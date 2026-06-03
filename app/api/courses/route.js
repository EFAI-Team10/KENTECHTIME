import { errorJson } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const semester = searchParams.get('semester');
  const track = searchParams.get('track');
  const category = searchParams.get('category');

  const supabase = getSupabaseAdmin();
  let query = supabase.from('courses').select('*');

  if (semester) query = query.eq('semester', semester);
  if (track) query = query.eq('track', track);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    console.error('GET /api/courses error:', error);
    return errorJson('서버 오류', 500);
  }

  return Response.json({ courses: data });
}
