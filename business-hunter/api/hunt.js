// GET /api/hunt?company=world-kinect
// GET /api/hunt?workday=https://tenant.wd5.myworkdayjobs.com/board
// GET /api/hunt?greenhouse=<board-slug>   |   ?lever=<company-slug>
//
// Pulls live job postings from a company's public ATS API (Workday CXS,
// Greenhouse boards, Lever postings), scores every role against the selected
// fit profile, and returns them ranked.

const { scoreTitle, PROFILES, DEFAULT_PROFILE } = require('../lib/score.js');
const { parseTarget, fetchBoard } = require('../lib/board.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

  const q = req.query || {};
  const profile = PROFILES[q.profile] ? String(q.profile) : DEFAULT_PROFILE;

  let target;
  try {
    target = parseTarget(q);
  } catch (e) {
    res.status(400).json({ error: `Invalid target: ${e.message}` });
    return;
  }
  const { company, ats, source } = target;

  let board;
  try {
    board = await fetchBoard(ats, company);
  } catch (e) {
    res.status(502).json({ error: e.message });
    return;
  }
  const { result, live, note } = board;

  const roles = result.jobs
    .map((j) => ({ ...j, fit: scoreTitle(j.title, profile) }))
    .sort((a, b) => b.fit.score - a.fit.score);

  const strong = roles.filter((r) => r.fit.tier === 'strong');
  const possible = roles.filter((r) => r.fit.tier === 'possible');

  res.status(200).json({
    company: company
      ? {
          slug: company.slug,
          name: company.name,
          domain: company.domain,
          ticker: company.ticker,
          hq: company.hq,
          summary: company.summary,
          careersUrl: company.careersUrl,
        }
      : { name: source },
    source,
    profile: { key: profile, label: PROFILES[profile].label },
    live,
    note,
    totalOpenRoles: result.total,
    counts: { strong: strong.length, possible: possible.length, noFit: roles.length - strong.length - possible.length },
    topFit: roles[0] && roles[0].fit.tier !== 'no-fit' ? roles[0] : null,
    roles,
  });
};
