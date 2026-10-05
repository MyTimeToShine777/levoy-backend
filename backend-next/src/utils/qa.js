'use strict';

const { QA_WEIGHTS } = require('../config/constants');

// Clients are inconsistent about case/spacing, so normalise keys before lookup:
// "opening", "Opening", "OPENING", " open ing " all resolve to 'Opening'.
function canonicalCategory(key) {
  const norm = String(key).trim().toLowerCase().replace(/[\s_-]+/g, '');
  for (const cat of Object.keys(QA_WEIGHTS)) {
    if (cat.toLowerCase() === norm) return cat;
  }
  return null;
}

// Compute the overall score from a category→score map. The client's own overall
// is never trusted: it is derived here from the fixed weight table, and a
// compliance violation forces the whole thing to 0 (auto-fail, as in real QA
// programmes where a compliance breach is disqualifying regardless of the rest).
// Each category is scored 1-5; its contribution is score/5 * weight, so a perfect
// sheet is 100 and 1-everywhere is 20.
function computeQAScore(scores, isViolation) {
  const rows = [];
  let total = 0;
  for (const [category, weight] of Object.entries(QA_WEIGHTS)) {
    const score = scores[category];
    const weighted = (Number(score) / 5) * weight; // 1-5 scaled onto 0..weight
    total += weighted;
    rows.push({ category, score: Number(score), weight, weighted: Math.round(weighted * 100) / 100 });
  }
  const overall = isViolation ? 0 : Math.round(total * 100) / 100;
  return { overall, rows };
}

module.exports = { canonicalCategory, computeQAScore };
