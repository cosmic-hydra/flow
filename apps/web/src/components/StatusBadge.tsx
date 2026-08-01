import { statusLabel } from '../format.js';

const positive = new Set(['booked', 'confirmed', 'succeeded', 'active', 'available']);
const attention = new Set([
  'awaiting_approval',
  'approved',
  'awaiting_user_action',
  'scheduled',
  'queued',
  'running',
]);
const negative = new Set(['failed', 'cancelled', 'expired', 'denied']);

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const tone = positive.has(status)
    ? 'positive'
    : attention.has(status)
      ? 'attention'
      : negative.has(status)
        ? 'negative'
        : 'neutral';
  return <span className={`status-badge status-${tone}`}>{statusLabel(status)}</span>;
}
