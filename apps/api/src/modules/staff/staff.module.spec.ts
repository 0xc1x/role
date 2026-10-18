import { describe, expect, it } from 'bun:test';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import { StaffModule } from './staff.module';

/**
 * `StaffModule` se registra en `AppModule` desde esta tarea, sin controlador.
 *
 * Eso no es un descuido a medias: el módulo existe para que la DI sea real —el
 * `service_role` es lo único que puede crear un `auth.users`, y el writer de
 * `business_members` es esta API (§6.3)— y registrarlo ahora hace que un fallo de
 * cableado se vea en el arranque de la app en vez de en el día que se agregue la
 * primera ruta.
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

  it('exporta el servicio: el controlador de la tarea siguiente lo consume', () => {
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      StaffModule,
    ) as unknown[];

    expect(exports).toContain(StaffService);
  });
});
