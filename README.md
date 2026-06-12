[中文](README.zh.md) | English

# Practice Web

A comprehensive question practice platform built with React + Supabase. Supports multiple question types (single/multi-choice, true/false, fill-blank, short-answer), practice & exam modes, AI-powered study summaries and question import, ECharts-rich dashboard analytics, dual study plan system, and PWA offline support. Interface available in Chinese and English.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **UI**: Tailwind CSS 4, shadcn/ui, Radix UI, Lucide icons, ECharts
- **State**: Zustand
- **Routing**: React Router v7 (lazy loading)
- **Backend**: Supabase (Auth, Database, RLS)
- **AI**: Vercel AI SDK + DeepSeek (question parsing, key points generation, smart exam setup, Ebbinghaus learning plan, daily study summary)
- **I18n**: Built-in (Chinese / English toggle)

## Features

| Feature | Description |
|---|---|
| **Dashboard Analytics** | ECharts-rich charts: calendar heatmap, concentric-circle time distribution (7 rings × 24h), daily stacked bar (subjects + correct/wrong), time scatter (today's hourly bubbles), accuracy horizontal bar + subject×type heatmap, nested donut + treemap (zhongguose palette, drill-down), Sankey flow (subject↔category) |
| **Plan Progress** | Header progress bar with long-term & daily goal tracking, congratulatory messages when goals are completed |
| **Mobile Bottom Nav** | iOS-style bottom tab bar (Dashboard / Practice / Exam / Favorites / Wrong Review), visible on mobile & tablet, frosted glass effect, customizable in Preferences |
| **AI Study Summary** | Click the ✨ button in the header to get a friend-style AI summary of today's performance, weak areas, and personalized study suggestions — with typewriter reveal animation |
| **AI Question Import** | Upload documents (PDF, Word, images), auto-extract questions via MinerU OCR + DeepSeek parsing, 6-step wizard with preview and batch import |
| **AI Key Points** | One-click generate knowledge points for any question, with color-shift border animation and typewriter text reveal |
| **AI Smart Exam** | Analyzes practice history via DeepSeek, auto-recommends subjects/categories/types/count/duration for exams — with border glow animation |
| **AI Learning Plan** | Ebbinghaus forgetting curve analysis + subject urgency scoring + AI-generated personalized study advice, cached for session |
| **Study Plan** | Dual system: long-term plan (pick subjects + deadline → auto daily goal) and custom daily targets with per-subject progress bars. Click dashboard cards to edit directly. |
| **Practice Mode** | Scope filter (all / favorites-only / wrong-only), priority mode (mixed / new-first / wrong-first), subject/category/type multi-filter, skip button, persistent notes with public/private toggle, swipe navigation |
| **Exam Mode** | Configurable question count and duration, multi-select subject/category/type filter, grid question navigator, resume detection, auto-submit on timeout, ECharts gauge + donut + bar chart score report |
| **Wrong Answer Review** | Filter by mode, inline note editing, favorites, answer highlighted |
| **Question Management** | CRUD with dynamic option count, subject/category/type/import-mode/verified filtering, page size selector, bulk edit/delete, analysis & key points fields |
| **Bulk Import** | CSV, JSON, or AI-powered document import |
| **User Roles** | Admin (CRUD questions, manage users, AI config) and User (practice only) |
| **First-user Auto-admin** | First registered user automatically becomes admin via DB trigger |
| **Mobile Responsive** | Collapsible sidebar, responsive charts (horizontal scroll for Sankey), swipe navigation |
| **PWA** | Service worker with offline caching, installable |
| **Dark Mode** | System-preference detection, localStorage persistence, toggle in header and login page |
| **Public Notes** | Share notes with other users; unified card layout with answer comparison, visibility badges, and author info |
| **Favorites** | Star questions, sync to Supabase, accessible from sidebar |
| **I18n** | Chinese/English toggle in sidebar footer |
| **Loading Tips** | Rotating tips with fade transitions during loading states |
| **GitHub Release Badge** | Sidebar shows latest release version from GitHub |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/rand777gg/react-practice-web.git
cd practice-web
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials (find them in Supabase Project Settings → API):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

> `.env` is gitignored — never commit your real keys.

### 3. Set up Supabase database

Open your Supabase project → **SQL Editor**, paste and run the entire contents of `supabase/migrations/001_initial_schema.sql`.

This creates all tables, indexes, the first-user-admin trigger, and row-level security (RLS) policies.

### 4. Start dev server

```bash
npm run dev
```

Visit `http://localhost:5173`, register an account — the first user automatically becomes admin.

### 5. Add questions

As admin, go to **Questions** → **Import** and upload `sample-questions.csv` (18 sample questions), or use **Add Question** to create them manually.

## Project Structure

```
practice-web/
├── index.html
├── .env.example                  # Environment variable template
├── sample-questions.csv          # Sample questions for import testing
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
└── src/
    ├── main.tsx
    ├── App.tsx                   # Auth initializer + session listener
    ├── index.css                 # Tailwind + CSS custom properties
    ├── types/                    # TypeScript types (Question, ExamSession, etc.)
    ├── lib/                      # supabase client, cn util, constants, ai (deepseek, ebbinghaus, summary)
    ├── stores/                   # Zustand stores (auth, exam, lang, theme, refresh)
    ├── hooks/                    # useQuestions, useTimer, useUserAnswers, useFavorites, useSwipe
    ├── i18n/                     # translations (zh/en) + useT hook
    ├── router/                   # Route definitions (lazy loaded)
    ├── components/
    │   ├── ui/                   # shadcn primitives (button, card, dialog, etc.)
    │   ├── auth/                 # LoginForm, RegisterForm, ProtectedRoute
    │   ├── layout/               # AppLayout, Sidebar, Header, PlanDialog, PlanProgress, DashboardPlanCards, LoadingScreen, LoadingTips
    │   ├── ai/                   # AiSummaryDialog
    │   ├── ai-import/            # AiImportUpload, AiImportPreview, AiImportQuestionCard, AiImportMetadata
    │   ├── questions/            # QuestionCard, QuestionForm, QuestionList, ImportDialog
    │   ├── practice/             # PracticeSession
    │   ├── exam/                 # ExamSession, ExamTimer, ExamProgress, ExamResultCard
    │   └── charts/               # ECharts: TimeDistributionHistogram, TimeScatterChart, AnswerTimeScatterHistogram, SubjectCategorySunburst, SubjectDonutCharts, SubjectAccuracyCharts, SubjectRankChart, DailyGoalHeatmap, EbbinghausCurve, UrgencyChart
    └── pages/                    # Route pages (admin/ subfolder for admin pages)
```

## Routes

| Path | Page | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/` | Dashboard | Authenticated |
| `/practice` | Practice Mode | Authenticated |
| `/exam` | Exam Mode | Authenticated |
| `/exam/result/:sessionId` | Exam Results | Authenticated |
| `/favorites` | Favorites | Authenticated |
| `/notes` | Public Notes | Authenticated |
| `/review` | Wrong Answer Review | Authenticated |
| `/admin/questions` | Question Management | Admin |
| `/admin/questions/new` | Create Question | Admin |
| `/admin/questions/:id/edit` | Edit Question | Admin |
| `/admin/users` | User Management | Admin |
| `/admin/ai` | AI Management | Admin |
| `/admin/ai-import` | AI Question Import | Admin |

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # TypeScript check + production build
npm run preview   # Preview production build locally
```

## Deploy

Build the project and deploy the `dist/` folder to any static hosting (Vercel, Netlify, Cloudflare Pages, etc.):

```bash
npm run build
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables in your hosting platform (not in the repo).

## License

MIT
