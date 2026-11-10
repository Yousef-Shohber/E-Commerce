import { Transform, type TransformFnParams } from 'class-transformer';

export const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export const ToBoolean = (): PropertyDecorator => Transform(toBoolean);
