import { Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { DatabaseError } from '../common/errors';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';
import * as schema from './schema';
import { DB, type Database } from './db.types';

/** Injection token for the underlying pg Pool (rarely needed directly). */
export const PG_POOL = Symbol('PG_POOL');

/**
 * Global database module.
 *
 * Provides:
 *  - PG_POOL: a configured `pg` Pool (size from DB_POOL_SIZE).
 *  - DB:      a Drizzle instance bound to our schema.
 *
 * On init it runs a `SELECT 1` ping to fail fast with an actionable error if
 * DATABASE_URL is unreachable. On shutdown it closes the pool cleanly.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (env: Env): Pool =>
        new Pool({
          connectionString: env.DATABASE_URL,
          max: env.DB_POOL_SIZE,
        }),
      inject: [ENV],
    },
    {
      provide: DB,
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
      inject: [PG_POOL],
    },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbModule.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.db.execute(sql`select 1`);
      this.logger.log('Database connection verified.');
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const redacted = this.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***:***@');
      throw new DatabaseError(
        `Cannot reach the database at ${redacted}.\n` +
          `  Reason: ${reason}\n` +
          `  Check that Postgres is running (\`docker compose up -d\`) and that ` +
          `DATABASE_URL points at the right host/port.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
