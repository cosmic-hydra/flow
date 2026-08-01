import { Menu, Plus, Settings2 } from 'lucide-react';

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
        <span className="brand-lockup-copy">
          <strong>Flow</strong>
          {!props.glass ? <small>{props.title}</small> : null}
        </span>
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
      </div>
    </header>
  );
}
