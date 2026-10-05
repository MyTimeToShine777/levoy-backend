'use strict';

// Fills a DEVELOPMENT database with believable call history so the Call History / Analytics / Contacts
// screens have something to show: a month of working days per telecaller, lunch and tea breaks, SIM 1 / SIM 2 /
// WhatsApp calls, saved names, a few notes and tags. Every number is fake and starts with "+91 90000".
//
//   node --env-file=.env.test scripts/seed-demo-calls.js --yes            add data
//   node --env-file=.env.test scripts/seed-demo-calls.js --reset --yes    remove the demo calls again
//
// It refuses to run against the default Postgres port (5432) unless --allow-default-port is given, so the
// real database is never filled with demo rows by accident.

const { pool, q } = require('../src/config/db');

const args = new Set(process.argv.slice(2));
const PREFIX = '+91 90000';
const IST = 330;                       // working day is expressed in IST, stored as UTC wall-clock
const DAYS = 30;

const NAMES = ['Aarav Mehta', 'Diya Nair', 'Kabir Shah', 'Ananya Iyer', 'Rohan Gupta', 'Meera Pillai', 'Vikram Rao', 'Isha Kapoor', 'Arjun Reddy', 'Sneha Joshi',
  'Karan Malhotra', 'Pooja Verma', 'Rahul Bansal', 'Neha Chopra', 'Siddharth Jain', 'Tanvi Desai', 'Aditya Menon', 'Riya Sethi', 'Manish Kulkarni', 'Priya Nambiar'];
const NOTES = ['Asked for the price list', 'Will decide by Friday', 'Call back after 5 pm', 'Wants a demo next week', 'Wrong number', 'Interested in bulk order', 'Needs GST invoice'];
const TAGS = ['Interested', 'Follow-up', 'Price query', 'Wrong number'];

// small seeded PRNG so a re-run produces the same month
let seed = 20261003;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

async function main() {
  const host = `${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || 5432}/${process.env.PG_DB || 'levoy'}`;
  if (!args.has('--yes')) { console.error(`Target ${host}. Re-run with --yes to continue.`); process.exit(2); }
  if (String(process.env.PG_PORT || 5432) === '5432' && !args.has('--allow-default-port')) {
    console.error(`Refusing to touch ${host}: that is the default Postgres port. Point PG_PORT at a development database.`); process.exit(2);
  }

  if (args.has('--reset')) {
    const r = await q('DELETE FROM call_events WHERE phone_number LIKE $1', [PREFIX + '%']);
    console.log(`removed ${r.rowCount} demo calls from ${host}`);
    return;
  }

  const users = (await q("SELECT id, name, role FROM users WHERE is_active = true ORDER BY (role = 'agent') DESC, id LIMIT 6")).rows;
  if (!users.length) throw new Error('no users to seed calls for');
  const tagIds = [];
  for (const t of TAGS) {
    tagIds.push((await q('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [t])).rows[0].id);
  }

  let total = 0;
  for (const u of users) {
    // this person's address book: some saved (named), some strangers
    const book = Array.from({ length: 36 }, (_, i) => ({
      number: `${PREFIX}${String(u.id * 100 + i).padStart(5, '0')}`.slice(0, 15),
      name: i < 20 ? NAMES[(i + u.id) % NAMES.length] : null,
    }));
    for (let back = DAYS; back >= 0; back--) {
      const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() - back);
      const dow = new Date(day.getTime() + IST * 60000).getUTCDay();
      if (dow === 0) continue;                                           // Sundays off
      const dayStart = day.getTime() - IST * 60000;                      // local midnight as a UTC instant
      let cursor = dayStart + (9 * 60 + between(25, 50)) * 60000;        // first call about 09:30–09:50
      const teaAt = dayStart + (16 * 60 + between(0, 20)) * 60000;
      const count = between(14, 38);
      for (let i = 0; i < count; i++) {
        const h = (cursor - dayStart) / 3600000;
        if (h > 18.5) break;
        if (h >= 13 && h < 14.2) cursor = dayStart + (14 * 60 + between(5, 20)) * 60000;      // lunch
        if (cursor >= teaAt && cursor < teaAt + 25 * 60000) cursor = teaAt + 28 * 60000;       // a tea break
        const contact = pick(book);
        const roll = rnd();
        let direction = 'outgoing', status = 'connected', dur = 0;
        if (roll < 0.58) { direction = 'outgoing'; if (rnd() < 0.62) dur = between(25, 540); else status = 'missed'; }
        else if (roll < 0.82) { direction = 'incoming'; dur = between(15, 420); }
        else if (roll < 0.93) { direction = 'incoming'; status = 'missed'; }
        else { direction = 'incoming'; status = 'rejected'; }
        const whatsapp = rnd() < 0.12;
        const slot = whatsapp ? null : (rnd() < 0.7 ? 1 : 2);
        const note = dur > 60 && rnd() < 0.18 ? pick(NOTES) : null;
        const r = await q(
          `INSERT INTO call_events (user_id, phone_number, direction, status, duration_seconds, timestamp, caller_id, notes, source, sim_slot, sim_label)
           VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7,$8,$9,$10,$11) RETURNING id`,
          [u.id, contact.number, direction, status, dur, new Date(cursor).toISOString(), contact.name, note,
            whatsapp ? 'whatsapp' : 'sim', slot, slot === 1 ? 'Jio' : slot === 2 ? 'Airtel' : null]);
        if (note && rnd() < 0.6) await q('INSERT INTO call_event_tags (call_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].id, pick(tagIds)]);
        total++;
        cursor += (dur + between(40, 420)) * 1000;                       // talk time + a few minutes to the next dial
        if (rnd() < 0.04) cursor += between(20, 45) * 60000;             // an occasional long gap
      }
    }
    await q(`INSERT INTO user_sims (user_id, slot, label) VALUES ($1, 1, 'Jio'), ($1, 2, 'Airtel') ON CONFLICT (user_id, slot) DO NOTHING`, [u.id]);
    console.log(`  ${u.name} (${u.role})`);
  }
  console.log(`added ${total} demo calls for ${users.length} people in ${host}`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
