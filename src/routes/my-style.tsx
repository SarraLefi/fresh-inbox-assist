import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { getWritingSamples, saveWritingSamples } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/my-style")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Mon style d'écriture — Assistant Inbox" }],
  }),
  component: MyStylePage,
});

function MyStylePage() {
  const fetchSamples = useServerFn(getWritingSamples);
  const saveSamples = useServerFn(saveWritingSamples);
  const { data } = useQuery({ queryKey: ["writing_samples"], queryFn: () => fetchSamples() });

  const [examples, setExamples] = useState(
    Array.from({ length: 3 }).map(() => ({ subject: "", body: "" })) as { subject: string; body: string }[],
  );

  useEffect(() => {
    if (data && data.length > 0) {
      const filled = data.slice(0, 3);
      const arr = Array.from({ length: 3 }).map((_, i) => filled[i] ?? { subject: "", body: "" });
      setExamples(arr);
    }
  }, [data]);

  const onChange = (i: number, key: "subject" | "body", value: string) => {
    const copy = [...examples];
    copy[i] = { ...copy[i], [key]: value };
    setExamples(copy);
  };

  const onSave = async () => {
    try {
      await saveSamples({ data: examples });
      toast.success("Exemples sauvegardés");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-5 py-6">
        <h1 className="text-lg font-semibold">Mon style d'écriture</h1>
        <p className="mt-2 text-sm text-muted-foreground">Colle 2-3 exemples d'emails (objet + corps) pour personnaliser les réponses générées.</p>

        <div className="mt-6 space-y-6">
          {examples.map((ex, i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="text-sm font-medium">Exemple {i + 1}</h2>
              <div className="mt-3 space-y-2">
                <Input value={ex.subject} onChange={(e) => onChange(i, "subject", e.target.value)} placeholder="Objet" />
                <Textarea value={ex.body} onChange={(e) => onChange(i, "body", e.target.value)} rows={6} placeholder="Corps de l'email" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Button onClick={onSave}>Sauvegarder</Button>
        </div>
      </main>
    </div>
  );
}
