import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { CreateCommand } from './cli/create.command';

/**
 * Root module. CLI-first (no HTTP server in Phase 0).
 *
 * ConfigModule and DbModule are @Global, so the validated env and the Drizzle
 * DB instance are injectable anywhere. CLI commands are registered as providers
 * and picked up by nest-commander's CommandFactory.
 */
@Module({
  imports: [ConfigModule, DbModule],
  providers: [CreateCommand],
})
export class AppModule {}
