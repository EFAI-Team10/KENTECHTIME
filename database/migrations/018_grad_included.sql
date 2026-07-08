-- 018: 대학원 과목(EE)을 졸업학점에 포함할지 사용자가 선택할 수 있도록 completed_courses에 컬럼 추가
ALTER TABLE completed_courses ADD COLUMN IF NOT EXISTS grad_included BOOLEAN NOT NULL DEFAULT true;
