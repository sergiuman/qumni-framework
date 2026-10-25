import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import * as path from 'path';
import * as fs from 'fs';
import { Database } from './schema.js';
import { NodeSqliteDialect } from './sqlite-dialect.js';
import { SQLITE_INIT_DDL } from './init-sql.js';

let dbInstance: Kysely<Database> | null = null;
let isPostgres = false;

export function getDb(databaseUrl?: string): Kysely<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const url = databaseUrl || process.env.DATABASE_URL;

  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    isPostgres = true;
    const pool = new pg.Pool({ connectionString: url });
    dbInstance = new Kysely<Database>({
      dialect: new PostgresDialect({ pool })
    });
  } else {
    isPostgres = false;
    let dbPath = ':memory:';
    if (url && !url.includes(':memory:')) {
      dbPath = url.replace(/^sqlite:\/\//, '');
    } else if (process.env.NODE_ENV !== 'test') {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      dbPath = path.resolve(dataDir, 'beergame.sqlite');
    }

    dbInstance = new Kysely<Database>({
      dialect: new NodeSqliteDialect({
        inMemory: dbPath === ':memory:',
        databasePath: dbPath !== ':memory:' ? dbPath : undefined
      })
    });
  }

  return dbInstance;
}

export async function initDatabase(db: Kysely<Database>): Promise<void> {
  if (!isPostgres) {
    // Execute SQLite DDL statements
    const statements = SQLITE_INIT_DDL.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await db.executeQuery({
        sql: stmt,
        parameters: [],
        query: { kind: 'RawNode' } as any
      });
    }
  } else {
    // For Postgres: read db/schema.sql and execute
    const schemaPath = path.resolve(process.cwd(), '../../db/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const ddl = fs.readFileSync(schemaPath, 'utf-8');
      const statements = ddl.split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      for (const stmt of statements) {
        await db.executeQuery({
          sql: stmt,
          parameters: [],
          query: { kind: 'RawNode' } as any
        });
      }
    }
  }
}

export function closeDatabase(): Promise<void> {
  if (dbInstance) {
    const db = dbInstance;
    dbInstance = null;
    return db.destroy();
  }
  return Promise.resolve();
}
