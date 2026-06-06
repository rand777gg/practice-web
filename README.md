[中文](README.zh.md) | English

# Practice Web — 刷题网站

A single-choice question practice website built with React + Supabase. Supports practice mode (with subject/category filter, public/private notes, and swipe navigation), configurable exam mode with auto-submit and resume, wrong answer review with favorites and note editing, ECharts-powered dashboard with analytics, dual study plan system (long-term auto-calc + custom daily targets), question error reporting, and question management (CRUD + CSV/JSON import). Interface available in Chinese and English. PWA-enabled for offline use.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **UI**: Tailwind CSS 4, shadcn/ui, Radix UI, Lucide icons, ECharts
- **State**: Zustand
- **Routing**: React Router v7 (lazy loading)
- **Backend**: Supabase (Auth, Database, RLS)
- **I18n**: Built-in (Chinese / English toggle)

## Features

| Feature | Description |
|---|---|
| **Dashboard Analytics** | ECharts-powered charts: calendar heatmap, stacked bar chart (Mon–Sun), Sankey diagram (subject→category), metrics card with trend arrows |
| **Study Plan** | Dual system: long-term plan (pick subjects + deadline → auto daily goal) and custom daily targets (per-subject count + optional deadline). Real-time dual progress bars in header. Click dashboard cards to edit directly. |
| **Practice Mode** | Random single-choice questions with subject/category linked filter, attempt/wrong tracking, skip button, persistent notes with public/private toggle, left-swipe to next question |
| **Exam Mode** | Configurable question count (5–200) and duration (5–300 min), subject/category filter, grid question navigator, resume detection dialog, auto-submit on timeout, score report with per-question review |
| **Wrong Answer Review** | Filter by practice/exam mode, inline note editing with public/private toggle, favorites star button, remove wrong answers, answer highlighted |
| **Question Management** | Create, edit, delete questions with dynamic option count (2+ options) |
| **Bulk Import** | CSV or JSON file import |
| **Subject & Analysis** | Questions support subject tag (e.g., Logic, Math) and analysis field for answer explanations |
| **Error Reporting** | Users can report errors on questions via "Report Error" link |
| **User Roles** | Admin (CRUD questions, manage users) and User (practice only) |
| **First-user Auto-admin** | First registered user automatically becomes admin via DB trigger |
| **Mobile Responsive** | Collapsible sidebar drawer, responsive tables and forms, left/right swipe to switch questions in practice and exam mode |
| **PWA** | Service worker with offline caching, installable on mobile and desktop |
| **Dark Mode** | System-preference detection, localStorage persistence, smooth 0.25s transitions, toggle in header and login page |
| **Public Notes** | Mark notes as public to share with other users; shown with author email in question detail |
| **Favorites** | Star questions in practice or wrong review; syncs to Supabase, accessible from sidebar |
| **I18n** | Chinese/English dropdown switcher in header |
| **Loading Tips** | Rotating "Did you know?" tips cycling every 5s during loading states, with fade transitions. Edit in `src/i18n/translations.ts` |
| **GitHub Release Badge** | Sidebar fetches latest GitHub release version and displays it as a badge |

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
    ├── lib/                      # supabase client, cn util, constants
    ├── stores/                   # Zustand stores (auth, exam, lang, theme, refresh)
    ├── hooks/                    # useQuestions, useTimer, useUserAnswers, useFavorites, useSwipe
    ├── i18n/                     # translations (zh/en) + useT hook
    ├── router/                   # Route definitions (lazy loaded)
    ├── components/
    │   ├── ui/                   # shadcn primitives (button, card, dialog, etc.)
    │   ├── auth/                 # LoginForm, RegisterForm, ProtectedRoute
    │   ├── layout/               # AppLayout, Sidebar, Header, PlanDialog, PlanProgress, DashboardPlanCards, LoadingScreen, LoadingTips
    │   ├── questions/            # QuestionCard, QuestionForm, QuestionList, ImportDialog
    │   ├── practice/             # PracticeSession
    │   ├── exam/                 # ExamSession, ExamTimer, ExamProgress, ExamResultCard
    │   └── charts/               # ECharts components (CalendarHeatmap, StackedBar, Sankey)
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
| `/review` | Wrong Answer Review | Authenticated |
| `/admin/questions` | Question Management | Admin |
| `/admin/questions/new` | Create Question | Admin |
| `/admin/questions/:id/edit` | Edit Question | Admin |
| `/admin/users` | User Management | Admin |

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
