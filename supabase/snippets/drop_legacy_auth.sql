-- Run AFTER DiliJump v1.2 is live everywhere (Vercel / Pages).
-- Removes the v1.1 functions that relied on Supabase anonymous sign-ins.
-- Afterwards you can switch OFF "Allow anonymous sign-ins" in
-- Authentication → Sign In / Providers.
drop function if exists public.submit_run(text, integer, integer, integer, integer);
drop function if exists public.set_player_name(text);
drop function if exists public.get_my_rank();
drop policy if exists "Players can read their own runs" on public.runs;
revoke all on public.runs from anon, authenticated;
