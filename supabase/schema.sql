-- Run once in Supabase → SQL Editor.
-- All access goes through the Next.js server with the secret key; RLS is on with no
-- policies, so the public anon key can read nothing.
--
-- Upgrading a database created before exam dates existed? Run just this:
--   alter table exam_sessions add column held_on date;
--   update exam_sessions set held_on = (created_at at time zone 'Asia/Jakarta')::date;
--   alter table exam_sessions alter column held_on set not null, alter column held_on set default current_date;

create table exam_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  held_on date not null default current_date,
  kind text not null check (kind in ('pre', 'post')),
  timer_mode text not null check (timer_mode in ('total', 'per_question')),
  duration_sec int not null default 1800 check (duration_sec > 0),
  per_question_sec int not null default 45 check (per_question_sec > 0),
  max_violations int not null default 3 check (max_violations > 0),
  is_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exam_sessions (id) on delete cascade,
  position int not null,
  type text not null check (type in ('mc', 'tf')),
  text text not null,
  options text[] not null,
  answer_index int not null check (answer_index >= 0 and answer_index < cardinality(options))
);
create index questions_session_idx on questions (session_id);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exam_sessions (id) on delete cascade,
  name text not null,
  nim text not null,
  question_order uuid[] not null,
  option_orders jsonb not null,
  answers jsonb not null default '{}',
  current_index int not null default 0,
  question_started_at timestamptz not null,
  started_at timestamptz not null,
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  submit_reason text check (submit_reason in ('manual', 'timeout', 'violation')),
  score int,
  violation_count int not null default 0,
  unique (session_id, nim)
);

create table violations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now()
);
create index violations_attempt_idx on violations (attempt_id);

alter table exam_sessions enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table violations enable row level security;

-- Merge one answer atomically. Guarded by current_index so a stale per-question
-- answer (or a concurrent one) updates nothing and returns no row.
create function record_answer(
  p_attempt uuid, p_question text, p_choice int,
  p_expect_index int, p_next_index int, p_now timestamptz
) returns setof attempts language sql as $$
  update attempts
     set answers = answers || jsonb_build_object(p_question, p_choice),
         question_started_at = case when p_next_index <> p_expect_index then p_now else question_started_at end,
         current_index = p_next_index
   where id = p_attempt and submitted_at is null and current_index = p_expect_index
  returning *;
$$;

-- Log a violation and return the new count (null if already submitted).
create function add_violation(p_attempt uuid, p_type text) returns int language sql as $$
  insert into violations (attempt_id, type)
    select id, p_type from attempts where id = p_attempt and submitted_at is null;
  update attempts set violation_count = violation_count + 1
   where id = p_attempt and submitted_at is null
  returning violation_count;
$$;

revoke execute on function record_answer(uuid, text, int, int, int, timestamptz) from public, anon, authenticated;
revoke execute on function add_violation(uuid, text) from public, anon, authenticated;
grant execute on function record_answer(uuid, text, int, int, int, timestamptz) to service_role;
grant execute on function add_violation(uuid, text) to service_role;
grant usage on schema public to service_role;
grant select, insert, update, delete on exam_sessions, questions, attempts, violations to service_role;
