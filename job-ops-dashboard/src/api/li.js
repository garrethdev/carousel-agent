import { requireAuth } from "../lib/auth.js";
import { normalizeCompany, makeId } from "../lib/id.js";
import { resolveDomain, searchPeople } from "../lib/apollo.js";
import {
  getLead, insertLead, patchLead,
  leadsForCompany, ycForCompany, liInsert, liPatch, liAll, liSentSince,
} from "../lib/supa.js";
import {
  TECH_LEADERSHIP_TITLES, parseShotJSON, inferLane, normalizeLinkedIn,
  buildTargets, buildScreenshotLead, buildDMPrompt, parseDMJSON,
  ycFounderTouches, todayStartISO,
} from "../lib/li.js";

// The Drop view: screenshot -> company -> 4-5 senior tech leaders -> LinkedIn
// DMs, sent by hand from the user's own browser (this API never talks to
// LinkedIn). One function with action routing to stay inside the Vercel
// function budget:
//   POST /api/li?action=extract  {image}                  read the screenshot
//   POST /api/li?action=hunt     {company, title, ...}    lead + targets + overlap
//   POST /api/li?action=dm       {target, job, ...}       craft note+message, queue row
//   POST /api/li?action=mark     {id, status}             sent | skipped
//   GET  /api/li                                          today's sent count

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function llmChat(content, { model, max_tokens = 500, temperature = 0.4 } = {}) {
  const r = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/job-ops",
      "X-Title": "job-ops",
    },
    body: JSON.stringify({ model, temperature, max_tokens, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error(`llm ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data.choices[0].message.content;
}

const SHOT_PROMPT = `This is a screenshot of a job posting (or a similar page). Extract:
- company: the hiring company's name — NOT the job board (never "LinkedIn", "Indeed", "Wellfound", "Y Combinator", "Greenhouse", "Lever")
- title: the role title
- location: location / remote policy if visible, else ""
- comp: salary or comp range if visible, else ""
- snippet: 2-4 sentences summarizing the role and what the company does, from what is visible
- confidence: "high" | "medium" | "low" — how sure you are about the company name
Respond with ONLY a JSON object with exactly those keys.`;

async function extract(body) {
  const image = String((body && body.image) || "");
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(image)) throw httpErr(400, "image must be a png/jpeg/webp data URL");
  if (image.length > 6_000_000) throw httpErr(400, "image too large — try a smaller screenshot");
  const model = process.env.OPENROUTER_VISION_MODEL || "google/gemini-2.5-flash";
  const raw = await llmChat(
    [{ type: "text", text: SHOT_PROMPT }, { type: "image_url", image_url: { url: image } }],
    { model, max_tokens: 600, temperature: 0 },
  );
  const shot = parseShotJSON(raw);
  return { shot: { ...shot, lane: inferLane(shot.title) } };
}

async function hunt(body) {
  const company = String((body && body.company) || "").trim();
  if (!company) throw httpErr(400, "company required");
  const title = String(body.title || "").trim() || `Contact — ${company}`;
  const norm = normalizeCompany(company);
  const now = new Date().toISOString();

  // The posting behind the screenshot becomes a board lead — but never
  // clobber a row the scraper pipeline already owns.
  const id = makeId(company, title);
  let lead = await getLead(id);
  let leadExisted = !!lead;
  if (!lead) {
    lead = await insertLead(buildScreenshotLead({ ...body, company, title }, now));
  }

  // Free Apollo searches (no credits — credits are only spent on email reveals).
  const domain = await resolveDomain(company);
  let candidates = await searchPeople({ domain, company, titles: TECH_LEADERSHIP_TITLES, per_page: 10 });
  let tier = "tech-leadership";
  if (!candidates.length) {
    candidates = await searchPeople({
      domain, company, per_page: 10,
      seniorities: ["c_suite", "vp", "head", "director", "founder", "owner"],
    });
    tier = "any-senior";
  }

  // What the rest of business hunter already did around this company.
  const [liRows, boardLeads, yc] = await Promise.all([liAll(), leadsForCompany(norm), ycForCompany(norm)]);
  const contacts = boardLeads
    .filter((l) => l.contact && (l.contact.name || l.contact.linkedin))
    .map((l) => ({
      name: l.contact.name, linkedin: l.contact.linkedin, company: l.company,
      stage: l.stage, outreached_at: l.outreached_at,
    }));
  const targets = buildTargets(candidates, { li: liRows, contacts, ycFounders: ycFounderTouches(yc) }, company);

  const liHere = liRows.filter((r) => r.company_norm === norm || normalizeCompany(r.company) === norm);
  const overlap = {
    board_leads: boardLeads.map((l) => ({ id: l.id, title: l.title, stage: l.stage, outreached_at: l.outreached_at, via: l.source_detail || "" })),
    yc: yc ? { name: yc.name, batch: yc.batch, state: yc.state, drafted: !!yc.founder_email, matched_role: yc.matched_role || "" } : null,
    dm_history: liHere.filter((r) => r.status === "sent").length,
  };

  const today = await liSentSince(todayStartISO());
  return { lead, lead_existed: leadExisted, targets, overlap, today, meta: { domain, match_tier: tier, credits_used: 0 } };
}

async function dm(body) {
  const target = (body && body.target) || {};
  const job = (body && body.job) || {};
  if (!target.name || !job.company) throw httpErr(400, "target.name and job.company required");
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324";
  const raw = await llmChat(buildDMPrompt(target, job, String(body.context || "")), { model });
  const { note, message } = parseDMJSON(raw);

  const fields = {
    person_name: String(target.name).slice(0, 200),
    person_title: String(target.title || "").slice(0, 200),
    linkedin_url: normalizeLinkedIn(target.linkedin_url) || String(target.linkedin_url || "").trim().slice(0, 300),
    note, message,
  };
  // Re-crafting updates the queued row instead of stacking duplicates.
  const row = body.row_id
    ? await liPatch(String(body.row_id), fields)
    : await liInsert({
        ...fields,
        lead_id: String(body.lead_id || "") || null,
        company: String(job.company).slice(0, 200),
        company_norm: normalizeCompany(job.company),
        status: "queued",
        source: "screenshot",
      });
  if (!row) throw httpErr(404, "outreach row not found");
  return { row };
}

async function mark(body) {
  const rid = String((body && body.id) || "");
  const status = String((body && body.status) || "");
  if (!rid || !["sent", "skipped"].includes(status)) throw httpErr(400, "id and status (sent|skipped) required");
  const row = await liPatch(rid, { status, sent_at: status === "sent" ? new Date().toISOString() : null });
  if (!row) throw httpErr(404, "outreach row not found");

  // First DM out the door moves the posting lead to Reached out, so the board
  // (and every other business-hunter process) sees the touch.
  if (status === "sent" && row.lead_id) {
    const lead = await getLead(row.lead_id);
    if (lead && lead.stage !== "reached_out") {
      await patchLead(lead.id, { stage: "reached_out", outreached_at: lead.outreached_at || row.sent_at || new Date().toISOString() });
    }
  }
  const today = await liSentSince(todayStartISO());
  return { row, today };
}

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === "GET") {
      return res.json({ today: await liSentSince(todayStartISO()) });
    }
    const action = String(req.query.action || "");
    const body = req.body || {};
    if (action === "extract") return res.json(await extract(body));
    if (action === "hunt") return res.json(await hunt(body));
    if (action === "dm") return res.json(await dm(body));
    if (action === "mark") return res.json(await mark(body));
    res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e) {
    res.status(e.status || 502).json({ error: `li: ${e.message || e}` });
  }
}
