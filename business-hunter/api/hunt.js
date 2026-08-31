// GET /api/hunt?company=world-kinect
// GET /api/hunt?workday=https://tenant.wd5.myworkdayjobs.com/board
// GET /api/hunt?greenhouse=<board-slug>   |   ?lever=<company-slug>
//
// Pulls live job postings from a company's public ATS API (Workday CXS,
// Greenhouse boards, Lever postings), scores every role against the
// "New Business Hunter" fit profile, and returns them ranked.

const path = require('path');
const fs = require('fs');
const { scoreTitle } = require('../lib/score.js');

const COMPANIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'companies.json'), 'utf8')
);

const WORKDAY_HOST = /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/;
const SLUG = /^[a-zA-Z0-9_-]{1,64}$/;
const PAGE = 20; // Workday CXS hard limit per request
const MAX_JOBS = 400;

async function fetchWorkday(ats) {
  const base = `https://${ats.host}/wday/cxs/${ats.tenant}/${ats.board}/jobs`;
  const jobs = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total && jobs.length < MAX_JOBS) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: PAGE, offset, searchText: '' }),
    });
    if (!res.ok) throw new Error(`workday ${res.status}`);
    const data = await res.json();
    total = data.total ?? 0;
    for (const j of data.jobPostings || []) {
      jobs.push({
        title: j.title,
        location: j.locationsText || '',
        posted: j.postedOn || '',
        ref: (j.bulletFields && j.bulletFields[0]) || '',
        url: `https://${ats.host}/en-US/${ats.board}${j.externalPath || ''}`,
      });
    }
    if (!(data.jobPostings || []).length) break;
    offset += PAGE;
  }
  return { jobs, total };
}

async function fetchGreenhouse(board) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
  if (!res.ok) throw new Error(`greenhouse ${res.status}`);
  const data = await res.json();
  const jobs = (data.jobs || []).slice(0, MAX_JOBS).map((j) => ({
    title: j.title,
    location: (j.location && j.location.name) || '',
    posted: j.updated_at ? j.updated_at.slice(0, 10) : '',
    ref: String(j.id || ''),
    url: j.absolute_url,
  }));
  return { jobs, total: (data.jobs || []).length };
}

async function fetchLever(company) {
  const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`);
  if (!res.ok) throw new Error(`lever ${res.status}`);
  const data = await res.json();
  const jobs = (Array.isArray(data) ? data : []).slice(0, MAX_JOBS).map((j) => ({
    title: j.text,
    location: (j.categories && j.categories.location) || '',
    posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : '',
    ref: j.id || '',
    url: j.hostedUrl,
  }));
  return { jobs, total: jobs.length };
}

function loadSeed(slug) {
  const p = path.join(__dirname, '..', 'data', `${slug}-seed.json`);
  if (!fs.existsSync(p)) return null;
  const seed = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ats = COMPANIES[slug] && COMPANIES[slug].ats;
  return {
    jobs: (seed.jobPostings || []).map((j) => ({
      title: j.title,
      location: j.locationsText || '',
      posted: j.postedOn || '',
      ref: (j.bulletFields && j.bulletFields[0]) || '',
      url: ats ? `https://${ats.host}/en-US/${ats.board}${j.externalPath || ''}` : '',
    })),
    total: seed.total,
    fetchedAt: seed.fetchedAt,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

  const q = req.query || {};
  let company = null;
  let source = null;
  let ats = null;

  try {
    if (q.workday) {
      const u = new URL(String(q.workday));
      if (!WORKDAY_HOST.test(u.hostname)) throw new Error('bad workday host');
      const parts = u.pathname.split('/').filter(Boolean);
      const board = parts.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p));
      if (!board || !SLUG.test(board)) throw new Error('bad workday board');
      ats = { type: 'workday', host: u.hostname, tenant: u.hostname.split('.')[0], board };
      source = `workday:${ats.tenant}/${ats.board}`;
    } else if (q.greenhouse) {
      if (!SLUG.test(String(q.greenhouse))) throw new Error('bad greenhouse slug');
      ats = { type: 'greenhouse', board: String(q.greenhouse) };
      source = `greenhouse:${ats.board}`;
    } else if (q.lever) {
      if (!SLUG.test(String(q.lever))) throw new Error('bad lever slug');
      ats = { type: 'lever', board: String(q.lever) };
      source = `lever:${ats.board}`;
    } else {
      const slug = SLUG.test(String(q.company || '')) ? String(q.company) : 'world-kinect';
      company = COMPANIES[slug] || COMPANIES['world-kinect'];
      ats = company.ats;
      source = `${ats.type}:${ats.tenant || ''}/${ats.board}`;
    }
  } catch (e) {
    res.status(400).json({ error: `Invalid target: ${e.message}` });
    return;
  }

  let result = null;
  let live = true;
  let note = null;
  try {
    if (ats.type === 'workday') result = await fetchWorkday(ats);
    else if (ats.type === 'greenhouse') result = await fetchGreenhouse(ats.board);
    else result = await fetchLever(ats.board);
  } catch (e) {
    live = false;
    const seed = company ? loadSeed(company.slug) : null;
    if (seed) {
      result = seed;
      note = `Live fetch failed (${e.message}); showing snapshot from ${seed.fetchedAt}.`;
    } else {
      res.status(502).json({ error: `Could not reach the job board: ${e.message}` });
      return;
    }
  }

  const roles = result.jobs
    .map((j) => ({ ...j, fit: scoreTitle(j.title, 'new-business-hunter') }))
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
    live,
    note,
    totalOpenRoles: result.total,
    counts: { strong: strong.length, possible: possible.length, noFit: roles.length - strong.length - possible.length },
    topFit: roles[0] && roles[0].fit.tier !== 'no-fit' ? roles[0] : null,
    roles,
  });
};
