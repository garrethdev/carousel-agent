-- ROLLBACK: original run_account_health_check() as of 2026-08-26
-- (before suspected_burn + tail-metric JSON exposure). Re-run to revert.
CREATE OR REPLACE FUNCTION public.run_account_health_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_summary jsonb;
begin
  create temp table _raw on commit drop as
  select v.id, v.username, v.geelark_profile, v.platform, v."character",
         v.posts_7d, v.median_7d_r, v.median_28d_r, v.max_14d, v.zero_21d, v.last_post_at,
         v.mat_posts_7d, v.age_band, v.account_age_days, v.fired_7d, v.perf_rows_7d,
         v.cohort_median_7d, v.cohort_n, v.confidence, v.data_stale, v.platform_last_ingest,
         v.view_health as raw_status,
         a.health_status as old_status, a.warmup_source,
         a.banned_at, a.banned_at_is_estimate,
         a.pending_status as old_pending, a.pending_status_count as old_pending_count,
         a.consecutive_checks as old_cc, a.status_since as old_since
  from v_account_view_health v join accounts a on a.id = v.id;

  create temp table _new on commit drop as
  select r.*,
    case
      when r.raw_status in ('muted') and r.old_status <> 'muted' then
        case when coalesce(r.old_pending,'') = r.raw_status and coalesce(r.old_pending_count,0) >= 1
             then r.raw_status
             else coalesce(r.old_status, 'watch') end
      else r.raw_status
    end as new_status,
    case
      when r.raw_status in ('muted') and r.old_status <> 'muted'
           and not (coalesce(r.old_pending,'') = r.raw_status and coalesce(r.old_pending_count,0) >= 1)
      then r.raw_status else null end as new_pending,
    case
      when r.raw_status in ('muted') and r.old_status <> 'muted'
           and not (coalesce(r.old_pending,'') = r.raw_status and coalesce(r.old_pending_count,0) >= 1)
      then coalesce(r.old_pending_count,0) + 1 else 0 end as new_pending_count
  from _raw r;

  insert into account_events (geelark_profile, username, event_type, platform, warmup_source, detail, source)
  select geelark_profile, username,
         case when new_status = 'banned' then 'banned'
              when new_status = 'muted' then 'shadowban_detected'
              when new_status = 'collapsing' then 'collapse_detected'
              when new_status = 'healthy' and old_status in ('muted','collapsing','watch','banned') then 'recovered'
              else 'health_change' end,
         platform, warmup_source,
         format('%s -> %s (med7d=%s med28d=%s cohort=%s n=%s conf=%s)',
                coalesce(old_status,'(new)'), new_status, median_7d_r, median_28d_r,
                round(coalesce(cohort_median_7d,0)), mat_posts_7d, confidence),
         'detector'
  from _new
  where new_status is distinct from old_status
    and not (old_status is null and new_status = 'healthy');

  update accounts a set
     health_status = n.new_status,
     median_views_7d = n.median_7d_r, median_views_28d = n.median_28d_r, zero_view_streak = n.zero_21d,
     health_detail = format('med7d=%s med28d=%s cohort=%s matured7d=%s age=%sd band=%s',
                            n.median_7d_r, n.median_28d_r, round(coalesce(n.cohort_median_7d,0)),
                            n.mat_posts_7d, coalesce(n.account_age_days,-1), n.age_band),
     health_checked_at = now(),
     health_confidence = n.confidence,
     health_evidence = jsonb_build_object(
        'median_7d', n.median_7d_r, 'median_28d', n.median_28d_r,
        'cohort_median_7d', round(coalesce(n.cohort_median_7d,0)), 'cohort_n', n.cohort_n,
        'matured_posts_7d', n.mat_posts_7d, 'fired_7d', n.fired_7d, 'perf_rows_7d', n.perf_rows_7d,
        'age_days', n.account_age_days, 'age_band', n.age_band,
        'data_stale', n.data_stale, 'platform_last_ingest', n.platform_last_ingest),
     pending_status = n.new_pending,
     pending_status_count = n.new_pending_count,
     status_since = case when n.new_status is distinct from n.old_status then now()
                         else coalesce(n.old_since, now()) end,
     consecutive_checks = case when n.new_status is distinct from n.old_status then 1
                               else coalesce(n.old_cc,0) + 1 end
  from _new n where n.id = a.id;

  select jsonb_build_object(
    'checked_at', now(),
    'geelark_capture', (select jsonb_build_object(
        'total', count(*),
        'captured', count(*) filter (where status is not null),
        'uncaptured', count(*) filter (where status is null))
      from geelark_tasks where schedule_at >= now() - interval '7 days' and schedule_at <= now()),
    'data_freshness', (select jsonb_object_agg(pf, jsonb_build_object('last_ingest', li, 'stale', li < now() - interval '4 days'))
      from (select 'instagram' pf, max(ingested_at) li from post_performance
            union all select 'tiktok', max(ingested_at) from tt_post_performance) f),
    'token_expiry', (select coalesce(jsonb_agg(jsonb_build_object('handle', username, 'profile', geelark_profile,
                        'expires_at', token_expires_at,
                        'days_left', round(extract(epoch from (token_expires_at - now()))/86400))
                      order by token_expires_at), '[]'::jsonb)
      from accounts where platform='instagram' and is_active
        and (token_expires_at is null or token_expires_at < now() + interval '14 days')),
    'tracked_count', (select count(*) from _new),
    'counts', (select jsonb_object_agg(new_status, c) from (select new_status, count(*) c from _new group by new_status) s),
    'accounts', (select jsonb_agg(jsonb_build_object(
                   'profile',geelark_profile,'handle',username,'platform',platform,'status',new_status,
                   'median_7d',median_7d_r,'median_28d',median_28d_r,
                   'cohort_median',round(coalesce(cohort_median_7d,0)),'cohort_n',cohort_n,
                   'matured_7d',mat_posts_7d,'confidence',confidence,
                   'age_days',account_age_days,'age_band',age_band,
                   'fired_7d',fired_7d,'perf_rows_7d',perf_rows_7d,
                   'zero_21d',zero_21d,'warmup',warmup_source,
                   'pending',new_pending,
                   'banned_at', banned_at, 'banned_at_is_estimate', banned_at_is_estimate,
                   'banned_bucket', case
                      when new_status <> 'banned' then null
                      when banned_at is null then 'unknown'
                      when (banned_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date then 'today'
                      when (banned_at at time zone 'America/New_York')::date >= date_trunc('week', (now() at time zone 'America/New_York'))::date then 'this_week'
                      when (banned_at at time zone 'America/New_York')::date >= date_trunc('month', (now() at time zone 'America/New_York'))::date then 'this_month'
                      else 'older' end,
                   'banned_days_ago', case when new_status='banned' and banned_at is not null
                      then ((now() at time zone 'America/New_York')::date - (banned_at at time zone 'America/New_York')::date) end)
                 order by array_position(array['banned','tracking broken','no data','muted','collapsing','watch','idle','ramping','healthy'], new_status), username)
                 from _new),
    'changes', (select coalesce(jsonb_agg(jsonb_build_object('handle',username,'from',old_status,'to',new_status) order by username),'[]'::jsonb)
                  from _new where new_status is distinct from old_status and not (old_status is null and new_status='healthy')),
    'untracked', (select coalesce(jsonb_agg(jsonb_build_object('handle',acct,'posts_14d',n,'platform',pf) order by n desc),'[]'::jsonb)
      from (select account acct, count(*) n, max(case when src='tt' then 'tiktok' else 'instagram' end) pf
            from (select account,posted_at,'ig' src from post_performance union all select account,posted_at,'tt' src from tt_post_performance) p
            where posted_at >= now() - interval '14 days' and account not in (select username from accounts) group by account) u)
  ) into v_summary;
  return v_summary;
end; $function$;
