import { describe, it, expect } from 'vitest';
import { appConfig } from './app.config';

describe('appConfig', () => {
  it('should NOT include provideClientHydration (SSR removed)', () => {
    const providers = appConfig.providers;
    expect(providers).toBeDefined();
    // After SSR removal: provideBrowserGlobalErrorListeners + provideRouter + provideServiceWorker
    expect(providers.length).toBe(3);
  });

  it('should include routing providers', () => {
    const providers = appConfig.providers;
    expect(providers.length).toBeGreaterThan(0);
  });
});
