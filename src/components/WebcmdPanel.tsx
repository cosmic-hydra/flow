"use client";

import { useEffect, useState } from "react";
import { Activity, ListTree, Stethoscope } from "lucide-react";

type WebcmdStatus = {
  ok: boolean;
  version?: string;
  doctor?: { ok: boolean; stderr?: string };
  list?: { ok: boolean; parsed?: unknown };
};

export function WebcmdPanel() {
  const [status, setStatus] = useState<WebcmdStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [runOut, setRunOut] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/webcmd");
      const data = await res.json();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runList() {
    setLoading(true);
    setRunOut(null);
    try {
      const res = await fetch("/api/webcmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: ["list", "-f", "json"] }),
      });
      const data = await res.json();
      const preview = JSON.stringify(
        data.parsed || data.result?.stdout || data,
        null,
        2,
      ).slice(0, 1800);
      setRunOut(preview);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  const adapterCount = Array.isArray(status?.list?.parsed)
    ? status?.list?.parsed.length
    : null;

  return (
    <section className="rounded-3xl border border-white/10 bg-ink-900/45 p-5 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-tide-300">
            Webcmd
          </p>
          <h2 className="font-display text-xl text-sand-50">Browser infra</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs text-white/50 hover:text-sand-100"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <Activity className="mb-2 h-4 w-4 text-ember-400" />
          <div className="text-xs text-white/45">CLI</div>
          <div className="text-sm text-sand-50">
            {status?.version || (status?.ok ? "ready" : "checking")}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <Stethoscope className="mb-2 h-4 w-4 text-tide-300" />
          <div className="text-xs text-white/45">Doctor</div>
          <div className="text-sm text-sand-50">
            {status?.doctor?.ok ? "healthy" : "bridge optional"}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <ListTree className="mb-2 h-4 w-4 text-tide-300" />
          <div className="text-xs text-white/45">Adapters</div>
          <div className="text-sm text-sand-50">
            {adapterCount != null ? adapterCount : "—"}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void runList()}
        className="mt-4 w-full rounded-full border border-tide-400/30 bg-tide-500/10 px-4 py-2 text-sm text-tide-200 hover:bg-tide-500/20"
      >
        Run `webcmd list`
      </button>

      {runOut ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-ink-950/70 p-3 font-mono text-[11px] text-sand-100/80">
          {runOut}
        </pre>
      ) : null}
    </section>
  );
}
