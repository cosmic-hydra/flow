import {
  Apple,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Monitor,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, type SetupStatus, type ToolkitDefinition } from '../api.js';

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'os', label: 'Your device' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'webcmd', label: 'Webcmd' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'done', label: 'Ready' },
] as const;

type StepId = (typeof STEPS)[number]['id'];
type SelectedOs = 'macos' | 'windows' | 'linux';

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-chip"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_200);
        });
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CommandBlock({ label, command }: { label: string; command: string }): React.JSX.Element {
  return (
    <div className="command-block">
      <div className="command-block-head">
        <span>{label}</span>
        <CopyButton text={command} />
      </div>
      <pre>{command}</pre>
    </div>
  );
}

function localCommands(os: SelectedOs): {
  node: string;
  postgres: string;
  webcmd: string;
  doctor: string;
  districtLogin: string;
  composio: string;
  flow: string;
} {
  if (os === 'windows') {
    return {
      node: 'winget install OpenJS.NodeJS.LTS',
      postgres: 'winget install PostgreSQL.PostgreSQL',
      webcmd: 'npm install -g @agentrhq/webcmd',
      doctor: 'webcmd doctor',
      districtLogin: 'webcmd --profile flow district login --window foreground',
      composio: 'npm install -g @composio/cli && composio login',
      flow: 'git clone https://github.com/cosmic-hydra/flow.git && cd flow && copy .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev',
    };
  }
  if (os === 'macos') {
    return {
      node: 'brew install node',
      postgres: 'brew install postgresql@16 && brew services start postgresql@16',
      webcmd: 'npm install -g @agentrhq/webcmd',
      doctor: 'webcmd doctor',
      districtLogin: 'webcmd --profile flow district login --window foreground',
      composio: 'npm install -g @composio/cli && composio login',
      flow: 'git clone https://github.com/cosmic-hydra/flow.git && cd flow && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev',
    };
  }
  return {
    node: 'sudo apt update && sudo apt install -y nodejs npm',
    postgres: 'sudo apt install -y postgresql postgresql-client',
    webcmd: 'npm install -g @agentrhq/webcmd',
    doctor: 'webcmd doctor',
    districtLogin: 'webcmd --profile flow district login --window foreground',
    composio: 'npm install -g @composio/cli && composio login',
    flow: 'git clone https://github.com/cosmic-hydra/flow.git && cd flow && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev',
  };
}

export function SetupDialog(props: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}): React.JSX.Element | null {
  const [step, setStep] = useState<StepId>('welcome');
  const [status, setStatus] = useState<SetupStatus>();
  const [toolkits, setToolkits] = useState<ToolkitDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOs, setSelectedOs] = useState<SelectedOs>('macos');
  const [linking, setLinking] = useState<string>();
  const [linkMsg, setLinkMsg] = useState<string>();
  const [error, setError] = useState<string>();

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  const commands = useMemo(() => {
    const fallback = localCommands(selectedOs);
    if (status === undefined || selectedOs !== status.os) return fallback;
    return {
      node: status.commands.node ?? fallback.node,
      postgres: status.commands.postgres ?? fallback.postgres,
      webcmd: status.commands.webcmd ?? fallback.webcmd,
      doctor: status.commands.doctor ?? fallback.doctor,
      districtLogin: status.commands.districtLogin ?? fallback.districtLogin,
      composio: status.commands.composio ?? fallback.composio,
      flow: status.commands.flow ?? fallback.flow,
    };
  }, [selectedOs, status]);

  const refreshStatus = async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const setup = await api.setupStatus();
      setStatus(setup);
      if (setup.os === 'macos' || setup.os === 'windows' || setup.os === 'linux') {
        setSelectedOs(setup.os);
      }
      try {
        const accounts = await api.accounts();
        setToolkits(accounts.toolkits);
      } catch {
        setToolkits([
          { id: 'gmail', name: 'Gmail', description: 'Pull confirmations and travel receipts' },
          {
            id: 'googlecalendar',
            name: 'Google Calendar',
            description: 'Block trip dates and reminders',
          },
          { id: 'slack', name: 'Slack', description: 'Share deals with your team' },
          { id: 'notion', name: 'Notion', description: 'Save itineraries to a workspace' },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup status failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (props.open) void refreshStatus();
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  const connectToolkit = async (toolkit: string, demo = false): Promise<void> => {
    setLinking(toolkit);
    setLinkMsg(undefined);
    try {
      const data = await api.connectAccount(toolkit, demo ? 'demo-link' : 'connect');
      if (data.account.redirectUrl !== undefined && !demo) {
        window.open(data.account.redirectUrl, '_blank', 'noopener,noreferrer');
      }
      setLinkMsg(data.message);
      await refreshStatus();
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setLinking(undefined);
    }
  };

  const next = (): void => {
    const nextStep = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    if (nextStep !== undefined) setStep(nextStep.id);
  };

  const back = (): void => {
    const prevStep = STEPS[Math.max(stepIndex - 1, 0)];
    if (prevStep !== undefined) setStep(prevStep.id);
  };

  const finish = (): void => {
    localStorage.setItem('flow_setup_complete', '1');
    localStorage.setItem('flow_setup_os', selectedOs);
    props.onComplete();
    props.onClose();
  };

  return (
    <div className="dialog-backdrop setup-backdrop">
      <div
        className="dialog setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <header className="dialog-header setup-header">
          <div>
            <p className="eyebrow">Flow setup</p>
            <h2 id="setup-title">Get booking-ready</h2>
          </div>
          <button className="icon-button glass-icon" type="button" onClick={props.onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="setup-steps" role="tablist" aria-label="Setup steps">
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === step}
              className={`setup-step-pill ${item.id === step ? 'setup-step-active' : ''} ${index < stepIndex ? 'setup-step-done' : ''}`}
              onClick={() => setStep(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="dialog-body setup-body">
          {error === undefined ? null : <p className="form-error setup-error">{error}</p>}

          {step === 'welcome' ? (
            <div className="setup-panel">
              <p className="setup-lead">
                Flow finds the best deals across flights, stays, events, and more — then books with
                browser automation via <em>webcmd</em> and linked accounts through <em>Composio</em>
                .
              </p>
              <div className="setup-feature-grid">
                {[
                  {
                    title: 'Ask in plain language',
                    body: 'Tokyo weekend under $900 — Flow ranks total-value options.',
                  },
                  {
                    title: 'Webcmd adapters',
                    body: 'Deterministic site commands for District, Trip.com, and Booking.com.',
                  },
                  {
                    title: 'One-click accounts',
                    body: 'Link Gmail, Calendar, Slack via Composio MCP or in-app OAuth.',
                  },
                ].map((card) => (
                  <article key={card.title} className="setup-feature">
                    <Sparkles size={16} />
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {step === 'os' ? (
            <div className="setup-panel">
              <p className="setup-lead">
                Pick your platform. We’ll show the exact install commands.
              </p>
              <div className="os-grid">
                {(
                  [
                    {
                      id: 'macos' as const,
                      label: 'macOS',
                      icon: Apple,
                      hint: 'Homebrew + Terminal',
                    },
                    {
                      id: 'windows' as const,
                      label: 'Windows',
                      icon: Monitor,
                      hint: 'winget + PowerShell',
                    },
                    { id: 'linux' as const, label: 'Linux', icon: Terminal, hint: 'apt / npm' },
                  ] as const
                ).map((os) => {
                  const Icon = os.icon;
                  return (
                    <button
                      key={os.id}
                      type="button"
                      className={`os-card ${selectedOs === os.id ? 'os-card-active' : ''}`}
                      onClick={() => setSelectedOs(os.id)}
                    >
                      <Icon size={20} />
                      <strong>{os.label}</strong>
                      <span>{os.hint}</span>
                    </button>
                  );
                })}
              </div>
              {status?.os !== undefined && status.os !== 'unknown' ? (
                <p className="muted setup-detected">
                  Detected from this browser: <em>{status.os}</em>
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 'runtime' ? (
            <div className="setup-panel">
              <p className="setup-lead">
                Flow needs Node.js 22+ and PostgreSQL 15+. This API is running{' '}
                <code>{status?.runtime.node ?? '…'}</code>.
              </p>
              <CommandBlock label="Install Node" command={commands.node} />
              <CommandBlock label="Install PostgreSQL" command={commands.postgres} />
              <CommandBlock label={`Clone & run Flow (${selectedOs})`} command={commands.flow} />
            </div>
          ) : null}

          {step === 'webcmd' ? (
            <div className="setup-panel">
              <div className="setup-status-row">
                <span
                  className={`status-pill ${status?.webcmd.available ? 'status-pill-good' : 'status-pill-warn'}`}
                >
                  {status?.webcmd.available
                    ? `webcmd ${status.webcmd.version ?? 'ready'}`
                    : 'webcmd not detected'}
                </span>
                <button type="button" className="text-button" onClick={() => void refreshStatus()}>
                  {loading ? 'Checking…' : 'Re-check'}
                </button>
              </div>
              <CommandBlock label="Install webcmd" command={commands.webcmd} />
              <CommandBlock label="Health check" command={commands.doctor} />
              <CommandBlock label="District login (checkout)" command={commands.districtLogin} />
              <p className="muted setup-note">
                {status?.webcmd.message ??
                  'Set FLOW_ENABLE_WEBCMD=true and FLOW_WEBCMD_PATH in .env after install.'}
              </p>
            </div>
          ) : null}

          {step === 'accounts' ? (
            <div className="setup-panel">
              <p className="setup-lead">
                Link booking-adjacent accounts. Prefer Composio MCP in Cursor, or use in-app Link /
                Demo link.
              </p>
              <div className="mcp-callout">
                <Link2 size={16} />
                <div>
                  <strong>Composio MCP</strong>
                  <p>{status?.mcp.hint ?? 'Enable Composio MCP, then ask to connect Gmail.'}</p>
                  <pre>{status?.mcp.snippet ?? ''}</pre>
                </div>
              </div>
              <CommandBlock label="Composio CLI (optional)" command={commands.composio} />
              <div className="toolkit-list">
                {toolkits.map((toolkit) => (
                  <div key={toolkit.id} className="toolkit-row">
                    <div>
                      <strong>{toolkit.name}</strong>
                      <span>{toolkit.description}</span>
                    </div>
                    <div className="toolkit-actions">
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        disabled={linking === toolkit.id}
                        onClick={() => void connectToolkit(toolkit.id, true)}
                      >
                        Demo
                      </button>
                      <button
                        type="button"
                        className="button button-primary button-small"
                        disabled={linking === toolkit.id}
                        onClick={() => void connectToolkit(toolkit.id)}
                      >
                        {linking === toolkit.id ? <Loader2 size={14} className="spin" /> : null}
                        Link
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {linkMsg === undefined ? null : <p className="setup-link-msg">{linkMsg}</p>}
              <p className="muted setup-note">
                Mode: {status?.accounts.mode ?? 'demo'} · {status?.accounts.count ?? 0} linked
                {status?.composioConfigured ? ' · Composio API key configured' : ' · demo / MCP'}
              </p>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="setup-panel setup-done">
              <div className="setup-done-mark" aria-hidden="true">
                <Check size={22} />
              </div>
              <h3>You’re ready</h3>
              <p>
                Describe what you want to book. Flow researches providers, ranks deals, and waits
                for your approval before any checkout.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="dialog-footer setup-footer">
          <button
            type="button"
            className="button button-ghost"
            onClick={back}
            disabled={stepIndex === 0}
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <div>
            {step === 'done' ? (
              <button type="button" className="button button-primary" onClick={finish}>
                Enter Flow
                <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" className="button button-primary" onClick={next}>
                Continue
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
