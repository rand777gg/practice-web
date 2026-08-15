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

A modern, AI-powered question practice platform. Supports six question types across practice and exam modes, with rich dashboard analytics, dual study plan system, question banks, and full PWA offline support.

## Highlights

- **Dashboard** — ECharts-powered analytics: calendar heatmap, time distribution, stacked bar charts, scatter plots, accuracy bars, heatmaps, treemaps, sunburst, Sankey diagrams, nested donuts, Ebbinghaus curve, urgency chart
- **AI-Powered** — smart question parsing, knowledge point generation, personalized study summaries, Ebbinghaus learning plan, intelligent exam configuration, AI chart insights
- **Dual Study Plan** — long-term plan with deadline-based daily goals, custom daily targets with per-subject progress tracking
- **Question Banks** — curated question collections with detail view and session picker, reusable across practice and exam
- **Sequential Practice** — subject-aware ordered question flow with cross-device progress sync and knowledge-point batched sessions
- **2FA Security** — TOTP authenticator + Passkey (WebAuthn) with trusted device management and login notifications via Feishu
- **Cross-Device Sync** — bidirectional settings sync with conflict detection (sidebar collapsed, theme, language, sequential progress)
- **QR Code Login** — desktop QR → mobile scan → instant login, no password needed
- **Mobile First** — iOS-style bottom tab bar, swipe navigation, collapsible sidebar, responsive charts
- **PWA** — offline caching, installable on mobile and desktop
- **Dark & Eye-care Modes** — system-aware dark mode plus six traditional Chinese color themes

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
| Auth | @simplewebauthn/browser, otplib, qrcode, FingerprintJS |
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

Visit `http://localhost:5173`, register — the first user automatically becomes admin.

## Features

### Practice

| Feature | Description |
|---|---|
| Scope Filter | All / favorites-only / wrong-only |
| Priority Modes | Mixed / new-first / wrong-first / sequential |
| Multi-Filter | Subject, category, question type, knowledge point |
| Sequential Mode | KP-batched subject blocks, directory navigation, exclude & restore questions, auto-saved progress with resume prompt, cross-device sync |
| Subject Explanations | Admin-managed per-subject Markdown explanations shown during practice |
| Swipe Navigation | Touch swipe to move between questions |
| Notes | Rich-text notes with public/private toggle |
| Question Banks | Curated collections, detail view, picker for practice/exam sessions |

### Exam

| Feature | Description |
|---|---|
| Configurable | Question count, time limit, subject/category/type filters |
| Grid Navigator | Jump to any question, see answered/skipped status at a glance |
| Resume | Auto-detects interrupted sessions |
| Auto-Submit | Submits on timeout |
| Score Report | ECharts gauge + donut + bar chart with breakdown |
| History | Past exam sessions list with result review |

### AI

| Feature | Description |
|---|---|
| Document Import | Upload PDF/Word/image → auto-extract questions via OCR + LLM (lightweight or MinerU precision parse) |
| Parse History | Browse the full parse history with pagination, edit parsed questions, and re-parse |
| Knowledge Points | One-click generate KPs with animated reveal |
| Study Summary | Friend-style daily recap with typewriter animation |
| Smart Exam | Analyzes practice history, recommends exam config |
| Learning Plan | Ebbinghaus forgetting curve + subject urgency scoring |
| Chart Insights | AI-generated natural-language takeaways from dashboard data |

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

### Question Management (Admin)

- Full CRUD with dynamic option counts
- Bulk import: CSV, JSON, AI document parsing
- Filter by subject, category, type, import mode, verification status
- Bulk edit, delete, and verification toggle

### Account & Security

- Email + OAuth (GitHub) login
- QR code login with session-based polling
- TOTP 2FA with authenticator app setup and device trust
- Passkey (WebAuthn) as alternative 2FA with platform-native biometrics
- Trusted device management — name devices, set trust expiration, revoke remotely
- Login notifications via Feishu bot
- Account deletion with identity unlink support
- Row-Level Security on all tables
- Admin / User role separation
- First registered user auto-admin via DB trigger

## Routes

| Path | Page | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/welcome` | Welcome | Public |
| `/farewell` | Farewell (account deleted) | Public |
| `/terms` | Terms of Service | Public |
| `/privacy` | Privacy Policy | Public |
| `/qr-confirm` | QR Login Confirm | Public |
| `/` | Dashboard | Authenticated |
| `/practice` | Practice | Authenticated |
| `/exam` | Exam | Authenticated |
| `/exam/result/:sessionId` | Exam Results | Authenticated |
| `/favorites` | Favorites | Authenticated |
| `/notes` | Public Notes | Authenticated |
| `/review` | Wrong Answer Review | Authenticated |
| `/question-bank` | Question Banks | Authenticated |
| `/settings` | Settings | Authenticated |
| `/admin/questions` | Question List | Admin |
| `/admin/questions/new` | New Question | Admin |
| `/admin/questions/:questionId/edit` | Edit Question | Admin |
| `/admin/users` | User Management | Admin |
| `/admin/ai` | AI Config | Admin |
| `/admin/ai-import` | AI Import | Admin |

## Project Structure

```
src/
├── components/
│   ├── ui/           shadcn primitives
│   ├── auth/         login/register forms, QR scanner, 2FA dialogs, route guard
│   ├── layout/       app shell, sidebar, header, plan progress & dialog
│   ├── ai/           AI summary dialog
│   ├── ai-import/    AI import wizard, PDF viewer, parse history
│   ├── charts/       ECharts & Recharts components
│   ├── markdown/     Markdown editor & renderer (Shiki highlighting)
│   ├── notes/        note editor, emoji picker, formatting toolbar
│   ├── practice/     practice session & KP selector
│   ├── exam/         exam session, timer, navigator, result card, history
│   ├── question-bank/ bank card, detail, dialog, question picker
│   └── questions/    question card, form, list, import dialog
├── hooks/            custom hooks (answers, favorites, filters, swipe, timer, mobile)
├── i18n/             zh/en translations
├── lib/              supabase client, AI SDK, constants, utilities
├── pages/            route-level page components
├── router/           lazy-loaded route definitions
├── stores/           Zustand state (auth, exam, settings, sync, sequential, dashboard, AI)
└── types/            TypeScript type definitions
supabase/
├── migrations/       single-file DB schema
└── functions/        Edge Functions (qr-login, verify-totp, manage-passkey, login-notify, delete-account, unlink-identity, r2-*, mineru-proxy)
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
