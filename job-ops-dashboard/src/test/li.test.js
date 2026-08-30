import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseShotJSON, inferLane, normalizeLinkedIn, personKey, buildTargets,
  buildScreenshotLead, buildDMPrompt, parseDMJSON, ycFounderTouches,
  todayStartISO, NOTE_MAX, TECH_LEADERSHIP_TITLES,
} from "../lib/li.js";
import { makeId } from "../lib/id.js";

/* --- parseShotJSON -------------------------------------------------------- */

test("parseShotJSON handles clean JSON and clamps fields", () => {
  const s = parseShotJSON(JSON.stringify({
    company: "  Kin Health  ", title: "Head of AI", location: "Remote (EU)",
    comp: "$180k", snippet: "x".repeat(2000), confidence: "high",
  }));
  assert.equal(s.company, "Kin Health");
  assert.equal(s.title, "Head of AI");
  assert.equal(s.snippet.length, 1500);
  assert.equal(s.confidence, "high");
});

test("parseShotJSON survives fences and prose around the JSON", () => {
  const s = parseShotJSON('Sure! ```json\n{"company":"Acme","title":"CTO"}\n``` hope that helps');
  assert.equal(s.company, "Acme");
  assert.equal(s.confidence, "low");   // unknown confidence -> low
});

test("parseShotJSON throws without a company", () => {
  assert.throws(() => parseShotJSON('{"title":"CTO"}'), /company/);
  assert.throws(() => parseShotJSON("no json here"), /JSON/);
});

/* --- inferLane ------------------------------------------------------------ */

test("inferLane maps role keywords to lanes", () => {
  assert.equal(inferLane("Head of AI"), "ai-consultant");
  assert.equal(inferLane("Software Architect"), "software-architect");
  assert.equal(inferLane("GTM Engineer"), "gtm-engineer");
  assert.equal(inferLane("Senior Product Manager"), "product-lead");
  assert.equal(inferLane("Accountant"), "");
});

/* --- LinkedIn identity ---------------------------------------------------- */

test("normalizeLinkedIn canonicalizes profile URL variants", () => {
  const want = "https://www.linkedin.com/in/jane-doe-123";
  assert.equal(normalizeLinkedIn("https://www.linkedin.com/in/jane-doe-123"), want);
  assert.equal(normalizeLinkedIn("http://linkedin.com/in/Jane-Doe-123/"), want);
  assert.equal(normalizeLinkedIn("de.linkedin.com/in/jane-doe-123?utm=x"), want);
  assert.equal(normalizeLinkedIn("https://www.linkedin.com/in/jane-doe-123/details/"), want);
});

test("normalizeLinkedIn rejects non-profile URLs", () => {
  assert.equal(normalizeLinkedIn("https://www.linkedin.com/company/acme"), "");
  assert.equal(normalizeLinkedIn("https://evil.com/in/jane"), "");
  assert.equal(normalizeLinkedIn(""), "");
});

test("personKey falls back to normalized name + company", () => {
  assert.equal(personKey("Jane  DOE", "Acme Inc"), "jane doe|acme");
  assert.equal(personKey("", "Acme"), "");
});

/* --- buildTargets: person-level dedupe ------------------------------------ */

const cand = (name, title, li) => ({ name, title, linkedin_url: li });

test("buildTargets blocks a person already DM'd, warns on queued", () => {
  const prior = {
    li: [
      { linkedin_url: "https://www.linkedin.com/in/sent-guy", person_name: "Sent Guy", company: "Acme", status: "sent" },
      { linkedin_url: "https://www.linkedin.com/in/queued-gal", person_name: "Queued Gal", company: "Acme", status: "queued" },
    ],
  };
  const ts = buildTargets([
    cand("Sent Guy", "CTO", "linkedin.com/in/sent-guy"),
    cand("Queued Gal", "VP Eng", "linkedin.com/in/queued-gal"),
    cand("Fresh Person", "Head of Engineering", "linkedin.com/in/fresh"),
  ], prior, "Acme");
  assert.equal(ts[0].blocked, true);
  assert.match(ts[0].reason, /DM'd/);
  assert.equal(ts[1].blocked, false);
  assert.match(ts[1].warn, /queue/);
  assert.equal(ts[2].blocked, false);
});

test("buildTargets blocks a contact the dashboard already emailed", () => {
  const prior = {
    contacts: [
      { name: "Emailed Founder", linkedin: "https://www.linkedin.com/in/emailed", company: "Acme", stage: "reached_out", outreached_at: "2026-08-14T00:00:00Z" },
      { name: "Board Contact", linkedin: "https://www.linkedin.com/in/onboard", company: "Acme", stage: "new", outreached_at: null },
    ],
  };
  const ts = buildTargets([
    cand("Emailed Founder", "CEO", "linkedin.com/in/emailed"),
    cand("Board Contact", "CTO", "linkedin.com/in/onboard"),
  ], prior, "Acme");
  assert.equal(ts[0].blocked, true);
  assert.match(ts[0].reason, /emailed/);
  assert.equal(ts[1].blocked, false);
  assert.match(ts[1].warn, /board/);
});

test("buildTargets matches by name+company when a record has no LinkedIn URL", () => {
  const prior = {
    contacts: [{ name: "Jane Doe", linkedin: "", company: "Acme Inc", stage: "reached_out", outreached_at: "2026-08-01T00:00:00Z" }],
  };
  const ts = buildTargets([cand("Jane Doe", "CTO", "")], prior, "Acme");
  assert.equal(ts[0].blocked, true);
});

test("buildTargets blocks the YC founder the hunter drafted to, warns co-founders", () => {
  const prior = {
    ycFounders: [
      { name: "Drafted Founder", linkedin: "", drafted: true, touched: true },
      { name: "Other Founder", linkedin: "", drafted: false, touched: true },
    ],
  };
  const ts = buildTargets([
    cand("Drafted Founder", "CEO", ""),
    cand("Other Founder", "CTO", ""),
  ], prior, "Acme");
  assert.equal(ts[0].blocked, true);
  assert.match(ts[0].reason, /YC GTM Hunter/);
  assert.equal(ts[1].blocked, false);
  assert.match(ts[1].warn, /co-founder/i);
});

test("buildTargets dedupes candidates and caps selectable targets at 5", () => {
  const many = [];
  for (let i = 0; i < 9; i++) many.push(cand(`P ${i}`, "VP Eng", `linkedin.com/in/p-${i}`));
  many.push(cand("P 0", "VP Eng", "linkedin.com/in/p-0"));  // duplicate
  const ts = buildTargets(many, {}, "Acme");
  assert.equal(ts.filter((t) => !t.blocked).length, 5);
  assert.equal(new Set(ts.map((t) => t.linkedin_url)).size, ts.length);
});

/* --- ycFounderTouches ----------------------------------------------------- */

test("ycFounderTouches attributes the draft by email local part", () => {
  const t = ycFounderTouches({
    founder_email: "garreth@acme.com",
    founders: [{ name: "Garreth Smith", linkedin_url: "linkedin.com/in/gs" }, { name: "Bob Jones" }],
  });
  assert.equal(t[0].drafted, true);
  assert.equal(t[1].drafted, false);
  assert.equal(t[1].touched, true);
});

test("ycFounderTouches handles string founders and no email", () => {
  const t = ycFounderTouches({ founder_email: "", founders: ["Ann Lee"] });
  assert.equal(t[0].name, "Ann Lee");
  assert.equal(t[0].drafted, false);
  assert.equal(t[0].touched, false);
  assert.deepEqual(ycFounderTouches(null), []);
});

/* --- buildScreenshotLead -------------------------------------------------- */

test("buildScreenshotLead builds a pipeline-compatible row", () => {
  const now = "2026-08-30T12:00:00.000Z";
  const row = buildScreenshotLead({ title: "Head of AI", company: "Acme", lane: "ai-consultant", snippet: "desc" }, now);
  assert.equal(row.id, makeId("Acme", "Head of AI"));   // dedupes vs scraped copy
  assert.equal(row.source_detail, "drop-zone");
  assert.equal(row.stage, "new");
  assert.equal(row.lane, "ai-consultant");
  assert.throws(() => buildScreenshotLead({ company: "Acme" }, now), /required/);
});

/* --- DM crafting ---------------------------------------------------------- */

test("buildDMPrompt carries person, role, and the note length rule", () => {
  const p = buildDMPrompt({ name: "Jane Doe", title: "CTO" }, { title: "Head of AI", company: "Acme", snippet: "s" }, "");
  assert.match(p, /Jane Doe/);
  assert.match(p, /Acme/);
  assert.match(p, /Hi Jane,/);
  assert.match(p, /270 CHARACTERS/);
});

test("parseDMJSON requires a note and clamps to the LinkedIn limit", () => {
  const d = parseDMJSON(JSON.stringify({ note: "n".repeat(500), message: "m" }));
  assert.equal(d.note.length, NOTE_MAX);
  assert.equal(d.message, "m");
  assert.throws(() => parseDMJSON('{"message":"m"}'), /note/);
});

/* --- misc ----------------------------------------------------------------- */

test("todayStartISO is UTC midnight", () => {
  assert.equal(todayStartISO("2026-08-30T18:45:12Z"), "2026-08-30T00:00:00.000Z");
});

test("tech leadership titles stay senior-tech focused", () => {
  assert.ok(TECH_LEADERSHIP_TITLES.includes("CTO"));
  assert.ok(!TECH_LEADERSHIP_TITLES.some((t) => /recruiter|sales/i.test(t)));
});
