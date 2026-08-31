// Role-fit scoring for Business Hunter.
// Scores a job title against a selected fit profile. Default profile is
// "AI / Software Engineering"; "New Business Hunter" ranks client-facing,
// revenue-generating roles instead.

const DEFAULT_PROFILE = 'ai-software-engineering';

const PROFILES = {
  'ai-software-engineering': {
    label: 'AI / Software Engineering',
    strong: [
      ['machine learning', 50],
      ['artificial intelligence', 50],
      [' ai ', 50],
      ['ai engineer', 50],
      ['genai', 50],
      ['llm', 45],
      ['software engineer', 50],
      ['software developer', 50],
      ['data scientist', 50],
      ['data engineer', 50],
      ['full stack', 45],
      ['tech lead', 45],
      ['security engineer', 45],
      ['developer', 40],
      ['devops', 40],
      ['backend', 40],
      ['frontend', 40],
      ['sre', 40],
      ['programmer', 40],
      ['soc ', 35],
      ['cyber', 35],
      ['architect', 35],
      ['engineer', 30],
      ['quality assurance', 30],
      ['ux designer', 30],
      ['analytics', 20],
      ['hris', 20],
      ['it ', 15],
      ['data', 12],
    ],
    seniority: [
      ['director', 8],
      ['vp', 8],
      ['vice president', 8],
      ['head of', 8],
      ['principal', 6],
      ['lead', 4],
      ['senior', 4],
    ],
    negative: [
      ['refuel', -40],
      ['avitailleur', -40],
      ['sales', -30],
      ['trader', -30],
      ['broker', -30],
      ['operator', -30],
      ['technician', -30],
      ['tax', -30],
      ['counsel', -30],
      ['legal', -30],
      ['customer service', -25],
      ['audit', -25],
      ['procurement', -25],
      ['compensation', -25],
      ['marketing', -20],
      ['supply', -20],
      ['inventory', -20],
      ['payroll', -15],
      ['credit', -15],
      ['controls manager', -15],
    ],
  },
  'new-business-hunter': {
    label: 'New Business Hunter',
    strong: [
      ['business development', 50],
      ['new business', 50],
      ['sales executive', 50],
      ['account executive', 50],
      ['sales manager', 40],
      ['sales director', 40],
      ['head of sales', 40],
      ['territory', 35],
      ['account manager', 35],
      ['commercial manager', 35],
      ['partnerships', 35],
      ['revenue', 30],
      ['growth', 25],
      ['trader', 40],
      ['broker', 40],
      ['sales', 30],
      ['solutions', 15],
      ['consultant', 18],
      ['commercial', 15],
      ['client', 10],
      ['customer success', 10],
      ['marketing', 8],
    ],
    seniority: [
      ['director', 8],
      ['vp', 8],
      ['vice president', 8],
      ['head of', 8],
      ['lead', 4],
      ['senior', 4],
    ],
    negative: [
      ['engineer', -30],
      ['developer', -30],
      ['technician', -30],
      ['refuel', -30],
      ['operator', -30],
      ['payroll', -30],
      ['audit', -30],
      ['tax', -30],
      ['counsel', -30],
      ['legal', -30],
      ['compensation', -25],
      ['procurement', -25],
      ['credit', -20],
      ['controller', -20],
      ['operations', -18],
      ['operativo', -18],
      ['customer service', -15],
      ['coordinator', -12],
      ['support', -12],
      ['analyst', -10],
      ['it ', -20],
      ['soc ', -20],
      ['hris', -25],
      ['inventory', -20],
      ['supply', -15],
    ],
  },
};

function scoreTitle(title, profileKey) {
  const profile = PROFILES[profileKey] || PROFILES[DEFAULT_PROFILE];
  const t = ` ${String(title).toLowerCase()} `;
  let score = 0;
  const matched = [];
  const flags = [];

  for (const [kw, pts] of profile.strong) {
    if (t.includes(kw)) {
      score += pts;
      matched.push(kw);
    }
  }
  // Seniority only boosts a role that already smells client-facing.
  if (score > 0) {
    for (const [kw, pts] of profile.seniority) {
      if (t.includes(kw)) {
        score += pts;
        matched.push(kw);
      }
    }
  }
  for (const [kw, pts] of profile.negative) {
    if (t.includes(kw)) {
      score += pts;
      flags.push(kw.trim());
    }
  }

  const bounded = Math.max(0, Math.min(100, score));
  let tier = 'no-fit';
  if (bounded >= 50) tier = 'strong';
  else if (bounded >= 22) tier = 'possible';

  return { score: bounded, tier, matched, flags };
}

module.exports = { scoreTitle, PROFILES, DEFAULT_PROFILE };
