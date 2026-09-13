---
name: local-supabase-docker
description: Start a self-hosted Supabase (Postgres + Auth + Storage + REST) on the user's own machine with Docker, create the question-bank table, verify connectivity, and hand the connection details to the platform's “My Question Bank”. Use when the user mentions local question bank, local Supabase, Docker database, "my bank won't connect", or initialising the question table.
---

# Local Supabase question bank (self-hosted with Docker)

The user's questions live **only on their machine**; the platform keeps no copy. Your job: bring the stack up → create the table → verify → hand the connection fields to the user.

## 0. Check the prerequisites first

```bash
docker --version
docker info >/dev/null 2>&1 && echo "docker is running" || echo "docker is not running — start Docker Desktop first"
```

- Check the ports, and **never kill someone else's process**:
  - Windows: `netstat -ano | findstr ":54321 :54322"`
  - macOS / Linux: `lsof -nP -iTCP:54321 -iTCP:54322 -sTCP:LISTEN`
- Option 1 needs Node.js 18+ (it uses `npx supabase`).
- **Stop at the first failure and paste the raw error to the user.** Never guess, never pretend it worked.

## 1. Option 1: Supabase CLI (recommended — includes Auth / Storage / Studio)

```bash
npx supabase init      # first time only, creates the supabase/ directory
npx supabase start     # starts the whole stack; the first image pull can take minutes
```

It prints these lines at the end — **read them out verbatim and keep them**:

```
API URL      : http://127.0.0.1:54321
anon key     : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # server-side only, never ship to a frontend
DB URL       : postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Everyday commands:

```bash
npx supabase status     # re-print URLs and keys at any time
npx supabase stop       # stop services; data stays in the Docker volume
npx supabase db reset   # rebuilds the local database and WIPES data — only with explicit consent
```

Default ports: `54321` API gateway / `54322` Postgres / `54323` Studio / `54324` mail catcher.

## 2. Option 2: a single Postgres container

For users who already have a backend and only want a standard Postgres. This path has **no** REST / Auth / Storage — the platform side then needs the user's own API or a direct DB connection.

```bash
docker run -d --name my-bank-db \
  -e POSTGRES_PASSWORD='<a strong password the user chooses>' \
  -e POSTGRES_DB=my_question_bank \
  -p 54322:5432 \
  -v my-bank-data:/var/lib/postgresql/data \
  supabase/postgres:15.1.0.147

docker exec -it my-bank-db psql -U postgres -d my_question_bank -c "select 1"
```

## 3. Create the question table (required for both options)

Minimal usable schema:

```sql
create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  topic_code  text not null,           -- e.g. 408-01
  type        text not null,           -- single choice / comprehensive / algorithm design …
  stem        text not null,
  options     jsonb,                   -- [{ "key": "A", "text": "…" }]
  answer      text,
  analysis    text,
  tags        text[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists questions_topic_idx on questions (topic_code);
```

Apply it (saving the SQL as `schema.sql` keeps this readable):

```bash
# Option 1 — CLI local stack (container is named supabase_db_<project dir>; confirm with docker ps)
docker ps --format "{{.Names}}" | findstr supabase_db      # Windows
docker ps --format "{{.Names}}" | grep supabase_db         # macOS / Linux
docker exec -i supabase_db_<project-dir> psql -U postgres -d postgres -f - < schema.sql

# Option 2 — the container you started yourself
docker exec -i my-bank-db psql -U postgres -d my_question_bank -f - < schema.sql
```

## 4. Verify — and show the raw output

```bash
# CLI stack: a readable empty table is success
curl -s "http://127.0.0.1:54321/rest/v1/questions?select=id&limit=1" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
# expect: []            (empty array = table and policies are readable)
# 42P01 = table was not created; 401 = wrong key
```

```bash
# Schema check, works for both options
docker exec -i my-bank-db psql -U postgres -d my_question_bank -c "\d questions"
```

## 5. Hand the fields to the user

Tell the user to open “Question Bank → My Question Bank” in the sidebar, pick “Local Docker Supabase”, and fill in three fields:

| Field | Value |
| --- | --- |
| API URL | `http://127.0.0.1:54321` (Option 2: the user's own API address) |
| anon key | the anon key printed by `start` |
| DB connection string (optional) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Credentials stay in the user's browser only: never commit them, never hard-code them, never send them to a third party.

## 6. Boundaries (must follow)

- The platform's “My Question Bank” **never receives or stores** the contents of the user's database. Only a user-checked “share” plus an explicit “upload to platform” click reaches `POST /functions/v1/my-bank-upload`.
- Destructive commands (`supabase stop --no-backup`, `docker rm -v`, `drop table`, `db reset`) require explicit user consent first.
- Never put the `service_role` key into frontend code or share it.
- If you cannot verify something, say “not verified locally” — **never fabricate a success output**.
- These questions never enter platform leaderboards or score statistics, and the platform does not guarantee the availability of the user's own database.

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker not running | Start Docker Desktop / `sudo systemctl start docker` |
| `supabase start` hangs on pulling | Slow first image pull | Wait, or `docker pull` the images first |
| `port is already allocated` | 54321 / 54322 taken | Free the port, or change it in `supabase/config.toml` |
| REST returns `42P01 relation "questions" does not exist` | Table missing or created in another database | Re-run step 3 and make sure it is the same database |
| REST keeps returning `[]` | Normal — the user has not written questions yet | Let the user add questions in “My Question Bank” |
| Platform “test connection” passes but nothing loads | That page is currently a DEMO | Say so plainly: it only validates the form, it does not connect |
