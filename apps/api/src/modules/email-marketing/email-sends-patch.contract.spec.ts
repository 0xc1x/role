import { BadRequestException, RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { UpdateEmailSendSchema } from '@0xc1x/role-commons';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EmailMarketingController } from './email-marketing.controller';

/**
 * `error_message` y `error_code` son diagnósticos del servidor: salen por DTO y
 * se renderizan en el admin, así que un cliente que los escriba reintroduce por
 * la puerta del PATCH el texto crudo de Resend que a7fac68 dejó de persistir.
 *
 * POR QUÉ SE PRUEBA AQUÍ Y NO EN EL SPEC DEL CONTROLLER: el spec del
 * controlador mockea `@0xc1x/role-commons` entero, así que no puede usar el
 * schema real. Aquí se usa el schema de verdad, pero además se lee el
 * METADATA de la ruta: una composición `new ZodValidationPipe(schema)` a mano
 * pasa igual si alguien borra el `@Body(...)` del controlador, y entonces
 * `repository.updateSend` recibe un `{ ...values }` crudo. Un test que pasa
 * igual haya o haya wiring es peor que no tener test, así que aquí se
 * comprueban las dos cosas: que la composición rechaza los campos, y que la
 * ruta está cableada con ella.
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

  it('está cableada con ese pipe en el body de la ruta', () => {
    // Lee el metadata que Nest escribe al aplicar `@Body(pipe)`. Si el pipe se
    // borra del controlador, `pipes` queda vacío y esto falla — que es el
    // punto: la protección del PATCH depende de esa línea de código, no del
    // contrato del schema.
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      EmailMarketingController,
      'updateSend',
    ) as Record<string, { index: number; pipes: unknown[] }> | undefined;

    expect(args).toBeDefined();
    const bodyParam = Object.values(args!).find((param) => param.index === 1);
    expect(bodyParam).toBeDefined();
    expect(bodyParam!.pipes).toHaveLength(1);

    const wired = bodyParam!.pipes[0] as { schema: unknown };
    expect(wired).toBeInstanceOf(ZodValidationPipe);
    // Misma identidad, no solo la misma forma: un schema equivalente pero
    // distinto dejaría pasar campos que este no acepta.
    expect(wired.schema).toBe(UpdateEmailSendSchema);
  });

  it('sigue siendo la ruta PATCH de un envío concreto', () => {
    const handler = EmailMarketingController.prototype.updateSend;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('sends/:id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PATCH,
    );
  });
});
