-- sweep_reservations() (migration 0022): overdue ready holds expire, their copies go back on
-- the shelf or to the next queued member, and nothing else is touched.
\set ON_ERROR_STOP on
begin;

insert into books (id, title) values
  ('00000000-0000-0000-0000-0000000000b1', 'Expired hold, nobody queued'),
  ('00000000-0000-0000-0000-0000000000b2', 'Expired hold, one member queued'),
  ('00000000-0000-0000-0000-0000000000b3', 'Hold still inside its window'),
  ('00000000-0000-0000-0000-0000000000b4', 'Expired hold, copy sent to repair');

insert into copies (id, book_id, accession_number, barcode, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'A1', 'B1', 'reserved'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'A2', 'B2', 'reserved'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b3', 'A3', 'B3', 'reserved'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b4', 'A4', 'B4', 'repair');

insert into members (id, member_number, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'M1', 'First member'),
  ('00000000-0000-0000-0000-0000000000a2', 'M2', 'Second member');

insert into reservations (id, book_id, member_id, copy_id, status, position, expires_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', 'ready', 0, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c2', 'ready', 0, now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2',
   null, 'queued', 1, null),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c3', 'ready', 0, now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000c4', 'ready', 0, now() - interval '3 days');

do $$
declare
  v_count integer;
  r reservations;
begin
  v_count := sweep_reservations();
  assert v_count = 3, format('expected 3 holds expired, got %s', v_count);

  -- Nobody queued: the copy goes back on the shelf.
  assert (select status from reservations where id = '00000000-0000-0000-0000-0000000000d1') = 'expired';
  assert (select status from copies where id = '00000000-0000-0000-0000-0000000000c1') = 'available';

  -- Someone queued: they get the copy, with a fresh hold window.
  assert (select status from reservations where id = '00000000-0000-0000-0000-0000000000d2') = 'expired';
  select * into r from reservations where id = '00000000-0000-0000-0000-0000000000d3';
  assert r.status = 'ready', format('queued reservation should be ready, is %s', r.status);
  assert r.copy_id = '00000000-0000-0000-0000-0000000000c2';
  assert r.expires_at > now();
  assert (select status from copies where id = '00000000-0000-0000-0000-0000000000c2') = 'reserved';

  -- Still inside its window: untouched.
  assert (select status from reservations where id = '00000000-0000-0000-0000-0000000000d4') = 'ready';
  assert (select status from copies where id = '00000000-0000-0000-0000-0000000000c3') = 'reserved';

  -- Copy moved off the hold by staff: the hold expires but the copy keeps its status.
  assert (select status from reservations where id = '00000000-0000-0000-0000-0000000000d5') = 'expired';
  assert (select status from copies where id = '00000000-0000-0000-0000-0000000000c4') = 'repair';

  assert (select count(*) from audit_logs where action = 'expire_reservation' and actor = 'system') = 3;

  -- A second sweep finds nothing left to do.
  v_count := sweep_reservations();
  assert v_count = 0, format('second sweep expired %s holds', v_count);

  assert has_function_privilege('authenticated', 'sweep_reservations()', 'execute');
  assert not has_function_privilege('anon', 'sweep_reservations()', 'execute');

  raise notice 'sweep_reservations: all checks passed';
end $$;
rollback;
