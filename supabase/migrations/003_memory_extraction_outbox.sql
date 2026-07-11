-- Durable, idempotent background memory extraction queue.
create table if not exists public.memory_extraction_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  anonymous_id text not null,
  session_id uuid null references public.chat_sessions(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text null,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memory_extraction_outbox enable row level security;

create index if not exists idx_memory_extraction_outbox_pending
  on public.memory_extraction_outbox(status, next_attempt_at, created_at)
  where status in ('pending', 'processing', 'failed');

drop trigger if exists memory_extraction_outbox_set_updated_at
  on public.memory_extraction_outbox;
create trigger memory_extraction_outbox_set_updated_at
  before update on public.memory_extraction_outbox
  for each row execute function public.set_updated_at();
