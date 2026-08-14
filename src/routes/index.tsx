import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Sparkles, ShieldCheck, RefreshCw } from "lucide-react";

import { getGoogleAuthUrl, getCurrentAccount } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Assistant Inbox — réponses Gmail assistées par IA" },
      {
        name: "description",
        content:
          "Connectez votre Gmail, repérez les emails à traiter et générez des réponses professionnelles en français en un clic.",
      },
      { property: "og:title", content: "Assistant Inbox — réponses Gmail assistées par IA" },
      {
        property: "og:description",
        content: "Triez vos emails non lus et générez des brouillons de réponse en français.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const startAuth = useServerFn(getGoogleAuthUrl);
  const currentAccount = useServerFn(getCurrentAccount);
  const [loading, setLoading] = useState(false);

  const { data: account } = useQuery({
    queryKey: ["account"],
    queryFn: () => currentAccount(),
  });

  const connect = async () => {
    setLoading(true);
    try {
      const { url } = await startAuth({ data: undefined });
      window.location.href = url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-border bg-surface p-8 shadow-card">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="size-6" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Assistant Inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Vos emails non lus, triés entre « à traiter » et « automatique », avec des propositions
            de réponse rédigées pour vous.
          </p>

          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 text-primary" />
              Réponses générées en français, concises et professionnelles
            </li>
            <li className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 size-4 text-primary" />
              Rafraîchissement automatique toutes les 2 minutes
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 text-primary" />
              Accès en lecture et création de brouillons uniquement
            </li>
          </ul>

          {account ? (
            <div className="mt-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Connecté en tant que <span className="font-medium text-foreground">{account.email}</span>
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/inbox" })}>
                Ouvrir ma boîte de réception
              </Button>
            </div>
          ) : (
            <Button className="mt-8 w-full" onClick={connect} disabled={loading}>
              {loading ? "Redirection…" : "Se connecter avec Google"}
            </Button>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/inbox" className="underline underline-offset-4">
              Déjà connecté ? Aller à l'inbox
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
