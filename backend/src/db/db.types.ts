import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

/**
 * The concrete Drizzle database type, bound to our schema. Inject this via the
 * DB token (see db.module.ts) wherever you need typed query access.
 */
export type Database = NodePgDatabase<typeof schema>;

/** Injection token for the Drizzle database instance. */
export const DB = Symbol('DB');
