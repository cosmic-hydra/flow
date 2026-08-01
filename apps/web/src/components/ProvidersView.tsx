import { Check, CircleSlash2, PlugZap, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import type { ProviderSummary } from '../api.js';

const capabilityLabels: Array<keyof ProviderSummary['capability']> = [
  'search',
  'checkout',
  'couponApplication',
  'scheduling',
];

function capabilityLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/^./u, (letter) => letter.toUpperCase());
}

export function ProvidersView(props: {
  providers: ProviderSummary[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  const available = props.providers.filter((provider) => provider.health.available).length;
  return (
    <div className="providers-page">
      <section className="providers-intro">
        <div>
          <p className="eyebrow">Adapter registry</p>
          <h2>Booking providers</h2>
          <p>
            Search and checkout capabilities are intentionally separate. A provider can contribute
            live inventory without receiving permission to transact.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          disabled={props.loading}
          onClick={() => void props.onRefresh()}
        >
          <RefreshCw size={15} className={props.loading ? 'spin' : ''} /> Refresh health
        </button>
      </section>

      <div className="provider-summary-grid">
        <div>
          <ServerCog size={19} />
          <span>
            <strong>{props.providers.length}</strong> configured
          </span>
        </div>
        <div>
          <PlugZap size={19} />
          <span>
            <strong>{available}</strong> available
          </span>
        </div>
        <div>
          <ShieldCheck size={19} />
          <span>
            <strong>Approval</strong> enforced
          </span>
        </div>
      </div>

      {props.loading && props.providers.length === 0 ? (
        <div className="providers-loading">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="provider-grid">
          {props.providers.map((provider) => (
            <article className="provider-card" key={provider.id}>
              <header>
                <div className="provider-icon">
                  <PlugZap size={18} />
                </div>
                <div>
                  <h3>{provider.name}</h3>
                  <code>{provider.id}</code>
                </div>
                <span
                  className={
                    provider.health.available ? 'health-dot health-up' : 'health-dot health-down'
                  }
                >
                  {provider.health.available ? 'Available' : 'Unavailable'}
                </span>
              </header>
              <p className="provider-health-message">{provider.health.message}</p>
              <div className="provider-categories">
                {provider.capability.categories.map((category) => (
                  <span key={category}>{category}</span>
                ))}
              </div>
              <dl className="capability-list">
                {capabilityLabels.map((capability) => {
                  const enabled = provider.capability[capability];
                  return (
                    <div key={capability}>
                      <dt>{capabilityLabel(capability)}</dt>
                      <dd className={enabled ? 'capability-on' : 'capability-off'}>
                        {enabled ? <Check size={14} /> : <CircleSlash2 size={14} />}
                        {enabled ? 'Enabled' : 'Not supported'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          ))}
          {!props.loading && props.providers.length === 0 ? (
            <div className="providers-empty">No providers are registered in this deployment.</div>
          ) : null}
        </div>
      )}

      <section className="provider-safety-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Provider access is least-privilege</strong>
          <p>
            Search adapters receive booking constraints. Checkout adapters additionally require an
            active, fingerprint-bound approval; raw payment credentials never enter the application.
          </p>
        </div>
      </section>
    </div>
  );
}
