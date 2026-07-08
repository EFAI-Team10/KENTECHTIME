-- 017: 과목별 담당 교수명 저장 (개설교과목 리스트의 '대표교수명' 열)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS professor VARCHAR(50);
