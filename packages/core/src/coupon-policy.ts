import type { CouponCandidate } from '@flow/contracts';

const couponCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;

function normalizedCode(code: string): string {
  return code.trim().toUpperCase();
}

export function rankCouponCandidates(
  candidates: readonly CouponCandidate[],
  providerId: string,
  maxAttempts: number,
  now: Date = new Date(),
): CouponCandidate[] {
  const seen = new Set<string>();

  return candidates
    .filter((candidate) => candidate.providerId === providerId)
    .filter((candidate) => candidate.publicCode)
    .filter((candidate) => couponCodePattern.test(candidate.code))
    .filter(
      (candidate) =>
        candidate.expiresAt === undefined || Date.parse(candidate.expiresAt) > now.getTime(),
    )
    .filter((candidate) => {
      const code = normalizedCode(candidate.code);
      if (seen.has(code)) {
        return false;
      }
      seen.add(code);
      return true;
    })
    .sort((left, right) => {
      const leftExpected = left.expectedSavingsMinor ?? 0;
      const rightExpected = right.expectedSavingsMinor ?? 0;
      const valueDelta = rightExpected * right.confidence - leftExpected * left.confidence;
      if (valueDelta !== 0) {
        return valueDelta;
      }
      return right.confidence - left.confidence || left.code.localeCompare(right.code);
    })
    .slice(0, Math.max(0, maxAttempts))
    .map((candidate) => ({ ...candidate, code: normalizedCode(candidate.code) }));
}
