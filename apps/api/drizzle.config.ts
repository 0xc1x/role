import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Supabase owns DDL. Use pull/introspect only — do not push migrations from the API.
 * npm run db:pull
 */
export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  schemaFilter: ['public'],
});
