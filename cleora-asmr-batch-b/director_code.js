// Cleora ASMR Director Stitch: picks one of the 9 approved clip pairs (A-I) per approved script,
// sets deterministic in-points, and writes clip URLs + production_metadata back to cleora_asmr.
const BASE = 'https://qlcmgxgwpzmiebzxflai.supabase.co/storage/v1/object/public/cleora-clips/';
const CLIPS = {
  asmr_walk_to_cauldron:   { path: 'asmr/asmr_walk_to_cauldron.mp4', dur: 5.04 },
  asmr_cauldron_stir:      { path: 'asmr/asmr_cauldron_stir.mp4', dur: 8.04 },
  asmr_ladle_taste:        { path: 'asmr/asmr_ladle_taste.mp4', dur: 5.04 },
  asmr_flask_mixing:       { path: 'asmr/asmr_flask_mixing.mp4', dur: 5.04 },
  cleora_walk:             { path: '_library/cleora_walk.mp4', dur: 5.04 },
  wide_closed_eye:         { path: 'wide_closed_eye.mp4', dur: 15.04 },
  cleora_looking_into_orb: { path: 'cleora_looking_into_orb.mp4', dur: 4.04 },
  cleora_tight:            { path: 'cleora_tight.mp4', dur: 5.04 },
  orb_ritual_hands:        { path: 'orb_ritual_hands.mp4', dur: 4.04 },
  ancient_book_close:      { path: '_library/ancient_book_close.mp4', dur: 5.04 },
  eyes_dilated_purple:     { path: 'eyes_dilated_purple.mp4', dur: 7.88 },
  eyes_dilated_zoom_reveal:{ path: 'eyes_dilated_zoom_reveal.mp4', dur: 6.29 },
};
// Approved pairs and the theme each one suits.
const PAIRS = {
  A: { c1: 'asmr_walk_to_cauldron', c2: 'asmr_cauldron_stir', theme: 'brew', reason: 'Cleora approaches the pot, then stirs it in the same cooking setting.' },
  B: { c1: 'asmr_cauldron_stir', c2: 'asmr_ladle_taste', theme: 'brew', reason: 'Preparing the stew leads to tasting it; matching cauldron and costume.' },
  C: { c1: 'asmr_cauldron_stir', c2: 'asmr_flask_mixing', theme: 'brew', reason: 'The approved cooking-to-mixing ritual pair, with Cleora present before the hand detail.' },
  D: { c1: 'cleora_walk', c2: 'wide_closed_eye', theme: 'calm', reason: 'Cleora reaches her chair; the second shot settles into the same root-lined parlour.' },
  E: { c1: 'wide_closed_eye', c2: 'cleora_looking_into_orb', theme: 'calm', reason: 'The wide table view moves closer as Cleora looks down at the orb; matching teal and purple costume.' },
  F: { c1: 'cleora_tight', c2: 'orb_ritual_hands', theme: 'science', reason: 'Cleora’s face establishes her attention, then the wider view reveals her hands working over the orb.' },
  G: { c1: 'wide_closed_eye', c2: 'ancient_book_close', theme: 'history', reason: 'The room and Cleora are established before a closer candlelit reading ritual; suited to historical stories.' },
  H: { c1: 'eyes_dilated_purple', c2: 'eyes_dilated_zoom_reveal', theme: 'reveal', reason: 'Her purple-lit eyes lead into the matching pullback, revealing Cleora and the parlour.' },
  I: { c1: 'wide_closed_eye', c2: 'orb_ritual_hands', theme: 'science', reason: 'A calm wide view moves into Cleora’s orb ritual in the same room and costume.' },
};
const THEME_WORDS = {
  history: /\b(1[0-8]\d\d|19[0-4]\d|centur(y|ies)|ancient|pharaoh|tomb|roman|dynasty|egypt|hippocrates|dioscorides|tradition|folk|village|medieval|conquistador|mayan|inca)\b/gi,
  brew: /\b(tea|drink|brew\w*|root|bark|seeds?|honey|fruit|berr(y|ies)|cocoa|juice|herbs?|fern|powder|plants?|strawberr\w*|pomegranates?|spoon\w*|cups?|milk|resin|gum|kitchen|food|meals?|oil)\b/gi,
  science: /\b(peptides?|cells?|mitochondria|genes?|proteins?|molecules?|collagen|dna|laser|light|enzymes?|receptors?|lab|mice|trial|fibroblasts?|amino)\b/gi,
  reveal: /\b(rejected|banned|classified|secret|poison|destroyed|ridiculed|silence|warning|hid|hidden|buried|shelved|dismissed|ignored)\b/gi,
  calm: /$^/g,
};
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function inPoint(key, r) { const max = Math.max(0, CLIPS[key].dur - 4 - 0.1); return Math.round(r() * Math.min(max, 1.5) * 10) / 10; }

// Lifetime pair usage, so the whole lane stays balanced across batches.
const usage = Object.fromEntries(Object.keys(PAIRS).map(k => [k, 0]));
for (const h of $('Get Pair History').all()) {
  const p = h.json.production_metadata && h.json.production_metadata.pair_id;
  if (p && usage[p] !== undefined) usage[p] += 1;
}
// Music pool = tracks already approved for this lane (every music_id used on cleora_asmr), balanced by use.
const musicUse = {};
for (const h of $('Get Pair History').all()) {
  const m = h.json.music_id;
  if (m) musicUse[m] = (musicUse[m] || 0) + 1;
}
let prevMusic = null;

const rows = $('Get Approved Scripts').all().map(i => i.json).filter(r => r.content_id);
const batchUse = Object.fromEntries(Object.keys(PAIRS).map(k => [k, 0]));
let prev = null;
const out = [];
for (const row of rows) {
  const text = [row.story_title, row.screen_1_text, row.screen_2_text].join(' ');
  const score = {};
  for (const [theme, re] of Object.entries(THEME_WORDS)) score[theme] = (text.match(re) || []).length;
  score.calm = 0.5; // parlour pairs are the neutral fallback
  const r = rng(hash(row.content_id));
  // Theme fit (capped) leads; in-batch and lifetime usage keep all 9 pairs in rotation; never repeat the previous pair back-to-back.
  const ranked = Object.entries(PAIRS)
    .filter(([id]) => id !== prev)
    .map(([id, p]) => [id, Math.min(score[p.theme], 3) - batchUse[id] * 0.6 - usage[id] * 0.1 + r() * 0.5])
    .sort((a, b) => b[1] - a[1]);
  const pairId = ranked[0][0];
  const pair = PAIRS[pairId];
  usage[pairId] += 1;
  batchUse[pairId] += 1;
  prev = pairId;
  const musicId = Object.keys(musicUse)
    .filter(m => m !== prevMusic)
    .sort((a, b) => (musicUse[a] - musicUse[b]) || (hash(row.content_id + a) - hash(row.content_id + b)))[0] || null;
  if (musicId) { musicUse[musicId] += 1; prevMusic = musicId; }
  const meta = Object.assign({}, row.production_metadata || {}, {
    pair_id: pairId,
    clip_1_key: pair.c1,
    clip_2_key: pair.c2,
    clip_1_start: inPoint(pair.c1, r),
    clip_2_start: inPoint(pair.c2, r),
    pair_reason: pair.reason,
    theme_scores: score,
    switch_seconds: 4,
    duration_seconds: 8,
    director: 'cleora-asmr-director-v1',
    directed_at: new Date().toISOString(),
  });
  out.push({ json: {
    content_id: row.content_id,
    pair_id: pairId,
    music_id: musicId,
    patch_body: JSON.stringify({
      clip_1_url: BASE + CLIPS[pair.c1].path,
      clip_2_url: BASE + CLIPS[pair.c2].path,
      production_metadata: meta,
      music_id: musicId,
      render_status: 'ready_to_render',
    }),
  } });
}
return out;
