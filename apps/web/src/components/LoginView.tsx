import { ArrowRight, LockKeyhole, Settings2 } from 'lucide-react';
import { useState } from 'react';

export function LoginView(props: {
  onLogin: (token: string) => Promise<void>;
  onOpenSetup?: () => void;
  error?: string;
}): React.JSX.Element {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="login-page login-page--apple">
      <section className="login-card login-card--apple">
        <div className="brand-mark brand-mark-large" aria-hidden="true">
          F
        </div>
        <h1>Flow</h1>
        <p className="login-copy">Sign in with your personal access token to book with clarity.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (token.trim() === '') return;
            setSubmitting(true);
            void props.onLogin(token.trim()).finally(() => setSubmitting(false));
          }}
        >
          <label htmlFor="access-token">Access token</label>
          <div className="token-field">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              id="access-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="flow_pat_…"
              required
            />
          </div>
          {props.error === undefined ? null : <p className="form-error">{props.error}</p>}
          <button className="button button-ink button-full" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Continue'}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        {props.onOpenSetup === undefined ? null : (
          <button type="button" className="login-setup-link" onClick={props.onOpenSetup}>
            <Settings2 size={15} />
            Setup for Windows / macOS
          </button>
        )}
      </section>
    </main>
  );
}
