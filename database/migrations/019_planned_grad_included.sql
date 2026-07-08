-- 019: 내 시간표(planned_schedules)에 추가한 대학원(EE) 과목도 졸업요건 대시보드의
-- 이수예정 학점 미리보기에 포함할지 사용자가 선택할 수 있도록 컬럼 추가
ALTER TABLE planned_schedules ADD COLUMN IF NOT EXISTS grad_included BOOLEAN NOT NULL DEFAULT true;
