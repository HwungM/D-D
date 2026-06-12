-- ============================================================================
-- REPAIR SCRIPT: migration 002 was never applied to the live database.
-- The app works without it (invite fallback + 5s polling), but applying this
-- makes co-op instant (realtime push) and enables short invite codes.
--
-- How to apply: Supabase Dashboard -> SQL Editor -> paste this file -> Run.
-- Safe to run more than once.
-- ============================================================================

-- Party invites table (short invite codes with expiry)
create table if not exists party_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns not null,
  invited_by uuid references profiles not null,
  invite_code text unique not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz default now()
);

alter table party_invites enable row level security;

do $$ begin
  create policy "Campaign members can create invites" on party_invites for insert
    with check (exists (select 1 from campaign_members cm where cm.campaign_id = campaign_id and cm.user_id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone can view invites by code" on party_invites for select using (true);
exception when duplicate_object then null; end $$;

-- Role metadata on campaign members
alter table campaign_members add column if not exists role text default 'player';
alter table campaign_members add column if not exists joined_at timestamptz default now();

-- THE IMPORTANT PART for co-op: realtime push on story events and characters.
-- Without this the partner who submits first only receives each round via the
-- 5-second poll; with it, rounds, popups, and dice prompts arrive instantly.
do $$ begin
  alter publication supabase_realtime add table story_events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table characters;
exception when duplicate_object then null; end $$;
