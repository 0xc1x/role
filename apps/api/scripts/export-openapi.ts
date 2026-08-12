/**
 * Bootstraps Nest (without listening) and writes the OpenAPI document to openapi/openapi.json.
 *
 * Usage: npm run openapi:export
 * Requires the same env as a normal boot (see .env.example). For CI, use dummy values if
 * ConfigModule validation allows them, or point DATABASE_URL at a reachable host.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  app.setGlobalPrefix('api/v1');

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
  const outDir = join(process.cwd(), 'openapi');
  const outFile = join(outDir, 'openapi.json');

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(document, null, 2), 'utf8');

  await app.close();
  // eslint-disable-next-line no-console
  console.log(`✓ Wrote ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
