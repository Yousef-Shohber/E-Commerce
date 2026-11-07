import { Transform } from 'class-transformer';

export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
