-- 002: Add question types support (multi-select, true/false, fill-blank, short-answer, analysis)
-- Replaces correct_answer INTEGER with JSONB to support all answer formats

-- 1. Add question_type column
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'single_choice'
  CHECK (question_type IN ('single_choice','multi_select','true_false','fill_blank','short_answer','analysis'));

-- 2. Add new JSONB column for correct_answer
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS correct_answer_jsonb JSONB;

-- 3. Migrate existing data: wrap integer into JSONB
UPDATE public.questions
  SET correct_answer_jsonb = to_jsonb(correct_answer)
  WHERE correct_answer_jsonb IS NULL;

-- 4. Make it NOT NULL
ALTER TABLE public.questions
  ALTER COLUMN correct_answer_jsonb SET NOT NULL;

-- 5. Drop old INTEGER column
ALTER TABLE public.questions
  DROP COLUMN IF EXISTS correct_answer;

-- 6. Rename JSONB column to correct_answer
ALTER TABLE public.questions
  RENAME COLUMN correct_answer_jsonb TO correct_answer;

-- 7. Add answer_explanation column (human-readable explanation for fill_blank/short_answer)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS answer_explanation TEXT;

-- 8. Index for question_type queries
CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(question_type);

-- ============================================
-- user_answers: widen selected_answer to JSONB
-- ============================================

ALTER TABLE public.user_answers
  ADD COLUMN IF NOT EXISTS selected_answer_jsonb JSONB;

UPDATE public.user_answers
  SET selected_answer_jsonb = to_jsonb(selected_answer)
  WHERE selected_answer_jsonb IS NULL;

ALTER TABLE public.user_answers
  ALTER COLUMN selected_answer_jsonb SET NOT NULL;

ALTER TABLE public.user_answers
  DROP COLUMN IF EXISTS selected_answer;

ALTER TABLE public.user_answers
  RENAME COLUMN selected_answer_jsonb TO selected_answer;

CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON public.user_answers(question_id);
