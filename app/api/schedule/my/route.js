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
  const semester = searchParams.get('semester');

  const supabase = getSupabaseAdmin();
  const [{ data, error }, activeRes] = await Promise.all([
    supabase
      .from('planned_schedules')
      .select('slot, courses(id, code, name, credits, timeslots, track, category, target_grade)')
      .eq('user_id', auth.userId)
      .eq('semester', semester),
    supabase
      .from('active_schedule')
      .select('slot')
      .eq('user_id', auth.userId)
      .eq('semester', semester)
      .maybeSingle(),
  ]);

  if (error) {
    console.error('GET /api/schedule/my error:', error);
    return errorJson('서버 오류', 500);
  }

  // 슬롯별로 그룹핑
  const bySlot = {};
  for (const row of data || []) {
    const slot = row.slot ?? 0;
    if (!bySlot[slot]) bySlot[slot] = [];
    if (row.courses?.id) bySlot[slot].push(row.courses);
  }
  const timetables = Object.keys(bySlot)
    .map(Number)
    .sort((a, b) => a - b)
    .map(slot => ({ slot, courses: bySlot[slot] }));

  return Response.json({
    timetables,
    activeSlot: activeRes?.data?.slot ?? null,
    // 하위호환: 기존 코드가 쓰던 schedule 필드 (slot 0 과목)
    schedule: (data || []).filter(r => (r.slot ?? 0) === 0),
  });
}
