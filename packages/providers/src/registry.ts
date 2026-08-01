import type { BookingCategory, CheckoutResult } from '@flow/contracts';
import type {
  BookingProvider,
  ProviderCheckoutContext,
  ProviderDiagnostic,
  ProviderSearchContext,
  ProviderSearchResult,
} from './types.js';
import { ProviderError } from './types.js';

export class ProviderRegistry {
  readonly #providers: ReadonlyMap<string, BookingProvider>;

  constructor(providers: readonly BookingProvider[]) {
    const providerMap = new Map<string, BookingProvider>();
    for (const provider of providers) {
      if (providerMap.has(provider.id)) {
        throw new Error(`Duplicate booking provider: ${provider.id}`);
      }
      providerMap.set(provider.id, provider);
    }
    this.#providers = providerMap;
  }

  list(category?: BookingCategory): BookingProvider[] {
    return this.listAll().filter(
      (provider) => provider.isEnabled() && (category === undefined || provider.supports(category)),
    );
  }

  listAll(): BookingProvider[] {
    return [...this.#providers.values()];
  }

  require(providerId: string): BookingProvider {
    const provider = this.#providers.get(providerId);
    if (provider === undefined || !provider.isEnabled()) {
      throw new ProviderError({
        providerId,
        code: 'provider_unavailable',
        message: `Provider ${providerId} is not configured`,
        retryable: false,
      });
    }
    return provider;
  }

  async searchAll(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const excluded = new Set(context.booking.intent.excludedProviders);
    const preferred = new Set(context.booking.intent.preferredProviders);
    let providers = this.list(context.booking.intent.category).filter(
      (provider) => !excluded.has(provider.id),
    );
    if (preferred.size > 0) {
      const preferredProviders = providers.filter((provider) => preferred.has(provider.id));
      if (preferredProviders.length > 0) providers = preferredProviders;
    }

    const searchProviders = providers.filter((provider) => provider.capability.search);
    const settled = await Promise.allSettled(
      searchProviders.map((provider) => provider.search(context)),
    );
    const result: ProviderSearchResult = { offers: [], diagnostics: [], deferredRuns: [] };

    for (let index = 0; index < settled.length; index += 1) {
      const item = settled[index];
      const provider = searchProviders[index];
      if (item === undefined || provider === undefined) continue;
      if (item.status === 'fulfilled') {
        result.offers.push(...item.value.offers);
        result.diagnostics.push(...item.value.diagnostics);
        result.deferredRuns.push(...item.value.deferredRuns);
        continue;
      }
      const error = item.reason;
      const diagnostic: ProviderDiagnostic =
        error instanceof ProviderError
          ? {
              providerId: error.providerId,
              level: 'error',
              code: error.code,
              message: error.message,
              retryable: error.retryable,
            }
          : {
              providerId: provider.id,
              level: 'error',
              code: 'provider_search_failed',
              message: error instanceof Error ? error.message : 'Unknown provider error',
              retryable: true,
            };
      result.diagnostics.push(diagnostic);
    }
    return result;
  }

  async prepareCheckout(context: ProviderCheckoutContext): Promise<CheckoutResult> {
    const provider = this.require(context.offer.providerId);
    if (!provider.capability.checkout) {
      throw new ProviderError({
        providerId: provider.id,
        code: 'checkout_not_supported',
        message: `${provider.name} does not support checkout automation`,
        retryable: false,
      });
    }
    return provider.prepareCheckout(context);
  }
}
