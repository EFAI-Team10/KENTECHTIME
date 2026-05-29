import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { parseTimeslots } from '@/lib/server/parser';

function parseGrade(gradeStr) {
  if (!gradeStr) return 0;
  const match = String(gradeStr).match(/(\d)학년/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('인증 오류', 401);
  }

  if (auth.role !== 'admin') {
    return errorJson('관리자 권한이 필요합니다.', 403);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorJson('multipart/form-data 파싱 실패', 400);
  }

  const semester = formData.get('semester');
  const fileEntry = formData.get('file');

  if (!semester) return errorJson('학기 정보가 누락되었습니다.', 400);
  if (!fileEntry) return errorJson('업로드할 파일이 없습니다.', 400);

  const arrayBuffer = await fileEntry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    return errorJson('엑셀 파일을 읽을 수 없습니다.', 400);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length < 2) {
    return errorJson('엑셀 파일 구조가 올바르지 않습니다.', 400);
  }

  const headers = rows[0];
  const colMap = {
    code:      headers.indexOf('교과목코드'),
    name:      headers.indexOf('교과목명(국문)'),
    category:  headers.indexOf('영역\n구분'),
    timetable: headers.indexOf('시간표'),
    credits:   headers.indexOf('학점'),
    grade:     headers.indexOf('Unnamed: 1'),
  };

  if (colMap.code === -1 || colMap.name === -1) {
    return errorJson('필수 열(교과목코드, 교과목명(국문))을 찾을 수 없습니다.', 400);
  }

  const supabase = getSupabaseAdmin();
  let count = 0;

  // 행 0: 헤더, 행 1: 부가 정보 → 행 2부터 데이터
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const code = row[colMap.code];
    const name = row[colMap.name];
    if (!code || !name) continue;

    const record = {
      code:         String(code).trim(),
      name:         String(name).trim(),
      credits:      parseInt(row[colMap.credits], 10) || 0,
      track:        null,
      category:     row[colMap.category] ? String(row[colMap.category]).trim() : 'EL',
      semester,
      target_grade: parseGrade(row[colMap.grade]),
      timeslots:    parseTimeslots(row[colMap.timetable]),
    };

    const { error } = await supabase
      .from('courses')
      .upsert(record, { onConflict: 'code' });

    if (!error) count++;
  }

  return NextResponse.json({ success: true, count }, { status: 200 });
}
