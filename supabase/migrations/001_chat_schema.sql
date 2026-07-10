create extension if not exists "pgcrypto";

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  character_id text not null,
  title text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  emotion text null,
  animation text null,
  expression text null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null unique,
  selected_character_id text null,
  selected_background_id text null,
  voice_enabled boolean not null default true,
  selected_voice text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_anonymous_id
  on public.chat_sessions(anonymous_id);

create index if not exists idx_chat_sessions_updated_at
  on public.chat_sessions(updated_at desc);

create index if not exists idx_chat_messages_session_created
  on public.chat_messages(session_id, created_at desc);

create index if not exists idx_user_preferences_anonymous_id
  on public.user_preferences(anonymous_id);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_preferences enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_sessions_set_updated_at on public.chat_sessions;
create trigger chat_sessions_set_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

comment on table public.chat_sessions is 'Backend-owned chat sessions for anonymous or authenticated users.';
comment on table public.chat_messages is 'Backend-owned chat messages. RLS is enabled; use service role from the API only.';
comment on table public.user_preferences is 'Backend-owned anonymous user preferences.';
