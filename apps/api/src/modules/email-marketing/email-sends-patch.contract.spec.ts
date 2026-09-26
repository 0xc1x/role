import { BadRequestException } from '@nestjs/common';
import { UpdateEmailSendSchema } from '@0xc1x/role-commons';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * `error_message` y `error_code` son diagnósticos del servidor: salen por DTO y
 * se renderizan en el admin, así que un cliente que los escriba reintroduce por
 * la puerta del PATCH el texto crudo de Resend que a7fac68 dejó de persistir.
 *
 * POR QUÉ SE PRUEBA AQUÍ Y NO EN EL SPEC DEL CONTROLLER: el enforcement de esta
 * ruta es `ZodValidationPipe(UpdateEmailSendSchema)`, no el `ValidationPipe`
 * global de `main.ts`. Ese global (`whitelist`, `forbidNonWhitelisted`) solo
 * actúa sobre metatypes de class-validator; con un body sin clase es un no-op.
 * El spec del controlador mockea `@0xc1x/role-commons` entero, así que aquí se
 * usa el schema real: lo que se verifica es que un PATCH con esos campos es un
 * 400 y no un 200 que finge haberlos guardado.
 */
describe('PATCH /email-marketing/sends/:id', () => {
  const pipe = new ZodValidationPipe(UpdateEmailSendSchema);

  it('acepta el estado y las marcas de tiempo del ciclo de vida', () => {
    expect(
      pipe.transform({ status: 'cancelled', sent_at: '2026-09-26T12:00:00.000Z' }),
    ).toEqual({ status: 'cancelled', sent_at: '2026-09-26T12:00:00.000Z' });
  });

  it('rechaza un error_message escrito por el cliente', () => {
    expect(() =>
      pipe.transform({
        status: 'failed',
        error_message: 'API key re_123 rejected for ana@correo.com',
      }),
    ).toThrow(BadRequestException);
  });

  it('rechaza un error_code escrito por el cliente', () => {
    expect(() =>
      pipe.transform({ status: 'failed', error_code: 'validation_error' }),
    ).toThrow(BadRequestException);
  });
});
