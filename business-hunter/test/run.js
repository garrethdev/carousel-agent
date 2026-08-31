// Smoke test: score the seed snapshot, then run the API handler for real.
const assert = require('assert');
const { scoreTitle } = require('../lib/score.js');
const seed = require('../data/world-kinect-seed.json');
const hunt = require('../api/hunt.js');

// 1. Scorer sanity.
assert.strictEqual(scoreTitle('Sales Executive – New Business').tier, 'strong');
assert.strictEqual(scoreTitle('Business Development Manager').tier, 'strong');
assert.strictEqual(scoreTitle('Aircraft Refuelling Operator').tier, 'no-fit');
assert.strictEqual(scoreTitle('HRIS Payroll Lead - Workday Expert').tier, 'no-fit');
console.log('scorer sanity: OK');

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
  ranked.some((r) => r.tier !== 'no-fit'),
  'World Kinect board should contain at least one hunter fit'
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

  console.log('\nAll tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
