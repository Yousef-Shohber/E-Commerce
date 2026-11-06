import { QueryFailedError } from 'typeorm';

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
