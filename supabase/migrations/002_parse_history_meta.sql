ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS key_points text;
