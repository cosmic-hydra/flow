import { describe, expect, it } from 'vitest';
import { loadConfig } from './index.js';

describe('configuration', () => {
  it('rejects unauthenticated production deployments', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        FLOW_AUTH_MODE: 'development',
      }),
    ).toThrow('FLOW_AUTH_MODE');
  });

  it('does not treat the string false as true', () => {
    const config = loadConfig({ FLOW_ENABLE_WEBCMD: 'false' });
    expect(config.webcmd.enabled).toBe(false);
  });

  it('requires a complete UiPath configuration', () => {
    expect(() => loadConfig({ FLOW_UIPATH_BASE_URL: 'https://example.com' })).toThrow(
      'All FLOW_UIPATH',
    );
  });

  it('requires a strong session secret when authentication is enabled', () => {
    expect(() =>
      loadConfig({ FLOW_AUTH_MODE: 'required', FLOW_SESSION_SECRET: 'too-short' }),
    ).toThrow('at least 32');
  });
});
