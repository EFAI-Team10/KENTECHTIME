-- fn_register_user: atomic user registration + completed courses + preferences
-- Called via supabase.rpc('fn_register_user', {...}) in app/api/auth/google/register/route.js
CREATE OR REPLACE FUNCTION fn_register_user(
  p_email            TEXT,
  p_name             TEXT,
  p_student_id       TEXT,
  p_semester         INT,
  p_google_sub       TEXT,
  p_course_ids       INT[]   DEFAULT '{}',
  p_preferred_tracks TEXT[]  DEFAULT '{}',
  p_avoid_morning    BOOLEAN DEFAULT FALSE,
  p_preferred_gap    INT     DEFAULT 60,
  p_day_off          TEXT[]  DEFAULT '{}'
)
RETURNS TABLE (
  id         INT,
  email      TEXT,
  name       TEXT,
  role       TEXT,
  semester   INT,
  student_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id INT;
  v_grade   INT;
  v_course  INT;
BEGIN
  -- Guard: bounce if already registered
  IF EXISTS (
    SELECT 1 FROM users u WHERE u.google_sub = p_google_sub OR u.email = p_email
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_USER';
  END IF;

  v_grade := CEIL(p_semester::NUMERIC / 2);

  INSERT INTO users (email, name, student_id, grade, semester, google_sub, role)
  VALUES (p_email, p_name, p_student_id, v_grade, p_semester, p_google_sub, 'student')
  RETURNING users.id INTO v_user_id;

  FOREACH v_course IN ARRAY p_course_ids LOOP
    INSERT INTO completed_courses (user_id, course_id)
    VALUES (v_user_id, v_course)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END LOOP;

  INSERT INTO user_preferences (user_id, preferred_tracks, avoid_morning, preferred_gap, day_off)
  VALUES (v_user_id, p_preferred_tracks, p_avoid_morning, p_preferred_gap, p_day_off)
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_tracks = EXCLUDED.preferred_tracks,
    avoid_morning    = EXCLUDED.avoid_morning,
    preferred_gap    = EXCLUDED.preferred_gap,
    day_off          = EXCLUDED.day_off;

  RETURN QUERY
    SELECT u.id, u.email::TEXT, u.name::TEXT, u.role::TEXT, u.semester, u.student_id::TEXT
    FROM users u WHERE u.id = v_user_id;
END;
$$;
