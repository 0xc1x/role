import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

/**
 * El catálogo y la suscripción del negocio (§4.5).
 *
 * ─── POR QUÉ UN MÓDULO PROPIO Y NO DOS ───────────────────────────────────────
 *
 * Porque las tres rutas son del mismo asunto: el catálogo dice qué planes hay
 * y qué incluye cada uno, y la suscripción dice cuál de ellos tiene un
 * negocio. Separarlas en dos módulos pondría el catálogo en un sitio y la
 * pregunta «qué plan tiene este negocio» en otro, que es la forma de que el
 * panel y el motor se aparten sin que nadie lo note.
 *
 * ─── POR QUÉ NO HAY NADA MÁS AQUÍ ───────────────────────────────────────────
 *
 * Ni pasarela, ni cobro, ni renovación, ni un plan de consumidor. El plan se
 * asigna A MANO y el negocio sigue operando con los límites que tenga: el
 * plan bloquea CRECER, nunca operar (§5.4). Todo lo demás —el precio, la
 * factura, el cobro automático— es de otra etapa, y esta API no lo anticipa.
 *
 * Y la base de estas tres tablas tiene RLS habilitado y CERO policies: la
 * alcanza el rol de servicio —`DATABASE_URL`, que es `postgres` y tiene
 * BYPASSRLS— y ningún cliente. No hay que abrirle nada a `anon` ni a
 * `authenticated` para que esta API las lea: las lee desde el servidor.
 */
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsService, SubscriptionsRepository],
})
export class SubscriptionsModule {}
