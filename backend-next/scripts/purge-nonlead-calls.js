'use strict';

// Removes call records that are not calls to a lead assigned to the person who uploaded them.
//
// Callio only tracks calls to the leads assigned to a telecaller. Older versions of the phone app uploaded the
// whole call log, so those personal calls are still on the server. This deletes them (and their tags/recordings,
// which cascade). It keeps every call whose number matches (last 10 digits) a lead assigned to that same person.
//
//   node --env-file=.env scripts/purge-nonlead-calls.js                     dry run for customer #1: counts only, deletes nothing
//   node --env-file=.env scripts/purge-nonlead-calls.js --customer 2        dry run for customer #2
//   node --env-file=.env scripts/purge-nonlead-calls.js --user 5            only this user id
//   node --env-file=.env scripts/purge-nonlead-calls.js --yes               really delete (cannot be undone: take a backup first)
//
// Deleting is only done with --yes. The dry run prints, per person, how many calls would stay and how many would go.

const { runInTenant, q, pool } = require('../src/config/db');
const Registry = require('../src/platform/CustomerRegistry');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

// last 10 digits of a phone number, in SQL
const KEY = (col) => `right(regexp_replace(${col}, '\\D', '', 'g'), 10)`;

async function main() {
  const customerId = parseInt(val('--customer', '1'));
  const onlyUser = val('--user') ? parseInt(val('--user')) : null;
  const doDelete = flag('--yes');
  const customer = await Registry.byId(customerId);
  if (!customer) throw new Error(`No customer #${customerId}`);

  await runInTenant(Registry.toTenant(customer), async () => {
    const where = onlyUser ? 'AND ce.user_id = $1' : '';
    const params = onlyUser ? [onlyUser] : [];
    const nonLead = `NOT EXISTS (
        SELECT 1 FROM leads l
         WHERE l.assigned_to = ce.user_id AND l.deleted_at IS NULL AND l.merged_into_lead_id IS NULL
           AND ${KEY('l.phone')} = ${KEY('ce.phone_number')})`;

    const rows = await q(
      `SELECT u.id, u.email,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ${nonLead})::int AS to_remove
         FROM call_events ce JOIN users u ON u.id = ce.user_id
        WHERE 1=1 ${where}
        GROUP BY u.id, u.email ORDER BY to_remove DESC`, params);

    let remove = 0, keep = 0;
    for (const r of rows.rows) {
      console.log(`  user ${r.id} ${r.email}: ${r.total} calls, ${r.to_remove} are not calls to their leads, ${r.total - r.to_remove} stay`);
      remove += r.to_remove; keep += r.total - r.to_remove;
    }
    console.log(`customer #${customerId} (${customer.name}): ${remove} calls would be removed, ${keep} would stay.`);

    if (!doDelete) { console.log('Dry run: nothing was deleted. Add --yes to delete.'); return; }
    const del = await q(`DELETE FROM call_events ce WHERE ${nonLead} ${where}`, params);
    console.log(`Deleted ${del.rowCount} calls.`);
  });
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
