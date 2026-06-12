-- Character gender, so the DM uses the right pronouns.
alter table characters add column if not exists gender text;
