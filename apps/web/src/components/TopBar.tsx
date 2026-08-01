import { Mail, Menu, Plus, Settings2 } from 'lucide-react';

export function TopBar(props: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  onMenu: () => void;
  onSetup?: () => void;
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
        aria-label="Flow"
        onClick={props.onMenu}
      >
        F
      </button>

      <nav className="glass-nav" aria-label="Quick links">
        <span className="glass-pill">{props.eyebrow}</span>
        <span className="glass-pill topbar-title-pill">{props.title}</span>
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
