// Smoke test: score the seed snapshot, then run the API handlers for real.
const assert = require('assert');
const { scoreTitle } = require('../lib/score.js');
const { classifyContact, parsePostedDays, vetBoard } = require('../lib/vet.js');
const seed = require('../data/world-kinect-seed.json');
const hunt = require('../api/hunt.js');
const vet = require('../api/vet.js');

// 1. Scorer sanity — AI/SWE profile (default).
assert.strictEqual(scoreTitle('IT Software Developer III').tier, 'strong');
assert.strictEqual(scoreTitle('Machine Learning Engineer').tier, 'strong');
assert.strictEqual(scoreTitle('AI Engineer').tier, 'strong');
assert.strictEqual(scoreTitle('Lead, IT Software Developer').tier, 'strong');
assert.strictEqual(scoreTitle('Aircraft Refuelling Operator').tier, 'no-fit');
assert.strictEqual(scoreTitle('Bunker Trader – Marine Fuel').tier, 'no-fit');
assert.strictEqual(scoreTitle('Aviation Customer Service Specialist').tier, 'no-fit');
// Hunter profile still works when selected.
assert.strictEqual(scoreTitle('Sales Executive – New Business', 'new-business-hunter').tier, 'strong');
assert.strictEqual(scoreTitle('Business Development Manager', 'new-business-hunter').tier, 'strong');
assert.strictEqual(scoreTitle('IT Software Developer III', 'new-business-hunter').tier, 'no-fit');
console.log('scorer sanity: OK');

// 1b. Recruiter gate — contact classification.
// Approve: recruiters with tech/GTM scope, and tech hiring managers.
assert.ok(classifyContact('Technical Recruiter').ok);
assert.ok(classifyContact('Lead TA Partner (GTM/SaaS)').ok);
assert.ok(classifyContact('Sr Executive Recruiter - Corporate and Technology').ok);
assert.ok(classifyContact('VP of Engineering').ok);
assert.ok(classifyContact('IT Director of AI/ML').ok);
assert.ok(classifyContact('VP, Data & AI').ok);
assert.ok(classifyContact('Director of Innovation & Data Science').ok);
assert.ok(classifyContact('Asst Vice President - Information Technology').ok);
// Reject: general TA (the World Kinect miss), campus/hourly lanes, non-tech roles.
assert.ok(!classifyContact('Global Talent Acquisition Sr. Recruiter').ok);
assert.ok(!classifyContact('Sr. Talent Acquisition Specialist').ok);
assert.ok(!classifyContact('Director of Talent Acquisition').ok);
assert.ok(!classifyContact('Campus Recruiter').ok);
assert.ok(!classifyContact('Manager, Talent Acquisition').ok);
assert.ok(!classifyContact('Director of Food & Beverage').ok);
// Tech-first companies: a bare "Recruiter" is a tech recruiter there.
assert.ok(!classifyContact('Recruiter').ok);
assert.ok(classifyContact('Recruiter', { techFirst: true }).ok);
assert.ok(!classifyContact('Campus Recruiter', { techFirst: true }).ok, 'campus still fails at tech-first cos');
console.log('contact classifier: OK');

// 1c. Recruiter gate — freshness parsing and board verdicts.
assert.strictEqual(parsePostedDays('Posted Today'), 0);
assert.strictEqual(parsePostedDays('Posted 24 Days Ago'), 24);
assert.strictEqual(parsePostedDays('Posted 30+ Days Ago'), 31);
assert.strictEqual(parsePostedDays(''), null);
const mk = (title, posted) => ({ title, posted, url: '', fit: scoreTitle(title) });
const goodBoard = [
  mk('Software Engineer II', 'Posted 3 Days Ago'),
  mk('Machine Learning Engineer', 'Posted Today'),
  mk('Data Engineer', 'Posted 10 Days Ago'),
];
assert.ok(vetBoard(goodBoard).pass, 'board with fresh strong tech roles must pass');
const staleBoard = goodBoard.map((r) => ({ ...r, posted: 'Posted 30+ Days Ago' }));
assert.ok(!vetBoard(staleBoard).pass, 'board with only stale roles must fail freshness');
const salesBoard = [mk('Bunker Trader – Marine Fuel'), mk('Sales Executive'), mk('Refuel Operator')];
assert.ok(!vetBoard(salesBoard).pass, 'board without tech roles must fail');
console.log('board verdicts: OK');

// 2. Seed snapshot ranks sensibly.
const ranked = seed.jobPostings
  .map((j) => ({ title: j.title, ...scoreTitle(j.title) }))
  .sort((a, b) => b.score - a.score);
console.log('\nSeed ranking (top 8 of ' + ranked.length + '):');
for (const r of ranked.slice(0, 8)) {
  console.log(`  ${String(r.score).padStart(3)}  ${r.tier.padEnd(8)}  ${r.title}`);
}
assert.ok(ranked[0].score > 0, 'top role should have a positive score');
assert.ok(
  ranked.some((r) => r.tier === 'strong'),
  'World Kinect board should contain at least one strong AI/SWE fit'
);

// 3. Run the handler like Vercel would (live fetch, seed fallback).
function fakeRes() {
  const res = { headers: {}, code: null, body: null };
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

(async () => {
  const res = fakeRes();
  await hunt({ query: { company: 'world-kinect' } }, res);
  assert.strictEqual(res.code, 200, 'handler should 200');
  const b = res.body;
  console.log(
    `\nAPI handler: ${b.live ? 'live' : 'snapshot'} · ${b.totalOpenRoles} open roles · ` +
      `${b.counts.strong} strong / ${b.counts.possible} possible`
  );
  assert.ok(Array.isArray(b.roles) && b.roles.length > 0);
  assert.ok(b.roles[0].url.startsWith('https://'), 'roles should carry apply URLs');
  console.log('top fit: ' + (b.topFit ? b.topFit.title : '(none)'));

  const bad = fakeRes();
  await hunt({ query: { workday: 'https://evil.example.com/board' } }, bad);
  assert.strictEqual(bad.code, 400, 'non-workday host must be rejected');
  console.log('SSRF guard: OK');

  // 4. Vet handler end to end against World Kinect: whatever the board holds
  // today, its general-TA recruiter title must be rejected and a tech hiring
  // manager approved — the exact miss this gate exists to catch.
  const vres = fakeRes();
  await vet(
    { query: { company: 'world-kinect', titles: 'Global Talent Acquisition Sr. Recruiter|VP of Engineering' } },
    vres
  );
  assert.strictEqual(vres.code, 200, 'vet handler should 200');
  const v = vres.body;
  console.log(
    `\nVet handler: ${v.live ? 'live' : 'snapshot'} · ${v.board.strong} strong / ${v.board.possible} possible · ` +
      `verdict ${v.verdict.pass ? 'PASS' : 'REJECT'}`
  );
  for (const c of v.checks || v.verdict.checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.rule}: ${c.detail}`);
  for (const c of v.contacts) console.log(`  ${c.ok ? '✓' : '✗'} ${c.title} — ${c.reason}`);
  assert.strictEqual(v.contacts.length, 2);
  assert.ok(!v.contacts[0].ok, 'general TA recruiter must be rejected');
  assert.ok(v.contacts[1].ok, 'VP of Engineering must be approved');
  const vbad = fakeRes();
  await vet({ query: { workday: 'https://evil.example.com/board' } }, vbad);
  assert.strictEqual(vbad.code, 400, 'vet must keep the SSRF guard');

  console.log('\nAll tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
