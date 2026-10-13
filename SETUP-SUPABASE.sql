-- Paste this once into Supabase Dashboard > SQL Editor > New query > Run.
-- Pack data, collaborative studios and accumulated vote statistics live in this table.
CREATE TABLE IF NOT EXISTS public.duel_store (
  id text PRIMARY KEY CHECK (id IN ('packs', 'drafts', 'stats')),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.duel_store ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.duel_store FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.duel_store TO service_role;
-- Separately create a PUBLIC storage bucket named duel-media via Storage > New bucket.
-- The backend still requires the private Supabase secret key for uploads and writes.
