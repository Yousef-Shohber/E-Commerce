import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  validateSync,
} from 'class-validator';

const NUMBER = /^\d+$/;

class EnvironmentVariables {
  // ---- required
  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must start with postgres:// or postgresql://',
  })
  DATABASE_URL: string;

  @IsString() @IsNotEmpty() JWT_SECRET: string;
  @IsString() @IsNotEmpty() JWT_EXPIRES_IN: string;

  @IsUrl({ require_tld: false }) DOMAIN: string;

  @IsString() @IsNotEmpty() SMTP_HOST: string;
  @Matches(NUMBER, { message: 'SMTP_PORT must be a number' }) SMTP_PORT: string;
  @IsString() @IsNotEmpty() SMTP_USERNAME: string;
  @IsString() @IsNotEmpty() SMTP_PASSWORD: string;

  @IsString() @IsNotEmpty() GOOGLE_CLIENT_ID: string;
  @IsString() @IsNotEmpty() GOOGLE_CLIENT_SECRET: string;
  @IsUrl({ require_tld: false }) GOOGLE_CALLBACK_URL: string;

  @IsString() @IsNotEmpty() CLOUDINARY_CLOUD_NAME: string;
  @IsString() @IsNotEmpty() CLOUDINARY_API_KEY: string;
  @IsString() @IsNotEmpty() CLOUDINARY_API_SECRET: string;

  // ---- optional
  @IsOptional()
  @Matches(NUMBER, { message: 'PORT must be a number' })
  PORT?: string;

  @IsOptional() @IsString() MAIL_FROM?: string;

  @IsOptional()
  @Matches(NUMBER, { message: 'THROTTLE_LIMIT must be a number' })
  THROTTLE_LIMIT?: string;

  @IsOptional() @IsString() CORS_ORIGINS?: string;

  @IsOptional()
  @Matches(NUMBER, { message: 'TRUST_PROXY must be a number' })
  TRUST_PROXY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    const problems = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(
      `Invalid environment variables:\n - ${problems.join('\n - ')}`,
    );
  }

  return config;
}
