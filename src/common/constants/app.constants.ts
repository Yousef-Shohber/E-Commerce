/** Metadata key written by @Roles() */
export const ROLES_KEY = 'roles';

/** Metadata key written by @Public() */
export const IS_PUBLIC_KEY = 'isPublic';

/** Names of the response headers used by the pagination interceptor */
export const PAGINATION_HEADERS = {
  total: 'X-Total-Count',
  page: 'X-Page',
  limit: 'X-Limit',
  totalPages: 'X-Total-Pages',
} as const;
