import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';

export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('인증 오류', 401);
  }

  const { name, source, credits, category } = await request.json();
  if (!name || !source || !credits || !category) {
    return errorJson('name, source, credits, category는 필수입니다.', 400);
  }

  const supabase = getSupabaseAdmin();
  const code = `EXT-${auth.userId}-${Date.now().toString(36).toUpperCase()}`;

  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .insert({ code, name, credits, category, semester: 'external', track: null, target_grade: 0, timeslots: [] })
    .select('id')
    .single();

  if (courseErr) return errorJson('과목 생성 실패: ' + courseErr.message, 500);

  const { error: ccErr } = await supabase
    .from('completed_courses')
    .upsert({ user_id: auth.userId, course_id: course.id, semester: source, grade: 'P' }, { onConflict: 'user_id,course_id' });

  if (ccErr) return errorJson('수강이력 등록 실패: ' + ccErr.message, 500);

  return NextResponse.json({ success: true, code }, { status: 200 });
}
