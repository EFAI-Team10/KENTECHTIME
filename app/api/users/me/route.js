import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { verifyIdToken, GoogleAuthError } from '@/lib/server/googleVerify';
import { getSupabaseAdmin } from '@/lib/server/supabase';

export async function GET(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, grade, student_id, role, semester')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error) return errorJson('서버 오류', 500);
  if (!user) return errorJson('유저 없음', 404);
  return Response.json({ user });
}

export async function PATCH(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { name, grade, student_id, semester } = body;

  const updates = {};
  if (name      !== undefined) updates.name       = String(name).trim();
  if (grade     !== undefined) updates.grade      = parseInt(grade) || 0;
  if (student_id !== undefined) updates.student_id = String(student_id).trim();
  // 학기차(1~8) 수정 — 학년은 DB 트리거로 자동 동기화
  if (semester  !== undefined) {
    const s = parseInt(semester);
    if (!Number.isInteger(s) || s < 1 || s > 8) {
      return errorJson('학기차는 1~8 사이의 정수여야 합니다.', 400);
    }
    updates.semester = s;
  }

  if (Object.keys(updates).length === 0) return errorJson('수정할 항목이 없습니다.', 400);

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.userId)
    .select('id, email, name, grade, student_id, role, semester')
    .maybeSingle();

  if (error) return errorJson('서버 오류', 500);
  return Response.json({ user });
}

export async function DELETE(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { id_token } = body;

  const supabase = getSupabaseAdmin();

  // 재인증(id_token)이 있으면 sub 검증, 없으면 로그인된 본인(JWT) 기준으로 탈퇴
  let sub;
  if (id_token) {
    try {
      const payload = await verifyIdToken(id_token);
      sub = payload.sub;
    } catch (err) {
      if (err instanceof GoogleAuthError) return errorJson(err.message, err.status);
      return errorJson('서버 오류', 500);
    }
  } else {
    const { data } = await supabase
      .from('users').select('google_sub').eq('id', auth.userId).maybeSingle();
    sub = data?.google_sub;
  }

  const { error } = await supabase.rpc('fn_delete_user', {
    p_user_id: auth.userId,
    p_google_sub: sub,
  });

  if (error) {
    if (error.message?.includes('USER_NOT_FOUND')) return errorJson('유저 없음', 404);
    if (error.message?.includes('SUB_MISMATCH')) return errorJson('본인 계정으로 재인증해주세요.', 403);
    console.error('fn_delete_user error:', error);
    return errorJson('서버 오류', 500);
  }

  return Response.json({ success: true });
}
