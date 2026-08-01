"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, PlugZap, RefreshCw } from "lucide-react";

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

  async function connect(toolkit: string) {
    setBusy(toolkit);
    setMessage(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit, action: "connect" }),
      });
      const data = await res.json();
      if (data.account?.redirectUrl) {
        window.open(data.account.redirectUrl, "_blank", "noopener,noreferrer");
      }
      setMessage(data.message || "Auth link opened");
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

      <p className="mb-4 text-sm text-white/55">
        Connect via Composio MCP / OAuth. Mode:{" "}
        <span className="text-tide-300">{mode}</span>
      </p>

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
      <div className="space-y-2 overflow-y-auto pr-1">
        {toolkits.slice(0, 5).map((tk) => (
          <button
            key={tk.id}
            type="button"
            disabled={busy === tk.id}
            onClick={() => void connect(tk.id)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2.5 text-left hover:border-tide-400/40 disabled:opacity-60"
          >
            <span>
              <span className="block text-sm text-sand-50">{tk.name}</span>
              <span className="block text-xs text-white/45">{tk.description}</span>
            </span>
            {busy === tk.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-tide-300" />
            ) : (
              <Link2 className="h-4 w-4 text-tide-300" />
            )}
          </button>
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
