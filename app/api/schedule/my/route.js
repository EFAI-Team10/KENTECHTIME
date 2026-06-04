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

  const { searchParams } = new URL(request.url);
  const semester = searchParams.get('semester');

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('planned_schedules')
    .select('*, courses(id, code, name, credits, timeslots, track, category, target_grade)')
    .eq('user_id', auth.userId)
    .eq('semester', semester);

  if (error) {
    console.error('GET /api/schedule/my error:', error);
    return errorJson('서버 오류', 500);
  }

  return Response.json({ schedule: data });
}
