-- Touchbeat leaderboard. Anyone can read scores. Scores are added only through submit_score(),
-- which rejects results the game cannot produce and throttles rapid submissions.
-- Nobody can insert, edit or delete rows directly through the public API.
create table public.scores (
  id bigint generated always as identity primary key,
  nickname text not null check (nickname ~ '^[A-Za-z0-9_ ]{2,16}$'),
  drill text not null check (drill in ('toe_taps','sole_rolls','inside_outside')),
  tempo text not null check (tempo in ('warm','match','elite')),
  with_ball boolean not null,
  score integer not null check (score between 0 and 6000),     -- 32 notes cannot exceed 5,840 points
  accuracy real not null check (accuracy between 0 and 1),
  form integer not null check (form between 0 and 100),
  best_combo integer not null check (best_combo between 0 and 32),
  created_at timestamptz not null default now()
);
create index scores_board on public.scores (drill, tempo, with_ball, score desc);
create index scores_recent on public.scores (nickname, created_at desc);
alter table public.scores enable row level security;
create policy "read scores" on public.scores for select to anon using (true);
-- No insert policy: with RLS on, direct inserts are refused. The grant revoke is a second lock.
revoke insert, update, delete on public.scores from anon, authenticated;

-- Mirrors the scorer in web/js/engine.js and app.js:
--   each hit scores {perfect:100, good:60, ok:25} * (1 + combo/20), combo counting up from 1 and
--   resetting on a miss; final score = round(points * (0.7 + 0.3 * form/100)); at most 32 scored notes.
-- The highest possible points for `hits` hits whose longest streak is `b` come from packing the hits
-- into streaks of exactly b, all perfect. Any submitted score above that bound is impossible.
create or replace function public.submit_score(
  p_nickname text, p_drill text, p_tempo text, p_with_ball boolean,
  p_score integer, p_accuracy real, p_form integer, p_best_combo integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- accuracy = hits / scored notes, and there are at most 32 scored notes.
  hits integer := round(p_accuracy * 32);
  b integer := least(p_best_combo, 40);
  max_points numeric;
begin
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 1 then
    raise exception 'That score is not possible.' using errcode = '22023';
  end if;
  if p_best_combo > hits or (hits > 0 and b = 0) then
    raise exception 'That score is not possible.' using errcode = '22023';
  end if;
  if b = 0 then
    max_points := 0;
  else
    max_points := 100 * (hits + ((hits / b) * b * (b + 1) / 2 + (hits % b) * ((hits % b) + 1) / 2) / 20.0);
  end if;
  -- +1 allows for the client rounding points and then score.
  if p_score > round(max_points * (0.7 + 0.3 * p_form / 100.0)) + 1 then
    raise exception 'That score is not possible.' using errcode = '22023';
  end if;
  if exists (select 1 from scores where nickname = p_nickname and created_at > now() - interval '15 seconds') then
    raise exception 'Slow down: one score every 15 seconds.' using errcode = 'P0001';
  end if;
  insert into scores (nickname, drill, tempo, with_ball, score, accuracy, form, best_combo)
  values (p_nickname, p_drill, p_tempo, p_with_ball, p_score, p_accuracy, p_form, p_best_combo);
end;
$$;
revoke all on function public.submit_score(text, text, text, boolean, integer, real, integer, integer) from public;
grant execute on function public.submit_score(text, text, text, boolean, integer, real, integer, integer) to anon, authenticated;
