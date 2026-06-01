/**
 * 강의 데이터 시딩 스크립트 (Supabase 버전)
 *
 * 사용법: node scripts/seed.js
 * 사전 조건:
 *   - .env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   - classlist/ 디렉토리에 엑셀 파일 존재
 *
 * 포팅: server/seed.js (pg) → @supabase/supabase-js
 */

// CommonJS + dotenv (Next.js 앱 번들 밖에서 실행되는 스크립트)
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const classlistDir = path.resolve(__dirname, '../classlist');

const SEMESTER_MAP = {
  '1학기': 'spring',
  '2학기': 'fall',
  '하계':  'summer',
  '동계':  'winter',
};

const DAY_MAP = {
  '월요일': 'MON', '월': 'MON',
  '화요일': 'TUE', '화': 'TUE',
  '수요일': 'WED', '수': 'WED',
  '목요일': 'THU', '목': 'THU',
  '금요일': 'FRI', '금': 'FRI',
};

const TIME_REGEX = /(\d{2}:\d{2})\s*[~-]\s*(\d{2}:\d{2})/;

function parseTimeslots(str) {
  if (!str || typeof str !== 'string') return [];
  const t = str.trim();
  if (t === '' || t === '시간미정') return [];
  const slots = [];
  for (const part of t.split('/')) {
    const p = part.trim();
    let day = null;
    for (const [kor, eng] of Object.entries(DAY_MAP)) {
      if (p.includes(kor)) { day = eng; break; }
    }
    const m = p.match(TIME_REGEX);
    if (day && m) slots.push({ day, start: m[1], end: m[2] });
  }
  return slots;
}

function parseGrade(gradeStr) {
  if (!gradeStr) return 0;
  const m = String(gradeStr).match(/(\d)학년/);
  return m ? parseInt(m[1], 10) : 0;
}

async function seed() {
  console.log('강의 데이터 시딩 시작...');

  if (!fs.existsSync(classlistDir)) {
    console.error(`classlist 디렉토리를 찾을 수 없습니다: ${classlistDir}`);
    process.exit(1);
  }

  const FILE_REGEX = /^개설교과목 리스트_(\d{4})_(1학기|2학기|하계|동계)\.xlsx$/;

  const files = fs.readdirSync(classlistDir)
    .map(filename => {
      const m = filename.match(FILE_REGEX);
      if (!m) return null;
      const semester = `${m[1]}-${SEMESTER_MAP[m[2]]}`;
      return { path: path.join(classlistDir, filename), filename, semester };
    })
    .filter(Boolean)
    .sort((a, b) => a.semester.localeCompare(b.semester));

  console.log(`처리할 파일 ${files.length}개 발견`);

  for (const fileInfo of files) {
    console.log(`\n처리 중: ${fileInfo.filename} → ${fileInfo.semester}`);
    try {
      const workbook = XLSX.readFile(fileInfo.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) {
        console.log('  비어 있거나 구조가 올바르지 않은 파일 — 건너뜀');
        continue;
      }

      const headers = rows[0];
      const col = {
        code:      headers.indexOf('교과목코드'),
        name:      headers.indexOf('교과목명(국문)'),
        category:  headers.indexOf('영역\n구분'),
        timetable: headers.indexOf('시간표'),
        credits:   headers.indexOf('학점'),
        grade:     headers.indexOf('Unnamed: 1'),
      };

      if (col.code === -1 || col.name === -1) {
        console.error('  필수 열(교과목코드, 교과목명(국문))을 찾을 수 없음 — 건너뜀');
        continue;
      }

      const records = [];
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const code = row[col.code];
        const name = row[col.name];
        if (!code || !name) continue;
        records.push({
          code:         String(code).trim(),
          name:         String(name).trim(),
          credits:      parseFloat(row[col.credits]) || 0,
          track:        null,
          category:     row[col.category] ? String(row[col.category]).trim() : 'EL',
          semester:     fileInfo.semester,
          target_grade: parseGrade(row[col.grade]),
          timeslots:    parseTimeslots(row[col.timetable]),
        });
      }

      // Supabase upsert (배치)
      const BATCH = 100;
      let count = 0;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await supabase
          .from('courses')
          .upsert(batch, { onConflict: 'code' });
        if (error) {
          console.error('  upsert 오류:', error.message);
        } else {
          count += batch.length;
        }
      }
      console.log(`  완료: ${count}개 과목 등록/업데이트`);
    } catch (err) {
      console.error(`  오류 (${fileInfo.filename}):`, err.message);
    }
  }

  console.log('\n시딩 완료.');
}

seed().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
