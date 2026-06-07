-- Permanent storage for AI-generated scene/portrait/item art.
-- DALL-E returns short-lived signed URLs (expire ~1-2 hours), which were being cached
-- directly into asset_cache and breaking once they expired. We now download the bytes
-- and re-host them here so cached URLs stay valid indefinitely.
insert into storage.buckets (id, name, public)
values ('generated-art', 'generated-art', true)
on conflict (id) do nothing;

create policy "Anyone can view generated art"
  on storage.objects for select
  using (bucket_id = 'generated-art');

create policy "Service role can upload generated art"
  on storage.objects for insert
  with check (bucket_id = 'generated-art');

create policy "Service role can update generated art"
  on storage.objects for update
  using (bucket_id = 'generated-art');

-- Purge previously cached entries pointing at ephemeral OpenAI/Azure blob URLs.
-- These have already expired (or will shortly) and were causing scenes to render
-- as blank/black panels. Deleting them forces regeneration through the new
-- permanent-storage path on next request.
delete from asset_cache
where url like '%oaidalleapiprodscus.blob.core.windows.net%'
   or url like '%blob.core.windows.net%';
