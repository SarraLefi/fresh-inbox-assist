import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Copy, Check, Save, Sparkles, LogOut, Inbox } from "lucide-react";
import { toast } from "sonner";

import { listInbox, generateReply, saveGmailDraft, signOut } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/inbox")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Boîte de réception — Assistant Inbox" },
      {
        name: "description",
        content:
          "Liste des emails non lus avec badges À traiter / Automatique et génération de réponses.",
      },
      { property: "og:title", content: "Boîte de réception — Assistant Inbox" },
      {
        property: "og:description",
        content: "Emails non lus triés et réponses générées automatiquement.",
      },
    ],
  }),
  component: InboxPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Aucun email.</div>,
});

type Email = {
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InboxPage() {
  const navigate = useNavigate();
  const fetchInbox = useServerFn(listInbox);
  const doSignOut = useServerFn(signOut);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => fetchInbox(),
    refetchInterval: 120_000,
  });

  useEffect(() => {
    if (data && !data.connected) navigate({ to: "/" });
  }, [data, navigate]);

  const emails = (data?.emails ?? []) as Email[];
  const toHandle = emails.filter((e) => !e.automatic);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="size-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-none">Boîte de réception</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {data && "email" in data ? data.email : "…"} · {toHandle.length} à traiter
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> actualisation
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Rafraîchir">
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Se déconnecter"
              onClick={async () => {
                await doSignOut({ data: undefined });
                navigate({ to: "/" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6">
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </p>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Chargement des emails…
          </div>
        )}
        {!isLoading && emails.length === 0 && !error && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucun email non lu. Boîte au clair.
          </p>
        )}
        <ul className="space-y-3">
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} />
          ))}
        </ul>
      </main>
    </div>
  );
}

function EmailCard({ email }: { email: Email }) {
  const generate = useServerFn(generateReply);
  const saveDraft = useServerFn(saveGmailDraft);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const senderName = email.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || email.fromEmail;

  const onGenerate = async () => {
    setBusy(true);
    try {
      const res = await generate({
        data: {
          messageId: email.id,
          threadId: email.threadId,
          subject: email.subject,
          toEmail: email.fromEmail,
          content: `De: ${email.from}\nObjet: ${email.subject}\n\n${email.body}`,
        },
      });
      setDraft(res.reply);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveDraft({
        data: {
          messageId: email.id,
          threadId: email.threadId,
          subject: email.subject,
          toEmail: email.fromEmail,
          body: draft,
        },
      });
      toast.success("Brouillon enregistré dans Gmail");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{senderName}</p>
          <p className="truncate text-xs text-muted-foreground">{email.fromEmail}</p>
        </div>
        <span
          className={
            email.automatic
              ? "shrink-0 rounded-full bg-auto px-2.5 py-1 text-[11px] font-medium text-auto-foreground"
              : "shrink-0 rounded-full bg-action px-2.5 py-1 text-[11px] font-medium text-action-foreground"
          }
        >
          {email.automatic ? "Automatique" : "À traiter"}
        </span>
      </div>

      <h2 className="mt-3 text-sm font-semibold leading-snug">{email.subject}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{email.snippet}</p>
      <p className="mt-2 text-xs text-muted-foreground">{formatDate(email.date)}</p>

      {!email.automatic && (
        <div className="mt-4">
          {!draft && (
            <Button size="sm" onClick={onGenerate} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Génération…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Générer une réponse
                </>
              )}
            </Button>
          )}

          {draft !== null && (
            <div className="space-y-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={7}
                className="resize-y text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onCopy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Sauvegarder comme brouillon Gmail
                </Button>
                <Button size="sm" variant="ghost" onClick={onGenerate} disabled={busy}>
                  Regénérer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
