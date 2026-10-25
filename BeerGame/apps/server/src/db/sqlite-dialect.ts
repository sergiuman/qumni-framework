import { DatabaseSync } from 'node:sqlite';
import {
  Dialect,
  Driver,
  DatabaseConnection,
  CompiledQuery,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  Kysely,
  TransactionSettings
} from 'kysely';

export class NodeSqliteDialect implements Dialect {
  private db: DatabaseSync;

  constructor(options: { databasePath?: string; inMemory?: boolean } = {}) {
    if (options.inMemory || !options.databasePath) {
      this.db = new DatabaseSync(':memory:');
    } else {
      this.db = new DatabaseSync(options.databasePath);
    }
    // Enable foreign keys and WAL mode if on disk
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (!options.inMemory && options.databasePath) {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch {
        // ignore if not supported
      }
    }
  }

  createDriver(): Driver {
    return new NodeSqliteDriver(this.db);
  }

  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<any>): SqliteIntrospector {
    return new SqliteIntrospector(db);
  }
}

class NodeSqliteDriver implements Driver {
  constructor(private db: DatabaseSync) {}

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new NodeSqliteConnection(this.db);
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {
    this.db.close();
  }

  async beginTransaction(connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('BEGIN'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('COMMIT'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('ROLLBACK'));
  }
}

class NodeSqliteConnection implements DatabaseConnection {
  constructor(private db: DatabaseSync) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(compiledQuery.sql);
    const stmt = this.db.prepare(compiledQuery.sql);

    if (isSelect) {
      const rows = stmt.all(...(compiledQuery.parameters as any[])) as R[];
      return { rows };
    } else {
      const info = stmt.run(...(compiledQuery.parameters as any[]));
      return {
        rows: [],
        numAffectedRows: BigInt(info.changes),
        insertId: BigInt(info.lastInsertRowid)
      };
    }
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const res = await this.executeQuery<R>(compiledQuery);
    yield res;
  }
}
