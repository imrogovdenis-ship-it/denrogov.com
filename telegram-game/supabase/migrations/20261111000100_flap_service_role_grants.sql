-- The Edge Function runs as service_role. This project does not grant table privileges to it by default,
-- and the flap_* functions are security invoker, so the grants have to be explicit.
grant select, insert, update, delete on public.flap_players, public.flap_runs, public.flap_config to service_role;
