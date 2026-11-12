-- =============================================================================
-- RLS policies for leagues + league_seasons (Phase 1 / T2)
-- Apply in the Supabase SQL editor together with the drizzle-generated
-- migration. Idempotent: safe to re-run.
--
-- Interim model (deliberately simple, per Phase 1 scope):
--   * INSERT: any authenticated user, only as commissioner of the new league.
--   * SELECT / UPDATE / DELETE: commissioner only.
-- Member-scoped reads ("all league members can select") land with the
-- permission model work (league_members is already in the schema).
--
-- Note: the app's server actions connect with the postgres role via
-- DATABASE_URL, which BYPASSES RLS. These policies protect the Supabase
-- client (anon/authenticated roles) and any direct PostgREST access.
-- =============================================================================

-- ---------- leagues ----------
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues_insert_any_authenticated" ON public.leagues;
CREATE POLICY "leagues_insert_any_authenticated"
  ON public.leagues
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = commissioner_id);

DROP POLICY IF EXISTS "leagues_select_commissioner" ON public.leagues;
CREATE POLICY "leagues_select_commissioner"
  ON public.leagues
  FOR SELECT
  TO authenticated
  USING (auth.uid() = commissioner_id);

DROP POLICY IF EXISTS "leagues_update_commissioner" ON public.leagues;
CREATE POLICY "leagues_update_commissioner"
  ON public.leagues
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = commissioner_id)
  WITH CHECK (auth.uid() = commissioner_id);

DROP POLICY IF EXISTS "leagues_delete_commissioner" ON public.leagues;
CREATE POLICY "leagues_delete_commissioner"
  ON public.leagues
  FOR DELETE
  TO authenticated
  USING (auth.uid() = commissioner_id);

-- ---------- league_seasons ----------
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;

-- Season rows are managed by the parent league's commissioner.
DROP POLICY IF EXISTS "league_seasons_insert_commissioner" ON public.league_seasons;
CREATE POLICY "league_seasons_insert_commissioner"
  ON public.league_seasons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_seasons.league_id
        AND l.commissioner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "league_seasons_select_commissioner" ON public.league_seasons;
CREATE POLICY "league_seasons_select_commissioner"
  ON public.league_seasons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_seasons.league_id
        AND l.commissioner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "league_seasons_update_commissioner" ON public.league_seasons;
CREATE POLICY "league_seasons_update_commissioner"
  ON public.league_seasons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_seasons.league_id
        AND l.commissioner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_seasons.league_id
        AND l.commissioner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "league_seasons_delete_commissioner" ON public.league_seasons;
CREATE POLICY "league_seasons_delete_commissioner"
  ON public.league_seasons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_seasons.league_id
        AND l.commissioner_id = auth.uid()
    )
  );
