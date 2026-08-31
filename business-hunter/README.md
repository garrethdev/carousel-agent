# Business Hunter

Point it at a company. It tells you which open roles fit the profile you're hunting for.

Built as an answer to the LinkedIn question *"What role?"* — enter a target company
(World Kinect Corporation is the built-in example) and the app pulls the company's
**live public job board**, scores every open role against the selected fit profile,
and ranks them into **strong fits**, **possible fits**, and the rest of the board.

Two profiles ship today (`lib/score.js`):

- **AI / Software Engineering** (default) — software engineers/developers, AI/ML,
  data, DevOps, security, tech leads rank high
- **New Business Hunter** — sales executive, business development, account
  executive, traders, client-facing commercial roles rank high

Operational and back-office roles rank low in both. Select via the UI dropdown or
`&profile=ai-software-engineering|new-business-hunter` on the API.

## The recruiter gate (`/api/vet`)

Vets an outreach target **before anyone gets emailed** — built because general
TA recruiters at companies with no real tech hiring were eating the daily
outreach quota. Three rules:

1. **The company must have live tech demand** — ≥ 1 strong fit and ≥ 3
   tech-ish openings on its board, scored with the AI/SWE profile.
2. **The contact must recruit tech** — a recruiter title with tech/GTM scope,
   or a tech hiring manager. General TA, campus, and hourly recruiters fail.
   At a tech-first company (dev tools, AI infra) pass `&techFirst=1` and a
   bare "Recruiter" counts, since all recruiting there is tech recruiting.
3. **Demand must be fresh** — at least one strong opening posted within 30
   days (`&freshDays=N` to change).

```
GET /api/vet?company=world-kinect&titles=Global TA Sr. Recruiter|VP of Engineering
GET /api/vet?workday=<careers-url>&titles=...&techFirst=1
```

Returns a `verdict` (pass/reject with per-rule checks and evidence roles) and
a per-title `contacts` list (approved/rejected with reasons). Same target
parameters as `/api/hunt`; `verdict.pass=false` means: do not outreach this
company's recruiters. The UI exposes it as the **Recruiter gate** panel.

## How it works

```
index.html          static UI (light + dark, no framework, no dependencies)
api/hunt.js         Vercel serverless function — ranked role hunt
api/vet.js          Vercel serverless function — the recruiter gate
lib/score.js        role-fit scoring engine (both profiles)
lib/board.js        shared ATS fetchers + target parsing (SSRF guard)
lib/vet.js          contact classification + board verdict rules
data/companies.json company registry (World Kinect, Motorola Solutions, RBI, Lennar)
data/*-seed.json    snapshot fallback if the live board is unreachable
```

`GET /api/hunt` supports:

| Query | Example |
|---|---|
| `company` | `/api/hunt?company=world-kinect` (default) |
| `workday` | `/api/hunt?workday=https://tenant.wd5.myworkdayjobs.com/board` |
| `greenhouse` | `/api/hunt?greenhouse=board-slug` |
| `lever` | `/api/hunt?lever=company-slug` |

Job data comes from the public, keyless APIs of Workday (CXS), Greenhouse
(boards API), and Lever (postings API) — no paid data provider required.
Workday hosts are validated against `*.wd<N>.myworkdayjobs.com` so the
function cannot be pointed at arbitrary URLs.

## Run & deploy

```bash
npm test                 # scorer sanity + live API smoke test
npx vercel deploy        # from this directory (business-hunter/)
npx vercel deploy --prod
```

No environment variables needed.
