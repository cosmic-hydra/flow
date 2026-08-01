"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Loader2,
  Settings2,
  Sparkles,
  Waves,
} from "lucide-react";
import { SetupDialog } from "@/components/SetupDialog";
import { DealCard } from "@/components/DealCard";
import { AccountsPanel } from "@/components/AccountsPanel";
import { WebcmdPanel } from "@/components/WebcmdPanel";
import type { ChatMessage, Deal } from "@/lib/types";

const SUGGESTIONS = [
  "Tokyo flights under $650 next month",
  "Shibuya hotel 2 nights with free cancel",
  "teamLab Planets tickets this Saturday",
  "JR Pass 7-day best price",
];

type UiMessage = ChatMessage & { deals?: Deal[] };

export function FlowApp() {
  const [setupOpen, setSetupOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [health, setHealth] = useState<{
    webcmd?: boolean;
    composio?: boolean;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const done = localStorage.getItem("flow_setup_complete");
    if (!done) setSetupOpen(true);
    void fetch("/api/health")
      .then((r) => r.json())
      .then((d) =>
        setHealth({
          webcmd: d.webcmd?.available,
          composio: d.composio?.configured,
        }),
      )
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages
            .filter((x) => x.role === "user" || x.role === "assistant")
            .slice(-6)
            .map((x) => ({ role: x.role, content: x.content })),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error("Chat failed");
      setMessages((m) => [...m, data.message]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            err instanceof Error
              ? `Something went wrong: ${err.message}`
              : "Something went wrong.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const showHero = messages.length === 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-mesh text-sand-50">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-tide-500/20 ring-1 ring-tide-400/30">
            <Waves className="h-5 w-5 text-tide-300" />
          </div>
          <div>
            <div className="font-display text-2xl leading-none tracking-tight">
              flow
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              book anything · best deal
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/55 sm:inline">
            webcmd {health?.webcmd ? "on" : "demo"} · composio{" "}
            {health?.composio ? "live" : "demo"}
          </span>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-sand-100 hover:bg-white/[0.09]"
          >
            <Settings2 className="h-4 w-4 text-ember-400" />
            Setup
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-7xl gap-5 px-5 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-[70vh] flex-col rounded-[28px] border border-white/10 bg-ink-900/40 shadow-panel backdrop-blur-md">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-8">
            <AnimatePresence mode="popLayout">
              {showHero ? (
                <motion.div
                  key="hero"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex min-h-[46vh] flex-col justify-center"
                >
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-tide-300"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Deal automation
                  </motion.p>
                  <motion.h1
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="max-w-3xl font-display text-5xl leading-[0.95] tracking-tight text-sand-50 sm:text-6xl md:text-7xl"
                  >
                    flow
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="mt-4 max-w-xl text-lg text-sand-100/70 sm:text-xl"
                  >
                    Say where you need to be. We hunt the best price across the
                    open web with webcmd, then wire confirmations through your
                    accounts.
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8 flex flex-wrap gap-2"
                  >
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-left text-sm text-sand-100/80 hover:border-tide-400/40 hover:bg-tide-500/10"
                      >
                        {s}
                      </button>
                    ))}
                  </motion.div>
                </motion.div>
              ) : (
                messages.map((m) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`max-w-3xl ${
                      m.role === "user" ? "ml-auto" : ""
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                        m.role === "user"
                          ? "bg-tide-500 text-ink-950"
                          : "border border-white/10 bg-white/[0.04] text-sand-100/90"
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.deals && m.deals.length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {m.deals.map((deal, i) => (
                          <DealCard key={deal.id} deal={deal} index={i} />
                        ))}
                      </div>
                    ) : null}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
            {busy ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin text-tide-300" />
                Searching deals…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className="border-t border-white/10 p-4 sm:p-5"
          >
            <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-ink-950/50 p-2 pl-4 focus-within:border-tide-400/40">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                placeholder="Book me the best deal to…"
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] text-sand-50 outline-none placeholder:text-white/35"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ember-500 text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
                aria-label="Send"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
          </form>
        </section>

        <div className="flex flex-col gap-5">
          <AccountsPanel onOpenSetup={() => setSetupOpen(true)} />
          <WebcmdPanel />
        </div>
      </main>

      <SetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onComplete={() => setSetupOpen(false)}
      />
    </div>
  );
}
