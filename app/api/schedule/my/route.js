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
  const [{ data, error }, activeRes, metaRes] = await Promise.all([
    supabase
      .from('planned_schedules')
      .select('slot, grad_included, courses(id, code, name, credits, timeslots, track, category, target_grade, grad_excluded, professor, room, section)')
      .eq('user_id', auth.userId)
      .eq('semester', semester),
    supabase
      .from('active_schedule')
      .select('slot')
      .eq('user_id', auth.userId)
      .eq('semester', semester)
      .maybeSingle(),
    supabase
      .from('schedule_meta')
      .select('slot, name')
      .eq('user_id', auth.userId)
      .eq('semester', semester),
  ]);

  if (error) {
    console.error('GET /api/schedule/my error:', error);
    return errorJson('서버 오류', 500);
  }

  const nameBySlot = {};
  for (const m of metaRes?.data || []) nameBySlot[m.slot] = m.name;

  // 슬롯별로 그룹핑
  const bySlot = {};
  for (const row of data || []) {
    const slot = row.slot ?? 0;
    if (!bySlot[slot]) bySlot[slot] = [];
    if (row.courses?.id) bySlot[slot].push({ ...row.courses, grad_included: row.grad_included !== false });
  }
  const timetables = Object.keys(bySlot)
    .map(Number)
    .sort((a, b) => a - b)
    .map(slot => ({ slot, courses: bySlot[slot], name: nameBySlot[slot] || null }));

  return Response.json({
    timetables,
    activeSlot: activeRes?.data?.slot ?? null,
    // 하위호환: 기존 코드가 쓰던 schedule 필드 (slot 0 과목)
    schedule: (data || []).filter(r => (r.slot ?? 0) === 0),
  });
}
