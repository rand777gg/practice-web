-- Performance indexes for high-frequency queries
-- Run in Supabase SQL Editor: https://app.supabase.com → your project → SQL Editor

-- ── questions table ──
-- Used in: filter dropdowns, practice random pick, exam, dashboard

-- Combined subject + category (most common filter pattern)
CREATE INDEX IF NOT EXISTS idx_questions_subject_category
  ON questions (subject, category);

-- Question type filter (practice/exam dropdown)
CREATE INDEX IF NOT EXISTS idx_questions_question_type
  ON questions (question_type);

-- Full filter combo (subject + category + question_type)
CREATE INDEX IF NOT EXISTS idx_questions_filter
  ON questions (subject, category, question_type);

-- ID-only queries (random pick, count queries)
-- Already covered by primary key, but adding explicit index for count(*)
CREATE INDEX IF NOT EXISTS idx_questions_subject_id
  ON questions (subject) INCLUDE (id);


-- ── user_answers table ──
-- Used in: dashboard (12-week range), practice stats, exam, review

-- Main dashboard query: user + time range
CREATE INDEX IF NOT EXISTS idx_user_answers_user_answered
  ON user_answers (user_id, answered_at DESC);

-- Per-question stats lookups (practice/exam)
CREATE INDEX IF NOT EXISTS idx_user_answers_user_question
  ON user_answers (user_id, question_id);

-- Question-level aggregation (correct rate, heatmap)
CREATE INDEX IF NOT EXISTS idx_user_answers_question_correct
  ON user_answers (question_id, is_correct);


-- ── favorites table ──
CREATE INDEX IF NOT EXISTS idx_favorites_user
  ON favorites (user_id);


-- ── profiles table ──
-- Auth lookup on every page load
CREATE INDEX IF NOT EXISTS idx_profiles_id
  ON profiles (id);
