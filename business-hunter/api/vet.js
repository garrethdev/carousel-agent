// GET /api/vet?company=world-kinect&titles=VP of Engineering|Sr. Talent Acquisition Specialist
// GET /api/vet?workday=<careers-url>&titles=...   |   ?greenhouse= / ?lever=
//
// The recruiter gate: vets an outreach target BEFORE anyone gets emailed.
// Rule 1 — the company must have live tech openings (>=1 strong, >=3 tech-ish
// fits on the AI/SWE profile). Rule 2 — each contact title must be a tech
// recruiter or a tech hiring manager (general TA / campus / hourly fail).
// Rule 3 — at least one strong opening posted within 30 days.
// verdict.pass=false means: do not add this company's recruiters to outreach.

const { scoreTitle } = require('../lib/score.js');
const { parseTarget, fetchBoard } = require('../lib/board.js');
const { classifyContact, vetBoard, DEFAULTS } = require('../lib/vet.js');

function parseTitles(q, body) {
  if (Array.isArray(body && body.titles)) return body.titles.map(String).slice(0, 50);
  if (q.titles) return String(q.titles).split('|').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

  const q = req.query || {};

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

  const roles = result.jobs.map((j) => ({ ...j, fit: scoreTitle(j.title, 'ai-software-engineering') }));
  const freshDays = Number.isFinite(+q.freshDays) && +q.freshDays > 0 ? +q.freshDays : DEFAULTS.freshDays;
  const verdict = vetBoard(roles, { freshDays });

  const techFirst = q.techFirst === '1' || q.techFirst === 'true';
  const contacts = parseTitles(q, req.body).map((t) => classifyContact(t, { techFirst }));
  const okContacts = contacts.filter((c) => c.ok);

  const advice = !verdict.pass
    ? 'REJECT: no real tech demand on this board — do not outreach its recruiters.'
    : contacts.length && !okContacts.length
      ? 'Company has tech demand, but none of these contacts should get the email — find a tech recruiter or hiring manager instead.'
      : 'PASS: company has live tech demand.' +
        (okContacts.length ? ` Outreach the ${okContacts.length} approved contact${okContacts.length === 1 ? '' : 's'}.` : '');

  res.status(200).json({
    company: company ? { slug: company.slug, name: company.name, hq: company.hq } : { name: source },
    source,
    live,
    note,
    rules: { minStrong: DEFAULTS.minStrong, minTech: DEFAULTS.minTech, freshDays },
    board: {
      totalOpenRoles: result.total,
      strong: roles.filter((r) => r.fit.tier === 'strong').length,
      possible: roles.filter((r) => r.fit.tier === 'possible').length,
    },
    verdict,
    contacts,
    advice,
  });
};
