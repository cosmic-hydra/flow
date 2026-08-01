export interface SeatCoordinate {
  id: string;
  row: number;
  rowLabel?: string;
  column: number;
  priceMinor: number;
  available: boolean;
  section?: string;
  className?: string;
  accessible?: boolean;
}

export interface SeatRankingPreference {
  count: number;
  together: boolean;
  preferCenter: boolean;
  avoidFrontRows: number;
  preferredRows: readonly string[];
  preferredSections: readonly string[];
  preferredClasses: readonly string[];
  accessibilityRequired: boolean;
  maxPricePerSeatMinor?: number;
}

export interface RankedSeatGroup {
  seats: SeatCoordinate[];
  score: number;
  totalPriceMinor: number;
}

function consecutiveGroups(seats: readonly SeatCoordinate[], count: number): SeatCoordinate[][] {
  const sorted = [...seats].sort((left, right) => left.column - right.column);
  const groups: SeatCoordinate[][] = [];
  for (let index = 0; index <= sorted.length - count; index += 1) {
    const group = sorted.slice(index, index + count);
    const first = group[0];
    if (first === undefined) continue;
    if (group.every((seat, offset) => seat.column === first.column + offset)) {
      groups.push(group);
    }
  }
  return groups;
}

export function rankSeatGroups(
  seats: readonly SeatCoordinate[],
  preference: SeatRankingPreference,
): RankedSeatGroup[] {
  const usable = seats.filter((seat) => {
    if (!seat.available) return false;
    if (seat.row <= preference.avoidFrontRows) return false;
    if (preference.accessibilityRequired && seat.accessible !== true) return false;
    if (
      preference.maxPricePerSeatMinor !== undefined &&
      seat.priceMinor > preference.maxPricePerSeatMinor
    ) {
      return false;
    }
    return true;
  });
  if (usable.length < preference.count) return [];

  const maximumRow = Math.max(...usable.map((seat) => seat.row));
  const maximumColumn = Math.max(...usable.map((seat) => seat.column));
  const targetRow = maximumRow * 0.62;
  const targetColumn = (maximumColumn + 1) / 2;
  const preferredRows = new Set(preference.preferredRows.map((value) => value.toLowerCase()));
  const preferredSections = new Set(
    preference.preferredSections.map((value) => value.toLowerCase()),
  );
  const preferredClasses = new Set(preference.preferredClasses.map((value) => value.toLowerCase()));
  const byRow = new Map<number, SeatCoordinate[]>();
  for (const seat of usable) {
    const rowSeats = byRow.get(seat.row) ?? [];
    rowSeats.push(seat);
    byRow.set(seat.row, rowSeats);
  }
  const candidates = preference.together
    ? [...byRow.values()].flatMap((rowSeats) => consecutiveGroups(rowSeats, preference.count))
    : combinations(usable, preference.count, 2_000);

  return candidates
    .map((group) => {
      const averageRow = group.reduce((sum, seat) => sum + seat.row, 0) / group.length;
      const averageColumn = group.reduce((sum, seat) => sum + seat.column, 0) / group.length;
      const rowDistance = Math.abs(averageRow - targetRow) / Math.max(1, maximumRow);
      const columnDistance =
        Math.abs(averageColumn - targetColumn) / Math.max(1, maximumColumn / 2);
      const positionScore = 1 - Math.min(1, Math.hypot(rowDistance, columnDistance) / 1.2);
      const rowScore = group.every(
        (seat) =>
          preferredRows.size === 0 ||
          (seat.rowLabel !== undefined && preferredRows.has(seat.rowLabel.toLowerCase())),
      )
        ? 1
        : 0;
      const sectionScore = group.every(
        (seat) =>
          preferredSections.size === 0 ||
          (seat.section !== undefined && preferredSections.has(seat.section.toLowerCase())),
      )
        ? 1
        : 0;
      const classScore = group.every(
        (seat) =>
          preferredClasses.size === 0 ||
          (seat.className !== undefined && preferredClasses.has(seat.className.toLowerCase())),
      )
        ? 1
        : 0;
      const centerWeight = preference.preferCenter ? 0.55 : 0.35;
      const score =
        positionScore * centerWeight + rowScore * 0.15 + sectionScore * 0.15 + classScore * 0.15;

      return {
        seats: group,
        score: Math.round(score * 10_000) / 100,
        totalPriceMinor: group.reduce((sum, seat) => sum + seat.priceMinor, 0),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.totalPriceMinor - right.totalPriceMinor ||
        left.seats
          .map((seat) => seat.id)
          .join(',')
          .localeCompare(right.seats.map((seat) => seat.id).join(',')),
    );
}

function combinations<T>(values: readonly T[], count: number, limit: number): T[][] {
  const output: T[][] = [];
  const selection: T[] = [];

  function visit(start: number): void {
    if (output.length >= limit) return;
    if (selection.length === count) {
      output.push([...selection]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (value === undefined) continue;
      selection.push(value);
      visit(index + 1);
      selection.pop();
      if (output.length >= limit) return;
    }
  }

  visit(0);
  return output;
}
