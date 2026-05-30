import { getSupabaseAdmin } from './supabase.js';

async function getRequiredCourses(userId, semester) {
  const supabase = getSupabaseAdmin();

  const { data: completed } = await supabase
    .from('completed_courses')
    .select('course_id')
    .eq('user_id', userId);

  const completedIds = (completed || []).map(r => r.course_id);

  let query = supabase
    .from('courses')
    .select('*')
    .in('category', ['VC', 'EF', 'EL'])
    .or(`semester.eq.${semester},semester.eq.both`)
    .order('target_grade');

  if (completedIds.length > 0) {
    query = query.not('id', 'in', `(${completedIds.join(',')})`);
  }

  const { data } = await query;
  return data || [];
}

async function checkPrerequisites(userId, courseList) {
  const supabase = getSupabaseAdmin();

  const { data: completed } = await supabase
    .from('completed_courses')
    .select('course_id')
    .eq('user_id', userId);

  const completedIds = new Set((completed || []).map(r => r.course_id));

  const courseIds = courseList.map(c => c.id);
  const { data: allPrereqs } = await supabase
    .from('prerequisites')
    .select('course_id, required_id')
    .in('course_id', courseIds);

  const prereqMap = {};
  for (const row of allPrereqs || []) {
    if (!prereqMap[row.course_id]) prereqMap[row.course_id] = [];
    prereqMap[row.course_id].push(row.required_id);
  }

  return courseList.filter(course => {
    const prereqs = prereqMap[course.id] || [];
    return prereqs.every(id => completedIds.has(id));
  });
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

function applyIntent(courses, intent) {
  if (!intent) return courses;
  let result = [...courses];

  if (intent.remove_codes?.length) {
    result = result.filter(c => !intent.remove_codes.includes(c.code));
  }
  if (intent.exclude_days?.length) {
    result = result.filter(c =>
      !(c.timeslots || []).some(s => intent.exclude_days.includes(s.day))
    );
  }
  if (intent.exclude_before) {
    result = result.filter(c =>
      !(c.timeslots || []).some(s => s.start < intent.exclude_before)
    );
  }
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

export async function generateRecommendations(userId, semester, preferences = {}, n = 3, intent = null) {
  const required = await getRequiredCourses(userId, semester);
  const eligible = await checkPrerequisites(userId, required);
  let filtered = applyHardConstraints(eligible, preferences);
  filtered = applyIntent(filtered, intent);

  const plans = [];
  for (let i = 0; i < n; i++) {
    const usedCodes = new Set(plans.flatMap(p => p.map(c => c.code)));
    const fresh = filtered.filter(c => !usedCodes.has(c.code));
    const reused = filtered.filter(c => usedCodes.has(c.code));
    plans.push(buildPlan([...fresh, ...reused]));
  }
  return plans;
}
