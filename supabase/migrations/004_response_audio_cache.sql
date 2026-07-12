create extension if not exists pg_trgm;

create table if not exists public.response_cache (
  id uuid primary key default gen_random_uuid(),
  character_id text not null,
  input_text text not null,
  normalized_input text not null,
  response_text text not null,
  emotion text not null default 'neutral',
  animation text not null default 'relax',
  expression text not null default 'neutral',
  intensity real not null default 0.5 check (intensity between 0 and 1),
  voice_style text not null default 'friendly',
  approved boolean not null default true,
  hit_count bigint not null default 0,
  last_hit_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (character_id, normalized_input)
);

create table if not exists public.response_audio_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  text text not null,
  voice text not null default '',
  style text not null default '',
  storage_path text not null unique,
  content_type text not null,
  content_length bigint not null,
  audio_format text null,
  sample_rate text null,
  channels text null,
  bytes_per_sample text null,
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_response_cache_trgm
  on public.response_cache using gin (normalized_input gin_trgm_ops);
create index if not exists idx_response_cache_character_approved
  on public.response_cache(character_id, approved);

alter table public.response_cache enable row level security;
alter table public.response_audio_cache enable row level security;

drop trigger if exists response_cache_set_updated_at on public.response_cache;
create trigger response_cache_set_updated_at
before update on public.response_cache
for each row execute function public.set_updated_at();

drop trigger if exists response_audio_cache_set_updated_at on public.response_audio_cache;
create trigger response_audio_cache_set_updated_at
before update on public.response_audio_cache
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'response-audio',
  'response-audio',
  false,
  10485760,
  array['audio/wav', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.match_response_cache(
  query_text text,
  query_character_id text,
  similarity_threshold real default 0.9,
  match_count integer default 3
)
returns table (
  id uuid,
  response_text text,
  emotion text,
  animation text,
  expression text,
  intensity real,
  voice_style text,
  score real
)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_id uuid;
begin
  select rc.id into matched_id
  from public.response_cache rc
  where rc.character_id = query_character_id
    and rc.approved = true
    and (
      rc.normalized_input = query_text
      or similarity(rc.normalized_input, query_text) >= similarity_threshold
    )
  order by
    case when rc.normalized_input = query_text then 1 else 0 end desc,
    similarity(rc.normalized_input, query_text) desc,
    rc.hit_count desc
  limit 1;

  if matched_id is not null then
    update public.response_cache rc
    set hit_count = rc.hit_count + 1, last_hit_at = now()
    where rc.id = matched_id;
  end if;

  return query
  select rc.id, rc.response_text, rc.emotion, rc.animation, rc.expression,
         rc.intensity, rc.voice_style,
         similarity(rc.normalized_input, query_text)::real
  from public.response_cache rc
  where rc.id = matched_id
  limit greatest(match_count, 1);
end;
$$;

revoke all on function public.match_response_cache(text, text, real, integer) from public;
grant execute on function public.match_response_cache(text, text, real, integer) to service_role;

comment on table public.response_cache is 'Backend-owned reusable chat responses. Version 1 auto-approves new rows.';
comment on table public.response_audio_cache is 'Metadata for reusable TTS files stored in the private response-audio bucket.';
