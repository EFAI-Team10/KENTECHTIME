-- fn_delete_user: atomic deletion of all user data after Google re-auth verification
-- Called via supabase.rpc('fn_delete_user', {p_user_id, p_google_sub}) in app/api/users/me/route.js
CREATE OR REPLACE FUNCTION fn_delete_user(
  p_user_id    INT,
  p_google_sub TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_google_sub TEXT;
BEGIN
  SELECT google_sub INTO v_google_sub FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF v_google_sub IS DISTINCT FROM p_google_sub THEN
    RAISE EXCEPTION 'SUB_MISMATCH';
  END IF;

  DELETE FROM reviews           WHERE user_id = p_user_id;
  DELETE FROM planned_schedules WHERE user_id = p_user_id;
  DELETE FROM completed_courses WHERE user_id = p_user_id;
  DELETE FROM user_preferences  WHERE user_id = p_user_id;
  DELETE FROM users             WHERE id      = p_user_id;
END;
$$;
