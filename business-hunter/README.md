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

## How it works

```
index.html          static UI (light + dark, no framework, no dependencies)
api/hunt.js         Vercel serverless function
lib/score.js        role-fit scoring engine ("New Business Hunter" profile)
data/companies.json company registry (World Kinect preset)
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
