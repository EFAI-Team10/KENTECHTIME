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
  const [{ data: user, error }, { data: meta }] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, name, grade, student_id, role, semester, last_ack_semester')
      .eq('id', auth.userId)
      .maybeSingle(),
    supabase.from('app_meta').select('value').eq('key', 'synced_semester').maybeSingle(),
  ]);

  if (error) return errorJson('서버 오류', 500);
  if (!user) return errorJson('유저 없음', 404);
  return Response.json({ user, current_semester: meta?.value || null });
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
  const { name, grade, student_id, semester, ack_semester } = body;

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
  // 새 학기 전환 알림 확인 처리 (배너 dismiss)
  if (ack_semester !== undefined) updates.last_ack_semester = String(ack_semester).trim();

  if (Object.keys(updates).length === 0) return errorJson('수정할 항목이 없습니다.', 400);

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.userId)
    .select('id, email, name, grade, student_id, role, semester, last_ack_semester')
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

  const supabase = getSupabaseAdmin();
  const uid = auth.userId;

  // users를 참조하는 자식 행을 먼저 삭제 (FK 제약 회피) — 일부 테이블은 없을 수 있어 오류 무시
  const childTables = [
    'active_schedule',
    'schedule_meta',
    'planned_schedules',
    'completed_courses',
    'user_preferences',
    'reviews',
  ];
  for (const tbl of childTables) {
    await supabase.from(tbl).delete().eq('user_id', uid);
  }

  const { error: delError } = await supabase.from('users').delete().eq('id', uid);
  if (delError) {
    console.error('delete user error:', delError);
    return errorJson('서버 오류', 500);
  }

  return Response.json({ success: true });
}
