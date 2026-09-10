[中文](README.zh.md) | English

<br/>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Practice-Web-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjMiLz48cGF0aCBkPSJNNiAxMGg0djZIOHoiLz48cGF0aCBkPSJNOSA2djQiLz48cGF0aCBkPSJNMTQgN2g0djVoLTJ6Ii8+PHBhdGggZD0iTTE2IDEwdjEiLz48L3N2Zz4="/>
    <img alt="Practice Web" src="https://img.shields.io/badge/Practice-Web-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjMiLz48cGF0aCBkPSJNNiAxMGg0djZIOHoiLz48cGF0aCBkPSJNOSA2djQiLz48cGF0aCBkPSJNMTQgN2g0djVoLTJ6Ii8+PHBhdGggZD0iTTE2IDEwdjEiLz48L3N2Zz4="/>
  </picture>
</p>

<p align="center">
  <a href="https://github.com/rand777gg/practice-web/releases"><img src="https://img.shields.io/github/v/release/rand777gg/practice-web?color=blue" alt="Release"></a>
  <a href="https://github.com/rand777gg/practice-web/actions"><img src="https://img.shields.io/github/actions/workflow/status/rand777gg/practice-web/ci.yml?branch=master" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-~6.0-3178C6?logo=typescript" alt="TypeScript">
</p>

# Practice Web

A modern, AI-powered question practice platform built with React + Supabase. Multi-type practice and exam modes, coding questions with dual-channel judging, learning routes, study rooms, exam templates with scheduled delivery, dashboard analytics, dual study plans, question banks, QR login, 2FA security, full PWA offline support, and built-in zh/en switching.

## Highlights

- **Dashboard** — ECharts-powered analytics: calendar heatmap, time distribution, stacked bar charts, scatter plots, accuracy bars, heatmaps, treemaps, sunburst, Sankey diagrams, nested donuts, Ebbinghaus curve, urgency chart
- **AI-Powered** — smart question parsing, knowledge point generation, personalized study summaries, Ebbinghaus learning plan, intelligent exam configuration, AI chart insights
- **Dual Study Plan** — long-term plan with deadline-based daily goals, custom daily targets with per-subject progress tracking
- **Question Banks** — curated question collections with detail view and session picker, reusable across practice, exam and learning routes
- **Sequential Practice** — subject-aware ordered question flow with cross-device progress sync and knowledge-point batched sessions
- **Learning Routes** — admin-curated stage-by-stage question paths with pass statistics and a draw.io route map (editable in-page and persisted per route, with the progress-colored archify map kept behind a "developing" tab)
- **Coding Judge** — LeetCode-style split-pane IDE with both platform-central and local Judge0 judging channels
- **Exam Templates & Scheduling** — WYSIWYG paper composer, multi-view preview, scheduled delivery with Web Push / email reminders
- **Study Rooms** — join by invite code, daily check-in, email reminders for check-ins and scheduled exams
- **2FA Security** — TOTP authenticator + Passkey (WebAuthn) + recovery codes, session/device-level grace, trusted device management, login notifications via Feishu
- **Cross-Device Sync** — bidirectional settings sync with conflict detection (sidebar collapsed, theme, language, sequential progress)
- **QR Code Login** — desktop QR → mobile scan → instant login, no password needed
- **Mobile First** — iOS-style bottom tab bar, swipe navigation, collapsible sidebar, responsive charts
- **PWA** — offline caching, installable on mobile and desktop
- **Dark & Eye-care Modes** — system-aware dark mode plus six traditional Chinese color themes
- **zh / en** — in-app language switching (Settings / onboarding guide)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19, TypeScript, Vite 8 |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI, Lucide, Motion |
| Charts | ECharts 6, Recharts, Mermaid |
| State | Zustand |
| Routing | React Router v7 (lazy loading) |
| Backend | Supabase (PostgreSQL, Auth, RLS, Edge Functions) |
| AI | Vercel AI SDK + DeepSeek / OpenAI |
| Markdown | react-markdown, Shiki, remark-math, rehype-raw |
| Auth | @simplewebauthn/browser, otplib, qrcode |
| Judging | Judge0 (platform-central / local self-test channels) |
| I18n | Built-in zh / en |
| PWA | vite-plugin-pwa + Workbox |

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) project

### Setup

```bash
git clone https://github.com/rand777gg/practice-web.git
cd practice-web
npm install
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Initialize the database: open your Supabase project → **SQL Editor**, paste and run `supabase/migrations/001_initial_schema.sql`.

```bash
npm run dev
```

Visit `http://localhost:5173`, register — the first user automatically becomes admin. When email confirmation is enabled, click the verification link in the email first (sender is configured via Supabase SMTP, e.g. `register@mail.pguide.dev`), then the new-user onboarding guide opens.

### Local Judge0 (optional)

Coding questions use the platform-central judge by default. To run judging on your **own machine** during peak hours (results for personal practice only, not scored), run Judge0 inside a **VirtualBox Ubuntu 22.04** (cgroup v1) — Docker Desktop / WSL2 on Windows only support cgroup v2, which cannot run Judge0's isolate sandbox (submissions always fail with status 13).

Quick steps: VirtualBox Ubuntu 22.04 → NAT port forward (host 2358 → guest 2358) → add `systemd.unified_cgroup_hierarchy=0` to GRUB and reboot → `apt install docker.io docker-compose-v2` → `docker compose up -d` in `judge0/` → the "Local Judge" item in the sidebar turns green and "local self-test" becomes available on coding questions.

> Beginners: see [docs/judge0-local-setup.md](docs/judge0-local-setup.md) (VirtualBox Ubuntu 22.04 → cgroup v1 → one command).

## Features

### Practice

| Feature | Description |
|---|---|
| Scope Filter | All / favorites-only / wrong-only |
| Priority Modes | Mixed / new-first / wrong-first / sequential |
| Multi-Filter | Subject, category, question type, knowledge point |
| Sequential Mode | KP-batched subject blocks, directory navigation, exclude & restore questions, auto-saved progress with resume prompt, cross-device sync |
| Learning Routes | Admin-curated staged paths, free practice + pass statistics, editable draw.io route map plus the archify progress map (developing) |
| Subject Explanations | Admin-managed per-subject Markdown explanations shown during practice |
| Swipe Navigation | Touch swipe to move between questions |
| Shortcuts | Prev/next question, favorite, too-easy, flag issue, etc. via keyboard |
| Notes | Rich-text notes with public/private toggle |
| Question Banks | Curated collections, detail view, picker for practice/exam sessions |

### Exam

| Feature | Description |
|---|---|
| Configurable | Question count, time limit, subject/category/type filters |
| Paper Templates | WYSIWYG custom cover/body, draggable page margins, template canvas composition |
| Scheduled Exams | Pick send time and exam window; Web Push / email reminder when it starts |
| Grid Navigator | Jump to any question, see answered/skipped status at a glance |
| Resume | Auto-detects interrupted sessions |
| Auto-Submit | Submits on timeout |
| Score Report | ECharts gauge + donut + bar chart with breakdown, multiple view modes |
| History | Past exam sessions list with result review and template reuse |

### Coding Judge

| Feature | Description |
|---|---|
| Split-pane IDE | LeetCode-style problem + CodeMirror editor, Python / JS / TS / C / C++ / Java |
| Run Cases | Sample cases / custom input run instantly, per-case verdict coloring |
| Dual Channels | Platform-central Judge0 counts toward results; local Judge0 self-test does not |
| Submission History | Per-submission language, status, runtime and history list |

### AI

| Feature | Description |
|---|---|
| Document Import | Upload PDF/Word/image → auto-extract questions via OCR + LLM (lightweight or MinerU precision parse) |
| Parse History | Browse full parse history with pagination, edit parsed questions, re-parse |
| Knowledge Points | One-click generate KPs with animated reveal |
| Study Summary | Friend-style daily recap with typewriter animation |
| Smart Exam | Analyzes practice history, recommends exam config |
| Learning Plan | Ebbinghaus forgetting curve + subject urgency scoring |
| Chart Insights | AI-generated natural-language takeaways from dashboard data |

### Study Rooms & Reminders

| Feature | Description |
|---|---|
| Study Rooms | Join/leave via invite code, member presence and daily check-in |
| Reminders | Email reminders for check-ins; Web Push + email when a scheduled exam starts |

### Dashboard

- **Calendar Heatmap** — daily activity overview
- **Time Distribution** — concentric rings (7 categories × 24 hours)
- **Daily Stacked Bar** — per-subject breakdown with correct/wrong split
- **Time Scatter** — today's answers as hourly bubbles
- **Accuracy Bar + Heatmap** — horizontal bars by subject + subject×type matrix
- **Sunburst** — subject → category → knowledge point hierarchy
- **Donut + Treemap** — nested hierarchy with traditional Chinese color palette
- **Sankey Diagram** — subject ↔ category flow
- **Ebbinghaus Curve** — forgetting curve with review schedule
- **Urgency Chart** — subject urgency scoring for study prioritization

### Admin

- Questions: full CRUD, dynamic options, bulk import (CSV / JSON / AI parsing), bulk edit / delete / verification toggle, filter by subject/category/type/source
- Duplicate Check: group-scan similar questions, keep one or operate on the whole group
- Coding: local-judge test page (direct Judge0 self-test)
- AI Import: parse-history management, PDF/image scan into the bank
- User Management: role toggle (admin/user), **delete account (cascades all related data)**, **email-confirmed status column**, online / last-online display
- Learning Routes: stage editing, question mounting, publish control, embedded draw.io map editing (regenerate from stages / persist / export .drawio)

### Account & Security

- Registration: email sign-up with confirmation mail (custom SMTP / bilingual template) + GitHub OAuth
- Onboarding (`/guide`): welcome → recommended Passkey / authenticator app → start; admins are required to set up 2FA
- QR code login with session-based polling
- TOTP 2FA: authenticator app enrollment; **replacing the authenticator requires the current code or a recovery code** to prevent silent re-keying
- Passkey (WebAuthn) as alternative 2FA with platform-native biometrics
- 2FA recovery codes: one-time codes generated at setup (stored as SHA-256 hashes)
- MFA validity: per-session grace (every sign-in / 7 / 14 / 30 days) with trusted-device management (name, trust expiry, remote revoke)
- Email-confirm sign-ups + login notifications via Feishu bot
- Account deletion with cascading cleanup and OAuth identity unlink support
- Row-Level Security on all tables, admin/user role separation; first registered user auto-admin via DB trigger

## Routes

| Path | Page | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/guide` | Onboarding guide | Post-login, on demand |
| `/mfa`, `/mfa/:method` | MFA verify page (passkey / app / recovery) | Post-login, on demand |
| `/welcome` | Welcome (email-confirm landing) | Public |
| `/farewell` | Farewell (account deleted) | Public |
| `/terms`, `/privacy` | Terms / Privacy | Public |
| `/qr-confirm` | QR Login Confirm | Public |
| `/` | Landing portal (guests) / Dashboard (authenticated) | Public / Authenticated |
| `/practice` | Practice | Authenticated |
| `/exam` | Exam | Authenticated |
| `/exam/templates` | Exam Templates & Scheduling | Authenticated |
| `/exam/result/:sessionId` | Exam Results | Authenticated |
| `/favorites` | Favorites | Authenticated |
| `/review` | Wrong Answer Review | Authenticated |
| `/notes` | Public Notes | Authenticated |
| `/question-bank` | Question Banks | Authenticated |
| `/learning-routes` | Learning Routes | Authenticated |
| `/learning-routes/:routeId` | Learning Route Detail (stages + draw.io / archify map) | Authenticated |
| `/learning-routes/:routeId/practice` | Route Practice | Authenticated |
| `/study-rooms` | Study Rooms | Authenticated |
| `/settings` | Settings | Authenticated |
| `/judge-local` | Local Judge (Judge0) setup guide | Authenticated |
| `/admin/questions` | Question List | Admin |
| `/admin/questions/new` | New Question | Admin |
| `/admin/questions/:questionId/edit` | Edit Question | Admin |
| `/admin/questions/test` | Coding Local-Judge Test | Admin |
| `/admin/duplicates` | Duplicate Check | Admin |
| `/admin/users` | User Management (roles, delete, email confirmed) | Admin |
| `/admin/ai` | AI Config | Admin |
| `/admin/ai-import` | AI Import | Admin |
| `/admin/learning-routes` | Learning Route Management | Admin |
| `/admin/learning-routes/new` | New Learning Route | Admin |
| `/admin/learning-routes/:routeId/edit` | Edit Learning Route | Admin |

## Project Structure

```
src/
├── components/
│   ├── ui/           shadcn primitives
│   ├── auth/         login/register forms, QR scanner, 2FA/Passkey dialogs, MFA panels, route guards
│   ├── layout/       app shell, sidebar, header, plan progress & dialog
│   ├── ai/           AI summary dialog
│   ├── ai-import/    AI import wizard, PDF viewer, parse history
│   ├── charts/       ECharts & Recharts components
│   ├── markdown/     Markdown editor & renderer (Shiki highlighting)
│   ├── notes/        note editor, emoji picker, formatting toolbar
│   ├── practice/     practice session & KP selector, coding IDE
│   ├── exam/         exam session, timer, navigator, result, template editor, schedule panel
│   ├── question-bank/ bank card, detail, dialog, question picker
│   ├── study-room/   study-room related
│   ├── settings/     settings items (sync, shortcuts, etc.)
│   └── questions/    question card, form, list, import dialog
├── hooks/            custom hooks (answers, favorites, filters, swipe, timer, mobile)
├── i18n/             zh/en translations
├── lib/              supabase client, AI SDK, MFA/Passkey helpers, utilities
├── pages/            route-level page components
├── router/           lazy-loaded route definitions
├── stores/           Zustand state (auth, exam, settings, sync, sequential, dashboard, AI)
└── types/            TypeScript type definitions
supabase/
├── migrations/       single-file DB schema (001_initial_schema.sql, appended by Section)
└── functions/        Edge Functions (verify-totp, manage-passkey, qr-login, admin-delete-user,
                      delete-account, unlink-identity, login-notify, cloudflare-turnstile,
                      judge, study-room, notify-exam, parse-paper-cover, mineru-proxy, r2-*)
```

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # TypeScript check + production build
npm run preview   # Preview production build locally
```

## Deploy

Build and deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages):

```bash
npm run build
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables on your hosting platform.

Edge Functions (optional): `npx supabase functions deploy <name> --project-ref <ref>`. Database migrations live in the single-file `supabase/migrations/001_initial_schema.sql`; apply remotely with `npx supabase db query --linked "<sql>"`.

## CI / CD

| Workflow | Description |
|---|---|
| `build-check.yml` | Build status notification to Feishu (success/failure) |
| `pr-review.yml` | Automated PR review (DeepSeek + Feishu notify) |
| `db-backup.yml` | Daily Supabase DB backup to Cloudflare R2 (encrypted, 30-day retention) — see [`scripts/backup/README.md`](scripts/backup/README.md) |

### PR Review Setup

Add to repository **Settings → Secrets → Actions**:

| Secret | Description |
|---|---|
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com) |
| `FEISHU_WEBHOOK_URL` | Feishu bot webhook URL |

Feishu bot security: if a custom keyword is enforced, include `Build` (for `build-check.yml`) and `PR Review` (for `pr-review.yml`) — otherwise the notifications will be dropped by Feishu.

## License

[MIT](LICENSE)
