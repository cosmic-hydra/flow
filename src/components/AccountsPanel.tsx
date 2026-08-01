"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, PlugZap, RefreshCw, Sparkles } from "lucide-react";

type Account = {
  id: string;
  toolkit: string;
  label: string;
  status: string;
  redirectUrl?: string;
};

type Toolkit = {
  id: string;
  name: string;
  description: string;
};

export function AccountsPanel({
  onOpenSetup,
}: {
  onOpenSetup?: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [mode, setMode] = useState<string>("demo");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
      setToolkits(data.toolkits || []);
      setMode(data.mode || "demo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect(toolkit: string, demo = false) {
    setBusy(toolkit);
    setMessage(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolkit,
          action: demo ? "demo-link" : "connect",
        }),
      });
      const data = await res.json();
      if (!demo && data.account?.redirectUrl) {
        window.open(data.account.redirectUrl, "_blank", "noopener,noreferrer");
      }
      setMessage(data.message || (demo ? "Demo linked" : "Auth link opened"));
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="flex h-full flex-col rounded-3xl border border-white/10 bg-ink-900/50 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-tide-300">
            Accounts
          </p>
          <h2 className="font-display text-2xl text-sand-50">Linked apps</h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-white/10 p-2 text-white/60 hover:text-sand-100"
          aria-label="Refresh accounts"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="mb-3 text-sm text-white/55">
        Connect via Composio MCP / OAuth. Mode:{" "}
        <span className="text-tide-300">{mode}</span>
      </p>

      <div className="mb-4 rounded-xl border border-tide-400/20 bg-tide-500/5 px-3 py-2.5 text-xs leading-relaxed text-white/65">
        <span className="inline-flex items-center gap-1 text-tide-300">
          <Sparkles className="h-3 w-3" />
          Cursor tip
        </span>
        <span className="mt-1 block">
          Ask your agent: “Connect my Gmail with Composio” — uses{" "}
          <code className="text-tide-200">COMPOSIO_MANAGE_CONNECTIONS</code>.
        </span>
      </div>

      <div className="mb-4 space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-white/45">No accounts linked yet.</p>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div>
                <div className="text-sm text-sand-50">{a.label}</div>
                <div className="text-xs text-white/40">{a.toolkit}</div>
              </div>
              <span className="rounded-md bg-tide-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-tide-300">
                {a.status}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/40">
        Quick link
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {toolkits.slice(0, 5).map((tk) => (
          <div
            key={tk.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-sand-50">{tk.name}</div>
              <div className="truncate text-xs text-white/45">{tk.description}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={busy === tk.id}
                onClick={() => void connect(tk.id, true)}
                className="rounded-lg px-2 py-1 text-[11px] text-white/45 hover:bg-white/5 hover:text-sand-100 disabled:opacity-60"
              >
                Demo
              </button>
              <button
                type="button"
                disabled={busy === tk.id}
                onClick={() => void connect(tk.id, false)}
                className="inline-flex items-center gap-1 rounded-lg border border-tide-400/30 bg-tide-500/10 px-2 py-1 text-xs text-tide-200 hover:bg-tide-500/20 disabled:opacity-60"
                aria-label={`Link ${tk.name}`}
              >
                {busy === tk.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Link
              </button>
            </div>
          </div>
        ))}
      </div>

      {message ? <p className="mt-3 text-xs text-tide-300">{message}</p> : null}

      <button
        type="button"
        onClick={onOpenSetup}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-sand-100 hover:bg-white/[0.08]"
      >
        <PlugZap className="h-4 w-4 text-ember-400" />
        Open setup wizard
      </button>
    </aside>
  );
}
