import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// 共用型別（node-postgres 和 pglite 的 query interface 相同）
export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

const DB_TOKEN = 'DB';
export { DB_TOKEN as DB };

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: async (): Promise<AppDb> => {
        if (process.env.USE_PG_MEM === 'true') {
          const { PGlite } = await import('@electric-sql/pglite');
          const { drizzle: drizzlePg } = await import('drizzle-orm/pglite');

          const client = new PGlite();

          // 建立 schema（對應 src/db/schema/users.ts）
          await client.exec(`
            CREATE TYPE user_role     AS ENUM ('surveyor', 'respondent', 'admin');
            CREATE TYPE auth_provider AS ENUM ('email', 'google', 'line');
            CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'pending_verify');

            CREATE TABLE users (
              id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              email          VARCHAR(255) NOT NULL UNIQUE,
              password_hash  VARCHAR(255),
              role           user_role    NOT NULL,
              status         user_status  NOT NULL DEFAULT 'active',
              display_name   VARCHAR(100) NOT NULL,
              avatar_url     TEXT,
              email_verified BOOLEAN      NOT NULL DEFAULT false,
              created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              deleted_at     TIMESTAMPTZ
            );

            CREATE TABLE oauth_accounts (
              id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id             UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              provider            auth_provider NOT NULL,
              provider_account_id VARCHAR(255)  NOT NULL,
              access_token        TEXT,
              refresh_token       TEXT,
              token_expires_at    TIMESTAMPTZ,
              created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
            );
          `);

          console.log('✅ PGlite in-memory DB initialized');
          return drizzlePg(client, { schema }) as unknown as AppDb;
        }

        // 真實 PostgreSQL
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 2_000,
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
