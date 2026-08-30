# Lead Generation Blueprint

**Client:** B2B eCommerce agency for established American manufacturers & distributors
**Prepared:** August 30, 2026
**Scope:** Cold email, LinkedIn outreach, LinkedIn InMail, paid ads (Meta/LinkedIn) — wide-open mandate, large spend
**Status:** Draft for client review — open questions at the end

---

## 1. What the four case studies tell us

Hydraulic Supply Company, Versa Valves, Aladdin Temp-Rite, and ACG Brands share a profile that is unusually specific and unusually monetizable:

| Trait | Pattern across all four |
|---|---|
| Age | 45–70 years old, pre-internet companies |
| Ownership | Privately held, often family businesses |
| Catalog | Deep SKU counts, technical specs, spec-driven buyers |
| Systems | ERP behind the website |
| Digital maturity | Not digital natives; came to the agency behind on eCommerce |
| Channel | 3 of 4 sell industrial/institutional (ACG is the consumer outlier — don't over-index) |
| Retention | Multi-year clients, all of them |

The retention pattern is the strategic unlock: **multi-year client lifetimes mean high LTV, which means we can afford a high-touch, high-CAC acquisition motion** that competitors doing spray-and-pray cannot sustain. The whole design below follows from that.

## 2. Market size — real numbers, pulled from Apollo (Aug 30, 2026)

Counts of named decision makers (strict title match: President, CEO, Owner, COO, VP Sales, VP Marketing, GM) at US-headquartered companies, US-based contacts:

| Segment | Company size | Decision makers in Apollo |
|---|---|---|
| Fluid power / hydraulics / hose & fittings / pneumatics | 21–1,000 emp | **2,321** |
| Valves / flow control | 21–1,000 emp | **5,994** |
| Foodservice equipment | 21–1,000 emp | **2,328** |
| Broad: fabricated metal + machinery mfg (NAICS 332/333) + machinery & industrial wholesale (NAICS 4238) | 51–1,000 emp | **31,774** |

And the number that shapes all messaging:

> In that same broad 31,774-person segment, only **145 people** hold an eCommerce leadership title (Director/VP/Head of eCommerce, Digital Commerce). **At more than 99% of target companies there is no eCommerce executive. The buyer is the President or Owner.**

Two consequences:

1. **Write for owners, not marketers.** Peer proof, revenue protection, and operational pain — not "digital transformation" language.
2. **The TAM is finite.** Roughly 8–12k companies once deduplicated to accounts. A careless volume operation burns the entire market in two quarters and poisons the domain reputation on the way. The large spend goes into *depth per account* (data quality, personalization, multi-channel coverage, more touches) — not raw send volume.

## 3. ICP definition

**Firmographics**
- US-headquartered manufacturer or distributor
- 50–1,000 employees (sweet spot 50–500); est. revenue $20M–$500M
- Founded before ~1990 (prefer pre-1980 — the "45–70 years old" pattern)
- Privately held / family-owned; PE-acquired distributors are a hot sub-segment (roll-ups digitize aggressively)

**Verticals, in priority order** (each anchored by a case study they can name):
1. Fluid power & motion control distribution (hose, fittings, hydraulics, pneumatics) — *Hydraulic Supply*. Associations: NAHAD, FPDA, AHTD.
2. Valve / flow control / instrumentation manufacturers — *Versa*. Association: VMA.
3. Foodservice equipment manufacturers & dealers — *Aladdin Temp-Rite*. Associations: NAFEM, FEDA, MAFSI.
4. Broad industrial distribution (bearings, power transmission, fasteners, safety, PVF, electrical) — closest analog pattern. Associations: PTDA, STAFDA, ASA, NAW.
5. Adjacent spec-driven manufacturers (pumps, filtration, seals, gauges, actuators).

**Qualifying signals** (used for tiering and trigger-based sends):
- No cart / PDF-catalog website, or a legacy platform (Magento 1/2 EOL, old WooCommerce under 10k+ SKUs)
- ERP in the stack: Epicor Prophet 21, Eclipse, Infor CSD/SX.e, SAP B1, Syspro, Macola
- Hiring for eCommerce/digital roles (they've admitted the problem — highest-intent trigger)
- Leadership transition (next-generation family member taking over)
- Recent PE acquisition of the company or a direct competitor
- A direct competitor that has visibly modernized

**Anti-ICP:** digital-native DTC brands, dropshippers, <$10M revenue, companies mid-way through a replatform with another agency (unless the project is visibly failing — the "rescue" angle), job shops with no catalog.

**Personas**
- **Owner / President / CEO** — the economic buyer at >99% of targets. Cares about: revenue protection, not breaking the counter/branch/distributor business, succession-proofing the company.
- **VP Sales** — feels the daily pain: reps re-keying POs, RFQs by email, counter staff answering "is it in stock."
- **IT Director / Controller** — the gatekeeper. One job: convince them the ERP doesn't get ripped out.
- **Director of eCommerce** (the 145) — easiest conversation, weakest economics; approach with the failed-replatform/rescue angle.

## 4. Channel architecture and build order

The order below is deliberate: **LinkedIn starts first because it needs no warmup; cold email is the volume engine but needs 3–4 weeks of infrastructure lead time; paid ads come last and start as retargeting** — this ICP does not click cold Meta lead forms, but ads multiply the channels that already work.

### Phase 0 — Foundation (Weeks 1–2)

**Offer & proof assets**
- Rewrite the four case studies as one-page peer narratives with numbers (online revenue growth, % of orders self-served, quote turnaround). Get written approval to name clients in outreach and ads — this is the single most valuable asset in the program; a 67-year-old distributor trusts a peer story, not an agency claim.
- CTA is a **named, low-friction diagnostic** — a "Catalog & ERP eCommerce Assessment" — not "book a demo." Owners take a specific, bounded first step.
- Positioning line to test: *"eCommerce for 50-year-old manufacturers and distributors. We make your ERP sell."*

**Cold email infrastructure**
- 20 secondary domains (name variants of the agency domain), 3 mailboxes each → 60 mailboxes, expandable to 90.
- SPF/DKIM/DMARC on every domain; all secondary domains 301-redirect to the main site.
- Sending platform (Smartlead/Instantly-class, or Apollo sequences) + unified master inbox.
- Warmup runs 14–21 days before a single real send. Non-negotiable.

**LinkedIn**
- Optimize 2–4 profiles (founder + senior team; SDR profiles added later). Sales Navigator on each.
- Founder profile is the content anchor — 3 posts/week (see Phase 2). The carousel-generation pipeline we already run can produce the case-study carousel format directly.

**Pipeline plumbing**
- CRM stages, routing, Slack alerts on replies, a master suppression list (existing clients, open opportunities, past declines), and a weekly metrics dashboard (defined in §7).

### Phase 1 — Data (Weeks 2–4)

- Build the full TAM account list from Apollo (NAICS + keyword + size + geography), then **layer association member directories** — NAHAD, FPDA, PTDA, NAFEM, FEDA, VMA, STAFDA member lists are public, pre-qualified, and give outreach a credible hook ("fellow NAHAD member companies we work with…").
- Enrich 3–4 contacts per account; verify every email (target <2% bounce); capture founded year, brands carried, ERP guess, website state as personalization fields.
- **Tier the market:**
  - **Tier A — 500 dream accounts.** Full account-based treatment: multi-threaded, personalized email, LinkedIn touches, InMail, direct mail if warranted. No automation-sounding copy.
  - **Tier B — ~2,500 strong-fit accounts.** Multi-channel sequences, segment-level personalization.
  - **Tier C — remainder.** Light-touch sequences, trigger-activated only.
- Score every target website: no cart / legacy cart / modern. "10,000 SKUs and no cart" is the hottest list in the program.

### Phase 2 — LinkedIn first (Weeks 3–6, then ongoing)

- 80–100 connection requests/week/seat, **no pitch in the invite**. Pitch-free invites to this ICP accept at 25–35%.
- Conversation-first messaging after acceptance; move to a call or the assessment offer only after signal.
- Founder content 3×/week: vertical teardowns (*"We looked at 50 fluid power distributor websites; 41 can't show live inventory"*), case-study carousels, ERP-integration explainers. Content converts silently — owners lurk for weeks, then reply to an email "seen your posts."
- **InMail is a Tier A weapon only.** 400–800/month across seats, every one hand-written against account research. Open-profile targets cost no credits.

### Phase 3 — Cold email engine (Weeks 4–8 ramp, then steady state)

- Begin week 4 post-warmup at 20–30 sends/mailbox/day; ramp to 750–1,000 sends/day total by week 8 (~15–20k/month — enough to multi-touch Tier B every quarter without burning TAM).
- 4-email sequences over ~3 weeks. Plain text, one idea per email, no links in email 1, spec-buyer tone. Every email names a peer client.
- **Angle bank** (each is a separate sequence, tested independently):
  1. **Peer proof** — "We took a 67-year-old fluid power distributor with 22 branches online without breaking their counter business."
  2. **ERP pain** — "Your Prophet 21 knows your inventory to the unit. Your website doesn't."
  3. **After-hours revenue** — "Your customers' maintenance crews work nights. Your order desk doesn't."
  4. **Rep math** — "Every re-keyed PO costs $30–50 in labor. How many did your team key last month?"
  5. **Hiring trigger** — "Saw you're hiring an eCommerce manager — here's what their first 90 days looks like with and without a partner."
  6. **Rescue** — for the 145 eCommerce leaders and any visibly stalled replatform.
- **Trigger queue outranks everything:** job postings, leadership changes, PE acquisitions, and (once the site tracker is installed) companies visiting the agency's website get same-week, hand-finished sends.

### Phase 4 — Paid layer (Weeks 6–10, then scale with proof)

- **Retargeting first** (Meta + LinkedIn): case-study video and carousel creative against site visitors and LinkedIn engagers. Small budget, outsized assist rate — outbound-sourced buyers Google the agency before replying; retargeting makes sure what they find confirms the story.
- **LinkedIn matched audiences:** upload Tier A+B account list; run thought-leader ads on the founder's best-performing posts plus case-study creative. This is where incremental paid dollars go first for this ICP.
- **Meta prospecting** stays on the bench unless retargeting + matched audiences saturate. If activated: lookalikes seeded from the client list, case-study video only, driving to the assessment offer — never a generic lead form.
- Gate: **no scaling of paid spend until cold email/LinkedIn reply quality proves message-market fit.** Ads amplify a message that's already landing; they can't find one.

### Phase 5 — Nurture & compounding assets (Month 2 onward)

- Every positive-but-not-now reply enters a monthly nurture track (they said *they stay* — the same patience applies pre-sale; these buyers move on their fiscal year, not ours).
- Quarterly **"State of Distributor eCommerce"** teardown report — a reason to email the entire TAM without pitching, and the retargeting audience builder.
- Webinar with a client on stage (peer voice beats agency voice), association sponsorships and speaking slots — the long game this ICP actually trusts.

## 5. What to expect, and when

| When | What |
|---|---|
| Weeks 1–2 | Infrastructure, assets, no outbound yet. Silence here is the plan working. |
| Weeks 2–3 | First LinkedIn conversations. |
| Weeks 5–6 | First cold-email-sourced meetings (warmup matures, volume ramps). |
| Month 2 | 8–12 qualified meetings/month. First read on which angles/verticals convert. |
| Month 3 | Steady state: **15–25 qualified meetings/month** with all channels live. |
| Months 4–6 | First closed deals. At a 60–120-day agency sales cycle for six-figure builds, judge the program on meeting quality at month 2, pipeline at month 3, and revenue at months 4–6 — not before. |

**Benchmarks we hold ourselves to** (kill/scale decisions per angle after ~1,000 sends):
- Cold email: bounce <2%, reply 2–4%, positive reply 0.5–1%, 3–6 meetings per 1,000 sends
- LinkedIn: 25–35% accept, 8–12% reply-to-conversation
- InMail (Tier A, hand-written): 10–15% reply
- Meetings → proposal ~40%; proposal → close 25–30% (client's own historical close rate to refine this)

Illustrative math at steady state: 20 meetings/mo × 40% → 8 proposals × 25% → **~2 new clients/month from month 5**. At the client's deal sizes and multi-year retention, one closed deal likely pays for a quarter of the entire program — worth confirming against real ACV/LTV (question 1 below).

## 6. Budget shape (for a $15–25k/month program)

| Line | Monthly | Notes |
|---|---|---|
| Data & enrichment (Apollo/Clay, verification) | $1.5–2.5k | Front-loaded in months 1–2 |
| Email infrastructure (domains, mailboxes, platform) | $0.7–1.2k | |
| LinkedIn (Sales Nav seats, InMail credits) | $0.5–1k | |
| Paid media | $3–8k | Starts ~$1k retargeting; scales only with proof |
| Copy, content, SDR/inbox management, list ops | remainder | The largest line — by design. Depth per account is the strategy. |

## 7. Reporting

One weekly dashboard: sends & deliverability, replies & positive %, meetings booked & show rate, SQLs, pipeline $ by source and by angle. Every angle and vertical gets a verdict (kill / iterate / scale) on a fixed cadence — no zombie sequences.

## 8. Risks and how the design absorbs them

- **Finite TAM burn** → tiering, volume caps, suppression discipline, quality bar on every send.
- **Deliverability collapse** → domain rotation, permanent warmup, plain-text copy, per-mailbox caps, third-party inbox-placement monitoring.
- **Channel-conflict objection** (manufacturers fear upsetting their distributors) → addressed head-on in copy; the Versa story is the proof asset.
- **IT gatekeeper stall** → ERP-integration proof content built in Phase 0, not improvised on calls.
- **Long sales cycle misread as failure** → the §5 table is the contract: meeting quality at month 2, revenue at months 4–6.

## 9. Questions before we start (answers sharpen the build, none block Phase 0)

1. ACV and realistic LTV on the four flagship accounts — sets the CAC ceiling and how hard we can push paid.
2. May we name the four clients (and use logos/quotes) in outreach and ads?
3. Which verticals do you *want* more of — and any you'd decline?
4. Geography: all-US, or regional preference?
5. Who takes the meetings, and what's real calendar capacity per month?
6. Existing CRM and any past outbound history (suppression data; which lists are already burned)?
7. Which ERPs do you integrate with best? (Sharpens technographic targeting and the IT-gatekeeper content.)
8. What platform do you build on (BigCommerce B2B, Shopify Plus, Optimizely…)? Enables tech-swap angles.
9. Your historical close rate from first meeting → signed — to calibrate the §5 math.
