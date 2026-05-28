import { verifyIdToken, GoogleAuthError } from '@/lib/server/googleVerify';
import { signJwt, errorJson } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { id_token, name, student_id, semester, completed_course_ids, preferences } = body;

  if (!id_token) return errorJson('id_token이 필요합니다.', 400);
  if (!name || typeof name !== 'string') return errorJson('이름을 입력해주세요.', 400);
  if (!student_id || typeof student_id !== 'string') return errorJson('학번을 입력해주세요.', 400);
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
    return errorJson('학기차는 1~8 사이의 정수여야 합니다.', 400);
  }

  let payload;
  try {
    payload = await verifyIdToken(id_token);
  } catch (err) {
    if (err instanceof GoogleAuthError) return errorJson(err.message, err.status);
    console.error('Google verify error:', err);
    return errorJson('서버 오류', 500);
  }

  const courseIds = Array.isArray(completed_course_ids)
    ? completed_course_ids.filter(Number.isInteger)
    : [];
  const prefs = preferences || {};

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_register_user', {
    p_email: payload.email,
    p_name: name,
    p_student_id: student_id,
    p_semester: semester,
    p_google_sub: payload.sub,
    p_course_ids: courseIds,
    p_preferred_tracks: Array.isArray(prefs.preferred_tracks) ? prefs.preferred_tracks : [],
    p_avoid_morning: !!prefs.avoid_morning,
    p_preferred_gap: Number.isInteger(prefs.preferred_gap) ? prefs.preferred_gap : 60,
    p_day_off: Array.isArray(prefs.day_off) ? prefs.day_off : [],
  });

  if (error) {
    console.error('fn_register_user error:', error);
    if (error.message?.includes('DUPLICATE_USER')) {
      return errorJson('이미 가입된 계정입니다. 로그인해주세요.', 409);
    }
    return errorJson('서버 오류', 500);
  }

  const user = Array.isArray(data) ? data[0] : data;
  const token = signJwt(user);
  return Response.json({ token, user }, { status: 201 });
}
