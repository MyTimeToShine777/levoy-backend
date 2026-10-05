'use strict';

// Constants of the spreadsheet engine (LEADS_SPEC.md). The status table and the
// scoring assumptions themselves are DATA (lead_status_rules /
// lead_scoring_settings); only fall-backs and vocabularies live here.

// Where a Call Status lands on the kanban. The spec's vocabulary ("Not Answered",
// "Interested"…) is not a pipeline-stage vocabulary, so it is mapped rather than
// rejected: an imported lead still has to appear on the board.
const CALL_STATUS_TO_STAGE = {
  notcalledyet: 'new',
  notanswered: 'contacted',
  callbacklater: 'contacted',
  underconsideration: 'qualified',
  interested: 'qualified',
  demodone: 'proposal',
  converted: 'won',
  notinterested: 'lost',
  switchedoffinvalidnumber: 'lost',
};

// The status the spec lists as row 9 — the fallback for a lead nobody has
// called yet. Matching is on status_key, which is this string normalised.
const NOT_CALLED_KEY = 'notcalledyet';

// Used ONLY to fill a gap if a row is missing from lead_scoring_settings.
const SCORING_SETTING_DEFAULTS = {
  plan_price: 499,
  daily_call_target: 60,
  hot_threshold: 80,
  warm_threshold: 50,
  followup_urgency_bonus: 30,
  this_week_days: 7,
};

const FOLLOWUP_WINDOWS = ['Overdue', 'Due Today', 'This Week', 'Upcoming', 'Closed'];

// The 15 imported columns. `key` is the leads.* column the value lands in;
// `aliases` are the header spellings accepted from a file.
const LEAD_IMPORT_FIELDS = [
  { key: 'segment',             label: 'Segment',              aliases: ['segment', 'lead segment', 'source segment', 'campaign'] },
  { key: 'lead_assigned_date',  label: 'Lead Assigned Date',   aliases: ['lead assigned date', 'assigned date', 'lead assigned', 'date assigned'] },
  { key: 'call_attempted_date', label: 'Call Attempted Date',  aliases: ['call attempted date', 'attempted date', 'call attempted', 'date of call'] },
  // NB the spelling: the sheet's header really is "Tellecaller" with a double l.
  { key: 'telecaller_name',     label: 'Tellecaller Name',     aliases: ['tellecaller name', 'tellecaller', 'telecaller name', 'telecaller', 'tele caller', 'tele caller name'] },
  { key: 'customer_name',       label: 'Customer Name',        aliases: ['customer name', 'customer', 'contact name', 'lead name', 'name'] },
  { key: 'pharmacy_name',       label: 'Pharmacy Name',        aliases: ['pharmacy name', 'pharmacy', 'shop name', 'store name'] },
  { key: 'locality',            label: 'Locality / Area',      aliases: ['locality / area', 'locality/area', 'locality', 'area', 'location'] },
  { key: 'address',             label: 'Address',              aliases: ['address', 'full address', 'street address'] },
  { key: 'phone_number',        label: 'Phone Number',         aliases: ['phone number', 'phone', 'mobile', 'mobile number', 'contact number', 'number'] },
  { key: 'email_id',            label: 'Email Id',             aliases: ['email id', 'email', 'email address', 'mail'] },
  { key: 'lead_source',         label: 'Lead Source',          aliases: ['lead source', 'source', 'channel'] },
  { key: 'followup_date',       label: 'Followup Date',        aliases: ['followup date', 'follow up date', 'follow-up date', 'followup', 'follow up'] },
  { key: 'call_done',           label: 'Call Done',            aliases: ['call done', 'call done?', 'is call done'] },
  { key: 'call_status',         label: 'Call Status',          aliases: ['call status', 'status', 'call status '] },
  { key: 'remarks',             label: 'Remarks',              aliases: ['remarks', 'remark', 'notes', 'comments'] },
];

// The 12 derived columns. They are NEVER imported: if a file carries them, the
// mapper leaves them alone and the app's own values stand.
const LEAD_DERIVED_COLUMNS = [
  'Phone (Clean 10-digit)', 'Duplicate?', 'Follow-up (Clean Date)', 'Active Lead? (1/0)',
  'Follow-up Window', 'Days Since Last Call', 'Priority Score', 'Tier',
  'Next Best Action', 'Data Check', 'Queue Key', 'Queue Rank',
];

const IMPORT_ROW_CAP = 5000;

module.exports = {
  CALL_STATUS_TO_STAGE, NOT_CALLED_KEY, SCORING_SETTING_DEFAULTS, FOLLOWUP_WINDOWS,
  LEAD_IMPORT_FIELDS, LEAD_DERIVED_COLUMNS, IMPORT_ROW_CAP,
};
