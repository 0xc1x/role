import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthUser } from '../../auth/auth.types';
import { OrdersController } from './orders.controller';

/**
 * `GET /orders/admin` expone las órdenes de TODOS los negocios. La defensa es
 * el par decorador + guard, y el orden de declaración de la ruta (`admin` antes
 * que `:id`) es lo que hace que el segmento literal exista. Estos tests leen
 * los metadatos reales del handler y los pasan por el `RolesGuard` real: un
 * mock del guard probaría el mock.
 */

const handler = OrdersController.prototype.listForAdmin;

function contextFor(user?: AuthUser) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => OrdersController,
  } as never;
}

const admin: AuthUser = { id: 'a1', email: 'a@x.com', role: 'admin' };
const businessOwner: AuthUser = {
  id: 'b1',
  email: 'b@x.com',
  role: 'business',
};
const consumer: AuthUser = { id: 'u1', email: 'u@x.com', role: 'user' };

describe('GET /orders/admin — acceso', () => {
  it('declara @Roles(admin) en el handler', () => {
    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride(ROLES_KEY, [handler, OrdersController]),
    ).toEqual(['admin']);
  });

  it('deja pasar a un admin', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextFor(admin))).toBe(true);
  });

  // Un dueño de negocio no es "admin que también tiene negocios": sin este
  // rol el endpoint transversal leería las órdenes de su competencia.
  it('rechaza a un dueño de negocio', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(contextFor(businessOwner))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza a un consumidor', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(contextFor(consumer))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza a un usuario sin sesión', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });

  it('es un segmento literal en un GET, no el comodín :id', () => {
    const reflector = new Reflector();
    expect(reflector.get(PATH_METADATA, handler)).toBe('admin');
    expect(reflector.get(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    // El comodín sigue siendo `:id`: `admin` no lo absorbió.
    expect(
      reflector.get(PATH_METADATA, OrdersController.prototype.getById),
    ).toBe(':id');
  });
});
