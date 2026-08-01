import { Menu, Plus, Settings2, UserRound } from 'lucide-react';

export function TopBar(props: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  onMenu: () => void;
  onSetup?: () => void;
  onServices?: () => void;
  onAccounts?: () => void;
  glass?: boolean;
}): React.JSX.Element {
  return (
    <header className={`topbar ${props.glass === true ? 'topbar-plan' : ''}`}>
      <button
        className="icon-button mobile-menu"
        type="button"
        onClick={props.onMenu}
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      <button type="button" className="brand-lockup" onClick={props.onMenu} aria-label="Flow home">
        <span className="brand-mark" aria-hidden="true">
          F
        </span>
        {!props.glass ? (
          <span className="brand-lockup-copy">
            <strong>Flow</strong>
            <small>{props.title}</small>
          </span>
        ) : null}
      </button>

      <nav className="top-nav" aria-label="Categories">
        <button type="button" onClick={props.onServices}>
          Flights
        </button>
        <button type="button" onClick={props.onServices}>
          Stays
        </button>
        <button type="button" onClick={props.onAccounts}>
          Accounts
        </button>
      </nav>

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        {props.actionLabel === undefined || props.onAction === undefined ? null : (
          <button
            className="button button-ink topbar-action"
            type="button"
            onClick={props.onAction}
          >
            <Plus size={15} />
            <span>{props.actionLabel}</span>
          </button>
        )}
        {props.onSetup === undefined ? null : (
          <button
            className="icon-button"
            type="button"
            onClick={props.onSetup}
            aria-label="Open setup"
          >
            <Settings2 size={16} />
          </button>
        )}
        <button className="button button-ink button-small sign-in-chip" type="button" tabIndex={-1}>
          <UserRound size={14} />
          Sign in
        </button>
      </div>
    </header>
  );
}
