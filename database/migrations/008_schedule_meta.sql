-- 008: 내 시간표(슬롯)별 사용자 지정 이름 저장
CREATE TABLE IF NOT EXISTS schedule_meta (
  user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  semester VARCHAR(20),
  slot     SMALLINT NOT NULL DEFAULT 0,
  name     VARCHAR(40),
  PRIMARY KEY (user_id, semester, slot)
);

GRANT ALL PRIVILEGES ON TABLE schedule_meta TO service_role, authenticated, anon;
