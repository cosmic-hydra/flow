import type { FlowConfig } from '@flow/config';
import { BmsBotProvider } from './bms-bot-provider.js';
import { DemoProvider } from './demo-provider.js';
import { ProviderRegistry } from './registry.js';
import { UiPathProvider } from './uipath-provider.js';
import { WebcmdBookingProvider } from './webcmd/booking-provider.js';
import { WebcmdDistrictProvider } from './webcmd/district-provider.js';
import { WebcmdTripProvider } from './webcmd/trip-provider.js';

export * from './bms-bot-provider.js';
export * from './demo-provider.js';
export * from './registry.js';
export * from './types.js';
export * from './uipath-provider.js';
export * from './webcmd/booking-provider.js';
export * from './webcmd/district-provider.js';
export * from './webcmd/runner.js';
export * from './webcmd/trip-provider.js';

export function createProviderRegistry(config: FlowConfig): ProviderRegistry {
  return new ProviderRegistry([
    new BmsBotProvider(config),
    new WebcmdDistrictProvider(config.webcmd),
    new WebcmdTripProvider(config.webcmd),
    new WebcmdBookingProvider(config.webcmd),
    new UiPathProvider(config.uiPath),
    new DemoProvider(),
  ]);
}
