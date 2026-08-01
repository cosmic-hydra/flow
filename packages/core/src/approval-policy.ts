import { createHash } from 'node:crypto';
import type { Approval, Offer } from '@flow/contracts';
import { canonicalJson } from './canonical-json.js';
import { DomainError } from './errors.js';
import { isAtMost } from './money.js';

const volatileAttributeKeys = new Set(['fetchedAt', 'traceId', 'requestId']);

function stableAttributes(attributes: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !volatileAttributeKeys.has(key)),
  );
}

export function fingerprintOffer(offer: Offer): string {
  const approvalSurface = {
    bookingId: offer.bookingId,
    providerId: offer.providerId,
    externalId: offer.externalId,
    title: offer.title,
    startAt: offer.startAt,
    endAt: offer.endAt,
    finalPrice: offer.finalPrice,
    attributes: stableAttributes(offer.attributes),
  };

  return createHash('sha256').update(canonicalJson(approvalSurface)).digest('hex');
}

export function assertApprovalAllowsOffer(
  approval: Approval,
  offer: Offer,
  now: Date = new Date(),
): void {
  if (approval.status !== 'active') {
    throw new DomainError('approval_inactive', 'The booking approval is no longer active');
  }
  if (approval.bookingId !== offer.bookingId || approval.offerId !== offer.id) {
    throw new DomainError('approval_offer_mismatch', 'The approval does not cover this offer');
  }
  if (approval.providerId !== offer.providerId) {
    throw new DomainError('approval_provider_mismatch', 'The provider changed after approval');
  }
  if (Date.parse(approval.validUntil) <= now.getTime()) {
    throw new DomainError('approval_expired', 'The booking approval has expired');
  }
  if (
    approval.executeNotBefore !== undefined &&
    Date.parse(approval.executeNotBefore) > now.getTime()
  ) {
    throw new DomainError('approval_too_early', 'The approved execution window has not started');
  }
  if (
    approval.executeNotAfter !== undefined &&
    Date.parse(approval.executeNotAfter) < now.getTime()
  ) {
    throw new DomainError('approval_window_closed', 'The approved execution window has closed');
  }
  if (!isAtMost(offer.finalPrice, approval.maxCharge)) {
    throw new DomainError(
      'approval_price_exceeded',
      'The final price exceeds the approved ceiling',
      {
        finalPrice: offer.finalPrice,
        maxCharge: approval.maxCharge,
      },
    );
  }
  if (fingerprintOffer(offer) !== approval.offerFingerprint) {
    throw new DomainError(
      'approval_fingerprint_mismatch',
      'Material offer details changed after approval',
    );
  }
}
