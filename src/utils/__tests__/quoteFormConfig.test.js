import { describe, it, expect } from 'vitest';
import { getDefaultQuoteFormConfig, mergeQuoteFormConfig } from '../quoteFormConfig';

describe('handyman quote form defaults', () => {
  it('exists and does not use junk quantity fields', () => {
    const cfg = getDefaultQuoteFormConfig('handyman');
    expect(cfg.layout).toBe('handyman');
    expect(cfg.fields.quantity.enabled).toBe(false);
    expect(cfg.fields.description.enabled).toBe(true);
    expect(cfg.steps.photos.enabled).toBe(true);
  });

  it('merges without throwing when vertical is handyman', () => {
    const merged = mergeQuoteFormConfig({ published: true }, 'handyman');
    expect(merged.published).toBe(true);
    expect(merged.layout).toBe('handyman');
    expect(merged.fields.quantity.enabled).toBe(false);
  });

  it('junk defaults still require quantity options', () => {
    const cfg = getDefaultQuoteFormConfig('junk_removal');
    expect(cfg.fields.quantity.options.length).toBeGreaterThan(0);
  });
});
