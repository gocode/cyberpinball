// Fausse D1 des essais du service (packages/service-telephone/worker.mjs) : la base « RETOURS » en
// mémoire, sur node:sqlite avec schema.sql. Partagée par retours-service.test.ts et mon-compte.test.ts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { REPO_ROOT } from './i18n-scan';

export const SERVICE_DIR = path.join(REPO_ROOT, 'packages', 'service-telephone');
const SCHEMA = fs.readFileSync(path.join(SERVICE_DIR, 'schema.sql'), 'utf8');

type Row = Record<string, unknown>;

/**
 * Fausse D1 : prepare().bind().all()/first()/run() et batch() (une transaction), sur node:sqlite avec
 * schema.sql. Comme D1 : un booléen devient 0/1, un ArrayBuffer un BLOB, un BLOB revient en tableau
 * d'octets, undefined est refusé.
 */
export function memoryD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const input = (v: unknown): SQLInputValue => {
    if (v === undefined) throw new TypeError('D1_TYPE_ERROR: undefined');
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    return v as SQLInputValue;
  };
  const output = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? Array.from(v) : v]));
  class Statement {
    constructor(
      readonly sql: string,
      readonly params: SQLInputValue[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params.map(input));
    }
    rows(): Row[] {
      return db.prepare(this.sql).all(...this.params).map((r) => output(r as Row));
    }
    async all() {
      return { results: this.rows(), success: true, meta: {} };
    }
    async first(column?: string) {
      const row = this.rows()[0];
      if (!row) return null;
      return column === undefined ? row : (row[column] ?? null);
    }
    async run() {
      const r = db.prepare(this.sql).run(...this.params);
      return { results: [], success: true, meta: { changes: Number(r.changes) } };
    }
  }
  return {
    db,
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => ({ results: s.rows(), success: true, meta: {} }));
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

