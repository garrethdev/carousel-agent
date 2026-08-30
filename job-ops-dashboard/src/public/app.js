/* job-ops dashboard — client logic (ES module).
   Talks only to /api/* (password in x-dash-key header). No secrets here.
   Pure helpers live in format.js so they can be unit-tested. */

import { esc, safeUrl, safeEmail, laneLabel, scoreClass, initials, fmtDate, stripTag, sortLeads } from "./format.js";

let currentTab = "leads";  // leads | warm | outreach

const STAGE_LABEL = { new: "New", wip: "Working", reached_out: "Reached out" };
const STAGES = ["new", "wip", "reached_out"];
function stageOf(x) { return x.stage || (x.outreached_at ? "reached_out" : "new"); }
function stageCell(x) {
  const cur = stageOf(x);
  const opts = STAGES.map((s) => `<option value="${s}"${s === cur ? " selected" : ""}>${STAGE_LABEL[s]}</option>`).join("");
  const date = cur === "reached_out" && x.outreached_at ? `<div class="stage-date">${esc(fmtDate(x.outreached_at))}</div>` : "";
  return `<select class="stage-sel stage-sel--${cur} act-stage" title="set stage">${opts}</select>${date}`;
}

let LEADS = [];
const $ = (s) => document.querySelector(s);
const KEY = () => localStorage.getItem("dashkey") || "";
const H = () => ({ "x-dash-key": KEY(), "Content-Type": "application/json" });

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

/* --- auth ---------------------------------------------------------------- */
function showGate(err) { $("#gate").hidden = false; $("#pwerr").textContent = err || ""; $("#pw").focus(); }
function submitPw() { localStorage.setItem("dashkey", $("#pw").value); $("#gate").hidden = true; load(); }
function logout() { localStorage.removeItem("dashkey"); location.reload(); }

async function api(path, opts) {
  const r = await fetch(path, { ...opts, headers: { ...H(), ...((opts && opts.headers) || {}) } });
  if (r.status === 401) {
    localStorage.removeItem("dashkey");
    showGate("Wrong password. Try again.");
    throw new Error("unauthorized");
  }
  return r;
}

/* --- load + render ------------------------------------------------------- */
async function load() {
  if (!KEY()) { showGate(); return; }
  let d;
  try { d = await (await api("/api/leads")).json(); } catch (e) { return; }
  LEADS = d.leads || [];
  const ap = $("#apollo");
  ap.textContent = d.apollo_ready ? "apollo ready" : "apollo: no key";
  ap.className = "badge " + (d.apollo_ready ? "ok" : "no");
  render();
}

function render() {
  const lane = $("#f-lane").value, min = +$("#f-min").value,
        onlyNew = $("#f-enriched").checked, q = $("#f-q").value.toLowerCase(),
        stage = $("#f-stage").value;
  const rows = $("#rows");
  rows.innerHTML = "";
  const list = LEADS.filter((x) =>
    (currentTab === "recruiters" ? x.lane === "recruiter" : x.lane !== "recruiter") &&
    (currentTab !== "warm" || x.warm === true) &&
    (currentTab !== "yc" || x.lane === "yc_gtm") &&
    (!lane || x.lane === lane) && x.fit_score >= min &&
    (!onlyNew || !(x.contact && x.contact.linkedin)) &&
    (!stage || (stage === "active" ? stageOf(x) !== "new" : stageOf(x) === stage)) &&
    (!q || (x.title + " " + x.company).toLowerCase().includes(q)));
  const sortMode = $("#f-sort") ? $("#f-sort").value : "newest";
  sortLeads(list, sortMode);
  const setCaret = (id, s) => { const c = $(id); if (c) c.textContent = s; };
  setCaret("#added-caret", sortMode === "newest" ? "↓" : sortMode === "oldest" ? "↑" : "");
  setCaret("#fit-caret", sortMode === "fit" ? "↓" : sortMode === "fit_asc" ? "↑" : "");
  $("#count").textContent = list.length + (currentTab === "warm" ? " warm leads" : currentTab === "yc" ? " YC GTM leads" : currentTab === "recruiters" ? " recruiters" : " / " + LEADS.length + " leads");
  $("#empty").hidden = list.length > 0;
  for (const x of list) rows.appendChild(rowEl(x));
}

function rowEl(x) {
  const tr = document.createElement("tr");
  tr.dataset.id = x.id;
  const c = x.contact || {};
  const liUrl = safeUrl(c.linkedin), em = safeEmail(c.email);
  const contactHtml = c.linkedin
    ? `<div class="contact">
         <div class="avatar">${esc(initials(c.name))}</div>
         <div class="contact__body">
           <div class="contact__name">${esc(c.name)}</div>
           <div class="contact__title">${esc(c.title)}</div>
           <div class="contact__row">
             ${liUrl ? `<a href="${esc(liUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}
             ${em ? `<a href="mailto:${esc(em)}">${esc(em)}</a>` : '<span class="muted">no email</span>'}
           </div>
         </div>
       </div>`
    : `<span class="muted">—</span>`;
  const flags = (x.red_flags || []).length ? `<div class="flags">⚠ ${esc(x.red_flags.join("; "))}</div>` : "";
  tr.innerHTML = `
    <td><button class="star ${x.warm ? "star--on" : ""} act-warm" title="${x.warm ? "warm — click to unstar" : "mark warm"}">${x.warm ? "★" : "☆"}</button></td>
    <td><span class="score ${scoreClass(x.fit_score)}">${x.fit_score ?? "·"}</span></td>
    <td><div class="role role--link" title="View role details">${esc(x.title)}</div><div class="rationale">${esc(stripTag(x.fit_rationale))}</div>${flags}</td>
    <td>${safeUrl(x.url) ? `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.company)} ↗</a>` : esc(x.company)}
        <div class="loc">${esc(x.location || "")}</div></td>
    <td class="date-in" title="${esc(x.first_seen || "")}">${esc(fmtDate(x.first_seen))}</td>
    <td><span class="lane lane--${esc(x.lane || "none")}">${esc(laneLabel(x.lane))}</span></td>
    <td>${contactHtml}</td>
    <td><div class="notes__disp" title="click to edit">${esc(x.notes) || '<span class="muted">+ note</span>'}</div></td>
    <td class="stage">${stageCell(x)}</td>
    <td><div class="acts">
      <button class="btn btn--primary act-li">${c.linkedin ? "✓ LinkedIn" : "🔗 Find LinkedIn"}</button>
      <button class="btn act-em">✉ Email</button>
      <button class="btn act-draft" title="draft outreach email in your voice">✍️ Draft</button>
      <button class="btn btn--danger act-rej" title="reject (hides it, remembers your no)">🗑</button>
    </div></td>`;
  tr.querySelector(".act-li").onclick = () => enrich(x.id, tr);
  tr.querySelector(".act-em").onclick = () => findEmail(x.id, tr);
  tr.querySelector(".act-draft").onclick = () => draftFromRow(x.id);
  tr.querySelector(".act-stage").onchange = (e) => setStage(x.id, e.target.value, tr);
  tr.querySelector(".act-warm").onclick = () => toggleWarm(x.id, tr);
  tr.querySelector(".act-rej").onclick = () => reject(x.id, tr);
  tr.querySelector(".role--link").onclick = () => openDetail(x.id);
  tr.querySelector(".notes__disp").onclick = (e) => editNotes(x, e.currentTarget);
  return tr;
}

/* --- actions ------------------------------------------------------------- */
async function enrich(id, tr) {
  const lead = LEADS.find((l) => l.id === id);
  if (lead.contact && lead.contact.linkedin) { toast("Already revealed (no credit)."); return; }
  const btn = tr.querySelector(".act-li");
  btn.disabled = true; btn.textContent = "⏳ finding…";
  try {
    const d = await (await api(`/api/enrich?id=${encodeURIComponent(id)}`, { method: "POST" })).json();
    Object.assign(lead, d.lead);
    const cr = (d.meta && d.meta.credits_used) || 0;
    if (d.lead.contact && d.lead.contact.linkedin) toast(`Found ${d.lead.contact.name} · ${cr} credit`);
    else toast("No decision-maker found · 0 credits");
    tr.replaceWith(rowEl(lead));
  } catch (e) { btn.disabled = false; btn.textContent = "🔗 Find LinkedIn"; }
}

function findEmail(id, tr) {
  const lead = LEADS.find((l) => l.id === id), c = lead.contact || {};
  if (c.email) { navigator.clipboard && navigator.clipboard.writeText(c.email); toast("Email: " + c.email + " (copied)"); }
  else enrich(id, tr);
}

async function reject(id, tr) {
  const lead = LEADS.find((l) => l.id === id);
  if (!confirm(`Reject:\n${lead.title} — ${lead.company}?\n(Hidden from the board; kept so the system learns.)`)) return;
  try {
    await api(`/api/reject?id=${encodeURIComponent(id)}`, { method: "POST" });
    LEADS = LEADS.filter((l) => l.id !== id);
    tr.remove(); render(); toast("Rejected.");
  } catch (e) {}
}

async function setStage(id, stage, tr) {
  const lead = LEADS.find((l) => l.id === id);
  const sel = tr.querySelector(".act-stage");
  const prev = stageOf(lead);
  sel.disabled = true;
  try {
    const d = await (await api(`/api/stage?id=${encodeURIComponent(id)}`, {
      method: "POST", body: JSON.stringify({ stage }),
    })).json();
    if (d.error) throw new Error(d.error);
    Object.assign(lead, d.lead);
    tr.replaceWith(rowEl(lead));
    toast(`Stage → ${STAGE_LABEL[stage]}${stage === "reached_out" && d.lead.outreached_at ? " (" + fmtDate(d.lead.outreached_at) + ")" : ""}.`);
  } catch (e) {
    sel.value = prev; sel.disabled = false;
    toast("Couldn’t update stage.");
  }
}

function editNotes(x, disp) {
  const td = disp.parentElement;
  td.innerHTML = `<div class="notes__edit"><textarea>${esc(x.notes)}</textarea>
    <div><button class="btn btn--primary act-save">Save</button> <button class="btn act-cancel">Cancel</button></div></div>`;
  const ta = td.querySelector("textarea");
  ta.focus();
  const restore = () => {
    td.innerHTML = `<div class="notes__disp" title="click to edit">${esc(x.notes) || '<span class="muted">+ note</span>'}</div>`;
    td.querySelector(".notes__disp").onclick = (e) => editNotes(x, e.currentTarget);
  };
  td.querySelector(".act-save").onclick = async () => {
    try {
      const d = await (await api(`/api/notes?id=${encodeURIComponent(x.id)}`, { method: "POST", body: JSON.stringify({ notes: ta.value }) })).json();
      x.notes = d.lead.notes;
      const lead = LEADS.find((l) => l.id === x.id); if (lead) lead.notes = d.lead.notes;
      toast("Note saved.");
    } catch (e) {}
    restore();
  };
  td.querySelector(".act-cancel").onclick = restore;
}

/* --- tabs ----------------------------------------------------------------- */
function showTab(name) {
  currentTab = name;
  const onLeads = name === "leads" || name === "warm" || name === "yc" || name === "recruiters";  // these reuse the leads table
  $("#view-leads").hidden = !onLeads;
  $("#view-outreach").hidden = name !== "outreach";
  $("#view-drop").hidden = name !== "drop";
  for (const t of ["leads", "yc", "warm", "outreach", "recruiters", "drop"]) {
    $("#tab-" + t).classList.toggle("tab--active", name === t);
  }
  if (name === "yc" || name === "recruiters") $("#f-lane").value = "";  // avoid the lane dropdown fighting the tab filter
  if (onLeads) render();
  else if (name === "outreach") fillLeadPicker();
  else refreshToday();
}

async function toggleWarm(id, tr) {
  const lead = LEADS.find((l) => l.id === id);
  const next = !lead.warm;
  const btn = tr.querySelector(".act-warm");
  btn.disabled = true;
  try {
    const d = await (await api(`/api/warm?id=${encodeURIComponent(id)}`, {
      method: "POST", body: JSON.stringify({ warm: next }),
    })).json();
    if (d.error) throw new Error(d.error);
    lead.warm = !!d.lead.warm;
    if (currentTab === "warm" && !lead.warm) { tr.remove(); render(); }  // dropped out of Warm view
    else tr.replaceWith(rowEl(lead));
    toast(lead.warm ? "★ Starred warm." : "Unstarred.");
  } catch (e) {
    btn.disabled = false; toast("Couldn’t update.");
  }
}

/* --- outreach: craft an email in Garreth's voice -> Gmail draft ----------- */
function fillLeadPicker(selectedId) {
  const sel = $("#o-lead");
  const current = selectedId || sel.value;
  sel.innerHTML = "";
  const sorted = [...LEADS].sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
  for (const l of sorted) {
    const opt = document.createElement("option");
    const who = l.contact && l.contact.name ? ` · ${l.contact.name}` : "";
    opt.value = l.id;
    opt.textContent = `[${l.fit_score ?? "·"}] ${l.title} — ${l.company}${who}`;
    sel.appendChild(opt);
  }
  if (current && LEADS.some((l) => l.id === current)) sel.value = current;
}

function draftFromRow(id) {
  showTab("outreach");
  fillLeadPicker(id);
  $("#o-editor").hidden = true;      // clear any stale draft from another lead
  delete $("#o-editor").dataset.leadId;
  $("#o-status").textContent = "";
  $("#o-context").focus();
}

// Step 1: LLM writes the email in your voice and drops it into editable fields.
// Nothing is saved to Gmail yet.
async function craftEmail() {
  const id = $("#o-lead").value;
  if (!id) { toast("Pick a lead first."); return; }
  const btn = $("#o-craft"), old = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ writing in your voice…";
  $("#o-status").textContent = "Writing a first draft you can edit…";
  try {
    const d = await (await api(`/api/craft?id=${encodeURIComponent(id)}`, {
      method: "POST", body: JSON.stringify({ context: $("#o-context").value }),
    })).json();
    // If the user switched leads while this was in flight, discard the stale
    // result — otherwise we'd show lead A's email while the picker reads lead B.
    if ($("#o-lead").value !== id) return;
    if (d.error) { $("#o-status").textContent = "Failed: " + d.error; return; }
    $("#o-editor").dataset.leadId = id;   // the lead this draft actually belongs to
    $("#o-to").value = d.to || "";
    $("#o-subject").value = d.email.subject || "";
    $("#o-body").value = d.email.body || "";
    $("#o-editor").hidden = false;
    $("#o-save-status").textContent = "";
    $("#o-status").textContent = "Draft ready — edit it, then save to Gmail.";
    $("#o-subject").focus();
  } catch (e) {
    $("#o-status").textContent = "Request failed.";
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

// Step 2: save the edited email into Gmail Drafts (labeled), move lead -> Working.
async function saveDraft() {
  // Save against the lead the visible content was crafted for, not whatever the
  // picker currently reads (guards against a lead switch after crafting).
  const id = $("#o-editor").dataset.leadId;
  if (!id) { $("#o-save-status").textContent = "Craft the email first."; return; }
  const subject = $("#o-subject").value.trim();
  const body = $("#o-body").value.trim();
  if (!subject || !body) { $("#o-save-status").textContent = "Add a subject and body first."; return; }
  const btn = $("#o-save"), old = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ saving…";
  $("#o-save-status").textContent = "Saving to Gmail Drafts…";
  try {
    const d = await (await api(`/api/draft?id=${encodeURIComponent(id)}`, {
      method: "POST", body: JSON.stringify({ subject, body, to: $("#o-to").value.trim() }),
    })).json();
    if (d.error) { $("#o-save-status").textContent = "Failed: " + d.error; return; }
    const lead = LEADS.find((l) => l.id === id);
    if (lead && d.lead) { Object.assign(lead, d.lead); render(); }
    $("#o-save-status").textContent = "Saved — it's in your Gmail Drafts under “Sendouts”.";
    toast("Draft saved to Gmail (Sendouts). Lead → Working.");
  } catch (e) {
    $("#o-save-status").textContent = "Request failed.";
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

/* --- role detail modal --------------------------------------------------- */
function openDetail(id) {
  const x = LEADS.find((l) => l.id === id);
  if (!x) return;
  const c = x.contact || {};
  const url = safeUrl(x.url);
  const meta = [x.location, x.comp, x.source_detail && "via " + x.source_detail]
    .filter(Boolean).map((m) => `<span class="d-tag">${esc(m)}</span>`).join("");
  const desc = (x.snippet || "").trim();
  $("#d-body").innerHTML = `
    <div class="d-head">
      <span class="score ${scoreClass(x.fit_score)}">${x.fit_score ?? "·"}</span>
      <div>
        <div class="d-title">${esc(x.title)}</div>
        <div class="d-company">${esc(x.company)} · <span class="lane lane--${esc(x.lane || "none")}">${esc(laneLabel(x.lane))}</span></div>
      </div>
    </div>
    <div class="d-meta">${meta || '<span class="d-tag">no location/comp captured</span>'}
      <span class="d-tag stage-sel--${stageOf(x)}" style="font-weight:600">${STAGE_LABEL[stageOf(x)]}${stageOf(x) === "reached_out" && x.outreached_at ? " · " + esc(fmtDate(x.outreached_at)) : ""}</span>
    </div>
    ${url
      ? `<a class="d-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">View original posting ↗</a>`
      : `<a class="d-link" href="https://www.google.com/search?q=${encodeURIComponent('"' + (x.title || '') + '" ' + (x.company || '') + ' job apply')}" target="_blank" rel="noopener noreferrer">Find this posting ↗</a>`}
    ${(x.company_summary || x.company_remote || x.company_hq) ? `<div class="d-section"><h4>Company</h4>
      ${x.company_summary ? `<div class="d-rationale">${esc(x.company_summary)}</div>` : ""}
      ${(x.company_remote || x.company_hq) ? `<div class="d-meta" style="margin-top:6px">${x.company_remote ? `<span class="d-tag">${esc(x.company_remote)}</span>` : ""}${x.company_hq ? `<span class="d-tag">${esc(x.company_hq)}</span>` : ""}</div>` : ""}</div>` : ""}
    ${x.fit_rationale ? `<div class="d-section"><h4>Why it fits</h4><div class="d-rationale">${esc(stripTag(x.fit_rationale))}</div></div>` : ""}
    ${(x.red_flags || []).length ? `<div class="d-section"><h4>Flags</h4><div class="d-flag">⚠ ${esc(x.red_flags.join("; "))}</div></div>` : ""}
    <div class="d-section"><h4>About the role</h4>
      <div class="d-desc">${desc ? esc(desc) : '<span class="muted">No description captured — use the ' + (url ? "posting link" : "“Find this posting” link") + " above.</span>"}</div>
    </div>
    ${c.linkedin || c.name ? `<div class="d-section"><h4>Contact</h4><div class="d-rationale">${esc(c.name || "")}${c.title ? " · " + esc(c.title) : ""}${safeUrl(c.linkedin) ? ` · <a href="${esc(safeUrl(c.linkedin))}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}${safeEmail(c.email) ? ` · <a href="mailto:${esc(safeEmail(c.email))}">${esc(safeEmail(c.email))}</a>` : ""}</div></div>` : ""}
    ${x.notes ? `<div class="d-section"><h4>Notes</h4><div class="d-rationale">${esc(x.notes)}</div></div>` : ""}`;
  $("#detail").hidden = false;
}
function closeDetail() { $("#detail").hidden = true; }

/* --- add a lead by hand ---------------------------------------------------- */
function openAddLead() {
  for (const id of ["al-title", "al-company", "al-url", "al-location", "al-comp", "al-desc", "al-notes"]) $("#" + id).value = "";
  $("#al-lane").value = ""; $("#al-fit").value = "7"; $("#al-status").textContent = "";
  $("#addlead").hidden = false; $("#al-title").focus();
}
function closeAddLead() { $("#addlead").hidden = true; }
async function submitAddLead() {
  const title = $("#al-title").value.trim(), company = $("#al-company").value.trim();
  if (!title || !company) { $("#al-status").textContent = "Role and company are required."; return; }
  const btn = $("#al-submit"), old = btn.textContent;
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    const body = {
      title, company, lane: $("#al-lane").value,
      url: $("#al-url").value.trim(), location: $("#al-location").value.trim(),
      comp: $("#al-comp").value.trim(), description: $("#al-desc").value.trim(),
      notes: $("#al-notes").value.trim(), fit: parseInt($("#al-fit").value, 10),
    };
    const d = await (await api("/api/add", { method: "POST", body: JSON.stringify(body) })).json();
    if (d.error) { $("#al-status").textContent = "Failed: " + d.error; return; }
    LEADS = [d.lead, ...LEADS.filter((l) => l.id !== d.lead.id)];  // surface it on the board
    render(); closeAddLead();
    toast(`Added: ${d.lead.title} — ${d.lead.company}`);
  } catch (e) {
    $("#al-status").textContent = "Request failed.";
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

/* --- find a contact (ad-hoc company lookup) ------------------------------ */
async function findContactSearch() {
  const company = $("#find-company").value.trim();
  if (!company) { toast("Enter a company."); return; }
  const role = $("#find-role").value.trim();
  const lane = $("#find-lane").value;
  const btn = $("#find-btn"), old = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ finding…";
  $("#find-status").textContent = "Searching Apollo…";
  try {
    const d = await (await api("/api/find", { method: "POST", body: JSON.stringify({ company, role, lane }) })).json();
    const lead = d.lead, c = lead.contact || {}, cr = (d.meta && d.meta.credits_used) || 0;
    LEADS = [lead, ...LEADS.filter((l) => l.id !== lead.id)];  // surface it on the board
    render();
    if (c.linkedin) {
      const liUrl = safeUrl(c.linkedin), em = safeEmail(c.email);
      $("#find-status").innerHTML =
        `Found <b>${esc(c.name)}</b> · ${esc(c.title)} ` +
        (liUrl ? `· <a href="${esc(liUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : "") +
        (em ? ` · <a href="mailto:${esc(em)}">${esc(em)}</a>` : "");
      toast(`Found ${c.name} · ${cr} credit`);
    } else {
      $("#find-status").textContent = `No contact found for ${company} (saved to board). 0 credits.`;
    }
    $("#find-company").value = ""; $("#find-role").value = "";
  } catch (e) {
    $("#find-status").textContent = "Search failed.";
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

/* --- drop tab: screenshot -> company -> tech leaders -> LinkedIn DMs ------ */
// Sending stays manual: we copy the note + open the profile; the user pastes
// and hits send in their own logged-in browser. Nothing talks to LinkedIn.
const DROP = { shot: null, lead: null, targets: [] };

function setToday(n) {
  const el = $("#li-today");
  if (typeof n !== "number") { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `${n} DM${n === 1 ? "" : "s"} sent today`;
}

async function refreshToday() {
  try {
    const d = await (await api("/api/li")).json();
    setToday(d.today);
  } catch (e) {}
}

function resetDrop() {
  DROP.shot = null; DROP.lead = null; DROP.targets = [];
  $("#dz-preview").hidden = true; $("#dz-hint").hidden = false;
  $("#drop-extract").hidden = true; $("#drop-targets").hidden = true;
  $("#drop-dms").hidden = true; $("#drop-dms").innerHTML = "";
  $("#t-overlap").innerHTML = ""; $("#t-list").innerHTML = "";
  $("#x-status").textContent = ""; $("#t-status").textContent = "";
}

// Screenshots can be huge; shrink client-side so the request stays small.
function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("couldn't read the file"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("couldn't decode the image"));
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function handleShotFile(file) {
  if (!file || !/^image\//.test(file.type)) { toast("That's not an image."); return; }
  resetDrop();
  $("#dz-status").textContent = "Reading the screenshot…";
  try {
    const image = await downscaleImage(file);
    $("#dz-preview").src = image; $("#dz-preview").hidden = false; $("#dz-hint").hidden = true;
    const d = await (await api("/api/li?action=extract", { method: "POST", body: JSON.stringify({ image }) })).json();
    if (d.error) { $("#dz-status").textContent = "Failed: " + d.error; return; }
    DROP.shot = d.shot;
    $("#x-company").value = d.shot.company; $("#x-title").value = d.shot.title;
    $("#x-location").value = d.shot.location; $("#x-comp").value = d.shot.comp;
    $("#x-lane").value = d.shot.lane || ""; $("#x-snippet").value = d.shot.snippet;
    $("#drop-extract").hidden = false;
    $("#dz-status").textContent = d.shot.confidence === "high"
      ? "Read it. Check the fields, then find leadership."
      : `Read it (confidence: ${d.shot.confidence}) — double-check the company name.`;
    $("#x-company").focus();
  } catch (e) {
    $("#dz-status").textContent = "Couldn't read the screenshot — " + (e.message || "try another image.");
  }
}

async function huntLeaders() {
  const company = $("#x-company").value.trim();
  if (!company) { toast("Company is required."); return; }
  const btn = $("#x-hunt"), old = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ hunting…";
  $("#x-status").textContent = "Searching Apollo for senior tech leadership (search is free — no credits)…";
  $("#drop-dms").hidden = true; $("#drop-dms").innerHTML = "";
  try {
    const body = {
      company, title: $("#x-title").value.trim(), lane: $("#x-lane").value,
      location: $("#x-location").value.trim(), comp: $("#x-comp").value.trim(),
      snippet: $("#x-snippet").value.trim(),
    };
    const d = await (await api("/api/li?action=hunt", { method: "POST", body: JSON.stringify(body) })).json();
    if (d.error) { $("#x-status").textContent = "Failed: " + d.error; return; }
    DROP.lead = d.lead; DROP.targets = d.targets || [];
    if (d.lead) LEADS = [d.lead, ...LEADS.filter((l) => l.id !== d.lead.id)];  // posting joins the board
    setToday(d.today);
    renderOverlap(d.overlap);
    renderTargets(DROP.targets);
    $("#drop-targets").hidden = false;
    const open = DROP.targets.filter((t) => !t.blocked).length;
    $("#x-status").textContent = "";
    $("#t-status").textContent = DROP.targets.length
      ? (open ? `${open} DM-able target${open === 1 ? "" : "s"} found.` : "Everyone found here was already contacted.")
      : `No senior tech leadership found at ${company}.`;
  } catch (e) {
    $("#x-status").textContent = "Request failed.";
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

function renderOverlap(o) {
  const bits = [];
  if (o && o.board_leads && o.board_leads.length) {
    const done = o.board_leads.filter((l) => l.stage === "reached_out").length;
    bits.push(`${o.board_leads.length} lead${o.board_leads.length === 1 ? "" : "s"} for this company on the board${done ? ` (${done} reached out)` : ""}`);
  }
  if (o && o.yc) {
    bits.push(`YC ${esc(o.yc.batch || "")} — GTM Hunter state: ${esc(o.yc.state || "?")}${o.yc.drafted ? ", founder email drafted" : ""}`);
  }
  if (o && o.dm_history) bits.push(`${o.dm_history} LinkedIn DM${o.dm_history === 1 ? "" : "s"} already sent here`);
  $("#t-overlap").innerHTML = bits.length
    ? `<div class="drop-overlap">🧠 Business hunter already knows this company: ${bits.join(" · ")}</div>` : "";
}

function renderTargets(ts) {
  const list = $("#t-list");
  list.innerHTML = "";
  ts.forEach((t, i) => {
    const li = safeUrl(t.linkedin_url);
    const div = document.createElement("div");
    div.className = "target" + (t.blocked ? " target--blocked" : "");
    div.innerHTML = `
      <label class="target__pick"><input type="checkbox" data-i="${i}" ${t.blocked ? "disabled" : "checked"}></label>
      <div class="avatar">${esc(initials(t.name))}</div>
      <div class="target__body">
        <div class="contact__name">${esc(t.name)}</div>
        <div class="contact__title">${esc(t.title)}</div>
        ${li ? `<a href="${esc(li)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : '<span class="muted">no profile URL</span>'}
      </div>
      ${t.blocked ? `<span class="target__flag target__flag--block">⛔ ${esc(t.reason)}</span>`
        : t.warn ? `<span class="target__flag">⚠ ${esc(t.warn)}</span>` : ""}`;
    list.appendChild(div);
  });
}

function dmCard(t) {
  const li = safeUrl(t.linkedin_url);
  const div = document.createElement("div");
  div.className = "dm";
  div.innerHTML = `
    <div class="dm__head">
      <div class="avatar">${esc(initials(t.name))}</div>
      <div class="target__body">
        <div class="contact__name">${esc(t.name)}</div>
        <div class="contact__title">${esc(t.title)}</div>
      </div>
      ${li ? `<a href="${esc(li)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}
    </div>
    <textarea class="outreach__context dm__note" spellcheck="true" hidden></textarea>
    <div class="dm__count" hidden></div>
    <details class="dm__msg" hidden><summary>Follow-up message (for after they accept)</summary>
      <textarea class="outreach__context dm__message" spellcheck="true"></textarea>
    </details>
    <div class="dm__actions" hidden>
      <button class="btn btn--primary dm__copy">📋 Copy note + open profile</button>
      <button class="btn dm__recraft" title="write a fresh version">↻ Re-craft</button>
      <button class="btn dm__sent" hidden>✓ Mark sent</button>
      <button class="btn btn--ghost btn--sm dm__skip" hidden>Skip</button>
    </div>
    <span class="dm__status outreach__status">⏳ writing in your voice…</span>`;
  return div;
}

function updateNoteCount(card) {
  const len = card.querySelector(".dm__note").value.length;
  const el = card.querySelector(".dm__count");
  el.textContent = `${len}/300 characters${len > 300 ? " — LinkedIn will cut this off" : ""}`;
  el.classList.toggle("dm__count--over", len > 300);
}

function fillDmCard(card, t, row) {
  card.dataset.rowId = row.id;
  card.querySelector(".dm__note").value = row.note || "";
  card.querySelector(".dm__message").value = row.message || "";
  for (const s of [".dm__note", ".dm__count", ".dm__msg", ".dm__actions"]) card.querySelector(s).hidden = false;
  updateNoteCount(card);
  card.querySelector(".dm__status").textContent = "";
  card.querySelector(".dm__note").addEventListener("input", () => updateNoteCount(card));
  card.querySelector(".dm__copy").onclick = async () => {
    const note = card.querySelector(".dm__note").value;
    try { await navigator.clipboard.writeText(note); } catch (e) {}
    const url = safeUrl(t.linkedin_url);
    if (url) window.open(url, "_blank", "noopener");
    card.querySelector(".dm__sent").hidden = false;
    card.querySelector(".dm__skip").hidden = false;
    card.querySelector(".dm__status").textContent = url
      ? "Note copied — paste it into the Connect/Message box, send, then mark it here."
      : "Note copied — no profile URL, find them on LinkedIn manually.";
  };
  card.querySelector(".dm__recraft").onclick = () => recraftDm(card, t);
  card.querySelector(".dm__sent").onclick = () => markDm(card, "sent");
  card.querySelector(".dm__skip").onclick = () => markDm(card, "skipped");
}

function currentJob() {
  return {
    title: $("#x-title").value.trim(),
    company: $("#x-company").value.trim(),
    snippet: $("#x-snippet").value.trim(),
  };
}

async function recraftDm(card, t) {
  const btn = card.querySelector(".dm__recraft");
  btn.disabled = true;
  card.querySelector(".dm__status").textContent = "⏳ re-writing…";
  try {
    const d = await (await api("/api/li?action=dm", {
      method: "POST",
      body: JSON.stringify({ target: t, job: currentJob(), lead_id: DROP.lead && DROP.lead.id, row_id: card.dataset.rowId }),
    })).json();
    if (d.error) throw new Error(d.error);
    card.querySelector(".dm__note").value = d.row.note || "";
    card.querySelector(".dm__message").value = d.row.message || "";
    updateNoteCount(card);
    card.querySelector(".dm__status").textContent = "";
  } catch (e) {
    card.querySelector(".dm__status").textContent = "Re-craft failed: " + (e.message || "error");
  } finally {
    btn.disabled = false;
  }
}

async function markDm(card, status) {
  const id = card.dataset.rowId;
  if (!id) return;
  try {
    const d = await (await api("/api/li?action=mark", { method: "POST", body: JSON.stringify({ id, status }) })).json();
    if (d.error) throw new Error(d.error);
    setToday(d.today);
    card.classList.add(status === "sent" ? "dm--sent" : "dm--skipped");
    card.querySelector(".dm__actions").hidden = true;
    card.querySelector(".dm__status").textContent = status === "sent" ? "✓ Sent — logged for the whole pipeline." : "Skipped.";
    if (status === "sent" && DROP.lead) {
      const l = LEADS.find((x) => x.id === DROP.lead.id);
      if (l && l.stage !== "reached_out") { l.stage = "reached_out"; l.outreached_at = l.outreached_at || new Date().toISOString(); }
    }
    toast(status === "sent" ? "Marked sent ✓" : "Skipped.");
  } catch (e) {
    toast("Couldn't update: " + (e.message || "error"));
  }
}

async function craftDMs() {
  const picked = [...$("#t-list").querySelectorAll("input[type=checkbox]:checked")]
    .map((c) => DROP.targets[+c.dataset.i]).filter(Boolean);
  if (!picked.length) { toast("Pick at least one target."); return; }
  const btn = $("#t-craft"), old = btn.textContent;
  btn.disabled = true;
  $("#drop-dms").hidden = false; $("#drop-dms").innerHTML = "";
  const job = currentJob();
  for (let k = 0; k < picked.length; k++) {
    const t = picked[k];
    btn.textContent = `⏳ writing ${k + 1}/${picked.length}…`;
    const card = dmCard(t);
    $("#drop-dms").appendChild(card);
    try {
      const d = await (await api("/api/li?action=dm", {
        method: "POST", body: JSON.stringify({ target: t, job, lead_id: DROP.lead && DROP.lead.id }),
      })).json();
      if (d.error) throw new Error(d.error);
      fillDmCard(card, t, d.row);
    } catch (e) {
      card.querySelector(".dm__status").textContent = "Failed: " + (e.message || "error");
    }
  }
  btn.disabled = false; btn.textContent = old;
  $("#t-status").textContent = "DMs ready — copy, paste, send, mark. One person at a time.";
}

function initDrop() {
  const dz = $("#dz"), fi = $("#dz-file");
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fi.click(); });
  fi.addEventListener("change", () => { if (fi.files[0]) handleShotFile(fi.files[0]); fi.value = ""; });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dropzone--over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dropzone--over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("dropzone--over");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleShotFile(f);
  });
  document.addEventListener("paste", (e) => {
    if (currentTab !== "drop") return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); handleShotFile(item.getAsFile()); }
  });
  $("#x-hunt").addEventListener("click", huntLeaders);
  $("#t-craft").addEventListener("click", craftDMs);
}

/* --- boot ---------------------------------------------------------------- */
["#f-lane", "#f-stage", "#f-sort", "#f-min", "#f-enriched", "#f-q"].forEach((s) => $(s).addEventListener("input", render));
$("#th-added") && $("#th-added").addEventListener("click", () => {  // click the column to re-sort by date
  $("#f-sort").value = $("#f-sort").value === "newest" ? "oldest" : "newest";
  render();
});
$("#th-fit") && $("#th-fit").addEventListener("click", () => {  // click the column to re-sort by fit
  $("#f-sort").value = $("#f-sort").value === "fit" ? "fit_asc" : "fit";
  render();
});
$("#pw") && $("#pw").addEventListener("keydown", (e) => { if (e.key === "Enter") submitPw(); });
$("#o-lead") && $("#o-lead").addEventListener("change", () => {
  $("#o-editor").hidden = true; delete $("#o-editor").dataset.leadId;
  $("#o-status").textContent = ""; // stale draft for another lead
});
$("#d-close").addEventListener("click", closeDetail);
$("#d-backdrop").addEventListener("click", closeDetail);
$("#al-close").addEventListener("click", closeAddLead);
$("#al-backdrop").addEventListener("click", closeAddLead);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDetail(); closeAddLead(); } });

// This file is a module, so top-level functions aren't global. Expose the ones
// referenced by inline onclick= handlers in index.html.
Object.assign(window, { submitPw, logout, load, showTab, craftEmail, saveDraft, findContactSearch, openAddLead, submitAddLead });

initDrop();
load();
