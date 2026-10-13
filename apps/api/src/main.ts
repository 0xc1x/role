import 'zod/compile';
import { Logger, ValidationPipe, type RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { Express, NextFunction, Request, Response } from 'express';
import { json } from 'express';
import { AppModule } from './app.module';
import { buildBootstrapFailureLog } from './common/bootstrap-failure';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AccessLogInterceptor } from './common/interceptors/access-log.interceptor';
import { JsonLoggerService } from './common/logging/json-logger.service';
import { requestContextMiddleware } from './common/logging/request-context.middleware';
import { parseCorsOrigins, type Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    // Los logs que Nest emite durante el montaje se acumulan aquí y se vuelcan
    // al logger JSON cuando `useLogger` lo instala más abajo. Sin esto, la fase
    // de arranque (módulos, RLS, providers) sale en el formato viejo.
    bufferLogs: true,
    bodyParser: false,
  });

  const config = app.get(ConfigService<Env, true>);

  // Sustituye al ConsoleLogger de Nest para TODOS los `new Logger(X)` del
  // código: usan el delegate estático que `useLogger` reemplaza, así que este
  // es el punto único donde se decide el formato de toda la aplicación.
  app.useLogger(
    new JsonLoggerService({
      level: config.get('LOG_LEVEL', { infer: true }),
      errorStack: config.get('ERROR_STACK', { infer: true }),
    }),
  );
  const port = config.get('PORT', { infer: true });

  // Render (y cualquier LB) termina TLS en un proxy: sin esto req.ip es el
  // proxy y el Throttler colapsa a un solo bucket compartido por todos.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', 1);
  const corsOrigins = parseCorsOrigins(
    config.get('CORS_ORIGINS', { infer: true }),
  );
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new AccessLogInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(helmet());
  // El orden importa y va ANTES del parser de cuerpo a propósito: así el
  // `x-request-id` cubre también los 413 que lanza `json({ limit })`, que de lo
  // contrario responderían sin identificador de correlación.
  app.use(requestContextMiddleware);
  // rawBody alimenta la verificación de firma svix del webhook de Resend
  // (email-marketing-public.controller). Sin verify, req.rawBody queda vacío
  // y toda firma es inválida en producción.
  app.use(
    json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as unknown as RawBodyRequest<Request>).rawBody = buf;
      },
    }),
  );

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
  // Una sola línea estructurada: las tres URLs quedan como campos buscables en
// vez de tres mensajes que un agregador no puede agrupar.
new Logger('Bootstrap').log({
  event: 'api_ready',
  port,
  docsPath: '/docs',
  healthPath: '/api/v1/health',
});
}

// Sin este catch, un fallo en `validateEnv` — que lanza nombrando la variable
// culpable — moría como unhandled rejection con un stack inútil. En un deploy
// eso se traduce en un contenedor que reinicia en bucle sin contexto. El evento
// lleva la huella acotada (`errorType`/`errorCode`) y los NOMBRES de las
// variables de entorno implicadas, porque un nombre no es un secreto; lo que no
// viaja es el `message`, que sí puede contener el valor de la que falta.
bootstrap().catch((err: unknown) => {
  new Logger('Bootstrap').error(buildBootstrapFailureLog(err));
  process.exitCode = 1;
  // `exitCode` solo marca el código: si el pool de Postgres o el handle de
  // Redis quedaron abiertos, el event loop sigue vivo y el contenedor NO
  // termina — que es justo el reinicio en bucle que este catch evita. Este
  // timer es la red de seguridad. Va `unref()` a propósito para que no sea él
  // mismo lo que mantenga el proceso vivo: en un fallo limpio (sin handles
  // colgados) el exitCode hace salir al proceso de inmediato, y el timer solo
  // llega a dispararse cuando el loop está realmente atascado.
  const forceExit = setTimeout(() => process.exit(1), 2000);
  forceExit.unref();
});
