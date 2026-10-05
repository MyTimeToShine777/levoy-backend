'use strict';

// A number derived from a count is either right or absent — never 0 for "we
// could not compute it". 0/0 has no value, so it is null, which the UI renders
// as "—" instead of a convincing-looking 0%.
function pctOf(part, whole) {
  const p = Number(part) || 0, w = Number(whole) || 0;
  if (w <= 0) return null;
  return Math.round((p / w) * 10000) / 100;
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Status matching key. "Not Answered", "not answered" and "NotAnswered" are
// the same status in the sheet's eyes, so every comparison goes through this.
function statusKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// "Yes"/"Y"/"1"/"TRUE" are all the same yes in a hand-edited sheet.
function truthy(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'done' || s === 't';
}

// Pharmacy + locality is the second duplicate key the spec names, so both halves
// are squashed to bare alphanumerics before comparing.
function pharmacyLocalityKey(pharmacy, locality) {
  const p = String(pharmacy || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const l = String(locality || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!p && !l) return null;   // never collide two blanks into one key
  return p + '|' + l;
}

// "AUTO -_assign!" and "auto assign" are the same customer as far as dedupe is
// concerned, so collapse everything non-alphanumeric before comparing.
function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function slugify(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'stage';
}

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

// Priority labels are strings in leads.priority but rules compare them
// numerically (min_priority), so they need a stable rank. 'normal' and 'medium'
// share rank 2 because both mean "no special urgency".
const PRIORITY_RANK = { low: 1, normal: 2, medium: 2, high: 3, urgent: 4, critical: 4 };
function priorityRank(p) { return PRIORITY_RANK[String(p || '').toLowerCase()] ?? 2; }

function humanDuration(sec) {
  const s = parseInt(sec) || 0;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

module.exports = {
  pctOf, money, statusKey, truthy, pharmacyLocalityKey, normalizeName,
  slugify, daysUntil, priorityRank, humanDuration,
};
