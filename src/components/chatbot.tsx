import { useState, useEffect } from "react";
import { MessagesSquare, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/gmail.functions";
import { getCurrentAccount } from "@/lib/gmail.functions";

export default function Chatbot() {
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ from: "user" | "bot"; text: string }[]>([]);
  const ask = useServerFn(askAssistant);
  const fetchAccount = useServerFn(getCurrentAccount);

  useEffect(() => {
    fetchAccount()
      .then((res) => {
        setConnected(Boolean(res));
      })
      .catch(() => setConnected(false));
  }, []);

  const onSend = async () => {
    if (!question.trim()) return;
    const q = question.trim();
    setMessages((m) => [...m, { from: "user", text: q }]);
    setQuestion("");
    setBusy(true);
    try {
      const res = await ask({ data: { question: q } });
      setMessages((m) => [...m, { from: "bot", text: res.reply ?? "(pas de réponse)" }]);
    } catch (e) {
      setMessages((m) => [...m, { from: "bot", text: `Erreur: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const Placeholder = () => (
    <div>
      <div className="fixed right-6 bottom-20 z-[9999]">
        {!open ? (
          <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
            <MessagesSquare className="size-4" />
          </Button>
        ) : (
          <div className="w-80 rounded-2xl border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <MessagesSquare className="size-4 text-primary" />
                <div className="text-sm font-medium">Assistant (déconnecté)</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer">
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-3 text-sm">
              <div className="text-xs text-muted-foreground">Connectez-vous pour utiliser l'assistant.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!connected) return <Placeholder />;

  return (
    <div>
      <div className="fixed right-6 bottom-20 z-[9999]">
        {open ? (
          <div className="w-80 rounded-2xl border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <MessagesSquare className="size-4 text-primary" />
                <div className="text-sm font-medium">Assistant</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer">
                <X className="size-4" />
              </Button>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto p-3 text-sm">
              {messages.length === 0 && <div className="text-xs text-muted-foreground">Posez une question sur vos emails.</div>}
              {messages.map((m, i) => (
                <div key={i} className={m.from === "user" ? "text-right" : "text-left"}>
                  <div className={m.from === "user" ? "inline-block rounded-xl bg-primary/10 px-3 py-2 text-sm" : "inline-block rounded-xl bg-muted/10 px-3 py-2 text-sm"}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border px-3 py-2">
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Poser une question..." />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={onSend} disabled={busy}>
                  <Send className="size-4 mr-2" /> Envoyer
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
            <MessagesSquare className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
