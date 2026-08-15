-- Optional hardening: dedicated read-only role for backups.
-- Run in Supabase SQL Editor as `postgres`. Replace the password first.
-- Requires PostgreSQL 14+ (pg_read_all_data predefined role).
-- If role creation is restricted on your plan, fall back to the postgres
-- user's connection string and skip this file.
create role backup_ro login password 'REPLACE_WITH_A_STRONG_PASSWORD' noinherit;
grant pg_read_all_data to backup_ro;
