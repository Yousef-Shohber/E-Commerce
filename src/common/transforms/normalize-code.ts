import { Transform } from 'class-transformer';

export const NormalizeCode = () =>
  Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );
