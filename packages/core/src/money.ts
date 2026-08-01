import type { Money } from '@flow/contracts';
import { DomainError } from './errors.js';

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new DomainError('currency_mismatch', 'Money values use different currencies', {
      leftCurrency: left.currency,
      rightCurrency: right.currency,
    });
  }
}

export function addMoney(...values: readonly Money[]): Money {
  const first = values[0];
  if (first === undefined) {
    throw new DomainError('empty_money_operation', 'At least one money value is required');
  }

  let amountMinor = 0;
  for (const value of values) {
    assertSameCurrency(first, value);
    amountMinor += value.amountMinor;
  }

  return { amountMinor, currency: first.currency };
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return {
    amountMinor: Math.max(0, left.amountMinor - right.amountMinor),
    currency: left.currency,
  };
}

export function compareMoney(left: Money, right: Money): number {
  assertSameCurrency(left, right);
  return left.amountMinor - right.amountMinor;
}

export function multiplyMoney(value: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new DomainError(
      'invalid_money_quantity',
      'Money quantity must be a non-negative integer',
      {
        quantity,
      },
    );
  }
  const amountMinor = value.amountMinor * quantity;
  if (!Number.isSafeInteger(amountMinor)) {
    throw new DomainError('money_overflow', 'Money multiplication exceeded the safe integer range');
  }
  return { amountMinor, currency: value.currency };
}

export function isAtMost(value: Money, ceiling: Money): boolean {
  return compareMoney(value, ceiling) <= 0;
}

export function zeroMoney(currency: string): Money {
  return { amountMinor: 0, currency };
}
