/** Default value of timestamp columns (microsecond precision) */
export const CURRENT_TIMESTAMP = 'CURRENT_TIMESTAMP(6)';

/** Key on the request object where the authenticated user is stored */
export const CURRENT_USER_KEY = 'user';

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
