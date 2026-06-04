import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';

const AP_CODE_RE = /^[A-Z]\d{6}$/; // F000017 등 AP 학점 코드

export async function POST(request) {
  let auth;
  try { auth = requireAuth(request); }
  catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('인증 오류', 401);
  }

  const body = await request.json().catch(() => ({}));

  // 신형: { courses: [{code, category, name, credits}] }
  // 구형 호환: { codes: string[] }
  const replace = !!body.replace; // true이면 기존 portal import 전부 교체

  const courses = Array.isArray(body.courses)
    ? body.courses
    : (body.codes || []).map(code => ({ code, category: 'EL', name: code, credits: 0 }));

  if (courses.length === 0) return errorJson('등록할 과목이 없습니다.', 400);

  const supabase = getSupabaseAdmin();
  const codes = courses.map(c => c.code);

  // DB에서 기존 과목 조회
  const { data: existing } = await supabase
    .from('courses')
    .select('id, code, name, credits, category')
    .in('code', codes);

  const existingMap = new Map((existing || []).map(c => [c.code, c]));
  const matched = [];
  const autoCreated = [];
  const failed = [];

  for (const item of courses) {
    let course = existingMap.get(item.code);

    if (!course) {
      // DB에 없으면 자동 생성
      let category = item.category || 'EL';
      let credits = typeof item.credits === 'number' ? item.credits : (parseFloat(item.credits) || 0);
      let name = item.name || item.code;

      // AP 학점 코드 (F000017 등): EF 영역, 2학점으로 고정
      if (AP_CODE_RE.test(item.code)) {
        category = 'EF';
        credits = 2;
        name = name || `AP 학점 (${item.code})`;
      }

      const { data: created, error } = await supabase
        .from('courses')
        .insert({
          code: item.code,
          name,
          credits,
          category,
          semester: 'external',
          track: null,
          target_grade: 0,
          timeslots: [],
        })
        .select('id, code, name, credits, category')
        .single();

      if (error || !created) { failed.push(item.code); continue; }
      course = created;
      autoCreated.push(course);
    }

    // DB에 0학점으로 잘못 저장된 경우 포털 파싱값으로 보정
    const parsedCredits = typeof item.credits === 'number' ? item.credits : (parseFloat(item.credits) || 0);
    if (course.credits === 0 && parsedCredits > 0) {
      const { data: updated } = await supabase
        .from('courses')
        .update({ credits: parsedCredits })
        .eq('id', course.id)
        .select('id, code, name, credits, category')
        .single();
      if (updated) course = updated;
    }
    matched.push(course);
  }

  // completed_courses에 일괄 등록
  if (matched.length > 0) {
    // replace=true: 기존 포털 import 이력 전체 교체 (수동 추가 과목은 유지)
    // 포털 출처 판별: semester='imported' 또는 YYYY-(spring|fall|summer|winter) 형식
    if (replace) {
      const { data: existing } = await supabase
        .from('completed_courses')
        .select('course_id, semester')
        .eq('user_id', auth.userId);
      const portalIds = (existing || [])
        .filter(r => r.semester === 'imported' || /^\d{4}-(spring|fall|summer|winter)$/.test(r.semester || ''))
        .map(r => r.course_id);
      if (portalIds.length > 0) {
        await supabase.from('completed_courses').delete()
          .eq('user_id', auth.userId).in('course_id', portalIds);
      }
    }
    const courseMap = new Map(courses.map(c => [c.code, c]));
    const rows = matched.map(c => ({
      user_id: auth.userId,
      course_id: c.id,
      semester: courseMap.get(c.code)?.semester || 'imported',
      grade: 'P',
    }));
    await supabase
      .from('completed_courses')
      .upsert(rows, { onConflict: 'user_id,course_id' });
  }

  return NextResponse.json({
    success: true,
    matched,
    autoCreated,
    failed,
    unmatched: failed,
  }, { status: 200 });
}
