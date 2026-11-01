import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// One client per server instance (and across hot reloads in dev).
// Created lazily so `next build` works without DATABASE_URL.
const g = globalThis as unknown as { __db?: DB };

export function getDb(): DB {
  if (g.__db) return g.__db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    max: 3,
    // Neon's pooled (PgBouncer) endpoint does not support prepared statements.
    prepare: false,
  });
  g.__db = drizzle(client, { schema });
  return g.__db;
}

export { schema };
