// Universal Caption Maker - reusable across pillars
// POST a JSON config to /webhook/caption-maker. See workflow description.
// Patched 2026-06-06: parallelized inner loop with Promise.all to avoid 60s task-runner cap.
// Patched 2026-07-14: baseline no-ampersand / no-dash rules + sanitizer, applied regardless of caller config.
// Patched 2026-08-07 (ban remediation): default CTA removed, hashtags sampled per row,
//   baseline banned list, narrative prompt.
// Patched 2026-08-07b (safe-by-default): the workflow is now usable with source + output only.
//   Everything in `voice` is optional. Defaults are deliberately conservative:
//     - no CTA, no offer, no keyword ask unless voice.cta_template is explicitly passed
//     - DEFAULT_SYSTEM_PROMPT enforces first-person narrative voice with no marketing register
//     - BASELINE_BANNED covers drug names, drug classes, lead-gen asks AND health/marketing claims
//     - DEFAULT_HASHTAG_POOL is lifestyle only, no weight-loss or health-claim tags
//     - context columns are auto-detected from the row when none are passed
//   Escape hatch: voice.allow_terms = ['peptide'] removes specific terms from BASELINE_BANNED.
// Patched 2026-08-27 (anti-fingerprint dilution): a fixed niche hashtag stack (format.hashtag_stack)
//   is now DILUTED with lifestyle tags so the appended block diverges across accounts instead of
//   reusing the same tiny niche pool everywhere (ban KB: repeated-caption-boilerplate). Keeps up to
//   format.hashtag_niche_keep (default 2) of the caller's targeting tags per post, fills the rest from
//   the blended pool. Disable with format.dilute_hashtags=false. An explicit format.hashtag_pool is
//   treated as an already-large pool and sampled as-is (no dilution).

const SUPABASE_KEY = 'sb_secret_9m_L_eb7sLGnbwbcCUXyfA_rO_91Upc';
const ANTHROPIC_KEY = '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';
const DEFAULT_SUPABASE_URL = 'https://qlcmgxgwpzmiebzxflai.supabase.co';

const DEFAULT_SYSTEM_PROMPT = [
  'You write captions for one woman posting about her own life on TikTok and Instagram.',
  'She is not a brand, a coach, or a marketer, and the caption must never read like any of those.',
  'Voice: casual, first person, the way she would actually text a friend. Plain words. Unfinished thoughts are fine.',
  'She explains things in felt language, never textbook language, and never as advice to the viewer.',
  'She describes what happened to her. She does not tell anyone what to do, promise a result, or cite a study.',
  'Nothing is being sold. No product, service, program, brand, quiz, or link exists in her world.'
].join('\n');

// Applied to EVERY call regardless of caller config. Remove individual terms with voice.allow_terms.
const BASELINE_BANNED = [
  // drug names and classes
  'glp1', 'glp-1', 'glp 1', 'semaglutide', 'tirzepatide', 'retatrutide', 'liraglutide',
  'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'saxenda',
  'peptide', 'peptides', 'injection', 'injectable', 'compounded', 'prescription', 'dosage', 'microdose',
  'weight loss drug', 'weight loss shot', 'fat burner', 'appetite suppressant', 'supplement',
  // lead generation asks
  'in the comments', 'comment below', 'comment the word', 'drop a comment',
  'type quiz', 'type renew', 'type build', 'quiz',
  'dm me', 'dm the word', 'send me a dm', 'link in bio', 'link in my bio', 'check my bio',
  'sign up', 'get access', 'book a call', 'join the',
  // health and marketing claims
  'cure', 'cures', 'guaranteed', 'guarantee', 'clinically proven', 'doctor recommended',
  'melt fat', 'melts fat', 'burn fat', 'burns fat', 'shed pounds', 'drop pounds', 'lose weight fast',
  'miracle', 'secret', 'they do not want you to know', 'transformation', 'before and after',
  'lose 10', 'lose 20', 'lose 30', 'pounds in'
];

// Lifestyle only. No weight-loss, health-claim, or medical tags by default.
const DEFAULT_HASHTAG_POOL = [
  '#morningroutine', '#whatieatinaday', '#realtalk', '#healthyhabits', '#kitchentok',
  '#girltalk', '#womenover30', '#smallchanges', '#consistency', '#cookingathome',
  '#dailyroutine', '#mindsetshift', '#slowliving', '#treadmillwalking', '#gymgirl',
  '#homecooking', '#selfcaretips', '#routinereset'
];
const DEFAULT_HASHTAG_COUNT = 3;

// Used when source.context_columns is not supplied.
const AUTO_CONTEXT_HINTS = [
  'story', 'script', 'transcript', 'voiceover', 'hook', 'text', 'description',
  'notes', 'summary', 'angle', 'topic', 'fact', 'body', 'quote', 'title'
];

const STRUCTURE_MOVES = [
  'Open mid-thought, as if you are continuing a sentence you already started in your head.',
  'Open on one concrete detail from this video: a time of day, a food, a number, an object.',
  'Open by admitting something you believed for a long time that turned out to be wrong.',
  'Open with something another person actually said to you.',
  'Open at the moment it changed, then back up and explain how you got there.',
  'Open with a flat statement of fact. No hook energy, no question.',
  'Open by talking to one specific person you have in mind, not to an audience.',
  'Open with what you were feeling that day rather than what you did.',
  'Open with the boring part on purpose, then let the point land late.',
  'Open with a small thing you still do now because of this.'
];
const LENGTH_TARGETS = [
  'one short sentence',
  'two short sentences',
  'three to four sentences',
  'a short paragraph, around five sentences',
  'two sentences and a one-line beat on its own line'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sample = (arr, n) => {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = copy[i]; copy[i] = copy[j]; copy[j] = t;
  }
  return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
};

const first = $input.first().json;
const cfg = first.body || first.params || first;

// `voice` is now optional. Only the source table and the target column are required.
const errors = [];
if (!cfg.source || !cfg.source.table) errors.push('missing source.table');
if (!cfg.output || !cfg.output.target_column) errors.push('missing output.target_column');
if (errors.length) return [{ json: { error: 'invalid config: ' + errors.join('; '), got: Object.keys(cfg) } }];

const voice = cfg.voice || {};

const SB = cfg.source.supabase_url || DEFAULT_SUPABASE_URL;
const table = cfg.source.table;
const select = cfg.source.select || '*';
const filter = (cfg.source.filter || '').replace(/^&/, '');
const limit = cfg.source.limit || 500;
const idCol = cfg.source.id_column || 'id';
let contextCols = cfg.source.context_columns || [];
const contextLabels = cfg.source.context_labels || {};

const angles = voice.opening_angles || [];
const angleMode = voice.angle_mode || 'direction';

const ctaTpl = voice.cta_template || '';
const ctaVariants = (voice.cta_variants && voice.cta_variants.length) ? voice.cta_variants : [];

const proofInstr = voice.personal_proof_instructions || '';
const allowTerms = (voice.allow_terms || []).map(t => String(t).toLowerCase());
const banned = BASELINE_BANNED
  .filter(w => allowTerms.indexOf(w.toLowerCase()) === -1)
  .concat(voice.banned_words || []);
const required = voice.required_phrases || [];
const extraRules = (voice.extra_rules || '') + '\nNever use ampersands. Always write the word and. Never use em dashes or en dashes. Use commas or full stops instead.';
const systemPrompt = voice.system_prompt || DEFAULT_SYSTEM_PROMPT;
const model = voice.model || 'claude-sonnet-4-5';
const temperature = voice.temperature != null ? voice.temperature : 1;
const maxTokens = voice.max_tokens || 600;

// ---- Hashtags (2026-08-27: dilute a fixed niche stack to cut cross-account fingerprint) ----
const toTags = (raw) => (Array.isArray(raw) ? raw : String(raw).split(/\s+/))
  .map(t => String(t).trim())
  .filter(Boolean)
  .map(t => (t.startsWith('#') ? t : '#' + t));

const fmt = cfg.format || {};
const poolTags = toTags(fmt.hashtag_pool || '');    // explicit large pool -> sampled as-is
const nicheTags = toTags(fmt.hashtag_stack || '');  // fixed niche stack -> diluted
const hashtagCount = fmt.hashtag_count != null ? fmt.hashtag_count : DEFAULT_HASHTAG_COUNT;
const hashtagAlways = toTags(fmt.hashtag_always || []);
const dilute = fmt.dilute_hashtags !== false;       // default ON
const nicheKeep = fmt.hashtag_niche_keep != null ? fmt.hashtag_niche_keep : 2;
const hashtagsEnabled = fmt.hashtags !== false;

const notIn = (used) => (t) => used.indexOf(t) === -1;
const buildHashtags = () => {
  if (poolTags.length) {
    return hashtagAlways.concat(sample(poolTags.filter(notIn(hashtagAlways)), hashtagCount));
  }
  if (nicheTags.length && dilute) {
    const keepN = Math.max(0, Math.min(nicheKeep, hashtagCount, nicheTags.length));
    const keptNiche = sample(nicheTags, keepN);
    const used = hashtagAlways.concat(keptNiche);
    const fillPool = DEFAULT_HASHTAG_POOL.concat(nicheTags).filter(notIn(used));
    const fill = sample(fillPool, Math.max(0, hashtagCount - keptNiche.length));
    return hashtagAlways.concat(keptNiche, fill);
  }
  if (nicheTags.length) {
    return hashtagAlways.concat(sample(nicheTags.filter(notIn(hashtagAlways)), hashtagCount));
  }
  if (hashtagsEnabled) {
    return hashtagAlways.concat(sample(DEFAULT_HASHTAG_POOL.filter(notIn(hashtagAlways)), hashtagCount));
  }
  return hashtagAlways.slice();
};

const targetCol = cfg.output.target_column;
const tsCol = cfg.output.timestamp_column;

const CONCURRENCY = Math.max(1, Math.min(20, parseInt(cfg.concurrency, 10) || 5));

const fetchUrl = SB + '/rest/v1/' + table + '?select=' + encodeURI(select) + (filter ? '&' + filter : '') + '&limit=' + limit;
const rows = await this.helpers.httpRequest({
  method: 'GET', url: fetchUrl,
  headers: { apikey: SUPABASE_KEY },
  json: true
});

if (!rows || !rows.length) return [{ json: { processed: 0, message: 'No rows match filter' } }];

// Auto-detect the story columns when the caller did not name them.
if (!contextCols.length) {
  const keys = Object.keys(rows[0] || {});
  contextCols = keys.filter(k => {
    if (k === idCol || k === targetCol || k === tsCol) return false;
    const lk = k.toLowerCase();
    return AUTO_CONTEXT_HINTS.some(h => lk.indexOf(h) !== -1);
  });
}

const sanitize = (text) => {
  let t = text.split(' & ').join(' and ').split('&').join(' and ');
  t = t.replace(/\s*[—–]+\s*/g, ', ');
  t = t.replace(/ {2,}/g, ' ').replace(/ ,/g, ',');
  return t;
};

const stripHashtags = (text) => text.replace(/(^|\n)\s*(#[^\s#]+\s*)+$/g, '').trimEnd();
const findBanned = (text) => {
  const lower = text.toLowerCase();
  return banned.find(w => w && lower.indexOf(String(w).toLowerCase()) !== -1);
};

const buildPrompt = (row, retryNote) => {
  const angle = angles.length ? pick(angles) : '';
  const ctaVariant = ctaVariants.length ? pick(ctaVariants) : '';
  const move = pick(STRUCTURE_MOVES);
  const lengthTarget = pick(LENGTH_TARGETS);

  const ctx = contextCols
    .filter(c => row[c] != null && String(row[c]).trim().length > 0)
    .map(c => (contextLabels[c] || c.toUpperCase()) + ': ' + row[c])
    .join('\n');

  const ctaResolved = ctaTpl ? ctaTpl.replace('{{variant}}', ctaVariant) : '';

  return [
    systemPrompt,
    '',
    'You are writing the caption for ONE specific short form video.',
    'The caption is not a summary of the video and not an ad. It is the same person who is in the video,',
    'talking in first person about what actually happened in it. Write only from what this video contains.',
    'If the context below is thin, stay small and specific rather than inventing detail.',
    '',
    'THIS VIDEO:',
    ctx ? ctx : '(no additional context on this row, work from the fields you were given)',
    '',
    'HOW TO SHAPE THIS ONE:',
    '- ' + move,
    '- Length: ' + lengthTarget + '.',
    '- This caption must not be swappable onto a different video. If it could sit under any video in the niche, rewrite it.',
    '- Do not use a formula. No setup, payoff, call to action rhythm unless the story genuinely goes that way.',
    '- No hashtags anywhere in the body. They are appended separately.',
    angle
      ? (angleMode === 'verbatim'
          ? 'THE EXACT OPENING must be this angle, used verbatim:\n' + angle
          : 'Use this angle as a DIRECTION for what the caption is about. Do not copy its wording:\n' + angle)
      : '',
    '',
    ctaResolved
      ? 'CLOSE: ease into this close naturally, in this narrative voice, so it reads as part of the story rather than a bolted on ask:\n' + ctaResolved
      : 'CLOSE: end where the story ends. Do NOT add a call to action, an offer, a program, a quiz, a keyword, a link, or an instruction to comment or DM. Nothing is being sold here.',
    '',
    proofInstr ? 'PERSONAL PROOF INSTRUCTIONS:\n' + proofInstr : '',
    '',
    'HARD RULES:',
    '- Never use these words or phrases: ' + banned.join(', '),
    '- Never name a drug, a medication brand, a drug class, or a supplement.',
    '- Never make a health claim, promise a result, or cite a study, doctor, or statistic.',
    '- Never instruct the viewer to do anything, including typing, commenting, DMing, or clicking.',
    '- Never mention a product, brand, program, or service, including your own.',
    required.length ? '- Must include verbatim: ' + required.join(', ') : '',
    extraRules,
    retryNote ? '\nPREVIOUS ATTEMPT REJECTED: it contained "' + retryNote + '". Rewrite without that idea entirely, not with a synonym.' : '',
    '',
    'Return ONLY the caption text. No JSON, no labels, no surrounding quotes.'
  ].filter(Boolean).join('\n');
};

const callClaude = async (prompt) => {
  const resp = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: {
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: 'user', content: prompt }]
    },
    json: true
  });
  let text = ((resp && resp.content && resp.content[0] && resp.content[0].text) || '').trim();
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
  return sanitize(text);
};

const processRow = async (row) => {
  const rowId = row[idCol];
  try {
    let text = await callClaude(buildPrompt(row, ''));
    if (!text) return { ok: false, id: rowId, reason: 'empty response' };

    let hit = findBanned(text);
    if (hit) {
      text = await callClaude(buildPrompt(row, hit));
      hit = findBanned(text);
      if (hit) return { ok: false, id: rowId, reason: 'banned term after retry: ' + hit };
    }

    const missReq = required.find(p => p && text.toLowerCase().indexOf(String(p).toLowerCase()) === -1);
    if (missReq) return { ok: false, id: rowId, reason: 'missing required phrase: ' + missReq };

    text = stripHashtags(text);
    const tags = buildHashtags();
    if (tags.length) text = text + '\n\n' + sample(tags, tags.length).join(' ');

    const patchBody = {};
    patchBody[targetCol] = text;
    if (tsCol) patchBody[tsCol] = new Date().toISOString();

    await this.helpers.httpRequest({
      method: 'PATCH',
      url: SB + '/rest/v1/' + table + '?' + idCol + '=eq.' + encodeURIComponent(rowId),
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: patchBody,
      json: true
    });
    return { ok: true, id: rowId };
  } catch (e) {
    return { ok: false, id: rowId, reason: String(e && e.message || e).slice(0, 200) };
  }
};

const results = [];
for (let i = 0; i < rows.length; i += CONCURRENCY) {
  const slice = rows.slice(i, i + CONCURRENCY);
  const r = await Promise.all(slice.map(row => processRow(row)));
  results.push(...r);
}

const okIds = results.filter(r => r.ok).map(r => r.id);
const failures = results.filter(r => !r.ok).map(r => ({ id: r.id, reason: r.reason }));

const hashtagMode = poolTags.length ? 'explicit_pool'
  : (nicheTags.length ? (dilute ? 'niche_diluted' : 'niche_raw')
  : (hashtagsEnabled ? 'default_pool' : 'none'));

return [{
  json: {
    processed: okIds.length,
    total: rows.length,
    failures_total: failures.length,
    failures_sample: failures.slice(0, 20),
    cta_enabled: Boolean(ctaTpl),
    used_default_system_prompt: !voice.system_prompt,
    context_columns_used: contextCols,
    allowed_terms: allowTerms,
    hashtag_mode: hashtagMode,
    hashtag_niche_kept: (nicheTags.length && dilute) ? Math.max(0, Math.min(nicheKeep, hashtagCount, nicheTags.length)) : null,
    hashtags_per_caption: hashtagCount + hashtagAlways.length,
    concurrency: CONCURRENCY,
    first_ok: okIds[0],
    last_ok: okIds[okIds.length - 1]
  }
}];
