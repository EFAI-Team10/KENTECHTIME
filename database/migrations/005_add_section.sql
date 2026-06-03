-- courses 테이블에 section 컬럼 추가 및 고유 키 변경
-- code 단독 UNIQUE → (code, semester, section) 복합 UNIQUE
-- 분반별 시간표를 개별 행으로 저장하기 위함

ALTER TABLE courses ADD COLUMN IF NOT EXISTS section VARCHAR(10) NOT NULL DEFAULT '01';

-- 기존 code 단독 UNIQUE 제약 제거
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_code_key;

-- 새 복합 UNIQUE 제약 추가
ALTER TABLE courses ADD CONSTRAINT courses_code_semester_section_key
  UNIQUE (code, semester, section);

-- 인덱스 추가 (코드별 조회 성능)
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
