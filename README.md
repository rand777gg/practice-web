[中文](README.zh.md) | English

<br/>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Practice-Web-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjMiLz48cGF0aCBkPSJNNiAxMGg0djZIOHoiLz48cGF0aCBkPSJNOSA2djQiLz48cGF0aCBkPSJNMTQgN2g0djVoLTJ6Ii8+PHBhdGggZD0iTTE2IDEwdjEiLz48L3N2Zz4="/>
    <img alt="Practice Web" src="https://img.shields.io/badge/Practice-Web-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjMiLz48cGF0aCBkPSJNNiAxMGg0djZIOHoiLz48cGF0aCBkPSJNOSA2djQiLz48cGF0aCBkPSJNMTQgN2g0djVoLTJ6Ii8+PHBhdGggZD0iTTE2IDEwdjEiLz48L3N2Zz4="/>
  </picture>
</p>

<p align="center">
  <a href="https://github.com/rand777gg/react-practice-web/releases"><img src="https://img.shields.io/github/v/release/rand777gg/react-practice-web?color=blue" alt="Release"></a>
  <a href="https://github.com/rand777gg/react-practice-web/actions"><img src="https://img.shields.io/github/actions/workflow/status/rand777gg/react-practice-web/ci.yml?branch=master" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-~6.0-3178C6?logo=typescript" alt="TypeScript">
</p>

# Practice Web

A modern, AI-powered question practice platform. Supports six question types across practice and exam modes, with rich dashboard analytics, dual study plan system, and full PWA offline support.

## Highlights

- **Dashboard** — ECharts-powered analytics: calendar heatmap, time distribution, stacked bar charts, scatter plots, accuracy bars, heatmaps, treemaps, Sankey diagrams, nested donuts
- **AI-Powered** — smart question parsing, knowledge point generation, personalized study summaries, Ebbinghaus learning plan, intelligent exam configuration
- **Dual Study Plan** — long-term plan with deadline-based daily goals, custom daily targets with per-subject progress tracking
- **Sequential Practice** — subject-aware ordered question flow with cross-device progress sync and knowledge-point batched sessions
- **QR Code Login** — desktop QR → mobile scan → instant login, no password needed
- **Mobile First** — iOS-style bottom tab bar, swipe navigation, collapsible sidebar, responsive charts
- **PWA** — offline caching, installable on mobile and desktop
- **Dark & Eye-care Modes** — system-aware dark mode plus six traditional Chinese color themes

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19, TypeScript, Vite 8 |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI, Lucide |
| Charts | ECharts 6, Recharts |
| State | Zustand |
| Routing | React Router v7 (lazy loading) |
| Backend | Supabase (PostgreSQL, Auth, RLS, Edge Functions) |
| AI | Vercel AI SDK + DeepSeek / OpenAI |
| I18n | Built-in zh / en |
| PWA | vite-plugin-pwa + Workbox |

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) project

### Setup

```bash
git clone https://github.com/rand777gg/react-practice-web.git
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
| Sequential Mode | KP-batched subject blocks, auto-saved progress, cross-device sync |
| Swipe Navigation | Touch swipe to move between questions |
| Notes | Rich-text notes with public/private toggle |

### Exam

| Feature | Description |
|---|---|
| Configurable | Question count, time limit, subject/category/type filters |
| Grid Navigator | Jump to any question, see answered/skipped status at a glance |
| Resume | Auto-detects interrupted sessions |
| Auto-Submit | Submits on timeout |
| Score Report | ECharts gauge + donut + bar chart with breakdown |

### AI

| Feature | Description |
|---|---|
| Document Import | Upload PDF/Word/image → auto-extract questions via OCR + LLM |
| Knowledge Points | One-click generate KPs with animated reveal |
| Study Summary | Friend-style daily recap with typewriter animation |
| Smart Exam | Analyzes practice history, recommends exam config |
| Learning Plan | Ebbinghaus forgetting curve + subject urgency scoring |

### Dashboard

- **Calendar Heatmap** — daily activity overview
- **Time Distribution** — concentric rings (7 categories × 24 hours)
- **Daily Stacked Bar** — per-subject breakdown with correct/wrong split
- **Time Scatter** — today's answers as hourly bubbles
- **Accuracy Bar + Heatmap** — horizontal bars by subject + subject×type matrix
- **Donut + Treemap** — nested hierarchy with traditional Chinese color palette
- **Sankey Diagram** — subject ↔ category flow

### Question Management (Admin)

- Full CRUD with dynamic option counts
- Bulk import: CSV, JSON, AI document parsing
- Filter by subject, category, type, import mode, verification status
- Bulk edit, delete, and verification toggle

### Account & Security

- Email + OAuth (GitHub) login
- QR code login with session-based polling
- Row-Level Security on all tables
- Admin / User role separation
- First registered user auto-admin via DB trigger

## Routes

| Path | Page | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/` | Dashboard | Authenticated |
| `/practice` | Practice | Authenticated |
| `/exam` | Exam | Authenticated |
| `/exam/result/:sessionId` | Exam Results | Authenticated |
| `/favorites` | Favorites | Authenticated |
| `/notes` | Public Notes | Authenticated |
| `/review` | Wrong Answer Review | Authenticated |
| `/settings` | Settings | Authenticated |
| `/admin/questions` | Question List | Admin |
| `/admin/questions/new` | New Question | Admin |
| `/admin/questions/:id/edit` | Edit Question | Admin |
| `/admin/users` | User Management | Admin |
| `/admin/ai` | AI Config | Admin |
| `/admin/ai-import` | AI Import | Admin |

## Project Structure

```
src/
├── components/
│   ├── ui/          shadcn primitives
│   ├── auth/        login/register forms, QR scanner, route guard
│   ├── layout/      app shell, sidebar, header, plan progress & dialog
│   ├── ai/          AI summary dialog, import wizard
│   ├── charts/      ECharts & Recharts components
│   ├── practice/    practice session & KP selector
│   ├── exam/        exam session, timer, navigator, result card
│   └── questions/   question card, form, list, import dialog
├── hooks/           custom hooks (answers, favorites, filters, swipe)
├── i18n/            zh/en translations
├── lib/             supabase client, AI SDK, constants, utilities
├── pages/           route-level page components
├── router/          lazy-loaded route definitions
├── stores/          Zustand state (auth, exam, settings, sequential, dashboard)
└── types/           TypeScript type definitions
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
| `lint.yml` | ESLint |
| `typecheck.yml` | TypeScript type check |
| `tests.yml` | Test suite |
| `ci.yml` | Build + dependency caching |
| `deploy-site.yml` | Static hosting deploy |
| `pr-review.yml` | Automated PR review (DeepSeek + Feishu notify) |

### PR Review Setup

Add to repository **Settings → Secrets → Actions**:

| Secret | Description |
|---|---|
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com) |
| `FEISHU_WEBHOOK_URL` | Feishu bot webhook URL |

Feishu bot security: add custom keyword `PR Review` in bot settings.

## License

[MIT](LICENSE)
