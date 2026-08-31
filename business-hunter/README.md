# Business Hunter

Point it at a company. It tells you which open roles fit a **new-business hunter**.

Built as an answer to the LinkedIn question *"What role?"* — enter a target company
(World Kinect Corporation is the built-in example) and the app pulls the company's
**live public job board**, scores every open role against a hunter profile
(client-facing, revenue-generating, new-business roles), and ranks them:

- **Strong fits** — sales executive, business development, account executive, territory…
- **Possible fits** — traders, brokers, client-facing consultants, commercial roles
- **Rest of the board** — operational / technical / back-office roles, collapsed

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
