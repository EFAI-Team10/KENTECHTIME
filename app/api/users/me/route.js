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
    .select('id, email, name, grade, student_id, role')
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
  const { name, grade, student_id } = body;

  const updates = {};
  if (name      !== undefined) updates.name       = String(name).trim();
  if (grade     !== undefined) updates.grade      = parseInt(grade) || 0;
  if (student_id !== undefined) updates.student_id = String(student_id).trim();

  if (Object.keys(updates).length === 0) return errorJson('수정할 항목이 없습니다.', 400);

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.userId)
    .select('id, email, name, grade, student_id, role')
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
  if (!id_token) return errorJson('Google 재인증이 필요합니다.', 400);

  let payload;
  try {
    payload = await verifyIdToken(id_token);
  } catch (err) {
    if (err instanceof GoogleAuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc('fn_delete_user', {
    p_user_id: auth.userId,
    p_google_sub: payload.sub,
  });

  if (error) {
    if (error.message?.includes('USER_NOT_FOUND')) return errorJson('유저 없음', 404);
    if (error.message?.includes('SUB_MISMATCH')) return errorJson('본인 계정으로 재인증해주세요.', 403);
    console.error('fn_delete_user error:', error);
    return errorJson('서버 오류', 500);
  }

  return Response.json({ success: true });
}
