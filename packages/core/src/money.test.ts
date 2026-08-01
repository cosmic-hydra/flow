import { describe, expect, it } from 'vitest';
import { addMoney, compareMoney, multiplyMoney, subtractMoney } from './money.js';

describe('money operations', () => {
  it('uses minor units and never returns a negative subtraction', () => {
    expect(
      addMoney({ amountMinor: 125, currency: 'USD' }, { amountMinor: 375, currency: 'USD' }),
    ).toEqual({ amountMinor: 500, currency: 'USD' });
    expect(
      subtractMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 250, currency: 'USD' }),
    ).toEqual({ amountMinor: 0, currency: 'USD' });
  });

  it('refuses cross-currency arithmetic and comparison', () => {
    expect(() =>
      compareMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 100, currency: 'EUR' }),
    ).toThrow('different currencies');
  });

  it('multiplies a minor-unit amount without losing currency precision', () => {
    expect(multiplyMoney({ amountMinor: 44_000, currency: 'INR' }, 2)).toEqual({
      amountMinor: 88_000,
      currency: 'INR',
    });
    expect(() => multiplyMoney({ amountMinor: 100, currency: 'INR' }, 1.5)).toThrow(
      'non-negative integer',
    );
  });
});
