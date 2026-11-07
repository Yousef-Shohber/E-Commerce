import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { PAGINATION_HEADERS } from './common/constants';

export function configureApp(app: NestExpressApplication) {
  app.enableShutdownHooks();
  app.use(helmet({ contentSecurityPolicy: false }));

  const proxies = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(proxies) && proxies > 0) {
    app.set('trust proxy', proxies);
  }

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin:
      origins.length > 0 ? origins : process.env.NODE_ENV !== 'production',
    exposedHeaders: Object.values(PAGINATION_HEADERS),
  });

  setupSwagger(app);
}

function setupSwagger(app: INestApplication) {
  const swagger = new DocumentBuilder()
    .setVersion('1.0')
    .setTitle('Nest Js - Backend Api')
    .setDescription('E-Commerce Backend Project')
    .addServer(process.env.DOMAIN)
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
