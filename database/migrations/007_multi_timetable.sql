-- 007: 여러 개의 '내 시간표' 지원 + 경쟁률 반영 대상(확정 시간표) 관리
-- planned_schedules 에 slot 추가 (한 학기에 여러 시간표를 슬롯으로 구분)
-- active_schedule: 사용자별 학기별 '확정'된 슬롯 (경쟁률 집계 대상)

ALTER TABLE planned_schedules
  ADD COLUMN IF NOT EXISTS slot SMALLINT NOT NULL DEFAULT 0;

-- 기존 PK (user_id, course_id, semester) → slot 포함으로 교체
ALTER TABLE planned_schedules DROP CONSTRAINT IF EXISTS planned_schedules_pkey;
ALTER TABLE planned_schedules
  ADD PRIMARY KEY (user_id, course_id, semester, slot);

-- 확정 시간표(슬롯) 테이블
CREATE TABLE IF NOT EXISTS active_schedule (
  user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  semester VARCHAR(20),
  slot     SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, semester)
);

CREATE INDEX IF NOT EXISTS idx_planned_schedules_slot ON planned_schedules(user_id, semester, slot);

-- 서비스 롤/REST 역할에 접근 권한 부여 (SQL Editor로 생성한 테이블은 자동 GRANT가 안 될 수 있음)
GRANT ALL PRIVILEGES ON TABLE active_schedule TO service_role, authenticated, anon;
