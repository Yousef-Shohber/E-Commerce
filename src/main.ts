import 'pg';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'));

  Logger.log(
    `Swagger docs on ${config.getOrThrow<string>('DOMAIN')}/swagger`,
    'Bootstrap',
  );
}
void bootstrap();
