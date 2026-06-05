[中文](README.zh.md) | English

# Practice Web — 刷题网站

A single-choice question practice website built with React + Supabase. Supports practice mode (with subject/category filter), configurable exam mode, wrong answer review, question error reporting, and question management (CRUD + CSV/JSON import with subject and analysis fields). Interface available in Chinese and English. PWA-enabled for offline use. Mobile swipe gestures for question navigation.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **UI**: Tailwind CSS 4, shadcn/ui, Radix UI (Dropdown Menu, Dialog, etc.), Lucide icons
- **State**: Zustand
- **Routing**: React Router v7 (lazy loading)
- **Backend**: Supabase (Auth, Database, RLS)
- **I18n**: Built-in (Chinese / English toggle)

## Features

| Feature | Description |
|---|---|
| **Practice Mode** | Random single-choice questions with instant correct/wrong feedback |
| **Exam Mode** | Configurable question count (5–200) and duration (5–300 min), question navigator, resume detection, auto-submit on timeout, score report |
| **Wrong Answer Review** | Filter by practice/exam mode, review with correct answer highlighted |
| **Question Management** | Create, edit, delete questions with dynamic option count (2+ options) |
| **Bulk Import** | CSV or JSON file import |
| **Subject & Analysis** | Questions support subject tag (e.g., Logic, Math) and analysis field for answer explanations |
| **Subject Filter** | Practice mode themed dropdown to filter questions by subject or category |
| **Error Reporting** | Users can report errors on questions |
| **User Roles** | Admin (CRUD questions, manage users) and User (practice only) |
| **First-user Auto-admin** | First registered user automatically becomes admin via DB trigger |
| **Mobile Responsive** | Collapsible sidebar drawer, responsive tables and forms, left/right swipe to switch questions in practice and exam mode |
| **PWA** | Service worker with offline caching, installable on mobile and desktop |
| **Dark Mode** | System-preference detection, localStorage persistence, smooth 0.25s transitions, toggle in header and login page |
| **I18n** | Chinese/English Radix Dropdown Menu switcher in header |

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
    ├── stores/                   # Zustand stores (auth, exam, lang, theme)
    ├── hooks/                    # useQuestions, useTimer, useUserAnswers, useSwipe
    ├── i18n/                     # translations (zh/en) + useT hook
    ├── router/                   # Route definitions (lazy loaded)
    ├── components/
    │   ├── ui/                   # shadcn primitives (button, card, dialog, etc.)
    │   ├── auth/                 # LoginForm, RegisterForm, ProtectedRoute
    │   ├── layout/               # AppLayout, Sidebar, Header, LoadingScreen
    │   ├── questions/            # QuestionCard, QuestionForm, QuestionList, ImportDialog
    │   ├── practice/             # PracticeSession
    │   └── exam/                 # ExamSession, ExamTimer, ExamProgress, ExamResultCard
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
