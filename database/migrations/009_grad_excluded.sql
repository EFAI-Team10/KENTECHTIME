-- 009: 개설교과목 '비고' 열의 '졸업학점 미포함' 과목을 졸업학점 계산에서 제외
ALTER TABLE courses ADD COLUMN IF NOT EXISTS grad_excluded BOOLEAN NOT NULL DEFAULT false;
