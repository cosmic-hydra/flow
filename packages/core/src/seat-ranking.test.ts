import { describe, expect, it } from 'vitest';
import { rankSeatGroups, type SeatCoordinate } from './seat-ranking.js';

describe('seat ranking', () => {
  it('selects an adjacent central pair away from the front', () => {
    const seats: SeatCoordinate[] = [];
    for (let row = 1; row <= 10; row += 1) {
      for (let column = 1; column <= 10; column += 1) {
        seats.push({
          id: `${row}-${column}`,
          row,
          column,
          priceMinor: 1_000,
          available: true,
        });
      }
    }

    const ranked = rankSeatGroups(seats, {
      count: 2,
      together: true,
      preferCenter: true,
      avoidFrontRows: 2,
      preferredRows: [],
      preferredSections: [],
      preferredClasses: [],
      accessibilityRequired: false,
    });

    const best = ranked[0];
    expect(best).toBeDefined();
    expect(best?.seats[0]?.row).toBeGreaterThan(2);
    expect((best?.seats[1]?.column ?? 0) - (best?.seats[0]?.column ?? 0)).toBe(1);
  });

  it('honors preferred row labels case-insensitively', () => {
    const seats: SeatCoordinate[] = [
      { id: 'G7', row: 7, rowLabel: 'G', column: 7, priceMinor: 1_000, available: true },
      { id: 'G8', row: 7, rowLabel: 'G', column: 8, priceMinor: 1_000, available: true },
      { id: 'H7', row: 8, rowLabel: 'H', column: 7, priceMinor: 1_000, available: true },
      { id: 'H8', row: 8, rowLabel: 'H', column: 8, priceMinor: 1_000, available: true },
    ];

    const ranked = rankSeatGroups(seats, {
      count: 2,
      together: true,
      preferCenter: false,
      avoidFrontRows: 0,
      preferredRows: ['h'],
      preferredSections: [],
      preferredClasses: [],
      accessibilityRequired: false,
    });

    expect(ranked[0]?.seats.map((seat) => seat.id)).toEqual(['H7', 'H8']);
  });
});
