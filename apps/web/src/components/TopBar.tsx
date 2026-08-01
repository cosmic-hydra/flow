import { Mail, Menu, Plus, Settings2 } from 'lucide-react';

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
    <header className={`topbar ${props.glass === true ? 'topbar-glass' : ''}`}>
      <button
        className="icon-button mobile-menu glass-icon"
        type="button"
        onClick={props.onMenu}
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      <button
        type="button"
        className="brand-mark brand-mark-nav"
        aria-label="Open navigation"
        onClick={props.onMenu}
      >
        F
      </button>

      <nav className="glass-nav" aria-label="Quick links">
        <button type="button" className="glass-pill" onClick={props.onServices ?? props.onMenu}>
          Services <span aria-hidden="true">+</span>
        </button>
        <button type="button" className="glass-pill" onClick={props.onAccounts ?? props.onSetup}>
          Accounts <span aria-hidden="true">+</span>
        </button>
      </nav>

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        {props.actionLabel === undefined || props.onAction === undefined ? null : (
          <button
            className="button button-pill-light topbar-action"
            type="button"
            onClick={props.onAction}
          >
            <Plus size={15} />
            <span>{props.actionLabel}</span>
          </button>
        )}
        {props.onSetup === undefined ? null : (
          <button
            className="glass-icon"
            type="button"
            onClick={props.onSetup}
            aria-label="Open setup"
          >
            <Settings2 size={16} />
          </button>
        )}
        <button className="glass-icon" type="button" aria-label="Messages" tabIndex={-1}>
          <Mail size={16} />
        </button>
      </div>
    </header>
  );
}
