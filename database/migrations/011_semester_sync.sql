-- 011: 학기차 자동 증가 + 학년 동기화

-- 전역 메타 (학기차 동기화 기준 학기 저장)
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
GRANT ALL PRIVILEGES ON TABLE app_meta TO service_role, authenticated, anon;

-- 학년 = CEIL(학기차 / 2) 자동 동기화 트리거 (학기차 변경 시 학년 재계산)
CREATE OR REPLACE FUNCTION sync_grade_from_semester() RETURNS trigger AS $$
BEGIN
  IF NEW.semester IS NOT NULL THEN
    NEW.grade := LEAST(4, GREATEST(1, CEIL(NEW.semester::numeric / 2)));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_grade ON users;
CREATE TRIGGER trg_sync_grade
  BEFORE INSERT OR UPDATE OF semester ON users
  FOR EACH ROW EXECUTE FUNCTION sync_grade_from_semester();

-- 기존 사용자 학년을 학기차 기준으로 재동기화 (트리거 발동)
UPDATE users SET semester = semester WHERE semester IS NOT NULL;

-- 전 사용자 학기차 +1 (최대 8) — 새 학기 개설교과목 업로드 시 호출
CREATE OR REPLACE FUNCTION fn_advance_all_semesters() RETURNS void AS $$
  UPDATE users SET semester = LEAST(semester + 1, 8)
  WHERE semester IS NOT NULL AND semester < 8;
$$ LANGUAGE sql;

-- 동기화 기준 학기 초기화 (현재 최신 정규학기 = 봄/가을)
INSERT INTO app_meta(key, value)
VALUES ('synced_semester', (
  SELECT semester FROM courses
  WHERE semester ~ '^[0-9]{4}-(spring|fall)$'
  ORDER BY substring(semester from 1 for 4) DESC,
           CASE WHEN semester LIKE '%-fall' THEN 1 ELSE 0 END DESC
  LIMIT 1
))
ON CONFLICT (key) DO NOTHING;
