import { createClient } from "@supabase/supabase-js";

export type GmailAccount = {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

export const SESSION_COOKIE = "gm_session";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
].join(" ");

function admin() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function callbackUrl(origin: string) {
  return `${origin}/api/public/google-callback`;
}

export function buildAuthUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env["GOOGLE_OAUTH_CLIENT_ID"]!,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env["GOOGLE_OAUTH_CLIENT_ID"]!,
      client_secret: process.env["GOOGLE_OAUTH_CLIENT_SECRET"]!,
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Google token exchange failed [${res.status}]: ${body}`);
  return JSON.parse(body) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function refreshToken(refresh: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: process.env["GOOGLE_OAUTH_CLIENT_ID"]!,
      client_secret: process.env["GOOGLE_OAUTH_CLIENT_SECRET"]!,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Google token refresh failed [${res.status}]: ${body}`);
  return JSON.parse(body) as { access_token: string; expires_in: number };
}

export async function saveAccount(params: {
  sessionId: string;
  email: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn: number;
}) {
  const db = admin();
  const expires_at = new Date(Date.now() + params.expiresIn * 1000).toISOString();
  const row: Record<string, unknown> = {
    session_id: params.sessionId,
    email: params.email,
    access_token: params.accessToken,
    expires_at,
    updated_at: new Date().toISOString(),
  };
  if (params.refreshToken) row["refresh_token"] = params.refreshToken;
  const { error } = await db.from("gmail_accounts").upsert(row, { onConflict: "session_id" });
  if (error) throw error;
}

export async function getAccount(sessionId: string | null): Promise<GmailAccount | null> {
  if (!sessionId) return null;
  const db = admin();
  const { data, error } = await db
    .from("gmail_accounts")
    .select("id, email, access_token, refresh_token, expires_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const account = data as GmailAccount;
  if (new Date(account.expires_at).getTime() - 60_000 > Date.now()) return account;
  if (!account.refresh_token) return account;

  const refreshed = await refreshToken(account.refresh_token);
  const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await db
    .from("gmail_accounts")
    .update({ access_token: refreshed.access_token, expires_at })
    .eq("id", account.id);
  return { ...account, access_token: refreshed.access_token, expires_at };
}

export async function deleteAccount(sessionId: string) {
  const db = admin();
  await db.from("gmail_accounts").delete().eq("session_id", sessionId);
}

async function gmail(account: GmailAccount, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail API [${res.status}]: ${text}`);
  return text ? JSON.parse(text) : {};
}

export type InboxEmail = {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  automatic: boolean;
};

const AUTO_SENDER = ["no-reply", "noreply", "notifications", "notification", "security"];
const AUTO_SUBJECT = ["welcome", "new sign-in", "new sign in", "newsletter"];

function isAutomatic(from: string, subject: string) {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  return AUTO_SENDER.some((k) => f.includes(k)) || AUTO_SUBJECT.some((k) => s.includes(k));
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const bin = atob(normalized);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

type Part = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
};

function extractText(payload: Part | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const text = extractText(part);
    if (text) return text;
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

export async function listUnreadEmails(account: GmailAccount): Promise<InboxEmail[]> {
  const list = (await gmail(account, "/messages?maxResults=25&q=is:unread+in:inbox")) as {
    messages?: { id: string }[];
  };
  const ids = (list.messages ?? []).map((m) => m.id);

  const emails = await Promise.all(
    ids.map(async (id) => {
      const msg = (await gmail(account, `/messages/${id}?format=full`)) as {
        id: string;
        threadId: string;
        snippet?: string;
        internalDate?: string;
        payload?: Part & { headers?: { name: string; value: string }[] };
      };
      const headers = msg.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
      const from = header("from");
      const subject = header("subject") || "(sans objet)";
      const fromEmail = from.match(/<([^>]+)>/)?.[1] ?? from;
      const body = (extractText(msg.payload) || msg.snippet || "").slice(0, 4000).trim();
      return {
        id: msg.id,
        threadId: msg.threadId,
        from,
        fromEmail,
        subject,
        date: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
        snippet: msg.snippet ?? "",
        body,
        automatic: isAutomatic(from, subject),
      } satisfies InboxEmail;
    }),
  );

  return emails.sort((a, b) => b.date.localeCompare(a.date));
}

function encodeRaw(input: string) {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailMessage(
  account: GmailAccount,
  params: { to: string; subject: string; body: string; threadId?: string | undefined },
) {
  const subject = params.subject.toLowerCase().startsWith("re:")
    ? params.subject
    : `Re: ${params.subject}`;
  const mime = [
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    params.body,
  ].join("\r\n");

  const sent = (await gmail(account, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encodeRaw(mime), threadId: params.threadId }),
  })) as { id: string };
  return sent.id;
}

export async function storeDraft(params: {
  accountId: string;
  messageId: string;
  threadId?: string | undefined;
  subject?: string | undefined;
  toEmail?: string | undefined;
  body: string;
  gmailDraftId?: string | undefined;
}) {
  const db = admin();
  const { error } = await db.from("generated_drafts").upsert(
    {
      account_id: params.accountId,
      message_id: params.messageId,
      thread_id: params.threadId ?? null,
      subject: params.subject ?? null,
      to_email: params.toEmail ?? null,
      body: params.body,
      gmail_draft_id: params.gmailDraftId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,message_id" },
  );
  if (error) throw error;
}

export async function generateWithGroq(emailContent: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["GROQ_API_KEY"]}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: `Rédige une proposition de réponse professionnelle et concise en français (max 150 mots) à cet email : ${emailContent}`,
        },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Groq [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
