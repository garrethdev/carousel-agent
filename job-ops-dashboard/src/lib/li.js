import { normalizeCompany, makeId } from "./id.js";
import { MANUAL_LANES } from "./manual_lead.js";
import { VOICE_PROFILE, BACKGROUND_FACTS } from "./voice.js";

// LinkedIn Drop-view helpers. All pure — unit tested in test/li.test.js.
// The serverless glue (Apollo, Supabase, OpenRouter calls) lives in api/li.js.

// Senior tech leadership — the titles the Drop view hunts for. Ordered by
// preference; Apollo returns its own relevance order within these.
export const TECH_LEADERSHIP_TITLES = [
  "CTO", "Chief Technology Officer", "Co-Founder", "Founder",
  "VP Engineering", "VP of Engineering", "Head of Engineering",
  "Director of Engineering", "Chief Product and Technology Officer",
  "Head of AI", "Chief AI Officer", "Head of Platform",
];

// Connection-request notes get cut off at 300 chars by LinkedIn.
export const NOTE_MAX = 300;

/* --- screenshot extraction ------------------------------------------------ */

// Parse the vision model's reply into validated job-posting fields. Same
// slice-to-outer-braces strategy as lib/llm.js parseEmailJSON.
export function parseShotJSON(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("vision model returned no JSON object");
  let p;
  try {
    p = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    throw new Error("vision model returned unparseable JSON: " + e.message);
  }
  const company = String((p && p.company) || "").trim().slice(0, 120);
  if (!company) throw new Error("couldn't read a company name off the screenshot");
  const conf = ["high", "medium", "low"].includes(p.confidence) ? p.confidence : "low";
  return {
    company,
    title: String(p.title || "").trim().slice(0, 150),
    location: String(p.location || "").trim().slice(0, 120),
    comp: String(p.comp || "").trim().slice(0, 80),
    snippet: String(p.snippet || "").trim().slice(0, 1500),
    confidence: conf,
  };
}

// Guess a lane from the role title so the form comes pre-filled. "" = unknown.
export function inferLane(title) {
  const t = String(title || "").toLowerCase();
  if (/\b(ai|ml|machine learning|llm)\b/.test(t)) return "ai-consultant";
  if (/architect|staff engineer|principal engineer/.test(t)) return "software-architect";
  if (/gtm|growth|revenue|sales/.test(t)) return "gtm-engineer";
  if (/video|editor|content/.test(t)) return "ai-video-editor";
  if (/product/.test(t)) return "product-lead";
  if (/marketing|brand/.test(t)) return "marketing-lead";
  return "";
}

/* --- person identity ------------------------------------------------------ */

// Canonical form of a LinkedIn *profile* URL for matching across processes:
// "https://www.linkedin.com/in/<slug>". "" when it isn't an /in/ profile link
// (company pages etc. can't identify a person).
export function normalizeLinkedIn(url) {
  const s = String(url || "").trim().toLowerCase();
  const m = s.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/);
  if (!m || !m[1]) return "";
  return `https://www.linkedin.com/in/${m[1]}`;
}

// Fallback identity when a record has no LinkedIn URL: person name + company.
export function personKey(name, company) {
  const n = String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return "";
  return n + "|" + normalizeCompany(company);
}

/* --- target list + person-level dedupe ------------------------------------ */

// Decide which Apollo candidates are DM-able. Company overlap is fine (multi-
// channel touch); only the SAME PERSON already contacted is blocked. Inputs:
//   candidates: [{name, title, linkedin_url}] from Apollo people search
//   prior: {
//     li:       jobops_li_outreach rows [{linkedin_url, person_name, company, status, sent_at}]
//     contacts: board contacts [{name, linkedin, company, stage, outreached_at}] from jobops_leads
//     ycFounders: [{name, linkedin, drafted}] from the matched yc_companies row
//   }
// Returns up to `max` targets: {name, title, linkedin_url, blocked, reason, warn}.
export function buildTargets(candidates, prior, company, max = 5) {
  const p = prior || {};
  const seen = new Set();
  const out = [];
  for (const c of candidates || []) {
    const name = String((c && c.name) || "").trim();
    const li = normalizeLinkedIn(c && c.linkedin_url);
    if (!li && !name) continue;
    const key = li || personKey(name, company);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let blocked = false, reason = "", warn = "";

    for (const r of p.li || []) {
      const rKey = normalizeLinkedIn(r.linkedin_url) || personKey(r.person_name, r.company);
      if (rKey !== key) continue;
      if (r.status === "sent") { blocked = true; reason = "already DM'd from the Drop view"; }
      else if (r.status === "queued" && !blocked) warn = "already in the DM queue";
    }
    for (const ct of p.contacts || []) {
      const cKey = normalizeLinkedIn(ct.linkedin) || personKey(ct.name, ct.company);
      if (!cKey || cKey !== key) continue;
      if (ct.stage === "reached_out" || ct.outreached_at) {
        blocked = true; reason = "already emailed via the dashboard";
      } else if (!warn) warn = "on the board as a contact (not yet reached out)";
    }
    for (const f of p.ycFounders || []) {
      const fKey = normalizeLinkedIn(f.linkedin) || personKey(f.name, company);
      if (!fKey || fKey !== key) continue;
      if (f.drafted) { blocked = true; reason = "YC GTM Hunter drafted a founder email to them"; }
      else if (f.touched && !warn) warn = "co-founder — YC GTM Hunter already emailed a founder here";
    }

    out.push({ name, title: String((c && c.title) || "").trim(), linkedin_url: li, blocked, reason, warn });
    if (out.filter((t) => !t.blocked).length >= max) break;
  }
  return out;
}

// Turn a yc_companies row into person-touch records for buildTargets. The YC
// GTM Hunter drafts to ONE founder (founder_email); attribute it by matching
// the email's local part to a founder's first name. `touched` marks every
// founder of a company the hunter already worked, `drafted` the likely
// recipient. Handles founders stored as strings or objects.
export function ycFounderTouches(yc) {
  if (!yc) return [];
  const founders = Array.isArray(yc.founders) ? yc.founders : [];
  const email = String(yc.founder_email || "").toLowerCase();
  const local = (email.split("@")[0] || "").replace(/[^a-z]/g, "");
  return founders.map((f) => {
    const name = typeof f === "string" ? f : String((f && (f.name || f.full_name)) || "");
    const linkedin = f && typeof f === "object" ? String(f.linkedin_url || f.linkedin || "") : "";
    const first = (name.toLowerCase().split(/\s+/)[0] || "").replace(/[^a-z]/g, "");
    const drafted = !!local && !!first && (local.includes(first) || first.includes(local));
    return { name, linkedin, drafted, touched: !!email };
  });
}

/* --- posting -> lead row -------------------------------------------------- */

// Lead row for the job posting behind the screenshot. Same id scheme as the
// Python pipeline / manual add, so it dedupes against a scraped copy.
export function buildScreenshotLead(input, now) {
  const title = String((input && input.title) || "").trim();
  const company = String((input && input.company) || "").trim();
  if (!title || !company) throw new Error("title and company are required");
  const lane = MANUAL_LANES.includes(input.lane) ? input.lane : "";
  return {
    id: makeId(company, title),
    schema_version: 1,
    lane,
    source: "manual",
    source_detail: "drop-zone",
    title,
    company,
    url: String(input.url || "").trim(),
    location: String(input.location || "").trim(),
    comp: String(input.comp || "").trim(),
    posted: "",
    first_seen: now,
    last_seen: now,
    fit_score: 7,
    fit_rationale: "Added from a screenshot drop.",
    red_flags: [],
    contact: { name: "", title: "", email: "", linkedin: "" },
    notes: "",
    status: "new",
    stage: "new",
    snippet: String(input.snippet || "").trim(),
  };
}

/* --- DM crafting ---------------------------------------------------------- */

export function buildDMPrompt(target, job, extraContext) {
  const firstName = String((target && target.name) || "").trim().split(/\s+/)[0] || "";
  return `You write LinkedIn outreach AS Garreth, matching his voice exactly.

VOICE PROFILE:
${VOICE_PROFILE}

VERIFIED BACKGROUND FACTS (use only these — never invent experience, clients, or numbers):
${BACKGROUND_FACTS}

THE OPPORTUNITY:
Role: ${(job && job.title) || ""}
Company: ${(job && job.company) || ""}
Details: ${String((job && job.snippet) || "").slice(0, 700)}
Person: ${(target && target.name) || "(unknown)"}${target && target.title ? " — " + target.title : ""}
${extraContext ? "EXTRA CONTEXT FROM GARRETH:\n" + String(extraContext).slice(0, 600) : ""}

Write TWO things in Garreth's voice:
1. "note" — a LinkedIn connection-request note, UNDER 270 CHARACTERS total.
   Greet "Hi ${firstName || "[Name]"}," then one specific line about the company/role and a
   soft reason to connect. No links, no hard sell, no sign-off needed.
2. "message" — a short follow-up message for after they accept (60-90 words).
   Open with a genuine nod to what the company does, one compact credibility
   line grounded ONLY in the verified facts, end with a soft permission ask
   like "Can I send over some of my previous work?". Sign off "Best,\\n\\nGarreth".

Respond with ONLY a JSON object: {"note": "...", "message": "..."}`;
}

export function parseDMJSON(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("llm returned no JSON object");
  let p;
  try {
    p = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    throw new Error("llm returned unparseable JSON: " + e.message);
  }
  if (!p || !p.note) throw new Error("llm returned no connection note");
  return {
    note: String(p.note).trim().slice(0, NOTE_MAX),
    message: String(p.message || "").trim().slice(0, 2000),
  };
}

/* --- misc ----------------------------------------------------------------- */

// UTC midnight for "DMs sent today" counting (deterministic, matches fmtDate's UTC).
export function todayStartISO(now) {
  const d = new Date(now || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
