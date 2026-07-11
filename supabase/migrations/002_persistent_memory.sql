-- Migration 002: Persistent Memory Tables and Indexes

-- 1. Bổ sung các cột vào bảng chat_sessions
alter table public.chat_sessions
  add column if not exists last_active_at timestamptz not null default now(),
  add column if not exists message_count integer not null default 0,
  add column if not exists rolling_summary text null,
  add column if not exists summary_through_message_id uuid null references public.chat_messages(id) on delete set null,
  add column if not exists summary_updated_at timestamptz null,
  add column if not exists memory_version integer not null default 1;

-- Bổ sung cột memory_enabled vào bảng user_preferences
alter table public.user_preferences
  add column if not exists memory_enabled boolean not null default true;

-- 2. Tạo bảng conversation_memories
create table if not exists public.conversation_memories (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  user_id uuid null,
  character_id text null,
  kind text not null, -- identity, preference, goal, project, relationship, instruction, other
  content text not null,
  normalized_key text not null,
  importance real not null default 0.5,
  confidence real not null default 0.5,
  explicit_user_request boolean not null default false,
  sensitive boolean not null default false,
  status text not null default 'active' check (status in ('active', 'superseded', 'deleted')),
  source_session_id uuid null references public.chat_sessions(id) on delete set null,
  source_message_ids jsonb not null default '[]'::jsonb,
  supersedes_memory_id uuid null references public.conversation_memories(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Tạo bảng conversation_summaries
create table if not exists public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  from_message_id uuid not null references public.chat_messages(id) on delete cascade,
  through_message_id uuid not null references public.chat_messages(id) on delete cascade,
  message_count integer not null default 0,
  summary text not null,
  topics jsonb not null default '[]'::jsonb,
  unresolved_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Tạo bảng memory_audit_log
create table if not exists public.memory_audit_log (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid null references public.conversation_memories(id) on delete set null,
  event_type text not null, -- created, updated, superseded, deleted, user_confirmed, user_rejected
  previous_content text null,
  new_content text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 5. Kích hoạt Row Level Security (RLS) cho các bảng mới
alter table public.conversation_memories enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.memory_audit_log enable row level security;

-- 6. Tạo trigger cập nhật cột updated_at
drop trigger if exists conversation_memories_set_updated_at on public.conversation_memories;
create trigger conversation_memories_set_updated_at
  before update on public.conversation_memories
  for each row execute function public.set_updated_at();

drop trigger if exists conversation_summaries_set_updated_at on public.conversation_summaries;
create trigger conversation_summaries_set_updated_at
  before update on public.conversation_summaries
  for each row execute function public.set_updated_at();

-- 7. Thêm cột tsvector để tìm kiếm full-text bằng cấu hình simple
alter table public.conversation_memories
  add column if not exists fts_doc tsvector generated always as (
    to_tsvector('simple', coalesce(normalized_key, '') || ' ' || coalesce(content, '') || ' ' || coalesce(kind, ''))
  ) stored;

-- 8. Tạo các index cho tối ưu truy vấn
create index if not exists idx_conv_memories_anon_char
  on public.conversation_memories(anonymous_id, character_id);

create index if not exists idx_conv_memories_retrieval
  on public.conversation_memories(anonymous_id, status, kind, importance desc);

create unique index if not exists idx_conv_memories_one_active_key
  on public.conversation_memories(anonymous_id, coalesce(character_id, ''), normalized_key)
  where status = 'active';

create index if not exists idx_conv_memories_status
  on public.conversation_memories(status);

create index if not exists idx_conv_memories_key
  on public.conversation_memories(normalized_key);

create index if not exists idx_conv_memories_fts
  on public.conversation_memories using gin(fts_doc);

create index if not exists idx_conv_summaries_session
  on public.conversation_summaries(session_id);

create index if not exists idx_chat_sessions_anon_updated
  on public.chat_sessions(anonymous_id, updated_at desc);

-- Thêm mô tả cho các bảng mới
comment on table public.conversation_memories is 'Long-term structured user memories and facts extracted from chat sessions.';
comment on table public.conversation_summaries is 'Rolling summaries of sessions used to compress past conversation history.';
comment on table public.memory_audit_log is 'Audit log for additions, modifications, and deletions of memories.';
