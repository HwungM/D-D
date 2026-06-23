-- Bring older deployments up to the schema expected by the current server.
alter table campaigns add column if not exists created_by uuid references profiles(id);
alter table campaigns add column if not exists campaign_type text default 'adventure';

create table if not exists party_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns not null,
  invited_by uuid references profiles not null,
  invite_code text unique not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz default now()
);

alter table party_invites enable row level security;
alter table campaign_members add column if not exists role text default 'player';
alter table campaign_members add column if not exists joined_at timestamptz default now();
alter table characters add column if not exists gender text;

do $$ begin
  create policy "Campaign members can create invites" on party_invites for insert
    with check (exists (
      select 1 from campaign_members cm
      where cm.campaign_id = campaign_id and cm.user_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone can view invites by code" on party_invites for select using (true);
exception when duplicate_object then null; end $$;

-- Membership and campaign creation are handled by the service-role server.
-- Removing these policies prevents direct client calls from bypassing server checks.
drop policy if exists "Users can join campaigns" on campaign_members;
drop policy if exists "Members can insert campaigns" on campaigns;

do $$ begin
  alter publication supabase_realtime add table story_events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table characters;
exception when duplicate_object then null; end $$;

create index if not exists idx_party_invites_campaign_id on party_invites(campaign_id);
create index if not exists idx_party_invites_invite_code on party_invites(invite_code);
