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

// [Fix1] 카테고리별 졸업 요건 학점 (충족 시 해당 카테고리 추천 제외)
const CAT_GRAD_REQ = { VC:8, EF:28, EL:40, MN:16, HASS:4, IR:4, CAPS:4, EN:4, RC:4 };

// [Fix15] EF 세부영역 코드 집합 + 영역별 필수 학점 (requirements/route.js와 동일)
const EF_SUBSETS = {
  math:    new Set(['EF1001','EF1008','EF1009','EF1011','EF1012','EF1013','EF1014','EF1015','EF1016','EF1017','EF2007','EF2008','EF2031','EF2032','EF2033']),
  physics: new Set(['EF1004','EF1005','EF1051','EF2004','EF2036']),
  chem:    new Set(['EF1002','EF1006','EF1007','EF2002','EF2005','EF2034']),
  dl:      new Set(['EF1003','EF2003','EF2006','EF2035','EF2039']),
};
const EF_SUB_REQ = { math:8, physics:4, chem:4, dl:4 };
function efSubOf(code) {
  for (const [sub, set] of Object.entries(EF_SUBSETS)) {
    if (set.has(code)) return sub;
  }
  return null;
}

// [Fix1] 코드 prefix → 카테고리 변환 (requirements/route.js와 동일 로직)
const PREFIX_TO_CAT = {
  EF:'EF', EL:'EL', EN:'EN', ES:'ESP', FR:'FR', GR:'GR',
  HA:'HASS', IR:'IR', MN:'MN', RC:'RC', VC:'VC', CA:'CAPS', GS:'EL',
};
function resolveCategory(code, stored) {
  // AP 학점 코드(예: F000017)는 저장 카테고리와 무관하게 EF로 인정
  if (/^[A-Z]\d{6}$/.test(String(code || ''))) return 'EF';
  const prefix = String(code || '').match(/^[A-Z]+/)?.[0] ?? '';
  for (let l = prefix.length; l >= 1; l--) {
    const m = PREFIX_TO_CAT[prefix.slice(0, l)];
    if (m) return m;
  }
  return stored ?? 'EL';
}

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

// [Fix1] 기수강 정보: 코드 목록 + 카테고리별 이수 학점 + EL4/5 과목 수 한 번에 조회
async function getCompletedInfo(userId, supabase) {
  const { data } = await supabase
    .from('completed_courses')
    .select('courses(code, category, credits)')
    .eq('user_id', userId);

  const seenCodes    = new Set();
  const codes        = [];
  const earnedByCat  = {};
  const efSub        = { math:0, physics:0, chem:0, dl:0 }; // [Fix15]
  let   elUpperCount = 0;

  for (const row of (data || [])) {
    const { code, category, credits } = row.courses || {};
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    codes.push(code);

    const cat = resolveCategory(code, category);
    if (CAT_GRAD_REQ[cat] !== undefined) {
      earnedByCat[cat] = (earnedByCat[cat] || 0) + Number(credits || 0);
    }
    if (cat === 'EL') {
      const level = parseInt(String(code).replace(/^EL/, '')[0]);
      if (level >= 4) elUpperCount++;
    }
    if (cat === 'EF') { // [Fix15] EF 세부영역 누적 (AP 코드는 세부영역 없음 → 무시)
      const sub = efSubOf(code);
      if (sub) efSub[sub] += Number(credits || 0);
    }
  }

  return { codes, earnedByCat, elUpperCount, efSub };
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

  const [completedInfo, semester, userRow] = await Promise.all([
    getCompletedInfo(userId, supabase),
    getLatestSemester(supabase),
    supabase.from('users').select('grade').eq('id', userId).maybeSingle(),
  ]);

  if (!semester) return { mandatory: [], elective: [], userGrade: 1, elUpperCount: 0 };

  const { codes: completedCodes, earnedByCat, elUpperCount, efSub } = completedInfo;
  const userGrade    = userRow?.data?.grade || 1;
  const espNextCodes = getEspNextStageCodes(completedCodes);

  // [Fix15] 이미 필수 학점을 채운 EF 세부영역 → 해당 영역 과목은 추천 제외
  const fulfilledEfSubs = new Set(
    Object.entries(EF_SUB_REQ)
      .filter(([sub, req]) => (efSub?.[sub] || 0) >= req)
      .map(([sub]) => sub)
  );
  const efSubFilter = (c) => {
    if (c.category !== 'EF') return true;
    const sub = efSubOf(c.code);
    return !(sub && fulfilledEfSubs.has(sub));
  };

  // [Fix1] 졸업 요건 충족 카테고리 — EL은 학점+EL4/5 모두 충족해야 완료
  const fulfilledCats = new Set(
    Object.entries(CAT_GRAD_REQ)
      .filter(([cat, req]) => {
        if (cat === 'EL') return (earnedByCat['EL'] || 0) >= req && elUpperCount >= 2;
        return (earnedByCat[cat] || 0) >= req;
      })
      .map(([cat]) => cat)
  );

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
  // [Fix1] 이미 충족한 카테고리 과목 제거
  const mandatory = filterCourses(rawMandatory || [], userGrade, espNextCodes)
    .filter(c => !fulfilledCats.has(c.category))
    .filter(efSubFilter); // [Fix15] 충족된 EF 세부영역 제외

  const electiveCats = preferences.elective_cats?.length
    ? preferences.elective_cats
    : ELECTIVE_CATS;
  const { data: rawElective } = await buildQuery(electiveCats);
  const elective = filterCourses(rawElective || [], userGrade, espNextCodes)
    .filter(c => !fulfilledCats.has(c.category));

  return { mandatory, elective, userGrade, elUpperCount };
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

// [Fix18] 'HH:MM' → 분 단위 정수
function toMinutes(t) {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// [Fix18] 같은 요일에 두 과목 사이 공강이 minGap(분) 미만이면 true
// (시간이 겹치는 경우는 hasTimeConflict가 따로 처리하므로 여기선 인접 간격만 검사)
function violatesMinGap(courseA, courseB, minGap) {
  if (!minGap || minGap <= 0) return false;
  for (const a of courseA.timeslots || []) {
    for (const b of courseB.timeslots || []) {
      if (a.day !== b.day) continue;
      const aS = toMinutes(a.start), aE = toMinutes(a.end);
      const bS = toMinutes(b.start), bE = toMinutes(b.end);
      // a가 먼저 끝나고 b가 시작 / 또는 그 반대 — 둘 사이 간격
      const gap = bS >= aE ? bS - aE : (aS >= bE ? aS - bE : -1);
      if (gap >= 0 && gap < minGap) return true;
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

function buildPlan(candidates, maxCredits = 21, minCredits = MIN_CREDITS, minGap = 0) {
  // 0학점(ESP 등)은 뒤로 밀어서 유학점 과목이 먼저 minCredits를 채우도록 정렬
  const sorted = [
    ...candidates.filter(c => Number(c.credits) > 0),
    ...candidates.filter(c => Number(c.credits) === 0),
  ];

  const plan = [];
  const usedCodes = new Set();
  let totalCredits = 0;

  for (const course of sorted) {
    if (usedCodes.has(course.code)) continue;
    if (totalCredits + Number(course.credits) > maxCredits) continue;
    // [Fix18] 시간 충돌 + 최소 공강 시간 위반 모두 회피
    const conflict = plan.some(c =>
      hasTimeConflict(c, course) || violatesMinGap(c, course, minGap)
    );
    if (!conflict) {
      plan.push(course);
      usedCodes.add(course.code);
      totalCredits += Number(course.credits);
    }
  }

  // 최소 학점 미달 시 유학점 후보에서 추가 시도
  if (totalCredits < minCredits) {
    for (const course of sorted) {
      if (totalCredits >= minCredits) break;
      if (usedCodes.has(course.code)) continue;
      if (Number(course.credits) === 0) continue; // 0학점은 minCredits 보충에 사용 안 함
      if (totalCredits + Number(course.credits) > maxCredits) continue;
      const conflict = plan.some(c => hasTimeConflict(c, course));
      if (!conflict) {
        plan.push(course);
        usedCodes.add(course.code);
        totalCredits += Number(course.credits);
      }
    }
  }

  return plan;
}

// DB에 '원자력'으로 저장된 과목은 '재료/화학'으로 통합
const normalizeTrack = (t) => t === '원자력' ? '재료/화학' : t;

// 추천 정렬: 내 학년 → 공통 → 상위 학년, EL은 선호 트랙 우선
function sortByGradeAndTrack(courses, userGrade, preferredTracks = []) {
  return [...courses].sort((a, b) => {
    const rankOf = g => g === userGrade ? 0 : g === 0 ? 1 : g > userGrade ? 2 : 3;
    const ga = rankOf(a.target_grade);
    const gb = rankOf(b.target_grade);
    if (ga !== gb) return ga - gb;

    // 같은 학년 그룹 내에서 EL 과목은 선호 트랙 순서로 세부 정렬
    if (a.category === 'EL' && b.category === 'EL') {
      const ia = preferredTracks.indexOf(normalizeTrack(a.track));
      const ib = preferredTracks.indexOf(normalizeTrack(b.track));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }
    return 0;
  });
}

// EL4/5 처리 (elUpperCount < 2일 때만)
// - 선호 트랙 있음: 비선호 트랙 EL4/5 완전 제거, 선호 트랙 EL4/5는 자연 순서 유지 (내 학년 EL 이후)
// - 선호 트랙 없음: 기존처럼 EL4/5 전체를 앞으로 배치
function bumpEL45(courses, elUpperCount, preferredTracks = []) {
  if (elUpperCount >= 2) return courses;
  const isUpper = c => {
    if (c.category !== 'EL') return false;
    const level = parseInt(String(c.code || '').replace(/^EL/, '')[0]);
    return level >= 4;
  };
  if (preferredTracks.length > 0) {
    return courses.filter(c => !isUpper(c) || preferredTracks.includes(normalizeTrack(c.track)));
  }
  return [...courses.filter(isUpper), ...courses.filter(c => !isUpper(c))];
}

// [Fix3] 소학점 필수 영역(각 4학점) — plan별로 재적용해 B·C 플랜에서도 보장
const PRIORITY_CATS = new Set(['HASS', 'EN', 'CAPS', 'IR']);

function bumpPriorityCats(courses) {
  const front = [];
  const rest  = [];
  const seen  = new Set();
  for (const c of courses) {
    if (PRIORITY_CATS.has(c.category) && !seen.has(c.category)) {
      front.push(c);
      seen.add(c.category);
    } else {
      rest.push(c);
    }
  }
  return [...front, ...rest];
}

export async function generateRecommendations(userId, _semester, preferences = {}, n = 3, intent = null, maxCredits = 21) {
  const { mandatory, elective, userGrade, elUpperCount } = await getRequiredCourses(userId, preferences);

  const eligibleMandatory = await checkPrerequisites(userId, mandatory);
  const eligibleElective  = await checkPrerequisites(userId, elective);

  let filteredMandatory = applyHardConstraints(eligibleMandatory, preferences);
  let filteredElective  = applyHardConstraints(eligibleElective,  preferences);

  const preferredTracks = preferences.preferred_tracks || [];
  // [Fix2] EL4/5 우선 → 이후 학년+트랙 정렬
  filteredMandatory = bumpEL45(
    sortByGradeAndTrack(filteredMandatory, userGrade, preferredTracks),
    elUpperCount,
    preferredTracks
  );
  filteredElective = sortByGradeAndTrack(filteredElective, userGrade, preferredTracks);

  filteredMandatory = applyIntent(filteredMandatory, intent);
  filteredElective  = applyIntent(filteredElective,  intent);

  // 막학기 여부: preferences.last_semester = true이면 최소 4학점만 충족
  const minCredits = preferences.last_semester ? 4 : MIN_CREDITS;
  // 최소 공강 시간 기능 제거됨 — 항상 미적용(0)
  const minGap = 0;

  const plans = [];
  for (let i = 0; i < n; i++) {
    const usedCodes = new Set(plans.flatMap(p => p.map(c => c.code)));

    // 1단계: 필수 영역 — [Fix3] plan마다 bumpPriorityCats 재적용
    const freshMandatory  = filteredMandatory.filter(c => !usedCodes.has(c.code));
    const reusedMandatory = filteredMandatory.filter(c =>  usedCodes.has(c.code));
    const candidates = bumpPriorityCats([...freshMandatory, ...reusedMandatory]);
    const plan = buildPlan(candidates, maxCredits, minCredits, minGap);

    // 2단계: 남은 학점을 선호 자유 영역으로 채우기
    const usedInPlan = new Set(plan.map(c => c.code));
    const usedAll    = new Set([...usedCodes, ...usedInPlan]);
    const remaining  = maxCredits - plan.reduce((s, c) => s + (Number(c.credits) || 0), 0);
    if (remaining > 0) {
      const freshElective = filteredElective.filter(c => !usedAll.has(c.code));
      // [Fix18] 자유 영역도 기존 plan과의 공강 간격 고려 (이미 담긴 과목 포함해 검사)
      const extra = buildPlan([...plan, ...freshElective], maxCredits, 0, minGap)
        .filter(c => !usedInPlan.has(c.code));
      plan.push(...extra);
    }

    plans.push(plan);
  }
  return plans;
}
