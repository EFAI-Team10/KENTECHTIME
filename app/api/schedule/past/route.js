import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { parseTimeslots } from '@/lib/server/parser';
import path from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import * as XLSX from 'xlsx';

const SEM_LABEL = { spring: '봄학기', fall: '가을학기' };
const SEM_FILE  = { spring: '1학기',  fall: '2학기' };
const SEM_ORDER = { spring: 1, fall: 3 };

function semSortKey(s) {
  const m = s.match(/^(\d{4})-(spring|fall)$/);
  if (!m) return 0;
  return parseInt(m[1]) * 10 + (SEM_ORDER[m[2]] || 0);
}

// classlist/ 에 실제 파일이 있는 봄/가을 학기 목록
function getAvailableSemesters() {
  const dir = path.join(process.cwd(), 'classlist');
  try {
    return readdirSync(dir)
      .map(f => {
        const m = f.match(/리스트_(\d{4})_(1|2)학기\.xlsx$/);
        if (!m) return null;
        return `${m[1]}-${m[2] === '1' ? 'spring' : 'fall'}`;
      })
      .filter(Boolean)
      .sort((a, b) => semSortKey(a) - semSortKey(b));
  } catch { return []; }
}

function parseXlsx(filePath) {
  const buffer = readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const courseMap = new Map();
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[2]) continue;
    const code = String(row[2]).trim();
    if (!code || courseMap.has(code)) continue;

    const name        = String(row[4] || row[3] || code).trim();
    const category    = String(row[7] || '').trim();
    const timeslotStr = String(row[20] || '').trim();
    const credits     = parseFloat(row[21]) || 0;

    courseMap.set(code, { code, name, category, credits, timeslots: parseTimeslots(timeslotStr) });
  }
  return courseMap;
}

export async function GET(request) {
  let auth;
  try { auth = requireAuth(request); }
  catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('인증 오류', 401);
  }

  const { searchParams } = new URL(request.url);
  const semester = searchParams.get('semester');

  const supabase = getSupabaseAdmin();

  // ── 학기 목록 요청 ──
  if (!semester) {
    const available = getAvailableSemesters();
    // DB에 정확한 학기 정보가 있는 학기 목록
    const { data } = await supabase
      .from('completed_courses')
      .select('semester')
      .eq('user_id', auth.userId);

    const exactSemesters = new Set(
      (data || [])
        .map(r => r.semester)
        .filter(s => /^\d{4}-(spring|fall)$/.test(s || ''))
    );

    // 수강이력이 있는지 여부 (imported 포함)
    const hasAnyHistory = (data || []).length > 0;

    return Response.json({ available, exactSemesters: [...exactSemesters], hasAnyHistory });
  }

  // ── 특정 학기 시간표 요청 ──
  const m = semester.match(/^(\d{4})-(spring|fall)$/);
  if (!m) return errorJson('semester 형식이 올바르지 않습니다. (예: 2022-spring)', 400);

  const [, year, term] = m;
  const fileName = `개설교과목 리스트_${year}_${SEM_FILE[term]}.xlsx`;
  const filePath = path.join(process.cwd(), 'classlist', fileName);

  if (!existsSync(filePath)) {
    return errorJson(`${year}년 ${SEM_LABEL[term]} 개설교과목 데이터가 없습니다.`, 404);
  }

  let xlsxMap;
  try {
    xlsxMap = parseXlsx(filePath);
  } catch (e) {
    console.error('[past] xlsx parse error:', e);
    return errorJson('개설교과목 파일을 읽는 중 오류가 발생했습니다.', 500);
  }

  // 해당 학기에 수강한 과목 코드 — 정확한 학기 태깅이 있는 경우 우선
  const { data: exactData } = await supabase
    .from('completed_courses')
    .select('courses(code)')
    .eq('user_id', auth.userId)
    .eq('semester', semester);

  const exactCodes = new Set(
    (exactData || []).map(r => r.courses?.code).filter(Boolean)
  );

  // 정확한 학기 데이터가 없으면 모든 수강 이력과 매칭 (imported 포함)
  let completedCodes = exactCodes;
  let isApproximate = false;

  if (exactCodes.size === 0) {
    const { data: allData } = await supabase
      .from('completed_courses')
      .select('courses(code)')
      .eq('user_id', auth.userId);
    completedCodes = new Set(
      (allData || []).map(r => r.courses?.code).filter(Boolean)
    );
    isApproximate = true;
  }

  const courses = [];
  for (const [code, course] of xlsxMap) {
    if (completedCodes.has(code)) courses.push(course);
  }

  return Response.json({
    courses,
    semLabel: `${year}년 ${SEM_LABEL[term]}`,
    isApproximate,
  });
}
