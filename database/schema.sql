CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(100) UNIQUE NOT NULL,
  name          VARCHAR(50),
  student_id    VARCHAR(20),
  grade         INTEGER,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE courses (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  credits       INTEGER,
  track         VARCHAR(50),
  category      VARCHAR(10),
  semester      VARCHAR(10),
  target_grade  INTEGER,
  timeslots     JSONB
);

CREATE TABLE prerequisites (
  course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  required_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, required_id)
);

CREATE TABLE completed_courses (
  user_id   INTEGER REFERENCES users(id),
  course_id INTEGER REFERENCES courses(id),
  semester  VARCHAR(10),
  grade     VARCHAR(5),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE user_preferences (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id),
  preferred_tracks TEXT[],
  avoid_morning    BOOLEAN DEFAULT FALSE,
  preferred_gap    INTEGER DEFAULT 60,
  day_off          TEXT[]
);

CREATE TABLE planned_schedules (
  user_id   INTEGER REFERENCES users(id),
  course_id INTEGER REFERENCES courses(id),
  semester  VARCHAR(10),
  PRIMARY KEY (user_id, course_id, semester)
);

CREATE TABLE reviews (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  course_id  INTEGER REFERENCES courses(id),
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  content    TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

-- 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_completed_courses_user_id  ON completed_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_planned_schedules_user_id  ON planned_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_planned_schedules_semester  ON planned_schedules(semester);
CREATE INDEX IF NOT EXISTS idx_courses_semester            ON courses(semester);
CREATE INDEX IF NOT EXISTS idx_courses_category            ON courses(category);
CREATE INDEX IF NOT EXISTS idx_prerequisites_course_id    ON prerequisites(course_id);
