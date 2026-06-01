-- courses.credits: INTEGER → NUMERIC(4,1)
-- 0.5학점 과목(RC_Student_Led 등) 지원을 위해 소수점 1자리 허용
ALTER TABLE courses ALTER COLUMN credits TYPE NUMERIC(4,1);
