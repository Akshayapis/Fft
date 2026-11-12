/**
 * SQLite implementation of the shared document-store contract.
 * Documents are JSON; a few hot fields are indexed columns. Transactions are
 * serialized and buffered, so every mutation inside `tx()` is atomic and rollback-safe.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { sortBy } from '../shared/utils.js';

function matches(item, where = []) {
  return where.every((w) => {
    const v = item?.[w.field];
    switch (w.op) {
      case '==': return v === w.value;
      case '!=': return v !== w.value;
      case '>': return v > w.value;
      case '>=': return v >= w.value;
      case '<': return v < w.value;
      case '<=': return v <= w.value;
      case 'in': return Array.isArray(w.value) && w.value.includes(v);
      default: return false;
    }
  });
}

export function createSqliteStore({ file = ':memory:' } = {}) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS docs (
    coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    user_id TEXT, ref TEXT, status TEXT, created_at TEXT, type TEXT,
    PRIMARY KEY (coll, id)
  );
  CREATE INDEX IF NOT EXISTS idx_docs_user ON docs(coll, user_id);
  CREATE INDEX IF NOT EXISTS idx_docs_status ON docs(coll, status);
  CREATE INDEX IF NOT EXISTS idx_docs_ref ON docs(coll, ref);
  CREATE INDEX IF NOT EXISTS idx_docs_created ON docs(coll, created_at);`);

  const readStmt = db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?');
  const collStmt = db.prepare('SELECT data FROM docs WHERE coll = ?');
  const filteredStmt = db.prepare('SELECT data FROM docs WHERE coll = ? AND user_id = ?');
  const writeStmt = db.prepare(`INSERT INTO docs (coll, id, data, user_id, ref, status, created_at, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET
    data = excluded.data, user_id = excluded.user_id, ref = excluded.ref,
    status = excluded.status, created_at = excluded.created_at, type = excluded.type`);
  const delStmt = db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?');

  const columns = (d) => [String(d.userId ?? ''), String(d.ref ?? d.key ?? d.tournamentId ?? ''),
    String(d.status ?? ''), String(d.createdAt ?? ''), String(d.type ?? '')];

  const getSync = (coll, id) => {
    const row = readStmt.get(coll, String(id));
    return row ? JSON.parse(row.data) : null;
  };
  const putSync = (coll, id, data) => {
    const doc = { ...data, id: String(id) };
    writeStmt.run(coll, String(id), JSON.stringify(doc), ...columns(doc));
    return doc;
  };
  const delSync = (coll, id) => delStmt.run(coll, String(id));

  const listSync = (coll, opts = {}) => {
    const where = opts.where || [];
    const userFilter = where.find((w) => w.field === 'userId' && w.op === '==');
    const rows = userFilter ? filteredStmt.all(coll, String(userFilter.value)) : collStmt.all(coll);
    return rows.map((r) => JSON.parse(r.data)).filter((d) => matches(d, where));
  };

  const finalize = (items, opts = {}) => {
    let out = items;
    if (opts.orderBy?.field) out = sortBy(out, opts.orderBy.field, opts.orderBy.dir || 'asc');
    if (opts.offset) out = out.slice(opts.offset);
    if (opts.limit) out = out.slice(0, opts.limit);
    return out;
  };

  const overlay = (base, writes, coll, id) => {
    let doc = base;
    for (const w of writes) {
      if (w.coll !== coll || w.id !== String(id)) continue;
      if (w.op === 'del') doc = null;
      else if (w.op === 'put') doc = { ...w.data, id: String(id) };
      else if (w.op === 'patch' && doc) doc = { ...doc, ...w.data, id: String(id) };
    }
    return doc;
  };

  const makeTransaction = () => {
    const writes = [];
    const tx = {
      async get(coll, id) { return overlay(getSync(coll, id), writes, coll, id); },
      async put(coll, id, data) { writes.push({ op: 'put', coll, id: String(id), data: { ...data, id: String(id) } }); },
      async patch(coll, id, patch) { writes.push({ op: 'patch', coll, id: String(id), data: patch }); },
      async del(coll, id) { writes.push({ op: 'del', coll, id: String(id) }); },
      async list(coll, opts = {}) {
        const base = listSync(coll, opts);
        const map = new Map(base.map((d) => [d.id, d]));
        for (const w of writes) {
          if (w.coll !== coll) continue;
          if (w.op === 'del') map.delete(w.id);
          else if (w.op === 'put') map.set(w.id, { ...w.data, id: w.id });
          else if (w.op === 'patch' && map.has(w.id)) map.set(w.id, { ...map.get(w.id), ...w.data, id: w.id });
          else if (w.op === 'patch') map.set(w.id, { ...w.data, id: w.id });
        }
        return finalize([...map.values()].filter((d) => matches(d, opts.where || [])), opts);
      },
      async tx() { throw new Error('Nested transactions are not supported'); },
    };
    return { tx, writes };
  };

  let chain = Promise.resolve();
  const store = {
    kind: 'sqlite',
    async get(coll, id) { return getSync(coll, id); },
    async put(coll, id, data) { return putSync(coll, id, data); },
    async patch(coll, id, patch) { const cur = getSync(coll, id) || {}; return putSync(coll, id, { ...cur, ...patch, id: String(id) }); },
    async del(coll, id) { return delSync(coll, id); },
    async list(coll, opts = {}) { return finalize(listSync(coll, opts), opts); },
    tx(fn) {
      const run = chain.then(async () => {
        const { tx, writes } = makeTransaction();
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(tx);
          for (const w of writes) {
            if (w.op === 'del') delSync(w.coll, w.id);
            else if (w.op === 'put') putSync(w.coll, w.id, w.data);
            else putSync(w.coll, w.id, { ...(getSync(w.coll, w.id) || {}), ...w.data, id: w.id });
          }
          db.exec('COMMIT');
          return result;
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
          throw err;
        }
      });
      chain = run.catch(() => {});
      return run;
    },
    close() { try { db.close(); } catch { /* noop */ } },
    raw: db,
  };
  return store;
}
