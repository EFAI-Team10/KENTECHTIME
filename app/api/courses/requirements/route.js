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
    .from('completed_courses')
    .select('courses(category, credits)')
    .eq('user_id', auth.userId);

  if (error) {
    console.error('GET /api/courses/requirements error:', error);
    return errorJson('서버 오류', 500);
  }

  const earned = { VC: 0, EF: 0, EL: 0, total: 0 };
  for (const row of data) {
    const { category, credits } = row.courses || {};
    if (category && earned[category] !== undefined) earned[category] += credits || 0;
    earned.total += credits || 0;
  }

  return Response.json({ earned, required: { VC: 8, EF: 28, EL: 40, total: 128 } });
}
