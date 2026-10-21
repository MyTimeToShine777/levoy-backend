'use strict';

// Every gated capability. Each key is a stable identifier the API and the UI both use, and each one guards
// specific code (PlanService.assert('key')), so the LIST lives in code. Which plan includes which features,
// and the prices, are data in the platform `plans` table and are editable from the platform console.
const FEATURES = {
  ad_free:                { label: 'Ad-free experience' },
  auto_backup:            { label: 'Backup and restore of call history' },
  whatsapp_support:       { label: 'Quick technical support on WhatsApp' },
  quick_call_extension:   { label: 'Place calls from the browser with the Quick Call extension' },
  call_notes_tags:        { label: 'Add a note and tags after each call' },
  export_exclude_contacts:{ label: 'Leave contact details out of exports' },
  unique_connected_calls: { label: 'Unique calls and connected calls' },
  billing_cycle:          { label: 'Billing cycle and the price of every call' },
  contact_report_excel:   { label: 'Contact report in Excel' },
  contact_groups:         { label: 'Organise contacts into groups' },
  group_filter_export:    { label: 'Filter and export reports by group' },
  working_hours:          { label: 'Working hours and idle time, with a downloadable timeline sheet' },
  team_call_analytics:    { label: 'Per-telecaller call analytics and leaderboard' },
};

// What a brand-new platform starts with (the original three tiers). Inserted once; after that the catalog
// belongs to the platform owner and is never overwritten by a restart.
const PREMIUM = ['ad_free', 'auto_backup', 'whatsapp_support', 'quick_call_extension'];
const PLUS = [...PREMIUM, 'call_notes_tags', 'export_exclude_contacts', 'unique_connected_calls', 'billing_cycle',
  'contact_report_excel', 'contact_groups', 'group_filter_export', 'working_hours'];
const BIZ = [...PLUS, 'team_call_analytics'];

const DEFAULT_PLANS = [
  { key: 'free', name: 'Free', price_monthly: 0, currency: 'INR', sort_order: 0, features: [],
    tagline: 'Call history, analytics, contacts and Excel export' },
  { key: 'premium', name: 'Premium', price_monthly: 75, currency: 'INR', sort_order: 1, features: PREMIUM,
    tagline: 'Backup, support and the browser dialler' },
  { key: 'premium_plus', name: 'Premium Plus', price_monthly: 125, currency: 'INR', sort_order: 2, features: PLUS,
    tagline: 'Notes, tags, groups, billing and working hours' },
  { key: 'biz', name: 'Callio Biz', price_monthly: null, currency: 'INR', sort_order: 3, features: BIZ,
    tagline: 'For teams: everything in Premium Plus, plus per-telecaller analytics' },
];

module.exports = { FEATURES, DEFAULT_PLANS };
