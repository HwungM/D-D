-- Party invites table
create table if not exists party_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns not null,
  invited_by uuid references profiles not null,
  invite_code text unique not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz default now()
);

alter table party_invites enable row level security;
create policy "Campaign members can create invites" on party_invites for insert
  with check (exists (select 1 from campaign_members cm where cm.campaign_id = campaign_id and cm.user_id = auth.uid()));
create policy "Anyone can view invites by code" on party_invites for select using (true);

-- Add role to campaign_members
alter table campaign_members add column if not exists role text default 'player';
alter table campaign_members add column if not exists joined_at timestamptz default now();

-- Enable realtime on story_events and characters
alter publication supabase_realtime add table story_events;
alter publication supabase_realtime add table characters;
