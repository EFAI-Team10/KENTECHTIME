/**
 * import_descriptions.mjs
 * kentech_courses.json에서 과목 description을 읽어 Supabase courses 테이블에 업데이트.
 *
 * 실행 전 준비:
 *   1. Supabase 대시보드 SQL Editor에서 migration 012 실행
 *      (ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT;)
 *   2. .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 확인
 *
 * 실행:
 *   node database/scripts/import_descriptions.mjs <JSON_PATH>
 *   예) node database/scripts/import_descriptions.mjs "C:/Users/bb105/Downloads/kentech_courses.json"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없습니다.');
  process.exit(1);
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('❌ JSON 경로를 인수로 전달하세요.\n   예) node database/scripts/import_descriptions.mjs "C:/Users/bb105/Downloads/kentech_courses.json"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const data = JSON.parse(readFileSync(resolve(jsonPath), 'utf-8'));

// 알려진 JSON 오류 수정: 선수과목 전체 제거할 과목 코드
const REMOVE_ALL_PREREQS = new Set(['EN1003']); // 실전창업 선수과목 없음

async function main() {
  const courses = data.courses;
  console.log(`📚 ${courses.length}개 과목 처리 시작...\n`);

  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  for (const course of courses) {
    const description = course.description || null;

    if (!description) {
      skipped++;
      continue;
    }

    const { data: rows, error } = await supabase
      .from('courses')
      .update({ description })
      .eq('code', course.code)
      .select('code');

    if (error) {
      console.error(`  ❌ ${course.code} 업데이트 실패:`, error.message);
    } else if (!rows || rows.length === 0) {
      console.log(`  ⚠️  ${course.code} — DB에 없는 과목, 건너뜀`);
      notFound++;
    } else {
      console.log(`  ✅ ${course.code} (${course.name_ko})`);
      updated++;
    }
  }

  console.log(`\n📊 결과: ${updated}개 업데이트, ${notFound}개 DB 미존재, ${skipped}개 description 없음`);

  // prerequisites 정리 — EN1003 등 선수과목 제거
  console.log('\n🔧 잘못된 선수과목 정리...');
  for (const code of REMOVE_ALL_PREREQS) {
    const { data: courseRow } = await supabase
      .from('courses')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (!courseRow) {
      console.log(`  ⚠️  ${code} — DB에 없음`);
      continue;
    }

    const { error } = await supabase
      .from('prerequisites')
      .delete()
      .eq('course_id', courseRow.id);

    if (error) {
      console.error(`  ❌ ${code} 선수과목 제거 실패:`, error.message);
    } else {
      console.log(`  ✅ ${code} 선수과목 제거 완료`);
    }
  }

  console.log('\n🎉 import 완료');
}

main().catch(err => {
  console.error('스크립트 오류:', err);
  process.exit(1);
});
