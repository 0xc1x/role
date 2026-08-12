import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../config/env.schema';
import { DRIZZLE, POSTGRES_CLIENT } from './database.tokens';

/**
 * Drizzle 1.x postgres-js client.
 * RQB typing uses `relations` (via `defineRelations`), not the legacy table `schema` map.
 * Tables are imported directly from `./schema/*` in repositories.
 */
export type Database = PostgresJsDatabase;

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Sql => {
        const connectionString = config.get('DATABASE_URL', { infer: true });
        // Transaction pooler (Supabase :6543) does not support prepared statements.
        return postgres(connectionString, { prepare: false, max: 10 });
      },
    },
    {
      provide: DRIZZLE,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: Sql): Database =>
        drizzle({
          client,
        }),
    },
  ],
  exports: [DRIZZLE, POSTGRES_CLIENT],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(POSTGRES_CLIENT) private readonly client: Sql) {}

  async onModuleDestroy() {
    await this.client.end({ timeout: 5 });
  }
}
