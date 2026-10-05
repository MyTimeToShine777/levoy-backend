'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../src/utils/metaLeads');
const { parseCsv } = require('../src/utils/tabularFile');
const { cleanPhone } = require('../src/utils/phone');

const matrix = parseCsv(fs.readFileSync(path.join(__dirname, 'fixtures', 'meta-leads.csv'), 'utf8'));
const columns = matrix[0];
const rows = matrix.slice(1);

test('detects a Meta Lead Ads export from its header', () => {
  assert.equal(M.isMetaExport(columns), true);
  assert.equal(M.isMetaExport(['Name', 'Phone', 'Email']), false);
  assert.equal(M.isMetaExport(['ad_id', 'form_id']), false);            // only 2 signature columns
  assert.equal(M.isMetaExport(['Ad ID', 'Form-ID', 'Created Time']), true);
});

test('strips the type prefixes but leaves URLs alone', () => {
  assert.equal(M.stripMetaPrefix('l:1405077975150361'), '1405077975150361');
  assert.equal(M.stripMetaPrefix('p:+919522676677'), '+919522676677');
  assert.equal(M.stripMetaPrefix('p:7741833426'), '7741833426');
  assert.equal(M.stripMetaPrefix('ag:120251017587940121'), '120251017587940121');
  assert.equal(M.stripMetaPrefix('https://example.com/x'), 'https://example.com/x');
  assert.equal(M.stripMetaPrefix(null), '');
});

test('every phone in the real export cleans to a 10-digit number', () => {
  const col = columns.indexOf('phone_number');
  const bad = rows.filter(r => !cleanPhone(M.stripMetaPrefix(r[col])));
  assert.equal(bad.length, 0, `unfixable phones: ${bad.map(r => r[col]).join(', ')}`);
  assert.equal(cleanPhone(M.stripMetaPrefix('p:+919522676677')), '9522676677');
  assert.equal(cleanPhone(M.stripMetaPrefix('p:7741833426')), '7741833426');
});

test('platform codes map to readable sources', () => {
  assert.equal(M.platformToSource('ig'), 'Instagram');
  assert.equal(M.platformToSource('fb'), 'Facebook');
  assert.equal(M.platformToSource('tiktok'), 'Tiktok');
  assert.equal(M.platformToSource(''), null);
});

test('finds the mangled "z" lead-id column by its values', () => {
  assert.equal(columns[0], 'z');
  assert.equal(M.findIdColumn(columns, rows[0]), 0);
  assert.equal(M.findIdColumn(['id', 'x'], ['5', 'y']), 0);
  assert.equal(M.findIdColumn(['name', 'x'], ['Bob', 'y']), -1);
});

test('extracts external id, received time and ad metadata from a normal row', () => {
  const idCol = M.findIdColumn(columns, rows[0]);
  const info = M.metaRowInfo(columns, rows[0], idCol);
  assert.equal(info.external_id, '1405077975150361');
  assert.equal(info.received_at, '2026-10-02T13:09:51.000Z');           // -05:00 -> UTC
  assert.equal(info.platform_source, 'Instagram');
  assert.equal(info.lead_meta.ad_name, 'Onboarding Poster - V1');
  assert.equal(info.lead_meta.campaign_id, '120251017371180121');
  assert.equal(info.lead_meta.form_id, '1058078430445588');
  assert.equal(info.lead_meta.is_organic, false);
  assert.equal(info.lead_meta.meta_status, 'CREATED');
  assert.equal(info.lead_meta.profile, 'meta_lead_ads');
});

test('drops the permission notice Meta writes into redacted ad columns', () => {
  const idCol = M.findIdColumn(columns, rows[0]);
  const restricted = rows.filter(r => /enough permission/.test(r[columns.indexOf('campaign_name')]));
  assert.equal(restricted.length, 2);
  const info = M.metaRowInfo(columns, restricted[0], idCol);
  assert.equal(info.lead_meta.ad_name, null);
  assert.equal(info.lead_meta.campaign_name, null);
  assert.equal(info.lead_meta.ad_id, null);
  assert.ok(info.external_id, 'the lead id itself is still present');
  assert.ok(info.lead_meta.form_id, 'unredacted columns survive');
});

test('all 102 leads have distinct external ids', () => {
  const idCol = M.findIdColumn(columns, rows[0]);
  const ids = new Set(rows.map(r => M.metaRowInfo(columns, r, idCol).external_id));
  assert.equal(rows.length, 102);
  assert.equal(ids.size, 102);
});
