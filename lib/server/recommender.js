import { getSupabaseAdmin } from './supabase.js';

const SEMESTER_RANK = { spring: 1, summer: 2, fall: 3, winter: 4 };
function semesterSortKey(s) {
  const [year, term] = (s || '').split('-');
  return parseInt(year || 0) * 10 + (SEMESTER_RANK[term] || 0);
}

export async function getLatestSemester(supabase) {
  if (process.env.CURRENT_SEMESTER) return process.env.CURRENT_SEMESTER;
  const { data } = await supabase.from('courses').select('semester');
  const semesters = [...new Set((data || []).map(r => r.semester).filter(Boolean))];
  return semesters.sort((a, b) => semesterSortKey(b) - semesterSortKey(a))[0] || null;
}

// 필수 졸업학점 영역 (RC체육·GR 제외, FR은 2순위)
const MANDATORY_CATS = ['VC', 'EF', 'EL', 'MN', 'HASS', 'ESP', 'IR', 'CAPS', 'EN', 'RC'];
// 선호도로 채우는 자유 영역
const ELECTIVE_CATS  = ['FR', 'MN', 'HASS', 'EN', 'EL'];

// 졸업학점 미포함 RC 과목 (체육) — 추천에서도 제외
const RC_EXCLUDED_CODES = new Set(['RC1011', 'RC1012', 'RC1013']);
// 1학년 전용 과목
const VC_ONLY_GRADE = 1;

// ESP 단계 정의 (순서대로)
const ESP_STAGES = [
  ['ES1001', 'ES1002'],   // 입문
  ['ES2001', 'ES2002'],   // 중급
  ['ES3001', 'ES3002'],   // 고급
];

// 기수강 코드 기준으로 다음에 들어야 할 ESP 코드 집합 반환
function getEspNextStageCodes(completedCodes) {
  const completed = new Set(completedCodes);
  // 완료된 최고 단계 탐색 (두 과목 모두 이수한 경우만 단계 완료로 인정)
  let maxDone = -1;
  for (let i = 0; i < ESP_STAGES.length; i++) {
    if (ESP_STAGES[i].every(c => completed.has(c))) maxDone = i;
  }
  // 모든 단계 완료 → ESP 추천 불필요
  if (maxDone === ESP_STAGES.length - 1) return new Set();
  // 다음 단계 코드 반환
  return new Set(ESP_STAGES[maxDone + 1]);
}

async function getCompletedCodes(userId, supabase) {
  const { data: completed } = await supabase
    .from('completed_courses').select('course_id').eq('user_id', userId);
  const completedIds = (completed || []).map(r => r.course_id);
  if (completedIds.length === 0) return [];
  const { data: codeData } = await supabase
    .from('courses').select('code').in('id', completedIds);
  return [...new Set((codeData || []).map(r => r.code).filter(Boolean))];
}

function filterCourses(courses, userGrade, espNextCodes) {
  return courses.filter(c => {
    // RC 체육 제외
    if (RC_EXCLUDED_CODES.has(c.code)) return false;

    // ESP: 다음 단계 코드만 허용 (시간표 있는 분반)
    if (c.category === 'ESP') {
      const hasTimeslot = (c.timeslots || []).length > 0;
      return espNextCodes.has(c.code) && hasTimeslot;
    }

    // 시간표 없거나 0학점인 과목 제외 (IR 개별연구 등)
    const hasTimeslot = (c.timeslots || []).length > 0;
    const hasCredits  = Number(c.credits) > 0;
    if (!hasTimeslot || !hasCredits) return false;

    // 학년 정보 없으면 누구나 가능
    if (!c.target_grade || c.target_grade === 0) return true;

    // VC는 1학년 전용
    if (c.category === 'VC' && userGrade > VC_ONLY_GRADE) return false;

    // 권장 학년이 사용자 학년보다 낮은 과목 제외
    if (c.target_grade < userGrade) return false;

    return true;
  });
}

async function getRequiredCourses(userId, preferences = {}) {
  const supabase = getSupabaseAdmin();

  const [completedCodes, semester, userRow] = await Promise.all([
    getCompletedCodes(userId, supabase),
    getLatestSemester(supabase),
    supabase.from('users').select('grade').eq('id', userId).maybeSingle(),
  ]);

  if (!semester) return { mandatory: [], elective: [], userGrade: 1 };

  const userGrade      = userRow?.data?.grade || 1;
  const espNextCodes   = getEspNextStageCodes(completedCodes);

  const buildQuery = (cats) => {
    let q = supabase
      .from('courses')
      .select('*')
      .in('category', cats)
      .eq('semester', semester)
      .order('target_grade');
    if (completedCodes.length > 0) {
      q = q.not('code', 'in', `(${completedCodes.join(',')})`);
    }
    return q;
  };

  const { data: rawMandatory } = await buildQuery(MANDATORY_CATS);
  const mandatory = filterCourses(rawMandatory || [], userGrade, espNextCodes);

  const electiveCats = preferences.elective_cats?.length
    ? preferences.elective_cats
    : ELECTIVE_CATS;
  const { data: rawElective } = await buildQuery(electiveCats);
  const elective = filterCourses(rawElective || [], userGrade, espNextCodes);

  return { mandatory, elective, userGrade };
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

const MIN_CREDITS = 10; // 한 학기 최소 이수 학점 (졸업 전 막학기 예외: 4학점)

function buildPlan(candidates, maxCredits = 21, minCredits = MIN_CREDITS) {
  const plan = [];
  const usedCodes = new Set();
  let totalCredits = 0;
  for (const course of candidates) {
    if (usedCodes.has(course.code)) continue;
    if (totalCredits + course.credits > maxCredits) continue;
    const conflict = plan.some(c => hasTimeConflict(c, course));
    if (!conflict) {
      plan.push(course);
      usedCodes.add(course.code);
      totalCredits += course.credits;
    }
  }
  // 최소 학점 미달 시 후보에서 추가 시도 (시간 충돌 없는 과목만)
  if (totalCredits < minCredits) {
    for (const course of candidates) {
      if (totalCredits >= minCredits) break;
      if (usedCodes.has(course.code)) continue;
      if (totalCredits + course.credits > maxCredits) continue;
      const conflict = plan.some(c => hasTimeConflict(c, course));
      if (!conflict) {
        plan.push(course);
        usedCodes.add(course.code);
        totalCredits += course.credits;
      }
    }
  }
  return plan;
}

// 추천 정렬: 내 학년 과목 → 공통(0학년) → 상위 학년 순
function sortByGrade(courses, userGrade) {
  return [...courses].sort((a, b) => {
    const rankOf = g => g === userGrade ? 0 : g === 0 ? 1 : g > userGrade ? 2 : 3;
    return rankOf(a.target_grade) - rankOf(b.target_grade);
  });
}

export async function generateRecommendations(userId, _semester, preferences = {}, n = 3, intent = null, maxCredits = 21) {
  const { mandatory, elective, userGrade } = await getRequiredCourses(userId, preferences);

  const eligibleMandatory = await checkPrerequisites(userId, mandatory);
  const eligibleElective  = await checkPrerequisites(userId, elective);

  let filteredMandatory = applyHardConstraints(eligibleMandatory, preferences);
  let filteredElective  = applyHardConstraints(eligibleElective,  preferences);

  // 내 학년 과목 우선 정렬
  filteredMandatory = sortByGrade(filteredMandatory, userGrade);
  filteredElective  = sortByGrade(filteredElective,  userGrade);

  filteredMandatory = applyIntent(filteredMandatory, intent);
  filteredElective  = applyIntent(filteredElective,  intent);

  // 막학기 여부: preferences.last_semester = true이면 최소 4학점만 충족
  const minCredits = preferences.last_semester ? 4 : MIN_CREDITS;

  const plans = [];
  for (let i = 0; i < n; i++) {
    const usedCodes = new Set(plans.flatMap(p => p.map(c => c.code)));

    // 1단계: 필수 영역 (VC/EF/EL/MN/HASS/ESP/IR/CAPS/EN/RC)
    const freshMandatory  = filteredMandatory.filter(c => !usedCodes.has(c.code));
    const reusedMandatory = filteredMandatory.filter(c =>  usedCodes.has(c.code));
    const plan = buildPlan([...freshMandatory, ...reusedMandatory], maxCredits, minCredits);

    // 2단계: 남은 학점을 선호 자유 영역으로 채우기
    const usedInPlan = new Set(plan.map(c => c.code));
    const usedAll    = new Set([...usedCodes, ...usedInPlan]);
    const remaining  = maxCredits - plan.reduce((s, c) => s + (Number(c.credits) || 0), 0);
    if (remaining > 0) {
      const freshElective = filteredElective.filter(c => !usedAll.has(c.code));
      const extra = buildPlan(freshElective, remaining, 0); // 자유 영역은 최소학점 제약 없음
      plan.push(...extra);
    }

    plans.push(plan);
  }
  return plans;
}
