import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const supa = { supabaseApi: { id: 'BpJOuYVDTTtsYa5o', name: 'Supabase Service Role' } };
const REST = 'https://qlcmgxgwpzmiebzxflai.supabase.co/rest/v1/cleora_asmr';

const runManually = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Director' } });

const every12h = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Every 12 Hours', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 12 }] } } }
});

const getScripts = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Get Approved Scripts',
    parameters: {
      method: 'GET', url: REST,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'script_status', value: 'eq.approved' },
        { name: 'clip_1_url', value: 'is.null' },
        { name: 'select', value: 'content_id,story_title,screen_1_text,screen_2_text,production_metadata' },
        { name: 'order', value: 'content_id.asc' },
        { name: 'limit', value: '100' }
      ] }
    },
    credentials: supa
  }
});

const getHistory = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Get Pair History',
    executeOnce: true,
    parameters: {
      method: 'GET', url: REST,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'clip_1_url', value: 'not.is.null' },
        { name: 'select', value: 'production_metadata,music_id' },
        { name: 'limit', value: '5000' }
      ] }
    },
    credentials: supa
  }
});

const direct = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Direct Pairs + Music', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Cleora ASMR Director Stitch: picks one of the 9 approved clip pairs (A-I) per approved script,\n// sets deterministic in-points, and writes clip URLs + production_metadata back to cleora_asmr.\nconst BASE = 'https://qlcmgxgwpzmiebzxflai.supabase.co/storage/v1/object/public/cleora-clips/';\nconst CLIPS = {\n  asmr_walk_to_cauldron:   { path: 'asmr/asmr_walk_to_cauldron.mp4', dur: 5.04 },\n  asmr_cauldron_stir:      { path: 'asmr/asmr_cauldron_stir.mp4', dur: 8.04 },\n  asmr_ladle_taste:        { path: 'asmr/asmr_ladle_taste.mp4', dur: 5.04 },\n  asmr_flask_mixing:       { path: 'asmr/asmr_flask_mixing.mp4', dur: 5.04 },\n  cleora_walk:             { path: '_library/cleora_walk.mp4', dur: 5.04 },\n  wide_closed_eye:         { path: 'wide_closed_eye.mp4', dur: 15.04 },\n  cleora_looking_into_orb: { path: 'cleora_looking_into_orb.mp4', dur: 4.04 },\n  cleora_tight:            { path: 'cleora_tight.mp4', dur: 5.04 },\n  orb_ritual_hands:        { path: 'orb_ritual_hands.mp4', dur: 4.04 },\n  ancient_book_close:      { path: '_library/ancient_book_close.mp4', dur: 5.04 },\n  eyes_dilated_purple:     { path: 'eyes_dilated_purple.mp4', dur: 7.88 },\n  eyes_dilated_zoom_reveal:{ path: 'eyes_dilated_zoom_reveal.mp4', dur: 6.29 },\n};\n// Approved pairs and the theme each one suits.\nconst PAIRS = {\n  A: { c1: 'asmr_walk_to_cauldron', c2: 'asmr_cauldron_stir', theme: 'brew', reason: 'Cleora approaches the pot, then stirs it in the same cooking setting.' },\n  B: { c1: 'asmr_cauldron_stir', c2: 'asmr_ladle_taste', theme: 'brew', reason: 'Preparing the stew leads to tasting it; matching cauldron and costume.' },\n  C: { c1: 'asmr_cauldron_stir', c2: 'asmr_flask_mixing', theme: 'brew', reason: 'The approved cooking-to-mixing ritual pair, with Cleora present before the hand detail.' },\n  D: { c1: 'cleora_walk', c2: 'wide_closed_eye', theme: 'calm', reason: 'Cleora reaches her chair; the second shot settles into the same root-lined parlour.' },\n  E: { c1: 'wide_closed_eye', c2: 'cleora_looking_into_orb', theme: 'calm', reason: 'The wide table view moves closer as Cleora looks down at the orb; matching teal and purple costume.' },\n  F: { c1: 'cleora_tight', c2: 'orb_ritual_hands', theme: 'science', reason: 'Cleora\u2019s face establishes her attention, then the wider view reveals her hands working over the orb.' },\n  G: { c1: 'wide_closed_eye', c2: 'ancient_book_close', theme: 'history', reason: 'The room and Cleora are established before a closer candlelit reading ritual; suited to historical stories.' },\n  H: { c1: 'eyes_dilated_purple', c2: 'eyes_dilated_zoom_reveal', theme: 'reveal', reason: 'Her purple-lit eyes lead into the matching pullback, revealing Cleora and the parlour.' },\n  I: { c1: 'wide_closed_eye', c2: 'orb_ritual_hands', theme: 'science', reason: 'A calm wide view moves into Cleora\u2019s orb ritual in the same room and costume.' },\n};\nconst THEME_WORDS = {\n  history: /\\b(1[0-8]\\d\\d|19[0-4]\\d|centur(y|ies)|ancient|pharaoh|tomb|roman|dynasty|egypt|hippocrates|dioscorides|tradition|folk|village|medieval|conquistador|mayan|inca)\\b/gi,\n  brew: /\\b(tea|drink|brew\\w*|root|bark|seeds?|honey|fruit|berr(y|ies)|cocoa|juice|herbs?|fern|powder|plants?|strawberr\\w*|pomegranates?|spoon\\w*|cups?|milk|resin|gum|kitchen|food|meals?|oil)\\b/gi,\n  science: /\\b(peptides?|cells?|mitochondria|genes?|proteins?|molecules?|collagen|dna|laser|light|enzymes?|receptors?|lab|mice|trial|fibroblasts?|amino)\\b/gi,\n  reveal: /\\b(rejected|banned|classified|secret|poison|destroyed|ridiculed|silence|warning|hid|hidden|buried|shelved|dismissed|ignored)\\b/gi,\n  calm: /$^/g,\n};\nfunction hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }\nfunction rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }\nfunction inPoint(key, r) { const max = Math.max(0, CLIPS[key].dur - 4 - 0.1); return Math.round(r() * Math.min(max, 1.5) * 10) / 10; }\n\n// Lifetime pair usage, so the whole lane stays balanced across batches.\nconst usage = Object.fromEntries(Object.keys(PAIRS).map(k => [k, 0]));\nfor (const h of $('Get Pair History').all()) {\n  const p = h.json.production_metadata && h.json.production_metadata.pair_id;\n  if (p && usage[p] !== undefined) usage[p] += 1;\n}\n// Music pool = tracks already approved for this lane (every music_id used on cleora_asmr), balanced by use.\nconst musicUse = {};\nfor (const h of $('Get Pair History').all()) {\n  const m = h.json.music_id;\n  if (m) musicUse[m] = (musicUse[m] || 0) + 1;\n}\nlet prevMusic = null;\n\nconst rows = $('Get Approved Scripts').all().map(i => i.json).filter(r => r.content_id);\nconst batchUse = Object.fromEntries(Object.keys(PAIRS).map(k => [k, 0]));\nlet prev = null;\nconst out = [];\nfor (const row of rows) {\n  const text = [row.story_title, row.screen_1_text, row.screen_2_text].join(' ');\n  const score = {};\n  for (const [theme, re] of Object.entries(THEME_WORDS)) score[theme] = (text.match(re) || []).length;\n  score.calm = 0.5; // parlour pairs are the neutral fallback\n  const r = rng(hash(row.content_id));\n  // Theme fit (capped) leads; in-batch and lifetime usage keep all 9 pairs in rotation; never repeat the previous pair back-to-back.\n  const ranked = Object.entries(PAIRS)\n    .filter(([id]) => id !== prev)\n    .map(([id, p]) => [id, Math.min(score[p.theme], 3) - batchUse[id] * 0.6 - usage[id] * 0.1 + r() * 0.5])\n    .sort((a, b) => b[1] - a[1]);\n  const pairId = ranked[0][0];\n  const pair = PAIRS[pairId];\n  usage[pairId] += 1;\n  batchUse[pairId] += 1;\n  prev = pairId;\n  const musicId = Object.keys(musicUse)\n    .filter(m => m !== prevMusic)\n    .sort((a, b) => (musicUse[a] - musicUse[b]) || (hash(row.content_id + a) - hash(row.content_id + b)))[0] || null;\n  if (musicId) { musicUse[musicId] += 1; prevMusic = musicId; }\n  const meta = Object.assign({}, row.production_metadata || {}, {\n    pair_id: pairId,\n    clip_1_key: pair.c1,\n    clip_2_key: pair.c2,\n    clip_1_start: inPoint(pair.c1, r),\n    clip_2_start: inPoint(pair.c2, r),\n    pair_reason: pair.reason,\n    theme_scores: score,\n    switch_seconds: 4,\n    duration_seconds: 8,\n    director: 'cleora-asmr-director-v1',\n    directed_at: new Date().toISOString(),\n  });\n  out.push({ json: {\n    content_id: row.content_id,\n    pair_id: pairId,\n    music_id: musicId,\n    patch_body: JSON.stringify({\n      clip_1_url: BASE + CLIPS[pair.c1].path,\n      clip_2_url: BASE + CLIPS[pair.c2].path,\n      production_metadata: meta,\n      music_id: musicId,\n      render_status: 'ready_to_render',\n    }),\n  } });\n}\nreturn out;\n" } }
});

const writePlan = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Write Director Plan',
    parameters: {
      method: 'PATCH',
      url: expr('https://qlcmgxgwpzmiebzxflai.supabase.co/rest/v1/cleora_asmr?content_id=eq.{{ $json.content_id }}'),
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] },
      sendBody: true, contentType: 'raw', rawContentType: 'application/json',
      body: expr('{{ $json.patch_body }}')
    },
    credentials: supa
  }
});

export default workflow('cleora-asmr-director', '[Cleora ASMR] Director Stitch')
  .add(runManually).to(getScripts).to(getHistory).to(direct).to(writePlan)
  .add(every12h).to(getScripts);
