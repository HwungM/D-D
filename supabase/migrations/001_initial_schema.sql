-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users/profiles
create table if not exists profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  created_at timestamptz default now()
);

-- Enable RLS on profiles
alter table profiles enable row level security;
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

-- Campaigns
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  story_seed text not null,
  world_state jsonb default '{}',
  world_bible jsonb default '{}',
  act integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table campaigns enable row level security;

-- Campaign members
create table if not exists campaign_members (
  campaign_id uuid references campaigns,
  user_id uuid references profiles,
  primary key (campaign_id, user_id)
);

alter table campaign_members enable row level security;
create policy "Members can view their campaigns" on campaigns for select
  using (exists (select 1 from campaign_members where campaign_id = campaigns.id and user_id = auth.uid()));
create policy "Members can insert campaigns" on campaigns for insert with check (true);
create policy "Members can update their campaigns" on campaigns for update
  using (exists (select 1 from campaign_members where campaign_id = campaigns.id and user_id = auth.uid()));

create policy "Users can view their campaign memberships" on campaign_members for select using (user_id = auth.uid());
create policy "Users can join campaigns" on campaign_members for insert with check (user_id = auth.uid());

-- Characters
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  campaign_id uuid references campaigns not null,
  name text not null,
  race text not null,
  class text not null,
  subclass text,
  secondary_class text,
  level integer default 1,
  xp integer default 0,
  hp integer not null,
  max_hp integer not null,
  stats jsonb not null,
  abilities jsonb default '[]',
  inventory jsonb default '[]',
  gold integer default 0,
  backstory text,
  portrait_url text,
  reputation jsonb default '{}',
  is_alive boolean default true,
  death_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table characters enable row level security;
create policy "Users can view their characters" on characters for select using (user_id = auth.uid());
create policy "Users can create characters" on characters for insert with check (user_id = auth.uid());
create policy "Users can update their characters" on characters for update using (user_id = auth.uid());

-- Sessions (play sessions)
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns not null,
  character_id uuid references characters not null,
  summary text,
  journal_entry text,
  created_at timestamptz default now()
);

alter table sessions enable row level security;
create policy "Users can view their sessions" on sessions for select
  using (exists (select 1 from characters c where c.id = sessions.character_id and c.user_id = auth.uid()));
create policy "Users can create sessions" on sessions for insert
  with check (exists (select 1 from characters c where c.id = character_id and c.user_id = auth.uid()));

-- Story events log
create table if not exists story_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns not null,
  character_id uuid references characters,
  event_type text not null,
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table story_events enable row level security;
create policy "Users can view story events for their campaigns" on story_events for select
  using (exists (select 1 from campaign_members cm where cm.campaign_id = story_events.campaign_id and cm.user_id = auth.uid()));
create policy "Users can insert story events" on story_events for insert
  with check (exists (select 1 from campaign_members cm where cm.campaign_id = campaign_id and cm.user_id = auth.uid()));

-- Generated assets cache
create table if not exists asset_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  url text not null,
  asset_type text not null,
  created_at timestamptz default now()
);

alter table asset_cache enable row level security;
create policy "Anyone can read asset cache" on asset_cache for select using (true);
create policy "Service role can insert asset cache" on asset_cache for insert with check (true);

-- NPCs
create table if not exists npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns not null,
  name text not null,
  description text,
  personality jsonb default '{}',
  relationship_map jsonb default '{}',
  portrait_url text,
  is_alive boolean default true,
  created_at timestamptz default now()
);

alter table npcs enable row level security;
create policy "Campaign members can view NPCs" on npcs for select
  using (exists (select 1 from campaign_members cm where cm.campaign_id = npcs.campaign_id and cm.user_id = auth.uid()));
create policy "Campaign members can insert NPCs" on npcs for insert
  with check (exists (select 1 from campaign_members cm where cm.campaign_id = campaign_id and cm.user_id = auth.uid()));
create policy "Campaign members can update NPCs" on npcs for update
  using (exists (select 1 from campaign_members cm where cm.campaign_id = npcs.campaign_id and cm.user_id = auth.uid()));

-- Indexes for performance
create index if not exists idx_characters_user_id on characters(user_id);
create index if not exists idx_characters_campaign_id on characters(campaign_id);
create index if not exists idx_story_events_campaign_id on story_events(campaign_id);
create index if not exists idx_story_events_character_id on story_events(character_id);
create index if not exists idx_story_events_created_at on story_events(created_at desc);
create index if not exists idx_sessions_campaign_id on sessions(campaign_id);
create index if not exists idx_npcs_campaign_id on npcs(campaign_id);

-- Updated_at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language 'plpgsql';

create trigger update_campaigns_updated_at before update on campaigns
  for each row execute function update_updated_at_column();
create trigger update_characters_updated_at before update on characters
  for each row execute function update_updated_at_column();
