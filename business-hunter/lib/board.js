// Shared job-board access for Business Hunter endpoints.
// Parses a hunt/vet target (registry company or raw ATS pointer), fetches the
// live public board (Workday CXS, Greenhouse, Lever), and falls back to a
// bundled snapshot when the live fetch fails.

const path = require('path');
const fs = require('fs');

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
    // Some tenants (e.g. motorolasolutions) only report total on the first
    // page and send 0 afterwards — never let a later page shrink it.
    if (total === Infinity) total = data.total ?? 0;
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

// Resolves a request's query into { company, source, ats }. Throws on a
// malformed or disallowed target (the SSRF guard lives here).
function parseTarget(q) {
  if (q.workday) {
    const u = new URL(String(q.workday));
    if (!WORKDAY_HOST.test(u.hostname)) throw new Error('bad workday host');
    const parts = u.pathname.split('/').filter(Boolean);
    const board = parts.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p));
    if (!board || !SLUG.test(board)) throw new Error('bad workday board');
    const ats = { type: 'workday', host: u.hostname, tenant: u.hostname.split('.')[0], board };
    return { company: null, ats, source: `workday:${ats.tenant}/${ats.board}` };
  }
  if (q.greenhouse) {
    if (!SLUG.test(String(q.greenhouse))) throw new Error('bad greenhouse slug');
    const ats = { type: 'greenhouse', board: String(q.greenhouse) };
    return { company: null, ats, source: `greenhouse:${ats.board}` };
  }
  if (q.lever) {
    if (!SLUG.test(String(q.lever))) throw new Error('bad lever slug');
    const ats = { type: 'lever', board: String(q.lever) };
    return { company: null, ats, source: `lever:${ats.board}` };
  }
  const slug = SLUG.test(String(q.company || '')) ? String(q.company) : 'world-kinect';
  const company = COMPANIES[slug] || COMPANIES['world-kinect'];
  const ats = company.ats;
  return { company, ats, source: `${ats.type}:${ats.tenant || ''}/${ats.board}` };
}

// Fetches the board for a parsed target, falling back to the company's seed
// snapshot. Returns { result, live, note }; throws when nothing is reachable.
async function fetchBoard(ats, company) {
  try {
    let result;
    if (ats.type === 'workday') result = await fetchWorkday(ats);
    else if (ats.type === 'greenhouse') result = await fetchGreenhouse(ats.board);
    else result = await fetchLever(ats.board);
    return { result, live: true, note: null };
  } catch (e) {
    const seed = company ? loadSeed(company.slug) : null;
    if (!seed) throw new Error(`Could not reach the job board: ${e.message}`);
    return {
      result: seed,
      live: false,
      note: `Live fetch failed (${e.message}); showing snapshot from ${seed.fetchedAt}.`,
    };
  }
}

module.exports = { COMPANIES, parseTarget, fetchBoard };
