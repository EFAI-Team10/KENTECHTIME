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
  const semester = searchParams.get('semester') || process.env.CURRENT_SEMESTER;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('planned_schedules')
    .select('course_id, courses(id, code, name)')
    .eq('semester', semester);

  if (error) {
    console.error('GET /api/tracker error:', error);
    return errorJson('서버 오류', 500);
  }

  const countMap = {};
  for (const row of data || []) {
    const id = row.course_id;
    if (!countMap[id]) countMap[id] = { course: row.courses, applicants: 0 };
    countMap[id].applicants += 1;
  }

  const tracker = Object.values(countMap).sort((a, b) => b.applicants - a.applicants);
  return Response.json({ tracker });
}
