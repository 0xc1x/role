import { describe, expect, it } from 'bun:test';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { StaffController } from './staff.controller';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import { StaffSessionController } from './staff-session.controller';
import { StaffModule } from './staff.module';

/**
 * `StaffModule` se registra en `AppModule` y expone las nueve rutas del §8.
 *
 * El módulo existe para que la DI sea real —el `service_role` es lo único que
 * puede crear un `auth.users`, y el writer de `business_members` es esta API
 * (§6.3)— y los controladores se declaran en `controllers`, que es lo que hace
 * que las rutas EXISTAN. Un módulo con las nueve rutas especificadas y sin esta
 * entrada arranca sin error y responde 404 a las nueve, que es el modo de fallo
 * más caro de los que no se ven.
 */
describe('StaffModule', () => {
  it('declara los providers que el servicio necesita', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      StaffModule,
    ) as unknown[];

    expect(providers).toContain(StaffService);
    expect(providers).toContain(StaffRepository);
  });

  it('registra los DOS controladores: ocho rutas cuelgan del negocio y la novena no', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      StaffModule,
    ) as unknown[];

    // Uno solo no alcanza: `POST /staff/session` no es
    // `businesses/:businessId/staff/session`, y declararla bajo ese prefijo
    // haría que el prefijo afirmara «de este negocio se administra» para una
    // ruta que no administra nada.
    expect(controllers).toContain(StaffController);
    expect(controllers).toContain(StaffSessionController);
  });

  it('la novena ruta NO está en el controlador de las ocho', () => {
    // Un controller por archivo es el patrón del repo, y el nombre de cada uno
    // dice a qué pertenece la ruta. Si las nueve volvieran a un archivo, un
    // lector que abriera `staff.controller.ts` buscando «las rutas del equipo»
    // leería ocho y concluiría que un empleado no tiene ninguna —que es la
    // lectura equivocada en la dirección que más daña—.
    expect(Object.getOwnPropertyNames(StaffController.prototype)).not.toContain(
      'stampSession',
    );
    expect(
      Object.getOwnPropertyNames(StaffSessionController.prototype),
    ).toContain('stampSession');
  });

  it('exporta el servicio: lo consumen los controladores y cualquier "cortar todos los accesos" del §10', () => {
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      StaffModule,
    ) as unknown[];

    expect(exports).toContain(StaffService);
  });
});
