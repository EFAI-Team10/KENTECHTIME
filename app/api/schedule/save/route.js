import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { courseIds, semester } = body;
  const slot = Number.isInteger(body.slot) ? body.slot : 0; // 어느 '내 시간표'인지

  if (!Array.isArray(courseIds) || !semester) {
    return errorJson('courseIds와 semester가 필요합니다.', 400);
  }

  const supabase = getSupabaseAdmin();
  // 해당 슬롯만 교체
  await supabase
    .from('planned_schedules')
    .delete()
    .eq('user_id', auth.userId)
    .eq('semester', semester)
    .eq('slot', slot);

  if (courseIds.length > 0) {
    const rows = courseIds.map(course_id => ({
      user_id: auth.userId,
      course_id,
      semester,
      slot,
    }));
    const { error } = await supabase
      .from('planned_schedules')
      .upsert(rows, { onConflict: 'user_id,course_id,semester,slot' });

    if (error) {
      console.error('POST /api/schedule/save error:', error);
      return errorJson('저장 실패', 500);
    }
  }

  return Response.json({ success: true });
}

// 내 시간표(슬롯) 삭제
export async function DELETE(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const { searchParams } = new URL(request.url);
  const semester = searchParams.get('semester');
  const slot = parseInt(searchParams.get('slot'));
  if (!semester || !Number.isInteger(slot)) {
    return errorJson('semester와 slot이 필요합니다.', 400);
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from('planned_schedules')
    .delete()
    .eq('user_id', auth.userId)
    .eq('semester', semester)
    .eq('slot', slot);

  // 확정 슬롯이 삭제된 슬롯이면 확정 해제
  await supabase
    .from('active_schedule')
    .delete()
    .eq('user_id', auth.userId)
    .eq('semester', semester)
    .eq('slot', slot);

  // 이름 메타도 정리
  await supabase
    .from('schedule_meta')
    .delete()
    .eq('user_id', auth.userId)
    .eq('semester', semester)
    .eq('slot', slot);

  return Response.json({ success: true });
}
