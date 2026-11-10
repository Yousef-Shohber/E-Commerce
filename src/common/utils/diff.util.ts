export interface FieldChange {
  before: unknown;
  after: unknown;
}

const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;

export function getChangedFields<T extends object>(
  current: T,
  dto: Partial<T>,
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};

  for (const key of Object.keys(dto) as (keyof T & string)[]) {
    const after = dto[key];
    if (after === undefined) continue;

    const before = current[key];
    if (!same(before, after)) changes[key] = { before, after };
  }

  return changes;
}
