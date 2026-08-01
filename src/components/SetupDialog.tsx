"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Apple,
  Check,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Monitor,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

type SetupStatus = {
  os: "macos" | "windows" | "linux" | "unknown";
  commands: Record<string, string>;
  runtime: { node: string; ready: boolean };
  webcmd: { available: boolean; version: string | null; doctorOk: boolean };
  accounts: { count: number; mode: string };
  composioConfigured: boolean;
  mcp?: { hint?: string };
};

type Toolkit = {
  id: string;
  name: string;
  description: string;
};

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "os", label: "Your device" },
  { id: "runtime", label: "Runtime" },
  { id: "webcmd", label: "Webcmd" },
  { id: "accounts", label: "Accounts" },
  { id: "done", label: "Ready" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-sand-100 hover:bg-white/15"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CommandBlock({ label, command }: { label: string; command: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.14em] text-tide-300">
          {label}
        </span>
        <CopyButton text={command} />
      </div>
      <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed text-sand-100">
        {command}
      </pre>
    </div>
  );
}

export function SetupDialog({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<StepId>("welcome");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOs, setSelectedOs] = useState<"macos" | "windows" | "linux">(
    "macos",
  );
  const [linking, setLinking] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const commands = useMemo(() => {
    if (!status) return null;
    if (selectedOs === status.os) return status.commands;
    // regenerate locally for alternate OS picks
    if (selectedOs === "windows") {
      return {
        node: "winget install OpenJS.NodeJS.LTS",
        webcmd: "npm install -g @agentrhq/webcmd",
        doctor: "webcmd doctor",
        skills: "webcmd skills add",
        composio: "npm install -g @composio/cli && composio login",
        flow: "git clone https://github.com/cosmic-hydra/flow.git && cd flow && npm install && npm run dev",
      };
    }
    if (selectedOs === "macos") {
      return {
        node: "brew install node",
        webcmd: "npm install -g @agentrhq/webcmd",
        doctor: "webcmd doctor",
        skills: "webcmd skills add",
        composio: "npm install -g @composio/cli && composio login",
        flow: "git clone https://github.com/cosmic-hydra/flow.git && cd flow && npm install && npm run dev",
      };
    }
    return {
      node: "sudo apt update && sudo apt install -y nodejs npm",
      webcmd: "npm install -g @agentrhq/webcmd",
      doctor: "webcmd doctor",
      skills: "webcmd skills add",
      composio: "npm install -g @composio/cli && composio login",
      flow: "git clone https://github.com/cosmic-hydra/flow.git && cd flow && npm install && npm run dev",
    };
  }, [selectedOs, status]);

  async function refreshStatus() {
    setLoading(true);
    setError(null);
    try {
      const [setupRes, accountsRes] = await Promise.all([
        fetch("/api/setup/status"),
        fetch("/api/accounts"),
      ]);
      const setup = await setupRes.json();
      const accounts = await accountsRes.json();
      if (!setup.ok) throw new Error("Failed to load setup status");
      setStatus(setup);
      if (setup.os === "macos" || setup.os === "windows" || setup.os === "linux") {
        setSelectedOs(setup.os);
      }
      setToolkits(accounts.toolkits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup status failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void refreshStatus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mcpSnippet = `{
  "mcpServers": {
    "composio": {
      "url": "https://mcp.composio.dev"
    }
  }
}`;

  async function connectToolkit(toolkit: string, demo = false) {
    setLinking(toolkit);
    setLinkMsg(null);
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
      if (!data.ok) throw new Error(data.error || "Connect failed");
      if (data.account?.redirectUrl && !demo) {
        window.open(data.account.redirectUrl, "_blank", "noopener,noreferrer");
      }
      setLinkMsg(data.message || "Connected");
      await refreshStatus();
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setLinking(null);
    }
  }

  function next() {
    const nextStep = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    setStep(nextStep.id);
  }

  function back() {
    const prevStep = STEPS[Math.max(stepIndex - 1, 0)];
    setStep(prevStep.id);
  }

  function finish() {
    localStorage.setItem("flow_setup_complete", "1");
    localStorage.setItem("flow_setup_os", selectedOs);
    onComplete();
    onClose();
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close setup"
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-mesh shadow-panel"
          >
            <div className="pointer-events-none absolute inset-0 bg-aurora opacity-80" />
            <div className="relative flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 sm:px-8">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-tide-300">
                  Flow setup
                </p>
                <h2
                  id="setup-title"
                  className="mt-1 font-display text-3xl tracking-tight text-sand-50"
                >
                  Get booking-ready
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-sand-100 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex gap-2 overflow-x-auto border-b border-white/10 px-6 py-3 sm:px-8">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
                    s.id === step
                      ? "bg-tide-500 text-ink-950"
                      : i < stepIndex
                        ? "bg-white/10 text-sand-100"
                        : "text-white/45 hover:text-sand-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              {error ? (
                <p className="mb-4 rounded-xl border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-sm text-ember-300">
                  {error}
                </p>
              ) : null}

              {step === "welcome" ? (
                <div className="space-y-4">
                  <p className="max-w-xl text-base leading-relaxed text-sand-100/85">
                    Flow finds the best deals across flights, stays, events, and
                    more — then books with browser automation via{" "}
                    <span className="text-tide-300">webcmd</span> and linked
                    accounts through{" "}
                    <span className="text-tide-300">Composio</span>.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        title: "Ask in plain language",
                        body: "Tokyo weekend under $900 — Flow ranks options.",
                      },
                      {
                        title: "Webcmd adapters",
                        body: "Reuse deterministic site commands instead of fragile scrapers.",
                      },
                      {
                        title: "One-click accounts",
                        body: "Link Gmail, Calendar, Slack via Composio MCP.",
                      },
                    ].map((card) => (
                      <div
                        key={card.title}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <Sparkles className="mb-3 h-4 w-4 text-ember-400" />
                        <h3 className="font-medium text-sand-50">{card.title}</h3>
                        <p className="mt-1 text-sm text-white/60">{card.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === "os" ? (
                <div className="space-y-4">
                  <p className="text-sand-100/80">
                    Pick your platform. We’ll show the exact install commands.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        {
                          id: "macos" as const,
                          label: "macOS",
                          icon: Apple,
                          hint: "Homebrew + Terminal",
                        },
                        {
                          id: "windows" as const,
                          label: "Windows",
                          icon: Monitor,
                          hint: "winget + PowerShell",
                        },
                        {
                          id: "linux" as const,
                          label: "Linux",
                          icon: Terminal,
                          hint: "apt / npm",
                        },
                      ] as const
                    ).map((os) => {
                      const Icon = os.icon;
                      const active = selectedOs === os.id;
                      return (
                        <button
                          key={os.id}
                          type="button"
                          onClick={() => setSelectedOs(os.id)}
                          className={`rounded-2xl border p-4 text-left transition ${
                            active
                              ? "border-tide-400/60 bg-tide-500/15 shadow-glow"
                              : "border-white/10 bg-white/[0.03] hover:border-white/25"
                          }`}
                        >
                          <Icon className="mb-3 h-5 w-5 text-tide-300" />
                          <div className="font-medium text-sand-50">{os.label}</div>
                          <div className="mt-1 text-sm text-white/55">{os.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                  {status?.os && status.os !== "unknown" ? (
                    <p className="text-sm text-white/50">
                      Detected from this browser:{" "}
                      <span className="text-tide-300">{status.os}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === "runtime" ? (
                <div className="space-y-4">
                  <p className="text-sand-100/80">
                    Flow needs Node.js 20+. On this machine the API is running{" "}
                    <span className="font-mono text-tide-300">
                      {status?.runtime.node || "…"}
                    </span>
                    .
                  </p>
                  {commands ? (
                    <>
                      <CommandBlock label="Install Node" command={commands.node} />
                      {"flow" in commands && commands.flow ? (
                        <CommandBlock
                          label={`Clone & run Flow (${selectedOs})`}
                          command={commands.flow}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
                    After installing, restart your terminal, then continue. You can
                    also run Flow with the bundled local dependencies — no global
                    Node install required for the web app itself.
                  </div>
                </div>
              ) : null}

              {step === "webcmd" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        status?.webcmd.available
                          ? "bg-tide-500/20 text-tide-300"
                          : "bg-ember-500/15 text-ember-300"
                      }`}
                    >
                      {status?.webcmd.available
                        ? `webcmd ${status.webcmd.version || "ready"}`
                        : "webcmd not detected"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void refreshStatus()}
                      className="text-xs text-white/60 hover:text-sand-100"
                    >
                      {loading ? "Checking…" : "Re-check"}
                    </button>
                  </div>
                  {commands ? (
                    <div className="space-y-3">
                      <CommandBlock
                        label="Install webcmd"
                        command={commands.webcmd}
                      />
                      <CommandBlock label="Doctor" command={commands.doctor} />
                      <CommandBlock
                        label="Add agent skills"
                        command={commands.skills}
                      />
                    </div>
                  ) : null}
                  <p className="text-sm text-white/55">
                    Flow shells out to the local{" "}
                    <code className="text-tide-300">webcmd</code> binary for live
                    adapters. Demo deals still work if the browser bridge is
                    offline.
                  </p>
                </div>
              ) : null}

              {step === "accounts" ? (
                <div className="space-y-4">
                  <p className="text-sand-100/80">
                    Link accounts with Composio for confirmations, calendars, and
                    team sharing — in-app OAuth or Cursor’s Composio MCP.
                  </p>

                  <div className="rounded-2xl border border-tide-400/25 bg-tide-500/10 p-4">
                    <h3 className="text-sm font-medium text-sand-50">
                      Easy path: Composio MCP in Cursor
                    </h3>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm text-white/70">
                      <li>Enable the Composio MCP server in Cursor Settings → MCP</li>
                      <li>
                        Ask: “Connect my Gmail with Composio” (uses{" "}
                        <code className="text-tide-300">
                          COMPOSIO_MANAGE_CONNECTIONS
                        </code>
                        )
                      </li>
                      <li>Open the auth link, finish OAuth, then refresh here</li>
                    </ol>
                    <div className="mt-3">
                      <CommandBlock
                        label="Cursor MCP snippet"
                        command={mcpSnippet}
                      />
                    </div>
                  </div>

                  {commands ? (
                    <CommandBlock
                      label="Optional Composio CLI"
                      command={commands.composio}
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {toolkits.map((tk) => (
                      <div
                        key={tk.id}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div>
                          <div className="font-medium text-sand-50">{tk.name}</div>
                          <p className="mt-1 text-sm text-white/55">
                            {tk.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            disabled={linking === tk.id}
                            onClick={() => void connectToolkit(tk.id, false)}
                            className="inline-flex items-center gap-1 rounded-lg bg-tide-500 px-2.5 py-1.5 text-xs font-medium text-ink-950 hover:bg-tide-400 disabled:opacity-60"
                          >
                            {linking === tk.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                            Link
                          </button>
                          <button
                            type="button"
                            disabled={linking === tk.id}
                            onClick={() => void connectToolkit(tk.id, true)}
                            className="text-[11px] text-white/45 hover:text-sand-100"
                          >
                            Demo link
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {linkMsg ? (
                    <p className="text-sm text-tide-300">{linkMsg}</p>
                  ) : null}
                  <p className="text-sm text-white/50">
                    Linked now: {status?.accounts.count ?? 0} · mode{" "}
                    {status?.accounts.mode || "demo"}
                    {!status?.composioConfigured
                      ? " · set COMPOSIO_API_KEY for live OAuth"
                      : ""}
                  </p>
                </div>
              ) : null}

              {step === "done" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-tide-400/30 bg-tide-500/10 p-5">
                    <h3 className="font-display text-2xl text-sand-50">
                      You’re set.
                    </h3>
                    <p className="mt-2 text-sand-100/75">
                      Ask Flow for a trip, stay, ticket, or reservation. We’ll
                      search, rank deals, and keep your linked accounts ready for
                      confirmations.
                    </p>
                  </div>
                  <ul className="space-y-2 text-sm text-white/65">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-tide-300" /> Node runtime
                      detected
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-tide-300" /> Webcmd{" "}
                      {status?.webcmd.available ? "available" : "optional / demo"}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-tide-300" /> Accounts panel
                      ready via Composio
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="relative flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
              <button
                type="button"
                onClick={back}
                disabled={stepIndex === 0}
                className="text-sm text-white/55 hover:text-sand-100 disabled:opacity-30"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                {step !== "done" ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-4 py-2 text-sm text-white/55 hover:text-sand-100"
                  >
                    Skip for now
                  </button>
                ) : null}
                {step === "done" ? (
                  <button
                    type="button"
                    onClick={finish}
                    className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-ink-950 hover:bg-ember-400"
                  >
                    Enter Flow
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex items-center gap-2 rounded-full bg-tide-500 px-5 py-2.5 text-sm font-medium text-ink-950 hover:bg-tide-400"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
