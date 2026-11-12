-- =============================================================================
-- RLS policies for league_members (Phase 1 / T4)
-- Apply in the Supabase SQL editor after the drizzle-generated migration
-- (drizzle/0001_membership.sql). Idempotent: safe to re-run.
--
-- Model:
--   * SELECT: active members of a league (or its commissioner) can read the
--     league's roster rows.
--   * INSERT / UPDATE / DELETE: the league's commissioner only.
--
-- The SELECT policy needs to ask "is auth.uid() an active member of this
-- league?" — a query against league_members itself. Written inline that
-- subquery would re-enter the very policy being evaluated (infinite
-- recursion), so membership checks live in SECURITY DEFINER helper
-- functions. They run as the function owner (postgres, the table owner),
-- which bypasses RLS and breaks the recursion.
--
-- Note: the app's server actions connect with the postgres role via
-- DATABASE_URL, which BYPASSES RLS; their authorization is enforced in
-- code (app/actions/members.ts checks leagues.commissioner_id). These
-- policies protect the Supabase client (anon/authenticated roles) and any
-- direct PostgREST access.
-- =============================================================================

-- ---------- helper functions ----------

CREATE OR REPLACE FUNCTION public.is_league_member(p_league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members lm
    WHERE lm.league_id = p_league_id
      AND lm.user_id = auth.uid()
      AND lm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_league_commissioner(p_league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.id = p_league_id
      AND l.commissioner_id = auth.uid()
  );
$$;

-- Never callable from anon (unauthenticated PostgREST must not probe
-- rosters); authenticated only.
REVOKE EXECUTE ON FUNCTION public.is_league_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_league_commissioner(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_league_member(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_league_commissioner(uuid) TO authenticated;

-- ---------- league_members policies ----------

ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "league_members_select_same_league" ON public.league_members;
CREATE POLICY "league_members_select_same_league"
  ON public.league_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_league_member(league_id)
    OR public.is_league_commissioner(league_id)
  );

DROP POLICY IF EXISTS "league_members_insert_commissioner" ON public.league_members;
CREATE POLICY "league_members_insert_commissioner"
  ON public.league_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_league_commissioner(league_id));

-- UPDATE doubles as the "remove member" path (status -> 'removed').
-- A policy cannot compare NEW against OLD, so cross-league re-parenting by
-- a commissioner of both leagues is not expressible here; the app's server
-- action scopes its UPDATE by (id, league_id), and Phase 2's permission
-- model owns stronger constraints.
DROP POLICY IF EXISTS "league_members_update_commissioner" ON public.league_members;
CREATE POLICY "league_members_update_commissioner"
  ON public.league_members
  FOR UPDATE
  TO authenticated
  USING (public.is_league_commissioner(league_id))
  WITH CHECK (public.is_league_commissioner(league_id));

DROP POLICY IF EXISTS "league_members_delete_commissioner" ON public.league_members;
CREATE POLICY "league_members_delete_commissioner"
  ON public.league_members
  FOR DELETE
  TO authenticated
  USING (public.is_league_commissioner(league_id));
