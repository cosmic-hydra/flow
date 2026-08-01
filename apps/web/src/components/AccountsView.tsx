import { Link2, Loader2, PlugZap, RefreshCw, Sparkles, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type ConnectedAccount, type ToolkitDefinition, type WebcmdStatus } from '../api.js';

export function AccountsView(props: { onOpenSetup: () => void }): React.JSX.Element {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [toolkits, setToolkits] = useState<ToolkitDefinition[]>([]);
  const [mode, setMode] = useState('demo');
  const [webcmd, setWebcmd] = useState<WebcmdStatus>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [webcmdBusy, setWebcmdBusy] = useState(false);
  const [webcmdOutput, setWebcmdOutput] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [accountsResponse, webcmdResponse] = await Promise.all([
        api.accounts(),
        api.webcmdStatus(),
      ]);
      setAccounts(accountsResponse.accounts);
      setToolkits(accountsResponse.toolkits);
      setMode(accountsResponse.mode);
      setWebcmd(webcmdResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (toolkit: string, demo = false): Promise<void> => {
    setBusy(toolkit);
    setMessage(undefined);
    try {
      const data = await api.connectAccount(toolkit, demo ? 'demo-link' : 'connect');
      if (!demo && data.account.redirectUrl !== undefined) {
        window.open(data.account.redirectUrl, '_blank', 'noopener,noreferrer');
      }
      setMessage(data.message);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed');
    } finally {
      setBusy(undefined);
    }
  };

  const runWebcmdList = async (): Promise<void> => {
    setWebcmdBusy(true);
    try {
      const result = await api.webcmdStatus('list');
      setWebcmdOutput(
        result.ok
          ? JSON.stringify(result.adapters ?? result, null, 2).slice(0, 4_000)
          : result.message || 'webcmd list failed',
      );
      await load();
    } catch (error) {
      setWebcmdOutput(error instanceof Error ? error.message : 'webcmd failed');
    } finally {
      setWebcmdBusy(false);
    }
  };

  return (
    <div className="accounts-page">
      <section className="accounts-hero-band">
        <div>
          <p className="eyebrow">Connections</p>
          <h2>Accounts & webcmd</h2>
          <p>
            Link Gmail, Calendar, Slack, and more through Composio. Check live browser adapters with
            webcmd on this host.
          </p>
        </div>
        <div className="accounts-hero-actions">
          <button className="button button-secondary" type="button" onClick={props.onOpenSetup}>
            Open setup
          </button>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </section>

      <div className="accounts-layout">
        <section className="sheet-panel">
          <header className="sheet-heading">
            <div>
              <p className="eyebrow">Linked apps</p>
              <h3>
                Composio accounts
                <span className="gold-dot" aria-hidden="true" />
              </h3>
            </div>
            <span className="mode-chip">{mode}</span>
          </header>

          <div className="mcp-inline">
            <Sparkles size={15} />
            <p>
              In Cursor, enable the <strong>Composio MCP</strong> server, then ask:{' '}
              <em>“Connect my Gmail with Composio”</em>. Auth links open in your browser.
            </p>
          </div>

          <div className="toolkit-list">
            {toolkits.map((toolkit) => {
              const linked = accounts.find((account) => account.toolkit === toolkit.id);
              return (
                <div key={toolkit.id} className="toolkit-row">
                  <div>
                    <strong>{toolkit.name}</strong>
                    <span>{toolkit.description}</span>
                    {linked === undefined ? null : (
                      <small className="linked-status">
                        {linked.status} · {linked.label}
                      </small>
                    )}
                  </div>
                  <div className="toolkit-actions">
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      disabled={busy === toolkit.id}
                      onClick={() => void connect(toolkit.id, true)}
                    >
                      Demo
                    </button>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      disabled={busy === toolkit.id}
                      onClick={() => void connect(toolkit.id)}
                    >
                      {busy === toolkit.id ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <Link2 size={14} />
                      )}
                      Link
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {message === undefined ? null : <p className="setup-link-msg">{message}</p>}
        </section>

        <section className="sheet-panel">
          <header className="sheet-heading">
            <div>
              <p className="eyebrow">Browser automation</p>
              <h3>webcmd</h3>
            </div>
            <span
              className={`status-pill ${webcmd?.available ? 'status-pill-good' : 'status-pill-warn'}`}
            >
              {webcmd?.available ? 'Available' : 'Unavailable'}
            </span>
          </header>

          <dl className="limits-grid">
            <div>
              <dt>Version</dt>
              <dd>{webcmd?.version ?? '—'}</dd>
            </div>
            <div>
              <dt>Doctor</dt>
              <dd>{webcmd?.doctorOk ? 'Healthy' : 'Needs attention'}</dd>
            </div>
            <div>
              <dt>Adapters</dt>
              <dd>{webcmd?.adapterCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{webcmd?.message ?? 'Checking…'}</dd>
            </div>
          </dl>

          <div className="accounts-webcmd-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={webcmdBusy}
              onClick={() => void runWebcmdList()}
            >
              {webcmdBusy ? <Loader2 size={15} className="spin" /> : <Terminal size={15} />}
              Run webcmd list
            </button>
            <button type="button" className="button button-ghost" onClick={props.onOpenSetup}>
              <PlugZap size={15} />
              Setup guide
            </button>
          </div>

          {webcmdOutput === undefined ? null : <pre className="webcmd-output">{webcmdOutput}</pre>}
        </section>
      </div>
    </div>
  );
}
