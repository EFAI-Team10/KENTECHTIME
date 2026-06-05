import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

// 경쟁률에 반영할 '확정' 시간표(슬롯) 지정
export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { semester } = body;
  const slot = Number.isInteger(body.slot) ? body.slot : 0;
  if (!semester) return errorJson('semester가 필요합니다.', 400);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('active_schedule')
    .upsert({ user_id: auth.userId, semester, slot }, { onConflict: 'user_id,semester' });

  if (error) {
    console.error('POST /api/schedule/active error:', error);
    return errorJson('확정 실패', 500);
  }
  return Response.json({ success: true });
}
