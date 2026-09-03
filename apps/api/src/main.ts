import 'zod/compile';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { NextFunction, Request, Response } from 'express';
import { json } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { parseCorsOrigins, type Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    bodyParser: false,
  });

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  const corsOrigins = parseCorsOrigins(
    config.get('CORS_ORIGINS', { infer: true }),
  );
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter(config));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    next();
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Role API')
    .setDescription('Backend API para Role — marketplace de comida excedente')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (nodeEnv === 'production') {
    app.use(
      '/docs',
      (req: Request, res: Response, next: NextFunction) => {
        const auth = req.headers.authorization;
        const expected = `Basic ${Buffer.from(
          `${config.get('DOCS_USER')}:${config.get('DOCS_PASSWORD')}`,
        ).toString('base64')}`;
        if (auth !== expected) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Docs"');
          return res.status(401).send('Unauthorized');
        }
        next();
      },
      apiReference({
        spec: { content: document },
        theme: 'purple',
      }),
    );
  } else {
    app.use(
      '/docs',
      apiReference({
        spec: { content: document },
        theme: 'purple',
      }),
    );
  }

  app.enableShutdownHooks();
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Role API listening on http://localhost:${port}`);
  logger.log(`Docs at http://localhost:${port}/docs`);
  logger.log(`Health at http://localhost:${port}/api/v1/health`);
}

bootstrap();
