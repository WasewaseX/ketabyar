-- Warraq Supabase schema — part 22: expire 'ready' holds once their pickup window passes.
-- accept_reservation() and advance_reservation_queue() stamp expires_at on a hold, but nothing
-- ever acted on it: an unclaimed hold stayed 'ready' forever and kept its copy 'reserved', so
-- the Website showed the title as unavailable and the next queued member never got the copy.
--
-- sweep_reservations() expires every overdue hold, puts its copy back on the shelf, and runs
-- advance_reservation_queue() so the copy goes straight to whoever is queued next. It also
-- replaces the App's boot-time advance_reservation_queue(null) call, which has been failing
-- silently since 0007 revoked EXECUTE on that function without granting it to authenticated.

create or replace function sweep_reservations() returns integer as $$
declare
  v_res reservations;
  v_expired integer := 0;
begin
  for v_res in
    update reservations set status = 'expired'
    where status = 'ready' and expires_at is not null and expires_at < now()
    returning *
  loop
    v_expired := v_expired + 1;

    -- Only release a copy that is still held. Staff may have moved it to repair/lost or lent it
    -- out by hand in the meantime, and another ready hold may already point at it.
    if v_res.copy_id is not null then
      update copies set status = 'available', updated_at = now()
      where id = v_res.copy_id and status = 'reserved'
        and not exists (select 1 from reservations where copy_id = v_res.copy_id and status = 'ready');
    end if;

    insert into audit_logs(actor, action, entity_type, entity_id, after_json)
    values (current_actor(), 'expire_reservation', 'reservation', v_res.id::text, to_jsonb(v_res));
  end loop;

  -- The full pass walks every available copy, so skip it when there is no queue to promote.
  if exists (select 1 from reservations where status = 'queued') then
    perform advance_reservation_queue(null);
  end if;

  return v_expired;
end;
$$ language plpgsql security definer set search_path = public;

-- Only acts on holds whose expiry has already passed, so any signed-in client may trigger it.
revoke execute on function sweep_reservations() from public;
grant execute on function sweep_reservations() to authenticated;

-- The App sweeps on boot and whenever the dashboard loads, which leaves holds stale while nobody
-- has it open (the Website keeps showing those copies as reserved). If pg_cron is enabled on the
-- project, also sweep every 15 minutes. Re-running this migration replaces the job by name.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sweep_reservations', '*/15 * * * *', 'select public.sweep_reservations()');
  end if;
end $$;
