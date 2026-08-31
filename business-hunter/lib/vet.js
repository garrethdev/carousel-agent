// Recruiter vetting for Business Hunter.
//
// Gates an outreach target on three rules before any recruiter gets emailed:
//   1. The company must have real tech openings on its live board
//      (>= 1 strong fit, >= 3 strong+possible fits on the AI/SWE profile).
//   2. The contact must be worth emailing for tech work: a recruiter whose
//      title shows tech scope, or a hiring manager in a tech role. General
//      TA, campus, and hourly recruiters fail.
//   3. At least one strong opening must be fresh (posted within 30 days);
//      boards that expose no dates are given the benefit of the doubt.

const { scoreTitle } = require('./score.js');

const DEFAULTS = { minStrong: 1, minTech: 3, freshDays: 30 };

const RECRUITERISH =
  /recruit|talent acquisition|\bta\b|\btalent\b|people partner|sourcer/i;
const NON_TECH_LANE =
  /campus|university|early careers?|hourly|high.?volume|retail|store|warehouse|driver|crew|hospitality|nurse|clinical/i;
const TECH_SCOPE =
  /tech|engineer|software|digital|product|data|\bit\b|\bai\b|gtm|go.?to.?market|saas|executive/i;
const TECH_ROLE_EXTRA =
  /\b(ai|ml|machine learning|data science|analytics|technology|cto|cio|cdo|chief technology|chief information|chief digital|chief data|innovation)\b/i;

// Classifies one outreach contact by title.
// Returns { title, ok, kind, reason }.
// opts.techFirst: the employer is a software/dev-tools company where all
// recruiting is tech recruiting — a bare "Recruiter" passes there.
function classifyContact(title, opts = {}) {
  const t = String(title || '').trim();
  if (!t) return { title: t, ok: false, kind: 'unknown', reason: 'empty title' };

  if (RECRUITERISH.test(t)) {
    if (NON_TECH_LANE.test(t)) {
      return { title: t, ok: false, kind: 'non-tech-recruiter', reason: 'recruits campus/hourly/non-tech lanes' };
    }
    if (TECH_SCOPE.test(t)) {
      return { title: t, ok: true, kind: 'tech-recruiter', reason: 'recruiter with tech/GTM scope in title' };
    }
    if (opts.techFirst) {
      return { title: t, ok: true, kind: 'tech-recruiter', reason: 'recruiter at a tech-first company — all recruiting is tech' };
    }
    return { title: t, ok: false, kind: 'general-ta', reason: 'general TA — no tech signal in title' };
  }

  const fit = scoreTitle(t, 'ai-software-engineering');
  if (fit.tier !== 'no-fit' || TECH_ROLE_EXTRA.test(t)) {
    return { title: t, ok: true, kind: 'hiring-manager', reason: 'holds a tech role — better target than TA' };
  }
  return { title: t, ok: false, kind: 'non-tech', reason: 'neither a tech recruiter nor a tech role' };
}

// Parses a board's posted label into whole days ago; null when unknown.
// Handles Workday ("Posted Today", "Posted 24 Days Ago", "Posted 30+ Days Ago")
// and ISO dates from Greenhouse/Lever. "30+" is treated as older than 30.
function parsePostedDays(posted, now = Date.now()) {
  const p = String(posted || '').trim();
  if (!p) return null;
  if (/posted\s+today/i.test(p)) return 0;
  if (/posted\s+yesterday/i.test(p)) return 1;
  const rel = p.match(/posted\s+(\d+)(\+?)\s+days?\s+ago/i);
  if (rel) return parseInt(rel[1], 10) + (rel[2] ? 1 : 0);
  const iso = p.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const days = Math.floor((now - Date.parse(iso[0])) / 86400000);
    return days >= 0 ? days : 0;
  }
  return null;
}

// Vets a scored board (roles carrying .fit and .posted) against the company
// rules. Returns { pass, checks, freshStrong, sample }.
function vetBoard(roles, opts = {}) {
  const { minStrong, minTech, freshDays } = { ...DEFAULTS, ...opts };
  const strong = roles.filter((r) => r.fit.tier === 'strong');
  const tech = roles.filter((r) => r.fit.tier !== 'no-fit');
  const freshStrong = strong.filter((r) => {
    const days = parsePostedDays(r.posted);
    return days === null || days <= freshDays;
  });

  const checks = [
    {
      rule: 'tech-roles',
      pass: strong.length >= minStrong,
      detail: `${strong.length} strong tech fit${strong.length === 1 ? '' : 's'} on the board (need ${minStrong}+)`,
    },
    {
      rule: 'depth',
      pass: tech.length >= minTech,
      detail: `${tech.length} tech-ish opening${tech.length === 1 ? '' : 's'} overall (need ${minTech}+)`,
    },
    {
      rule: 'freshness',
      pass: strong.length > 0 && freshStrong.length > 0,
      detail:
        strong.length === 0
          ? 'no strong roles to check freshness on'
          : `${freshStrong.length} strong fit${freshStrong.length === 1 ? '' : 's'} posted within ${freshDays} days`,
    },
  ];

  return {
    pass: checks.every((c) => c.pass),
    checks,
    freshStrong: freshStrong.length,
    sample: strong.slice(0, 5).map((r) => ({ title: r.title, posted: r.posted, url: r.url })),
  };
}

module.exports = { classifyContact, parsePostedDays, vetBoard, DEFAULTS };
