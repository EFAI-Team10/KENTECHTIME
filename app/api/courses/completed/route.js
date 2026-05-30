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
  const courses = Array.isArray(body.courses) ? body.courses : [];

  const supabase = getSupabaseAdmin();

  await supabase.from('completed_courses').delete().eq('user_id', auth.userId);

  if (courses.length > 0) {
    const rows = courses.map(c => ({
      user_id: auth.userId,
      course_id: c.course_id,
      semester: c.semester || '2025-fall',
      grade: c.grade || 'P',
    }));
    const { error } = await supabase
      .from('completed_courses')
      .upsert(rows, { onConflict: 'user_id,course_id' });

    if (error) {
      console.error('POST /api/courses/completed error:', error);
      return errorJson('서버 오류', 500);
    }
  }

  return Response.json({ success: true });
}
