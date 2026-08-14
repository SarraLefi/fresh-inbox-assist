import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

function readSessionId(): string | null {
  const cookie = getRequestHeader("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)gm_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function origin() {
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
    const { getAccount, generateWithGroq, storeDraft } = await import("./gmail.server");
    const account = await getAccount(readSessionId());
    if (!account) throw new Error("Non connecté à Gmail");
    const reply = await generateWithGroq(data.content);
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
