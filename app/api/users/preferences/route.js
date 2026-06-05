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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error) return errorJson('서버 오류', 500);
  return Response.json({ preferences: data || null });
}

export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { preferred_tracks, avoid_morning, preferred_gap, day_off, last_semester, elective_cats, max_credits, prefer_compact, esp_start_level } = body;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: auth.userId,
      preferred_tracks:  preferred_tracks  || [],
      avoid_morning:     !!avoid_morning,
      preferred_gap:     preferred_gap     ?? 0,
      day_off:           day_off           || [],
      last_semester:     !!last_semester,
      elective_cats:     elective_cats     || [],
      max_credits:       max_credits       ?? 16,
      prefer_compact:    !!prefer_compact,
      esp_start_level:   [1,2,3].includes(esp_start_level) ? esp_start_level : 1,
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('POST /api/users/preferences error:', error);
    return errorJson('서버 오류', 500);
  }

  return Response.json({ success: true });
}
