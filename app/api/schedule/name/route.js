import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

// 내 시간표(슬롯) 이름 변경
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
  const name = (body.name ?? '').toString().trim().slice(0, 40);
  if (!semester) return errorJson('semester가 필요합니다.', 400);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('schedule_meta')
    .upsert({ user_id: auth.userId, semester, slot, name: name || null }, { onConflict: 'user_id,semester,slot' });

  if (error) {
    console.error('POST /api/schedule/name error:', error);
    return errorJson('이름 저장 실패', 500);
  }
  return Response.json({ success: true });
}
