import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "@neondatabase/serverless";

const root = dirname(fileURLToPath(import.meta.url));

function postgresSql(statement) {
  let sql = statement.trim();
  if (/^PRAGMA\s+(foreign_keys|journal_mode)\b/i.test(sql)) return null;
  const columns = /^PRAGMA\s+table_info\((\w+)\)$/i.exec(sql);
  if (columns) return `SELECT column_name AS name FROM information_schema.columns WHERE table_name = '${columns[1]}'`;

  const ignoreConflicts = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
  sql = sql.replace(/\s+UNIQUE\s+COLLATE\s+NOCASE/gi, "");
  sql = sql.replace(/expires_at\s+INTEGER/gi, "expires_at BIGINT");
  sql = sql.replace(/julianday\(((?:listings\.)?)verified_at\)\s*>=\s*julianday\('now'\s*,\s*'-30 days'\)/gi, "$1verified_at::timestamptz >= NOW() - INTERVAL '30 days'");
  sql = sql.replace(/\bAS\s+([A-Za-z][A-Za-z0-9_]*)/g, (match, alias) => /[A-Z]/.test(alias) ? `AS "${alias}"` : match);
  sql = sql.replace(/ALTER TABLE (\w+) ADD COLUMN (?!IF NOT EXISTS)/gi, "ALTER TABLE $1 ADD COLUMN IF NOT EXISTS ");
  let index = 0;
  sql = sql.replace(/\?/g, () => `$${++index}`);
  if (ignoreConflicts) sql = sql.replace(/;\s*$/, "") + " ON CONFLICT DO NOTHING";
  return sql;
}

export class Database {
  constructor() {
    this.remote = Boolean(process.env.DATABASE_URL);
    if (this.remote) {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    } else {
      const dataDirectory = resolve(root, "data");
      mkdirSync(dataDirectory, { recursive: true });
      const databasePath = resolve(process.env.DATABASE_PATH || resolve(dataDirectory, "propertyhub.sqlite"));
      mkdirSync(dirname(databasePath), { recursive: true });
      this.sqlite = new DatabaseSync(databasePath);
      this.sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    }
  }

  prepare(statement, client = this.pool) {
    return {
      all: async (...values) => {
        if (!this.remote) return this.sqlite.prepare(statement).all(...values);
        const query = postgresSql(statement);
        return query ? (await client.query(query, values)).rows : [];
      },
      get: async (...values) => {
        if (!this.remote) return this.sqlite.prepare(statement).get(...values);
        const query = postgresSql(statement);
        if (!query) return undefined;
        return (await client.query(query, values)).rows[0];
      },
      run: async (...values) => {
        if (!this.remote) return this.sqlite.prepare(statement).run(...values);
        const query = postgresSql(statement);
        return query ? { changes: (await client.query(query, values)).rowCount || 0 } : { changes: 0 };
      }
    };
  }

  async exec(script, client = this.pool) {
    if (!this.remote) return this.sqlite.exec(script);
    const statements = script.split(";").map((part) => postgresSql(part)).filter(Boolean);
    if (statements.length) await client.query(statements.join(";"));
  }

  async transaction(callback) {
    if (!this.remote) {
      this.sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = await callback(this);
        this.sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        this.sqlite.exec("ROLLBACK");
        throw error;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({ prepare: (statement) => this.prepare(statement, client) });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.remote) await this.pool.end();
    else this.sqlite.close();
  }
}
