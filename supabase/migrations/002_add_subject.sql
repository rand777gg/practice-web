-- 002_add_subject.sql

-- Add subject column to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subject TEXT;

-- Set all existing questions to '逻辑学'
UPDATE public.questions SET subject = '逻辑学' WHERE subject IS NULL;

-- Add index for subject-based queries
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);
