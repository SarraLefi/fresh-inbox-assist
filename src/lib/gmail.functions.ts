import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

function readSessionId(): string | null {
  const cookie = getRequestHeader("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)gm_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function origin() {
  // Allow overriding the origin for local development when the OAuth redirect
  // needs to use a deployed host (e.g. lovable.app). Set DEV_ORIGIN in .env.
  const dev = process.env["DEV_ORIGIN"];
  if (dev && dev.trim() !== "") return dev;
  return new URL(getRequest().url).origin;
}

export const getGoogleAuthUrl = createServerFn({ method: "POST" }).handler(async () => {
  const { buildAuthUrl, SESSION_COOKIE } = await import("./gmail.server");
  const sessionId = crypto.randomUUID();
  setResponseHeader(
    "set-cookie",
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
  );
  return { url: buildAuthUrl(origin(), sessionId) };
});

export const getCurrentAccount = createServerFn({ method: "GET" }).handler(async () => {
  const { getAccount } = await import("./gmail.server");
  const account = await getAccount(readSessionId());
  return account ? { email: account.email } : null;
});

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { deleteAccount, SESSION_COOKIE } = await import("./gmail.server");
  const sessionId = readSessionId();
  if (sessionId) await deleteAccount(sessionId);
  setResponseHeader("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return { ok: true };
});

export const listInbox = createServerFn({ method: "GET" }).handler(async () => {
  const { getAccount, listUnreadEmails } = await import("./gmail.server");
  const account = await getAccount(readSessionId());
  if (!account) return { connected: false as const, emails: [] };
  const emails = await listUnreadEmails(account);
  return { connected: true as const, email: account.email, emails };
});

export const generateReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        messageId: z.string(),
        threadId: z.string().optional(),
        subject: z.string().optional(),
        toEmail: z.string().optional(),
        content: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getAccount, generateWithGroqWithStyle, storeDraft } = await import("./gmail.server");
    const account = await getAccount(readSessionId());
    if (!account) throw new Error("Non connecté à Gmail");
    const reply = await generateWithGroqWithStyle(data.content, account.id);
    await storeDraft({
      accountId: account.id,
      messageId: data.messageId,
      threadId: data.threadId,
      subject: data.subject,
      toEmail: data.toEmail,
      body: reply,
    });
    return { reply };
  });

export const getWritingSamples = createServerFn({ method: "GET" }).handler(async () => {
  const { getAccount, getWritingSamples: _get } = await import("./gmail.server");
  const account = await getAccount(readSessionId());
  if (!account) return [] as { subject: string; body: string }[];
  const samples = await _get(account.id);
  return samples.map((s) => ({ subject: s.subject ?? "", body: s.body ?? "" }));
});

export const saveWritingSamples = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .array(
        z.object({ subject: z.string().optional().default(""), body: z.string().optional().default("") }),
      )
      .max(3)
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getAccount, replaceWritingSamples } = await import("./gmail.server");
    const account = await getAccount(readSessionId());
    if (!account) throw new Error("Non connecté à Gmail");
    // filter out empty samples
    const samples = data.filter((s) => (s.subject ?? "").trim() !== "" || (s.body ?? "").trim() !== "");
    await replaceWritingSamples(account.id, samples as { subject: string; body: string }[]);
    return { ok: true };
  });

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ question: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { getAccount, generateWithGroqWithStyle, listUnreadEmails } = await import("./gmail.server");
    const account = await getAccount(readSessionId());
    if (!account) {
      throw new Error("Connectez votre compte Gmail pour utiliser l'assistant.");
    }

    // Fetch recent unread emails to provide context (up to 3)
    let emailsContext = "";
    try {
      const emails = await listUnreadEmails(account);
      const slice = (emails ?? []).slice(0, 3);
      if (slice.length > 0) {
        const parts = slice.map((e, i) => `Email ${i + 1}:\nDe: ${e.from}\nObjet: ${e.subject}\n${e.body.slice(0, 800)}`);
        emailsContext = `Voici quelques emails récents pour contexte :\n\n${parts.join("\n\n")}\n\n---\n\n`;
      }
    } catch (e) {
      // ignore email fetch errors and continue without context
      emailsContext = "";
    }

    const prompt = `${emailsContext}Question : ${data.question}\n\nRédige une réponse ou fournis des informations utiles en te basant sur les emails ci-dessus si nécessaire.`;
    const reply = await generateWithGroqWithStyle(prompt, account.id);
    return { reply };
  });

export const sendGmailReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        messageId: z.string(),
        threadId: z.string().optional(),
        subject: z.string().default("(sans objet)"),
        toEmail: z.string().min(1),
        body: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getAccount, sendGmailMessage, storeDraft } = await import("./gmail.server");
    const account = await getAccount(readSessionId());
    if (!account) throw new Error("Non connecté à Gmail");
    const sentId = await sendGmailMessage(account, {
      to: data.toEmail,
      subject: data.subject,
      body: data.body,
      threadId: data.threadId,
    });
    await storeDraft({
      accountId: account.id,
      messageId: data.messageId,
      threadId: data.threadId,
      subject: data.subject,
      toEmail: data.toEmail,
      body: data.body,
      gmailDraftId: sentId,
    });
    return { sentId };
  });
