-- Burned-accounts fix: tail-based view-collapse detection.
-- Adds suppressed-tail metrics + collapsing / suspected_burn verdicts to
-- v_account_view_health, excludes delivery failures, and adds per-account
-- data-freshness. Advisory only: the posting/warmup path gates on is_active
-- + posting_paused, NOT health_status (verified 2026-08-26).
--
-- Tiers (matured window = posts aged 48h..7d, "near-zero" = views <= 10):
--   watch          suppressed_share_7d >= 0.25   (elevated — surfaces, was hidden as healthy)
--   collapsing     suppressed_share_7d >= 0.40   (severe, recent) + delivery not the cause
--   suspected_burn 7d AND 14d >= 0.40            (severe, sustained) + delivery not the cause
-- Delivery guard: skip collapsing/suspected_burn when Geelark delivery failures
--   are a MAJORITY of fires (deliv_fail_7d > 0.25 * fired_7d) so broken proxies
--   are not misread as platform suppression.

CREATE OR REPLACE VIEW public.v_account_view_health AS
 WITH perf AS (
         SELECT post_performance.account, post_performance.posted_at, post_performance.views,
            post_performance.ingested_at, 'instagram'::text AS pf
           FROM post_performance
        UNION ALL
         SELECT tt_post_performance.account, tt_post_performance.posted_at, tt_post_performance.views,
            tt_post_performance.ingested_at, 'tiktok'::text AS pf
           FROM tt_post_performance
        ), fresh AS (
         SELECT 'instagram'::text AS pf, max(post_performance.ingested_at) AS last_ingest FROM post_performance
        UNION ALL
         SELECT 'tiktok'::text AS text, max(tt_post_performance.ingested_at) AS max FROM tt_post_performance
        ), fired AS (
         SELECT t.serial_name AS geelark_profile,
            count(*) FILTER (WHERE t.schedule_at >= (now() - '7 days'::interval) AND t.schedule_at <= now()) AS fired_7d,
            count(*) FILTER (WHERE t.schedule_at >= (now() - '28 days'::interval) AND t.schedule_at <= now()) AS fired_28d,
            -- delivery/proxy/login failures (NOT platform suppression): proxy 29996-29998/29994,
            -- video download 20208, content/music 20267, login 20116/20201
            count(*) FILTER (WHERE t.schedule_at >= (now() - '7 days'::interval) AND t.schedule_at <= now()
                 AND t.fail_code IN ('29996','29997','29998','29994','20208','20267','20116','20201')) AS deliv_fail_7d,
            max(t.schedule_at) FILTER (WHERE t.schedule_at <= now()) AS last_fired_at
           FROM geelark_tasks t WHERE t.serial_name IS NOT NULL GROUP BY t.serial_name
        ), agg AS (
         SELECT a.id, a.username, a.geelark_profile, a.platform, a."character", a.is_active, a.account_created_on,
            COALESCE(f.fired_7d, 0::bigint) AS fired_7d, COALESCE(f.fired_28d, 0::bigint) AS fired_28d,
            COALESCE(f.deliv_fail_7d, 0::bigint) AS deliv_fail_7d, f.last_fired_at,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '7 days'::interval)) AS posts_7d,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '28 days'::interval)) AS posts_28d,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '7 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval)) AS mat_posts_7d,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '28 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval)) AS mat_posts_28d,
            -- NEW: 14d matured window + near-zero tail counts (fixed floor of 10 views)
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '14 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval)) AS mat_posts_14d,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '7 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval) AND p.views <= 10) AS mat_le10_7d,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '14 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval) AND p.views <= 10) AS mat_le10_14d,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (p.views::double precision)) FILTER (WHERE p.posted_at >= (now() - '7 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval)) AS median_7d,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (p.views::double precision)) FILTER (WHERE p.posted_at >= (now() - '28 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval)) AS median_28d,
            max(p.views) FILTER (WHERE p.posted_at >= (now() - '14 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval)) AS max_14d,
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '21 days'::interval) AND p.posted_at <= (now() - '48:00:00'::interval) AND p.views = 0) AS zero_21d,
            max(p.posted_at) AS last_post_at,
            max(p.ingested_at) AS acct_last_ingest,   -- NEW: per-account analytics freshness
            count(p.*) FILTER (WHERE p.posted_at >= (now() - '7 days'::interval)) AS perf_rows_7d
           FROM accounts a
             LEFT JOIN perf p ON p.account = a.username
             LEFT JOIN fired f ON f.geelark_profile = a.geelark_profile
          GROUP BY a.id, a.username, a.geelark_profile, a.platform, a."character", a.is_active, a.account_created_on,
                   f.fired_7d, f.fired_28d, f.deliv_fail_7d, f.last_fired_at
        ), banded AS (
         SELECT g.id, g.username, g.geelark_profile, g.platform, g."character", g.is_active, g.account_created_on,
            g.fired_7d, g.fired_28d, g.deliv_fail_7d, g.last_fired_at, g.posts_7d, g.posts_28d,
            g.mat_posts_7d, g.mat_posts_28d, g.mat_posts_14d, g.mat_le10_7d, g.mat_le10_14d,
            g.median_7d, g.median_28d, g.max_14d, g.zero_21d, g.last_post_at, g.acct_last_ingest, g.perf_rows_7d,
            -- NEW: suppressed-tail shares
            round((g.mat_le10_7d::numeric  / NULLIF(g.mat_posts_7d, 0)), 2)  AS suppressed_share_7d,
            round((g.mat_le10_14d::numeric / NULLIF(g.mat_posts_14d, 0)), 2) AS suppressed_share_14d,
                CASE WHEN g.account_created_on IS NULL THEN NULL::integer ELSE CURRENT_DATE - g.account_created_on END AS account_age_days,
                CASE WHEN g.account_created_on IS NULL THEN 'unknown'::text
                    WHEN (CURRENT_DATE - g.account_created_on) < 9 THEN 'brand_new'::text
                    WHEN (CURRENT_DATE - g.account_created_on) < 16 THEN 'tier1'::text
                    WHEN (CURRENT_DATE - g.account_created_on) < 23 THEN 'tier2'::text
                    ELSE 'established'::text END AS age_band,
            ( SELECT fr.last_ingest FROM fresh fr WHERE fr.pf = g.platform) AS platform_last_ingest
           FROM agg g
        ), cohort AS (
         SELECT b_1."character" AS c_character, b_1.platform AS c_platform, b_1.age_band AS c_age_band,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY b_1.median_7d) AS cohort_median_7d, count(*) AS cohort_n
           FROM banded b_1 WHERE b_1.is_active AND b_1.median_7d IS NOT NULL AND b_1.mat_posts_7d >= 2
          GROUP BY b_1."character", b_1.platform, b_1.age_band
        )
 SELECT b.id, b.username, b.geelark_profile, b.platform, b."character", b.is_active, b.posts_7d, b.posts_28d,
    b.median_7d, b.median_28d, b.max_14d, b.zero_21d, b.last_post_at,
    round(b.median_7d) AS median_7d_r, round(b.median_28d) AS median_28d_r,
        CASE
            WHEN b.is_active IS FALSE THEN 'banned'::text
            -- fix 6: per-account freshness folded in (was: perf_rows_7d = 0 only)
            WHEN b.fired_7d >= 2 AND (b.perf_rows_7d = 0 OR b.acct_last_ingest IS NULL OR b.acct_last_ingest < (now() - '4 days'::interval))
                 AND b.platform_last_ingest IS NOT NULL AND b.platform_last_ingest >= (now() - '4 days'::interval) THEN 'tracking broken'::text
            WHEN b.platform_last_ingest IS NULL OR b.platform_last_ingest < (now() - '4 days'::interval) OR b.posts_28d = 0 THEN 'no data'::text
            WHEN b.fired_7d = 0 THEN 'idle'::text
            WHEN b.age_band = ANY (ARRAY['brand_new'::text, 'tier1'::text, 'tier2'::text]) THEN 'ramping'::text
            -- fix 1+2+3: tail-based collapse (delivery guard: failures must be a minority of fires)
            WHEN b.mat_posts_7d >= 4 AND b.mat_posts_14d >= 6
                 AND b.deliv_fail_7d::numeric <= (0.25 * GREATEST(b.fired_7d, 1))
                 AND (b.mat_le10_7d::numeric  / NULLIF(b.mat_posts_7d, 0))  >= 0.40
                 AND (b.mat_le10_14d::numeric / NULLIF(b.mat_posts_14d, 0)) >= 0.40 THEN 'suspected_burn'::text
            WHEN b.mat_posts_7d >= 4
                 AND b.deliv_fail_7d::numeric <= (0.25 * GREATEST(b.fired_7d, 1))
                 AND (b.mat_le10_7d::numeric / NULLIF(b.mat_posts_7d, 0)) >= 0.40 THEN 'collapsing'::text
            -- existing median-based rules
            WHEN b.mat_posts_7d >= 4 AND b.median_28d IS NOT NULL AND b.median_28d > 0::double precision AND COALESCE(b.median_7d, 0::double precision) < (0.25::double precision * b.median_28d) AND c.cohort_median_7d IS NOT NULL AND c.cohort_n >= 3 AND COALESCE(b.median_7d, 0::double precision) < (0.50::double precision * c.cohort_median_7d) THEN 'muted'::text
            WHEN b.mat_posts_7d >= 4 AND c.cohort_median_7d IS NOT NULL AND c.cohort_n >= 3 AND c.cohort_median_7d > 0::double precision AND COALESCE(b.median_7d, 0::double precision) < (0.25::double precision * c.cohort_median_7d) THEN 'muted'::text
            -- elevated tail -> watch (fix 2: surfaces partial suppression that was reading healthy)
            WHEN b.mat_posts_7d >= 4 AND (b.mat_le10_7d::numeric / NULLIF(b.mat_posts_7d, 0)) >= 0.25 THEN 'watch'::text
            WHEN b.mat_posts_7d < 4 AND b.posts_7d > 0 THEN 'watch'::text
            WHEN b.median_28d IS NOT NULL AND b.median_28d > 0::double precision AND COALESCE(b.median_7d, 0::double precision) < (0.5::double precision * b.median_28d) THEN 'watch'::text
            WHEN c.cohort_median_7d IS NOT NULL AND c.cohort_n >= 3 AND c.cohort_median_7d > 0::double precision AND COALESCE(b.median_7d, 0::double precision) < (0.5::double precision * c.cohort_median_7d) THEN 'watch'::text
            ELSE 'healthy'::text
        END AS view_health,
    -- ORIGINAL columns kept in their original positions (CREATE OR REPLACE requires this) ...
    b.mat_posts_7d, b.mat_posts_28d, b.account_created_on, b.account_age_days, b.age_band,
    b.fired_7d, b.fired_28d, b.last_fired_at, b.perf_rows_7d,
    c.cohort_median_7d, c.cohort_n, b.platform_last_ingest,
    b.platform_last_ingest IS NULL OR b.platform_last_ingest < (now() - '4 days'::interval) AS data_stale,
    b.mat_posts_7d >= 4 AS has_sample,
        CASE WHEN b.mat_posts_7d >= 4 THEN 'high'::text ELSE 'low'::text END AS confidence,
    -- ... NEW columns appended at the end only:
    b.mat_posts_14d, b.deliv_fail_7d, b.suppressed_share_7d, b.suppressed_share_14d, b.acct_last_ingest
   FROM banded b
     LEFT JOIN cohort c ON c.c_character = b."character" AND c.c_platform = b.platform AND c.c_age_band = b.age_band;
