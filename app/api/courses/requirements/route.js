import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

// DB에 저장된 category 값이 잘못된 경우를 대비해 코드 접두사로 재판별
const PREFIX_TO_CAT = {
  EF:'EF', EL:'EL', EN:'EN', ES:'ESP', FR:'FR', GR:'GR',
  HA:'HASS', IR:'IR', MN:'MN', RC:'RC', VC:'VC', CA:'CAPS',
};
function resolveCategory(code, stored) {
  const fullPrefix = String(code || '').match(/^[A-Z]+/)?.[0] ?? '';
  for (let len = fullPrefix.length; len >= 1; len--) {
    const mapped = PREFIX_TO_CAT[fullPrefix.slice(0, len)];
    if (mapped) return mapped;
  }
  return stored ?? 'EL';
}

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
    .select('courses(code, category, credits)')
    .eq('user_id', auth.userId);

  if (error) {
    console.error('GET /api/courses/requirements error:', error);
    return errorJson('서버 오류', 500);
  }

  // 졸업학점 미포함 RC 과목 (체육 관련)
  const RC_EXCLUDED = new Set(['RC1011', 'RC1012', 'RC1013']);
  // ESP 고급 과목 (둘 다 이수 시 4학점 인정)
  const ESP_ADV = new Set(['ES3001', 'ES3002']);

  const earned = { VC: 0, EF: 0, EL: 0, MN: 0, HASS: 0, ESP: 0, IR: 0, GR: 0, CAPS: 0, EN: 0, RC: 0, FR: 0, total: 0 };
  let espAdvDone = 0;

  for (const row of data) {
    const { code, category: storedCat, credits } = row.courses || {};
    if (!code) continue;
    const category = resolveCategory(code, storedCat);
    const cr = Number(credits) || 0;

    if (category === 'GR') {
      // GR: 졸업학점 미포함, 표시용으로만 집계
      earned.GR += cr;

    } else if (category === 'RC') {
      if (RC_EXCLUDED.has(code)) {
        // 체육 과목: 졸업학점 미포함
      } else {
        earned.RC += cr;
        earned.total += cr;
      }

    } else if (category === 'ESP') {
      // ESP: 고급 과목(ES3001, ES3002) 둘 다 이수 시에만 4학점
      if (ESP_ADV.has(code)) espAdvDone++;

    } else if (category === 'FR') {
      // FR: 최대 12학점까지 졸업학점 인정
      earned.FR += cr;

    } else {
      earned[category] = (earned[category] || 0) + cr;
      earned.total += cr;
    }
  }

  // ESP 최종 처리
  earned.ESP = espAdvDone >= 2 ? 4 : 0;
  earned.total += earned.ESP;

  // FR 최대 12학점 반영
  const frCounted = Math.min(earned.FR, 12);
  earned.total += frCounted;

  return Response.json({
    earned,
    required: { VC: 8, EF: 28, EL: 40, MN: 16, HASS: 4, ESP: 4, IR: 4, CAPS: 4, EN: 4, FR: 12, total: 128 },
    espAdvDone,
  });
}
