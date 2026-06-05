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
      .select('user_id, slot, course_id, courses(id, code, name)')
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

  // 사용자별 '확정' 슬롯 (없으면 0번 슬롯을 기본 확정으로 간주)
  const activeSlotByUser = new Map();
  for (const r of activeRes.data || []) activeSlotByUser.set(r.user_id, r.slot);

  const countMap = {};
  for (const row of plannedRes.data || []) {
    if (!activeSlotByUser.has(row.user_id)) continue; // 미확정 유저 제외
    const activeSlot = activeSlotByUser.get(row.user_id);
    if ((row.slot ?? 0) !== activeSlot) continue; // 확정된 시간표만 집계
    const id = row.course_id;
    if (!countMap[id]) countMap[id] = { course: row.courses, applicants: 0 };
    countMap[id].applicants += 1;
  }

  const tracker = Object.values(countMap).sort((a, b) => b.applicants - a.applicants);
  return Response.json({ tracker });
}
