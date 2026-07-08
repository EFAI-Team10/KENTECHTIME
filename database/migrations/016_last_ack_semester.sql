-- 016: 학기 전환 알림 확인 여부 저장
-- 사용자가 마지막으로 "수강이력 갱신" 알림을 확인(또는 처리)한 학기를 기록.
-- 이 값이 현재 학기(app_meta.synced_semester)와 다르면 프론트에서 알림 배너를 띄운다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ack_semester VARCHAR(20);
