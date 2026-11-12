#!/usr/bin/env node
/**
 * OPTIONAL development seed: creates sample *content* (tournaments, banners,
 * FAQ, announcements) so a fresh local install is not an empty shell.
 * It never creates fake users, balances, transactions or results.
 * Run manually with `npm run seed:demo` — it is not executed at boot.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteStore } from '../server/sqlite-store.js';
import { C } from '../shared/domain.js';
import { uid, now } from '../shared/utils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(root, '.env')); } catch { /* optional */ }
const dataDir = path.resolve(root, process.env.DATA_DIR || './server/data');
const store = createSqliteStore({ file: path.join(dataDir, 'nexus.sqlite'), dataDir });

const existing = await store.list(C.tournaments, {});
if (existing.length) { console.log(`[seed] ${existing.length} tournaments already exist — nothing to do.`); store.close(); process.exit(0); }
const mk = (d, h) => { const x = new Date(Date.now() + d * 86400000); x.setHours(h, 0, 0, 0); return { date: x.toISOString().slice(0, 10), time: `${String(h).padStart(2, '0')}:00` }; };
const templates = [
  { title: 'Friday Night Showdown', gameMode: 'Battle Royale', teamType: 'Squad', entryFee: 10000, slots: 48, prizePool: 500000, prize1: 250000, prize2: 150000, prize3: 100000, status: 'registration_open', days: 2, hour: 20, mapName: 'Bermuda', matchType: 'Ranked' },
  { title: 'Clash Squad Blitz', gameMode: 'Clash Squad', teamType: 'Duo', entryFee: 5000, slots: 32, prizePool: 200000, prize1: 100000, prize2: 60000, prize3: 40000, status: 'registration_open', days: 1, hour: 19, mapName: 'Purgatory', matchType: 'Ranked' },
  { title: 'Lone Wolf Duel', gameMode: 'Lone Wolf', teamType: 'Solo', entryFee: 2000, slots: 24, prizePool: 80000, prize1: 40000, prize2: 25000, prize3: 15000, status: 'upcoming', days: 4, hour: 21, mapName: 'Training Grounds', matchType: '1v1' },
  { title: 'Weekend Grand Arena', gameMode: 'Battle Royale', teamType: 'Squad', entryFee: 20000, slots: 96, prizePool: 1500000, prize1: 750000, prize2: 450000, prize3: 300000, status: 'upcoming', days: 6, hour: 20, mapName: 'Kalahari', matchType: 'Ranked' },
];
await store.tx(async (tx) => {
  for (const t of templates) {
    const { date, time } = mk(t.days, t.hour);
    const id = uid('trn_');
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    await tx.put(C.tournaments, id, {
      id, title: t.title, gameMode: t.gameMode, teamType: t.teamType, entryFee: t.entryFee, slots: t.slots,
      prizePool: t.prizePool, prize1: t.prize1, prize2: t.prize2, prize3: t.prize3,
      matchDate: date, matchTime: time, registrationClose: '', mapName: t.mapName, matchType: t.matchType,
      banner: '', description: `Community ${t.gameMode} tournament. Original Nexus Arena event.`,
      rules: '1. Fair play only — no cheats or third-party tools.\n2. Join the room 10 minutes before kick-off.\n3. Results are verified by the admin team.\n4. Disputes require a screenshot in a support ticket.',
      status: t.status, joinedCount: 0, roomReleased: false, resultPublished: false, startsAt,
      createdAt: now(), updatedAt: now(), createdBy: 'seed-script',
    });
    await tx.put(C.rooms, id, { tournamentId: id, roomId: '', roomPassword: '', updatedAt: now() });
  }
  const annId = uid('ann_');
  await tx.put(C.announcements, annId, { id: annId, title: 'Welcome to the circuit',
    body: 'Practice mode is active: all balances are platform credits with no cash value. Tournaments are sample content — delete or edit them from the Admin panel.',
    createdAt: now(), createdBy: 'seed-script' });
});
console.log(`[seed] ${templates.length} sample tournaments + 1 announcement created. No fake users or balances were created.`);
store.close();
