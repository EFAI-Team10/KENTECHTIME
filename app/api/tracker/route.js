import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

export async function GET(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const { searchParams } = new URL(request.url);
  const semester = searchParams.get('semester') || process.env.CURRENT_SEMESTER;

  const supabase = getSupabaseAdmin();
  const [plannedRes, activeRes] = await Promise.all([
    supabase
      .from('planned_schedules')
      .select('user_id, slot, course_id, courses(id, code, name, capacity)')
      .eq('semester', semester),
    supabase
      .from('active_schedule')
      .select('user_id, slot')
      .eq('semester', semester),
  ]);

  if (plannedRes.error) {
    console.error('GET /api/tracker error:', plannedRes.error);
    return errorJson('서버 오류', 500);
  }

  // 사용자별 '확정' 슬롯
  const activeSlotByUser = new Map();
  for (const r of activeRes.data || []) activeSlotByUser.set(r.user_id, r.slot);

  // 전체 확정 시간표 기준 과목별 수강 희망자 수 집계 + 내 확정 과목 추출
  const countMap = {};
  const myConfirmedIds = new Set();
  const myActiveSlot = activeSlotByUser.get(auth.userId);
  for (const row of plannedRes.data || []) {
    if (!activeSlotByUser.has(row.user_id)) continue;          // 미확정 유저 제외
    if ((row.slot ?? 0) !== activeSlotByUser.get(row.user_id)) continue; // 확정 슬롯만
    const id = row.course_id;
    if (!countMap[id]) countMap[id] = { course: row.courses, applicants: 0 };
    countMap[id].applicants += 1;
    if (row.user_id === auth.userId) myConfirmedIds.add(id);
  }

  // 내가 확정한 시간표의 과목만 노출 (제한 인원 포함)
  const tracker = Object.values(countMap)
    .filter(e => myConfirmedIds.has(e.course?.id))
    .map(e => ({ course: e.course, applicants: e.applicants, capacity: e.course?.capacity ?? null }))
    .sort((a, b) => b.applicants - a.applicants);

  return Response.json({ tracker, confirmed: myActiveSlot != null });
}
