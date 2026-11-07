export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export interface PaginationInput {
  page?: number;
  limit?: number;
}

/** page/limit with defaults + the `skip`/`take` TypeORM needs */
export function resolvePagination(query: PaginationInput = {}) {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = query.limit ?? DEFAULT_LIMIT;

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly total: number,
    public readonly page: number,
    public readonly limit: number,
  ) {}

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  static of<T>(items: T[], total: number, query: PaginationInput = {}) {
    const { page, limit } = resolvePagination(query);
    return new Paginated<T>(items, total, page, limit);
  }
}
