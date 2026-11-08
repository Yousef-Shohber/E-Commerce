import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { PAGINATION_HEADERS } from './common/constants';

export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);

  app.enableShutdownHooks();
  app.use(helmet({ contentSecurityPolicy: false }));

  const proxies = config.get<number>('TRUST_PROXY');
  if (proxies) {
    app.set('trust proxy', proxies);
  }

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin:
      origins.length > 0
        ? origins
        : config.get<string>('NODE_ENV') !== 'production',
    exposedHeaders: Object.values(PAGINATION_HEADERS),
  });

  setupSwagger(app, config.getOrThrow<string>('DOMAIN'));
}

function setupSwagger(app: INestApplication, domain: string) {
  const swagger = new DocumentBuilder()
    .setVersion('1.0')
    .setTitle('Nest Js - Backend Api')
    .setDescription('E-Commerce Backend Project')
    .addServer(domain)
    .addSecurity('bearer', { type: 'http', scheme: 'bearer' })
    .addBearerAuth()
    .build();

  const documentation = SwaggerModule.createDocument(app, swagger);

  SwaggerModule.setup('swagger', app, documentation, {
    customCssUrl:
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
    ],
  });
}
