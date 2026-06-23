alter table sessions add column if not exists status text not null default 'active';
alter table sessions add column if not exists session_number integer;
alter table sessions add column if not exists started_by uuid references profiles(id);
alter table sessions add column if not exists ended_at timestamptz;
alter table sessions add column if not exists key_decisions jsonb not null default '[]'::jsonb;
alter table sessions add column if not exists major_npcs jsonb not null default '[]'::jsonb;
alter table sessions add column if not exists event_count integer not null default 0;

create index if not exists idx_sessions_campaign_status on sessions(campaign_id, status);
create index if not exists idx_sessions_campaign_created on sessions(campaign_id, created_at desc);
