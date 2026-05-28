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

  if (!Array.isArray(courseIds) || !semester) {
    return errorJson('courseIds와 semester가 필요합니다.', 400);
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from('planned_schedules')
    .delete()
    .eq('user_id', auth.userId)
    .eq('semester', semester);

  if (courseIds.length > 0) {
    const rows = courseIds.map(course_id => ({
      user_id: auth.userId,
      course_id,
      semester,
    }));
    const { error } = await supabase
      .from('planned_schedules')
      .upsert(rows, { onConflict: 'user_id,course_id,semester' });

    if (error) {
      console.error('POST /api/schedule/save error:', error);
      return errorJson('저장 실패', 500);
    }
  }

  return Response.json({ success: true });
}
