/** Firestore implementation of the shared document-store contract (Cloud Functions only). */
import { sortBy } from './shared/utils.js';

const matchOne = (item, w) => {
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
};
const matches = (item, where = []) => where.every((w) => matchOne(item, w));

function buildQuery(db, coll, opts = {}) {
  let q = db.collection(coll);
  // One server-side filter keeps composite-index requirements away; the rest is applied in memory.
  const primary = (opts.where || []).find((w) => ['==', '!=', '>', '>=', '<', '<='].includes(w.op));
  if (primary) q = q.where(primary.field, primary.op, primary.value);
  return { q, primary };
}

function finalize(items, opts = {}) {
  let out = items.filter((d) => matches(d, opts.where || []));
  if (opts.orderBy?.field) out = sortBy(out, opts.orderBy.field, opts.orderBy.dir || 'asc');
  if (opts.offset) out = out.slice(opts.offset);
  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
}

const snapshotDocs = (snap) => {
  if (Array.isArray(snap)) return snap.filter(Boolean).map((d) => ({ ...d.data(), id: d.id }));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
};

function collapse(writes) {
  const final = new Map();
  for (const w of writes) {
    const k = `${w.coll}\u0000${w.id}`;
    if (w.op === 'del') { final.set(k, { ...w }); continue; }
    const prev = final.get(k);
    if (!prev || prev.op === 'del') final.set(k, { op: 'put', coll: w.coll, id: w.id, data: { ...w.data, id: w.id } });
    else final.set(k, { ...prev, data: { ...prev.data, ...w.data, id: w.id } });
  }
  return [...final.values()];
}

export function createFirestoreStore(db) {
  const ref = (coll, id) => db.collection(coll).doc(String(id));
  const overlay = (base, writes, coll, id) => {
    let doc = base;
    for (const w of writes) {
      if (w.coll !== coll || w.id !== String(id)) continue;
      if (w.op === 'del') doc = null;
      else if (w.op === 'put') doc = { ...w.data, id: w.id };
      else if (w.op === 'patch') doc = { ...(doc || {}), ...w.data, id: w.id };
    }
    return doc;
  };

  const listFrom = async (getter, coll, opts = {}) => {
    const { q } = buildQuery(db, coll, opts);
    const snap = await getter(q);
    return finalize(snapshotDocs(snap), opts);
  };

  const store = {
    kind: 'firestore',
    async get(coll, id) {
      const snap = await ref(coll, id).get();
      return snap.exists ? { ...snap.data(), id: snap.id } : null;
    },
    async put(coll, id, data) {
      const doc = { ...data, id: String(id) };
      await ref(coll, id).set(doc);
      return doc;
    },
    async patch(coll, id, patch) {
      await ref(coll, id).set({ ...patch, id: String(id) }, { merge: true });
      return { ...patch, id: String(id) };
    },
    async del(coll, id) { await ref(coll, id).delete(); },
    async list(coll, opts = {}) { return listFrom((q) => q.get(), coll, opts); },
    tx(fn) {
      return db.runTransaction(async (t) => {
        const writes = [];
        const txStore = {
          async get(coll, id) {
            const snap = await t.get(ref(coll, id));
            return overlay(snap.exists ? { ...snap.data(), id: snap.id } : null, writes, coll, id);
          },
          async put(coll, id, data) { writes.push({ op: 'put', coll, id: String(id), data: { ...data, id: String(id) } }); },
          async patch(coll, id, patch) { writes.push({ op: 'patch', coll, id: String(id), data: patch }); },
          async del(coll, id) { writes.push({ op: 'del', coll, id: String(id) }); },
          async list(coll, opts = {}) {
            const base = await listFrom((query) => t.get(query), coll, opts);
            const map = new Map(base.map((d) => [d.id, d]));
            for (const w of writes) {
              if (w.coll !== coll) continue;
              if (w.op === 'del') map.delete(w.id);
              else if (w.op === 'put') map.set(w.id, { ...w.data, id: w.id });
              else map.set(w.id, { ...(map.get(w.id) || {}), ...w.data, id: w.id });
            }
            return finalize([...map.values()], opts);
          },
          async tx() { throw new Error('Nested transactions are not supported'); },
        };
        const result = await fn(txStore);
        for (const w of collapse(writes)) {
          const r = ref(w.coll, w.id);
          if (w.op === 'del') await t.delete(r);
          else if (w.op === 'patch') await t.set(r, w.data, { merge: true });
          else await t.set(r, w.data);
        }
        return result;
      });
    },
  };
  return store;
}
