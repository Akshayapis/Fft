/** Scheduled match reminders — idempotent, works on both backends. */
import { C, notify } from './domain.js';
import { now, uid } from './utils.js';

export async function runMatchReminders(store, onChange = () => {}) {
  const ts = Date.now();
  const [tournaments, registrations] = await Promise.all([
    store.list(C.tournaments, {}), store.list(C.registrations, {}),
  ]);
  const upcoming = tournaments.filter((t) => {
    if (['completed', 'cancelled'].includes(t.status) || !t.startsAt) return false;
    const delta = Date.parse(t.startsAt) - ts;
    return delta > 0 && delta <= 30 * 60000;
  });
  let sent = 0;
  for (const t of upcoming) {
    const joined = registrations.filter((r) => r.tournamentId === t.id && r.status === 'joined');
    for (const r of joined) {
      const key = `${t.id}:${r.userId}`;
      if (await store.get(C.reminders, key)) continue;
      await store.tx(async (tx) => {
        if (await tx.get(C.reminders, key)) return;
        await tx.put(C.reminders, key, { id: key, tournamentId: t.id, userId: r.userId, createdAt: now() });
        await notify(tx, r.userId, { type: 'match', title: 'Match starting soon',
          body: `${t.title} begins at ${new Date(t.startsAt).toLocaleString('en-IN')}. Open the match page for room details.`,
          link: `/matches/${t.id}` });
      });
      onChange(r.userId);
      sent++;
    }
  }
  return { sent, matches: upcoming.length, at: now(), id: uid('job_') };
}
