import { VirloNicheConfig } from "../../config/virloNiches";
import { DistributionRow, NicheAnalysis } from "./analyzeSlideshows";
import { NicheInsights } from "./llmInsights";
import { SlideshowMetrics } from "./metrics";

/** Markdown + HTML renderers for a niche analysis. No external deps. */

export interface NicheReportBundle {
  niche: VirloNicheConfig;
  analysis: NicheAnalysis;
  insights: NicheInsights | null;
}

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : Math.round(n).toLocaleString("en-US");
const pct = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined ? "–" : `${(n * 100).toFixed(d)}%`;
const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mdCell = (s: string) => clean(s).replace(/\|/g, "\\|");

const DIMENSION_LABELS: Array<[string, string]> = [
  ["hookType", "Hook type"],
  ["narrativeArc", "Narrative arc"],
  ["textDensity", "Text density"],
  ["contentFormat", "Content format"],
  ["emotionalTone", "Emotional tone"],
  ["imageCountBucket", "Slide count"],
  ["hasFace", "Face visible"],
  ["isBeforeAfter", "Before / after"],
  ["backgroundType", "Background"],
  ["foregroundType", "Foreground"],
  ["subjectAgeBracket", "Subject age"],
  ["subjectGender", "Subject gender"],
  ["hasCta", "Has CTA"],
  ["ctaUsages", "CTA types"],
  ["socialProof", "Social proof"],
  ["keywordFoundBy", "Found by keyword"],
  ["platform", "Platform"],
  ["source", "Data source"],
  ["region", "Region"]
];

function liftFlag(lift: number | null): string {
  if (lift === null) return "";
  if (lift >= 1.3) return "▲";
  if (lift <= 0.7) return "▼";
  return "";
}

function distTableMd(rows: DistributionRow[]): string[] {
  const out = ["| Value | Count | Share | Top-tier share | Lift | Median views |", "|---|---:|---:|---:|---:|---:|"];
  for (const r of rows) {
    out.push(`| ${mdCell(r.value)} | ${r.count} | ${pct(r.share)} | ${pct(r.topTierShare)} | ${r.lift ?? "–"} ${liftFlag(r.lift)} | ${fmt(r.medianViews)} |`);
  }
  return out;
}

function slideshowRowMd(m: SlideshowMetrics, i: number): string {
  return `| ${i + 1} | ${fmt(m.views)} | ${m.outlierMultiplier ?? "–"}x | ${m.hookType} | ${m.imageCount ?? "–"} | ${mdCell(m.hookText).slice(0, 110)} | [@${m.username}](${m.url}) (${fmt(m.followers)}) |`;
}

export function renderNicheReportMarkdown(b: NicheReportBundle): string {
  const { niche, analysis: a, insights } = b;
  const s = a.summary;
  const L: string[] = [];

  L.push(`# ${niche.agentName} — high-performing slideshow analysis`);
  L.push("");
  L.push(`Generated ${a.generatedAt} from a Virlo pull at ${a.snapshotPulledAt}. Agent \`${niche.agentId}\`. View floor ${fmt(a.minViews)}.`);
  L.push("");
  L.push("## Snapshot");
  L.push("");
  L.push("| Metric | Value |");
  L.push("|---|---:|");
  L.push(`| Slideshows above floor | ${s.count} |`);
  L.push(`| With Virlo intelligence | ${s.intelligenceReady} |`);
  L.push(`| Total views | ${fmt(s.totalViews)} |`);
  L.push(`| Median / mean views | ${fmt(s.medianViews)} / ${fmt(s.meanViews)} |`);
  L.push(`| p75 / p90 / max views | ${fmt(s.p75Views)} / ${fmt(s.p90Views)} / ${fmt(s.maxViews)} |`);
  L.push(`| Top tier (≥ ${fmt(s.topTierThresholdViews)} views) | ${s.topTierCount} |`);
  L.push(`| Median engagement / save rate | ${pct(s.medianEngagementRate, 1)} / ${pct(s.medianSaveRate, 2)} |`);
  L.push(`| Median outlier multiplier | ${s.medianOutlierMultiplier ?? "–"}x |`);
  L.push(`| Small-account breakouts | ${s.breakoutCount} |`);
  L.push(`| Score 9 / 8 / 7 / 6 | ${s.scoreCounts["9"]} / ${s.scoreCounts["8"]} / ${s.scoreCounts["7"]} / ${s.scoreCounts["6"]} |`);
  L.push(`| Platforms | ${Object.entries(s.platformCounts).map(([k, v]) => `${k}: ${v}`).join(", ")} |`);
  L.push(`| Sources | ${Object.entries(s.sourceCounts).map(([k, v]) => `${k}: ${v}`).join(", ")} |`);
  L.push(`| Publish range | ${s.earliestPublish?.slice(0, 10) ?? "–"} → ${s.latestPublish?.slice(0, 10) ?? "–"} |`);
  L.push(`| Posted last 30 / 90 days | ${s.postedLast30Days} / ${s.postedLast90Days} |`);
  L.push(`| Median panel words (all / top tier) | ${a.panelText.medianWords ?? "–"} / ${a.panelText.medianWordsTopTier ?? "–"} |`);
  L.push(`| Median slides (all / top tier) | ${a.panelText.medianImageCount ?? "–"} / ${a.panelText.medianImageCountTopTier ?? "–"} |`);
  L.push("");

  if (insights) {
    L.push("## Strategic read");
    L.push("");
    if (!insights.ok) {
      L.push(`_LLM insight pass unavailable (${insights.error ?? "unknown error"}); model ${insights.model}. Deterministic sections below are unaffected._`);
      L.push("");
    } else {
      L.push(`**${clean(insights.headline)}**`);
      L.push("");
      L.push("### Winning patterns");
      L.push("");
      insights.winningPatterns.forEach((p, i) => {
        L.push(`${i + 1}. **${clean(p.pattern)}**`);
        L.push(`   - Evidence: ${clean(p.evidence)}`);
        L.push(`   - Apply: ${clean(p.howToApply)}`);
      });
      L.push("");
      L.push("### Hook formulas");
      L.push("");
      L.push("| Formula | Example | Why it works |");
      L.push("|---|---|---|");
      insights.hookFormulas.forEach((h) => L.push(`| ${mdCell(h.formula)} | ${mdCell(h.example)} | ${mdCell(h.whyItWorks)} |`));
      L.push("");
      L.push("### Slide structure");
      L.push("");
      L.push(`- Slide count: ${clean(insights.slideStructure.recommendedSlideCount)}`);
      L.push(`- Arc: ${clean(insights.slideStructure.arc)}`);
      L.push(`- Text density: ${clean(insights.slideStructure.textDensity)}`);
      L.push(`- Visual style: ${clean(insights.slideStructure.visualStyle)}`);
      if (insights.slideStructure.notes) L.push(`- Notes: ${clean(insights.slideStructure.notes)}`);
      L.push("");
      L.push("### Content angles");
      L.push("");
      insights.contentAngles.forEach((c, i) => {
        L.push(`${i + 1}. **${clean(c.title)}** — ${clean(c.angle)}`);
        L.push(`   - Emotion: ${clean(c.targetEmotion)}`);
        L.push(`   - Hook: ${clean(c.exampleHook)}`);
      });
      L.push("");
      L.push("### Carousel briefs (ready for /api/carousel/plan)");
      L.push("");
      insights.carouselBriefs.forEach((c, i) => {
        L.push(`${i + 1}. **${clean(c.topic)}**`);
        L.push(`   - Concept: ${clean(c.concept)}`);
        L.push(`   - Audience: ${clean(c.audience)}`);
        L.push(`   - Tone: ${clean(c.tone)}`);
        L.push(`   - Hook idea: ${clean(c.hookIdea)}`);
      });
      L.push("");
      if (insights.avoid.length) {
        L.push("### Avoid");
        L.push("");
        insights.avoid.forEach((x) => L.push(`- ${clean(x)}`));
        L.push("");
      }
    }
  }

  L.push("## Top 30 slideshows");
  L.push("");
  L.push("| # | Views | Outlier | Hook type | Slides | Hook | Creator (followers) |");
  L.push("|---:|---:|---:|---|---:|---|---|");
  a.topSlideshows.forEach((m, i) => L.push(slideshowRowMd(m, i)));
  L.push("");

  if (a.breakouts.length) {
    L.push("## Small-account breakouts");
    L.push("");
    L.push("Accounts under 50k followers whose slideshow pulled at least 50x their follower count. These hooks work without an audience.");
    L.push("");
    L.push("| # | Views | Outlier | Hook type | Slides | Hook | Creator (followers) |");
    L.push("|---:|---:|---:|---|---:|---|---|");
    a.breakouts.forEach((m, i) => L.push(slideshowRowMd(m, i)));
    L.push("");
  }

  if (a.velocityLeaders.length) {
    L.push("## Fastest-moving (views per day, posted ≤120 days ago)");
    L.push("");
    L.push("| # | Views/day | Views | Age (days) | Hook | Link |");
    L.push("|---:|---:|---:|---:|---|---|");
    a.velocityLeaders.forEach((m, i) =>
      L.push(`| ${i + 1} | ${fmt(m.viewsPerDay)} | ${fmt(m.views)} | ${m.ageDays === null ? "–" : Math.round(m.ageDays)} | ${mdCell(m.hookText).slice(0, 110)} | [open](${m.url}) |`)
    );
    L.push("");
  }

  L.push("## What the top tier does differently");
  L.push("");
  L.push("Lift = share of the top tier that has the value ÷ share of all slideshows that have it. ▲ ≥ 1.3, ▼ ≤ 0.7.");
  L.push("");
  for (const [key, label] of DIMENSION_LABELS) {
    const rows = a.distributions[key];
    if (!rows || rows.length === 0) continue;
    L.push(`### ${label}`);
    L.push("");
    L.push(...distTableMd(rows));
    L.push("");
  }

  L.push("## Hooks by type");
  L.push("");
  for (const [type, hooks] of Object.entries(a.hooksByType).sort((x, y) => y[1].length - x[1].length)) {
    L.push(`### ${type}`);
    L.push("");
    hooks.forEach((h) => L.push(`- (${fmt(h.views)} views, ${h.imageCount ?? "?"} slides) ${clean(h.hook)} — [open](${h.url})`));
    L.push("");
  }

  L.push("## Topics, keywords, hashtags");
  L.push("");
  L.push("**Primary topics:** " + a.topTopics.map((t) => `${t.value} (${t.count}, med ${fmt(t.medianViews)})`).join("; "));
  L.push("");
  L.push("**Intelligence keywords:** " + a.topKeywords.map((t) => `${t.value} (${t.count})`).join(", "));
  L.push("");
  L.push("**Hashtags:** " + a.topHashtags.map((t) => `#${t.value} (${t.count}, med ${fmt(t.medianViews)})`).join(", "));
  L.push("");

  L.push("## Top creators");
  L.push("");
  L.push("| Creator | Followers | Slideshows | Total views | Best |");
  L.push("|---|---:|---:|---:|---|");
  a.topCreators.forEach((c) =>
    L.push(`| @${c.username}${c.verified ? " ✓" : ""} | ${fmt(c.followers)} | ${c.count} | ${fmt(c.totalViews)} | [${fmt(c.maxViews)}](${c.bestUrl}) |`)
  );
  L.push("");
  return L.join("\n");
}

function distTableHtml(rows: DistributionRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.value)}</td><td class="n">${r.count}</td><td class="n">${pct(r.share)}</td><td class="n">${pct(r.topTierShare)}</td><td class="n ${r.lift !== null && r.lift >= 1.3 ? "up" : r.lift !== null && r.lift <= 0.7 ? "down" : ""}">${r.lift ?? "–"}</td><td class="n">${fmt(r.medianViews)}</td></tr>`
    )
    .join("");
  return `<table><thead><tr><th>Value</th><th>Count</th><th>Share</th><th>Top-tier share</th><th>Lift</th><th>Median views</th></tr></thead><tbody>${body}</tbody></table>`;
}

function slideshowCardsHtml(list: SlideshowMetrics[]): string {
  return `<div class="cards">${list
    .map(
      (m) => `<a class="card" href="${esc(m.url)}" target="_blank" rel="noopener">
  ${m.thumbnailUrl ? `<img loading="lazy" src="${esc(m.thumbnailUrl)}" alt="">` : `<div class="noimg"></div>`}
  <div class="meta"><b>${fmt(m.views)}</b> views · ${m.outlierMultiplier ?? "–"}x · ${m.imageCount ?? "–"} slides<br><span class="tag">${esc(m.hookType)}</span> <span class="tag">${esc(m.narrativeArc)}</span></div>
  <div class="hook">${esc(clean(m.hookText).slice(0, 160))}</div>
  <div class="who">@${esc(m.username)} · ${fmt(m.followers)} followers</div>
</a>`
    )
    .join("")}</div>`;
}

export function renderNicheReportHtml(b: NicheReportBundle): string {
  const { niche, analysis: a, insights } = b;
  const s = a.summary;
  const stat = (label: string, value: string) => `<div class="stat"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;

  const insightsHtml = !insights
    ? ""
    : !insights.ok
    ? `<section><h2>Strategic read</h2><p class="muted">LLM insight pass unavailable (${esc(insights.error ?? "")}).</p></section>`
    : `<section><h2>Strategic read</h2>
<p class="headline">${esc(insights.headline)}</p>
<h3>Winning patterns</h3><ol>${insights.winningPatterns.map((p) => `<li><b>${esc(p.pattern)}</b><br><span class="muted">Evidence:</span> ${esc(p.evidence)}<br><span class="muted">Apply:</span> ${esc(p.howToApply)}</li>`).join("")}</ol>
<h3>Hook formulas</h3><table><thead><tr><th>Formula</th><th>Example</th><th>Why it works</th></tr></thead><tbody>${insights.hookFormulas.map((h) => `<tr><td>${esc(h.formula)}</td><td>${esc(h.example)}</td><td>${esc(h.whyItWorks)}</td></tr>`).join("")}</tbody></table>
<h3>Slide structure</h3><ul><li>Slide count: ${esc(insights.slideStructure.recommendedSlideCount)}</li><li>Arc: ${esc(insights.slideStructure.arc)}</li><li>Text density: ${esc(insights.slideStructure.textDensity)}</li><li>Visual style: ${esc(insights.slideStructure.visualStyle)}</li>${insights.slideStructure.notes ? `<li>Notes: ${esc(insights.slideStructure.notes)}</li>` : ""}</ul>
<h3>Content angles</h3><ol>${insights.contentAngles.map((c) => `<li><b>${esc(c.title)}</b> — ${esc(c.angle)}<br><span class="muted">Emotion:</span> ${esc(c.targetEmotion)} · <span class="muted">Hook:</span> ${esc(c.exampleHook)}</li>`).join("")}</ol>
<h3>Carousel briefs</h3><ol>${insights.carouselBriefs.map((c) => `<li><b>${esc(c.topic)}</b><br>${esc(c.concept)}<br><span class="muted">Audience:</span> ${esc(c.audience)} · <span class="muted">Tone:</span> ${esc(c.tone)} · <span class="muted">Hook:</span> ${esc(c.hookIdea)}</li>`).join("")}</ol>
${insights.avoid.length ? `<h3>Avoid</h3><ul>${insights.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
</section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(niche.agentName)} — slideshow analysis</title>
<style>
  :root{color-scheme:light;--ink:#1a1a1a;--muted:#6b6b6b;--line:#e6e6e6;--bg:#fafaf8;--card:#fff;--up:#0a7a3c;--down:#b3261e}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  main{max-width:1200px;margin:0 auto;padding:32px 20px 80px}
  h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:40px 0 12px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{font-size:15px;margin:22px 0 8px}
  .muted{color:var(--muted)}.headline{font-size:17px;font-weight:600}
  .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:18px 0}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}.stat .v{font-size:20px;font-weight:700}.stat .l{color:var(--muted);font-size:12px}
  table{border-collapse:collapse;width:100%;background:var(--card);font-size:13px;margin:8px 0}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f1ee}td.n{text-align:right;white-space:nowrap}
  td.up{color:var(--up);font-weight:700}td.down{color:var(--down);font-weight:700}
  .wrap{overflow-x:auto}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
  .card{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;color:inherit;text-decoration:none}
  .card img,.card .noimg{width:100%;aspect-ratio:3/4;object-fit:cover;background:#eee;display:block}
  .card .meta{padding:8px 10px 0;font-size:12px}.card .hook{padding:6px 10px;font-weight:600;font-size:13px}.card .who{padding:0 10px 10px;font-size:12px;color:var(--muted)}
  .tag{display:inline-block;background:#f1f1ee;border-radius:4px;padding:0 6px;font-size:11px;margin-top:4px}
  .dims{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}
</style></head><body><main>
<h1>${esc(niche.agentName)}</h1>
<p class="muted">Virlo agent ${esc(niche.agentId)} · pulled ${esc(a.snapshotPulledAt)} · generated ${esc(a.generatedAt)} · view floor ${fmt(a.minViews)}</p>
<div class="stats">
${stat("slideshows above floor", String(s.count))}
${stat("sources", Object.entries(s.sourceCounts).map(([k, v]) => `${k} ${v}`).join(" · ") || "–")}
${stat("median views", fmt(s.medianViews))}
${stat("p90 views", fmt(s.p90Views))}
${stat("max views", fmt(s.maxViews))}
${stat("top tier (≥ " + fmt(s.topTierThresholdViews) + ")", String(s.topTierCount))}
${stat("median engagement", pct(s.medianEngagementRate, 1))}
${stat("median save rate", pct(s.medianSaveRate, 2))}
${stat("median outlier", (s.medianOutlierMultiplier ?? "–") + "x")}
${stat("breakouts", String(s.breakoutCount))}
${stat("posted last 30d", String(s.postedLast30Days))}
${stat("median slides (top tier)", `${a.panelText.medianImageCount ?? "–"} (${a.panelText.medianImageCountTopTier ?? "–"})`)}
${stat("median words (top tier)", `${a.panelText.medianWords ?? "–"} (${a.panelText.medianWordsTopTier ?? "–"})`)}
</div>
${insightsHtml}
<section><h2>Top slideshows</h2>${slideshowCardsHtml(a.topSlideshows)}</section>
${a.breakouts.length ? `<section><h2>Small-account breakouts</h2><p class="muted">Under 50k followers, ≥50x follower views — hooks that work without an audience.</p>${slideshowCardsHtml(a.breakouts)}</section>` : ""}
<section><h2>What the top tier does differently</h2><p class="muted">Lift = top-tier share ÷ overall share. Green ≥ 1.3, red ≤ 0.7.</p><div class="dims">
${DIMENSION_LABELS.filter(([k]) => a.distributions[k]?.length).map(([k, label]) => `<div><h3>${esc(label)}</h3><div class="wrap">${distTableHtml(a.distributions[k])}</div></div>`).join("")}
</div></section>
<section><h2>Hooks by type</h2>${Object.entries(a.hooksByType).sort((x, y) => y[1].length - x[1].length).map(([type, hooks]) => `<h3>${esc(type)}</h3><ul>${hooks.map((h) => `<li>(${fmt(h.views)} views, ${h.imageCount ?? "?"} slides) ${esc(clean(h.hook))} <a href="${esc(h.url)}" target="_blank" rel="noopener">open</a></li>`).join("")}</ul>`).join("")}</section>
<section><h2>Topics, keywords, hashtags</h2>
<p><b>Primary topics:</b> ${a.topTopics.map((t) => `${esc(t.value)} (${t.count})`).join("; ")}</p>
<p><b>Keywords:</b> ${a.topKeywords.map((t) => `${esc(t.value)} (${t.count})`).join(", ")}</p>
<p><b>Hashtags:</b> ${a.topHashtags.map((t) => `#${esc(t.value)} (${t.count})`).join(", ")}</p></section>
<section><h2>Top creators</h2><div class="wrap"><table><thead><tr><th>Creator</th><th>Followers</th><th>Slideshows</th><th>Total views</th><th>Best</th></tr></thead><tbody>
${a.topCreators.map((c) => `<tr><td>@${esc(c.username)}${c.verified ? " ✓" : ""}</td><td class="n">${fmt(c.followers)}</td><td class="n">${c.count}</td><td class="n">${fmt(c.totalViews)}</td><td class="n"><a href="${esc(c.bestUrl)}" target="_blank" rel="noopener">${fmt(c.maxViews)}</a></td></tr>`).join("")}
</tbody></table></div></section>
</main></body></html>`;
}

export function renderCrossNicheMarkdown(bundles: NicheReportBundle[]): string {
  const L: string[] = [];
  L.push("# Skincare slideshow research — cross-niche summary");
  L.push("");
  L.push(`Generated ${new Date().toISOString()}.`);
  L.push("");
  L.push("| Niche | Slideshows | Median views | p90 views | Max views | Top hook type (lift) | Top arc (lift) | Median slides (top tier) | Breakouts |");
  L.push("|---|---:|---:|---:|---:|---|---|---:|---:|");
  for (const b of bundles) {
    const s = b.analysis.summary;
    const best = (rows: DistributionRow[]) => {
      const r = [...rows]
        .filter((x) => x.count >= 3 && x.value !== "unknown")
        .sort((x, y) => (y.lift ?? 0) - (x.lift ?? 0))[0];
      return r ? `${r.value} (${r.lift})` : "–";
    };
    L.push(
      `| [${b.niche.agentName}](./${b.niche.key}.md) | ${s.count} | ${fmt(s.medianViews)} | ${fmt(s.p90Views)} | ${fmt(s.maxViews)} | ${best(b.analysis.distributions.hookType)} | ${best(b.analysis.distributions.narrativeArc)} | ${b.analysis.panelText.medianImageCountTopTier ?? "–"} | ${s.breakoutCount} |`
    );
  }
  L.push("");
  for (const b of bundles) {
    L.push(`## ${b.niche.agentName}`);
    L.push("");
    if (b.insights?.ok) {
      L.push(`**${clean(b.insights.headline)}**`);
      L.push("");
      b.insights.winningPatterns.slice(0, 3).forEach((p) => L.push(`- ${clean(p.pattern)} _(${clean(p.evidence)})_`));
      L.push("");
    }
    L.push("Top 5 hooks:");
    L.push("");
    b.analysis.topSlideshows.slice(0, 5).forEach((m) => L.push(`- (${fmt(m.views)}) ${clean(m.hookText).slice(0, 140)} — [open](${m.url})`));
    L.push("");
  }
  return L.join("\n");
}
