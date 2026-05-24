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

async function generateRecommendations(userId, semester, preferences = {}, n = 3) {
  const required = await getRequiredCourses(userId, semester);
  const eligible = await checkPrerequisites(userId, required);
  const filtered = applyHardConstraints(eligible, preferences);

  return Array.from({ length: n }, (_, i) => {
    const rotated = [...filtered.slice(i * 2), ...filtered.slice(0, i * 2)];
    return buildPlan(rotated);
  });
}

module.exports = { generateRecommendations };
