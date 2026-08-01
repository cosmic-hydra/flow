import { Menu, Plus } from 'lucide-react';

export function TopBar(props: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  onMenu: () => void;
}): React.JSX.Element {
  return (
    <header className="topbar">
      <button
        className="icon-button mobile-menu"
        type="button"
        onClick={props.onMenu}
        aria-label="Open navigation"
      >
        <Menu size={19} />
      </button>
      <div className="topbar-title">
        <span>{props.eyebrow}</span>
        <h1>{props.title}</h1>
      </div>
      {props.actionLabel === undefined || props.onAction === undefined ? null : (
        <button
          className="button button-secondary topbar-action"
          type="button"
          onClick={props.onAction}
        >
          <Plus size={16} />
          {props.actionLabel}
        </button>
      )}
    </header>
  );
}
