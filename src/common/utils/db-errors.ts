import { QueryFailedError } from 'typeorm';

/** PostgreSQL error codes the app reacts to */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_OUT_OF_RANGE: '22003',
} as const;

export function pgErrorCode(error: unknown): string | undefined {
  if (error instanceof QueryFailedError) {
    return (error.driverError as { code?: string } | undefined)?.code;
  }
  return undefined;
}

export function rowsOf<T = any>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return result as T[];
}
