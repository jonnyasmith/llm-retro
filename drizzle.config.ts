import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/database/schema.ts',
  out: './drizzle',
});
