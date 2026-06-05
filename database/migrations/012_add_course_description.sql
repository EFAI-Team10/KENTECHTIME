-- Migration 012: courses 테이블에 description 컬럼 추가
ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT;
