import { timingSafeEqual } from 'node:crypto';

export function safeEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
