// Supabase access via PostgREST, using the SERVICE key (server-side only, bypasses
// RLS). The table has RLS on with no policies, so nothing else can touch it.

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

function headers(extra) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(extra || {}) };
}

// Upstream error bodies can be huge (full HTML error pages); keep thrown
// messages short so logs/toasts don't balloon.
async function errText(r) {
  return (await r.text()).slice(0, 200);
}

export async function listLeads() {
  // Hide rejected leads from the board (soft-delete keeps them for learning).
  const q = "select=*&status=neq.rejected&order=fit_score.desc,last_seen.desc";
  const r = await fetch(`${URL}/rest/v1/jobops_leads?${q}`, { headers: headers() });
  if (!r.ok) throw new Error(`supabase list ${r.status}: ${await errText(r)}`);
  return r.json();
}

export async function insertLead(row) {
  const r = await fetch(`${URL}/rest/v1/jobops_leads`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation,resolution=merge-duplicates" }),
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`supabase insert ${r.status}: ${await errText(r)}`);
  const a = await r.json();
  return a[0] || row;
}

export async function getLead(id) {
  const r = await fetch(`${URL}/rest/v1/jobops_leads?id=eq.${encodeURIComponent(id)}&select=*`, { headers: headers() });
  const a = await r.json();
  return a[0] || null;
}

export async function patchLead(id, patch) {
  patch.updated_at = new Date().toISOString();
  const r = await fetch(`${URL}/rest/v1/jobops_leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`supabase patch ${r.status}: ${await errText(r)}`);
  const a = await r.json();
  return a[0] || null;
}

/* --- Drop view (LinkedIn DM outreach) ------------------------------------- */

async function getRows(table, qs, label) {
  const r = await fetch(`${URL}/rest/v1/${table}?${qs}`, { headers: headers() });
  if (!r.ok) throw new Error(`supabase ${label} ${r.status}: ${await errText(r)}`);
  return r.json();
}

// Board leads whose company resembles the (normalized) name — used to show
// company overlap and to collect contacts for person-level dedupe.
export async function leadsForCompany(companyNorm) {
  const pat = "*" + String(companyNorm || "").trim().replace(/\s+/g, "*") + "*";
  if (pat === "**") return [];
  const qs = `select=id,title,company,lane,stage,outreached_at,contact,source_detail&company=ilike.${encodeURIComponent(pat)}&status=neq.rejected&limit=50`;
  return getRows("jobops_leads", qs, "leads-for-company");
}

// The matched YC company row (if any) — the YC GTM Hunter's territory.
export async function ycForCompany(companyNorm) {
  const pat = "*" + String(companyNorm || "").trim().replace(/\s+/g, "*") + "*";
  if (pat === "**") return null;
  const qs = `select=id,name,batch,state,founders,founder_email,lead_id,matched_role&name=ilike.${encodeURIComponent(pat)}&limit=1`;
  const a = await getRows("yc_companies", qs, "yc-for-company");
  return a[0] || null;
}

export async function liInsert(row) {
  const r = await fetch(`${URL}/rest/v1/jobops_li_outreach`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`supabase li insert ${r.status}: ${await errText(r)}`);
  const a = await r.json();
  return a[0] || row;
}

export async function liPatch(id, patch) {
  const r = await fetch(`${URL}/rest/v1/jobops_li_outreach?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`supabase li patch ${r.status}: ${await errText(r)}`);
  const a = await r.json();
  return a[0] || null;
}

// Every DM record for dedupe (small table: one row per person ever targeted).
export async function liAll() {
  return getRows("jobops_li_outreach",
    "select=id,lead_id,company,person_name,linkedin_url,status,sent_at&order=created_at.desc&limit=1000", "li-all");
}

export async function liSentSince(iso) {
  const qs = `select=id&status=eq.sent&sent_at=gte.${encodeURIComponent(iso)}`;
  const a = await getRows("jobops_li_outreach", qs, "li-sent-since");
  return a.length;
}
