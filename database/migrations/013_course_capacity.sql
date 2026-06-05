-- 013: 과목별 수강 제한 인원
ALTER TABLE courses ADD COLUMN IF NOT EXISTS capacity INTEGER;
