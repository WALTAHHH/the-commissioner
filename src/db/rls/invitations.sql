-- =============================================================================
-- RLS policies for invitations (Phase 1 / T3)
-- Apply in the Supabase SQL editor AFTER the drizzle-generated migration
-- (0002_tired_ezekiel_stane.sql, invitations). Idempotent: safe to re-run.
--
-- Model:
--   * SELECT  — anyone (anon too): an invite link is meant to be opened by a
--               signed-out visitor. Only still-redeemable rows are visible, so
--               revoked/expired links leak nothing.
--   * INSERT  — only the league's commissioner.
--   * UPDATE  — only the league's commissioner (the app only ever sets
--               revoked_at; use_count is bumped by the server action).
--   * DELETE  — only the league's commissioner (no UI does this yet).
--
-- Residual risk, deliberate for Phase 1: because anon may SELECT, anyone who
-- can reach PostgREST with the anon key can list *live* invitation tokens and
-- then redeem them. That is inherent to "anyone can read invitations by token"
-- on a capability-token table. Hardening options for a later card: expose the
-- link through a SECURITY DEFINER function / view that takes the token as an
-- argument and never returns it, or store a hash and reveal only on match.
--
-- Note: the app's server actions connect with the postgres role via
-- DATABASE_URL, which BYPASSES RLS. These policies protect the Supabase client
-- (anon/authenticated) and any direct PostgREST access.
-- =============================================================================

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Explicit privileges so behaviour does not depend on the project's default
-- privilege era. RLS below still restricts rows: anon/authenticated see only
-- redeemable rows; only the league's commissioner can write.
GRANT SELECT ON public.invitations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.invitations TO authenticated;

-- ---------- read: the public invite page (anonymous visitors included) ----------
DROP POLICY IF EXISTS "invitations_select_redeemable" ON public.invitations;
CREATE POLICY "invitations_select_redeemable"
  ON public.invitations
  FOR SELECT
  TO anon, authenticated
  USING (revoked_at IS NULL AND expires_at > now());

-- ---------- write: commissioner only ----------
DROP POLICY IF EXISTS "invitations_insert_commissioner" ON public.invitations;
CREATE POLICY "invitations_insert_commissioner"
  ON public.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = invitations.league_id
        AND l.commissioner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invitations_update_commissioner" ON public.invitations;
CREATE POLICY "invitations_update_commissioner"
  ON public.invitations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = invitations.league_id
        AND l.commissioner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = invitations.league_id
        AND l.commissioner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invitations_delete_commissioner" ON public.invitations;
CREATE POLICY "invitations_delete_commissioner"
  ON public.invitations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = invitations.league_id
        AND l.commissioner_id = auth.uid()
    )
  );

-- NOTE: deliberately no changes to public.leagues policies here. Member-scoped
-- league reads are owned by the permission-model card (see rls/leagues.sql);
-- the invite page resolves the league name through the server action path,
-- which connects as the postgres role and is not subject to RLS.
