'use strict';

/*
 * Meta (Facebook / Instagram) Lead Ads export support.
 *
 * Meta's CSV looks like:
 *   z,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,
 *   form_id,form_name,is_organic,platform,full_name,phone_number,email,lead_status
 *   l:1405077975150361,2026-10-02T08:09:51-05:00,ag:1202…,Onboarding Poster - V1,…,false,ig,Peeyush,p:+919522676677,x@y.com,CREATED
 *
 * Quirks handled here:
 *   • ids and phones carry a type prefix ("l:", "p:", "ag:", "as:", "c:", "f:")
 *   • the lead-id column header is mangled to "z" (so it is found by its values)
 *   • platform is "ig" / "fb"
 *   • when the exporting user lacks permission, Meta writes a sentence into the ad
 *     columns ("You don't have enough permission…") — that is dropped, not stored
 *   • lead_status is Meta's own state (CREATED), not a call status
 */

const { headerKey } = require('./tabularFile');

const PROFILE = 'meta_lead_ads';
const DEFAULT_SEGMENT = 'Social Media Campaign';

// A file is a Meta export when at least 3 of these signature columns are present.
const SIGNATURE = ['adid', 'formid', 'createdtime', 'platform', 'campaignid', 'adsetid'];

function isMetaExport(columns) {
  const keys = new Set((columns || []).map(headerKey));
  return SIGNATURE.filter(k => keys.has(k)).length >= 3;
}

// "l:123" -> "123", "p:+9195…" -> "+9195…", "ag:1" -> "1". Only a short lowercase
// type tag followed by a colon is stripped, so "https://…" is left alone.
function stripMetaPrefix(v) {
  return String(v === null || v === undefined ? '' : v).trim().replace(/^[a-z]{1,3}:(?!\/\/)/, '');
}

const PERMISSION_NOTICE = /^(ag:|as:|c:|f:)?\s*you don'?t have enough permission/i;
const redacted = v => PERMISSION_NOTICE.test(String(v || '').trim());

function platformToSource(p) {
  const k = String(p || '').trim().toLowerCase();
  if (!k) return null;
  const known = { ig: 'Instagram', instagram: 'Instagram', fb: 'Facebook', facebook: 'Facebook',
    wa: 'WhatsApp', whatsapp: 'WhatsApp', msg: 'Messenger', messenger: 'Messenger', an: 'Audience Network' };
  return known[k] || (k[0].toUpperCase() + k.slice(1));
}

// The lead-id column: named id / lead_id / leadgen_id, or (Meta's mangled "z"
// header) the first column when its first value looks like "l:<digits>".
function findIdColumn(columns, firstRow) {
  const named = columns.findIndex(c => ['id', 'leadid', 'leadgenid'].includes(headerKey(c)));
  if (named !== -1) return named;
  if (firstRow && /^l:\d+$/i.test(String(firstRow[0] || '').trim())) return 0;
  return -1;
}

// "2026-10-02T08:09:51-05:00" -> "2026-10-02T13:09:51.000Z"; null if unparsable.
function parseReceivedAt(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const META_FIELDS = ['ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name'];

/**
 * Everything a Meta row carries beyond the 15 sheet columns.
 *
 * @param {string[]} columns file header
 * @param {string[]} cells   one data row
 * @param {number}   idCol   index of the lead-id column (from findIdColumn), or -1
 * @returns {{ external_id, received_at, lead_meta, platform_source, phone, name, email }}
 */
function metaRowInfo(columns, cells, idCol) {
  const rec = {};
  columns.forEach((c, i) => { rec[headerKey(c)] = cells[i] === undefined ? '' : String(cells[i]).trim(); });

  const meta = { profile: PROFILE };
  for (const f of META_FIELDS) {
    const raw = rec[headerKey(f)];
    if (raw === undefined || raw === '') continue;
    meta[f] = redacted(raw) ? null : (f.endsWith('_id') ? stripMetaPrefix(raw) : raw);
  }
  if (rec[headerKey('is_organic')] !== undefined && rec[headerKey('is_organic')] !== '') {
    meta.is_organic = /^(true|1|yes)$/i.test(rec[headerKey('is_organic')]);
  }
  if (rec[headerKey('platform')]) meta.platform = rec[headerKey('platform')].toLowerCase();
  if (rec[headerKey('lead_status')]) meta.meta_status = rec[headerKey('lead_status')];

  const externalId = idCol >= 0 ? stripMetaPrefix(cells[idCol]) : '';
  return {
    external_id: externalId || null,
    received_at: parseReceivedAt(rec[headerKey('created_time')]),
    lead_meta: meta,
    platform_source: platformToSource(rec[headerKey('platform')]),
  };
}

module.exports = {
  PROFILE, DEFAULT_SEGMENT, isMetaExport, stripMetaPrefix, platformToSource,
  findIdColumn, parseReceivedAt, metaRowInfo, redacted,
};
