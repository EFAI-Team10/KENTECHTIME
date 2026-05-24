const db = require('../models/db');

async function getRequiredCourses(userId, semester) {
  const result = await db.query(
    `SELECT c.* FROM courses c
     WHERE (c.semester = $1 OR c.semester = 'both')
       AND c.id NOT IN (
         SELECT course_id FROM completed_courses WHERE user_id = $2
       )
       AND c.category IN ('VC', 'EF', 'EL')
     ORDER BY c.target_grade`,
    [semester, userId]
  );
  return result.rows;
}

async function checkPrerequisites(userId, courseList) {
  const completedResult = await db.query(
    'SELECT course_id FROM completed_courses WHERE user_id = $1',
    [userId]
  );
  const completedIds = new Set(completedResult.rows.map(r => r.course_id));

  const eligible = [];
  for (const course of courseList) {
    const prereqResult = await db.query(
      'SELECT required_id FROM prerequisites WHERE course_id = $1',
      [course.id]
    );
    const prereqs = prereqResult.rows.map(r => r.required_id);
    const satisfied = prereqs.every(id => completedIds.has(id));
    if (satisfied) eligible.push(course);
  }
  return eligible;
}

function hasTimeConflict(courseA, courseB) {
  const slotsA = courseA.timeslots || [];
  const slotsB = courseB.timeslots || [];
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (a.day === b.day && a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
}

function applyHardConstraints(courses, preferences = {}) {
  return courses.filter(course => {
    if (preferences.avoid_morning) {
      const hasMorning = (course.timeslots || []).some(s => s.start < '09:30');
      if (hasMorning) return false;
    }
    if (preferences.day_off?.length) {
      const hasOffDay = (course.timeslots || []).some(s =>
        preferences.day_off.includes(s.day)
      );
      if (hasOffDay) return false;
    }
    return true;
  });
}

// LLM intent를 과목 목록에 실제 적용
function applyIntent(courses, intent) {
  if (!intent) return courses;
  let result = [...courses];

  // 특정 과목코드 제거
  if (intent.remove_codes?.length) {
    result = result.filter(c => !intent.remove_codes.includes(c.code));
  }

  // 특정 요일 수업 제외
  if (intent.exclude_days?.length) {
    result = result.filter(c =>
      !(c.timeslots || []).some(s => intent.exclude_days.includes(s.day))
    );
  }

  // 특정 시간 이전 수업 제외 (예: "09:30" → 9:30 이전 수업 제외)
  if (intent.exclude_before) {
    result = result.filter(c =>
      !(c.timeslots || []).some(s => s.start < intent.exclude_before)
    );
  }

  // 특정 과목 우선 배치 (맨 앞으로 이동)
  if (intent.include_codes?.length) {
    const prioritized = result.filter(c => intent.include_codes.includes(c.code));
    const rest = result.filter(c => !intent.include_codes.includes(c.code));
    result = [...prioritized, ...rest];
  }

  return result;
}

function buildPlan(candidates, maxCredits = 21) {
  const plan = [];
  let totalCredits = 0;
  for (const course of candidates) {
    if (totalCredits + course.credits > maxCredits) continue;
    const conflict = plan.some(c => hasTimeConflict(c, course));
    if (!conflict) {
      plan.push(course);
      totalCredits += course.credits;
    }
  }
  return plan;
}

async function generateRecommendations(userId, semester, preferences = {}, n = 3, intent = null) {
  const required = await getRequiredCourses(userId, semester);
  const eligible = await checkPrerequisites(userId, required);
  let filtered = applyHardConstraints(eligible, preferences);

  // LLM intent 적용
  filtered = applyIntent(filtered, intent);

  return Array.from({ length: n }, (_, i) => {
    const rotated = [...filtered.slice(i * 2), ...filtered.slice(0, i * 2)];
    return buildPlan(rotated);
  });
}

module.exports = { generateRecommendations };
