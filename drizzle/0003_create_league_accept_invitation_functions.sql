CREATE OR REPLACE FUNCTION create_league(
    p_name text,
    p_slug text,
    p_sport text DEFAULT 'football',
    p_format text DEFAULT 'redraft',
    p_commissioner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_league_id uuid;
    v_season_year integer;
BEGIN
    -- Insert league
    INSERT INTO leagues (name, slug, sport, format, commissioner_id)
    VALUES (p_name, p_slug, p_sport, p_format, p_commissioner_id)
    RETURNING id INTO v_league_id;

    -- Insert commissioner membership
    INSERT INTO league_members (league_id, user_id, role, status)
    VALUES (v_league_id, p_commissioner_id, 'commissioner', 'active');

    -- Insert current season
    v_season_year := extract(year from current_date);
    INSERT INTO league_seasons (league_id, season_year, is_current)
    VALUES (v_league_id, v_season_year, true);

    RETURN v_league_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accept_invitation(
    p_token text,
    p_user_id uuid
) RETURNS TABLE (
    status text,
    league_id uuid,
    league_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation invitations;
    v_league leagues;
    v_member league_members;
    v_should_increment boolean := false;
BEGIN
    -- Lock the invitation row for update
    SELECT * INTO v_invitation FROM invitations WHERE token = p_token FOR UPDATE;
    IF NOT FOUND THEN
        status := 'invalid';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check validity
    IF v_invitation.revoked_at IS NOT NULL OR v_invitation.expires_at <= NOW() THEN
        status := 'invalid';
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_invitation.max_uses IS NOT NULL AND v_invitation.use_count >= v_invitation.max_uses THEN
        status := 'invalid';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Get league
    SELECT * INTO v_league FROM leagues WHERE id = v_invitation.league_id;
    IF NOT FOUND THEN
        status := 'invalid';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check existing membership
    SELECT * INTO v_member FROM league_members
    WHERE league_id = v_invitation.league_id AND user_id = p_user_id;

    IF FOUND THEN
        IF v_member.status = 'active' THEN
            -- Already active member, do not burn a use
            status := 'already_member';
            league_id := v_league.id;
            league_name := v_league.name;
            RETURN NEXT;
            RETURN;
        ELSE
            -- Reactivate
            UPDATE league_members SET status = 'active'
            WHERE id = v_member.id
            RETURNING * INTO v_member;
            v_should_increment := true;
        END IF;
    ELSE
        -- Insert new member
        INSERT INTO league_members (league_id, user_id, role, status)
        VALUES (v_invitation.league_id, p_user_id, 'member', 'active')
        RETURNING * INTO v_member;
        v_should_increment := true;
    END IF;

    -- Increment use_count only when we actually added/reactivated a membership
    IF v_should_increment THEN
        UPDATE invitations SET use_count = use_count + 1 WHERE token = p_token;
    END IF;

    status := CASE WHEN v_member.status = 'active' THEN 'joined' ELSE 'reactivated' END;
    league_id := v_league.id;
    league_name := v_league.name;
    RETURN NEXT;
END;
$$;
--> statement-breakpoint