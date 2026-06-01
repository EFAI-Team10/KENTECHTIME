import { NextResponse } from 'next/server';
import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { getCategoryFromCode } from '@/lib/server/parser';

export async function GET(request) {
  let auth;
  try { auth = requireAuth(request); }
  catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('인증 오류', 401);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('completed_courses')
    .select('course_id, semester, grade, courses(id, code, name, credits, category)')
    .eq('user_id', auth.userId);

  if (error) return errorJson('서버 오류', 500);

  const courses = (data || []).map(r => ({
    ...r.courses,
    category: getCategoryFromCode(r.courses?.code) || r.courses?.category || 'EL',
    semester: r.semester,
    grade: r.grade,
  }));
  return NextResponse.json({ courses }, { status: 200 });
}

export async function DELETE(request) {
  let auth;
  try { auth = requireAuth(request); }
  catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('인증 오류', 401);
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId');
  if (!courseId) return errorJson('courseId가 필요합니다.', 400);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('completed_courses')
    .delete()
    .eq('user_id', auth.userId)
    .eq('course_id', courseId);

  if (error) return errorJson('서버 오류', 500);
  return NextResponse.json({ success: true }, { status: 200 });
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
  const courses = Array.isArray(body.courses) ? body.courses : [];

  const supabase = getSupabaseAdmin();

  await supabase.from('completed_courses').delete().eq('user_id', auth.userId);

  if (courses.length > 0) {
    const rows = courses.map(c => ({
      user_id: auth.userId,
      course_id: c.course_id,
      semester: c.semester || '2025-fall',
      grade: c.grade || 'P',
    }));
    const { error } = await supabase
      .from('completed_courses')
      .upsert(rows, { onConflict: 'user_id,course_id' });

    if (error) {
      console.error('POST /api/courses/completed error:', error);
      return errorJson('서버 오류', 500);
    }
  }

  return Response.json({ success: true });
}
