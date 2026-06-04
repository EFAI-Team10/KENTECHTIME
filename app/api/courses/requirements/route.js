import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

// DB category가 잘못된 경우 코드 접두사로 재판별
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

// RC 체육 — 졸업학점 미포함
const RC_EXCLUDED = new Set(['RC1011', 'RC1012', 'RC1013']);
// RC SLP — 0.5학점 (DB가 INTEGER일 때 0으로 잘못 저장되는 경우 보정)
const RC_SLP = new Set(['RC2001', 'RC2002']);

// ESP 고급 과목 (둘 다 이수 시 4학점)
const ESP_ADV = new Set(['ES3001', 'ES3002']);
// ESP 전체 단계 순서 (앞 단계 → 뒷 단계)
const ESP_STAGES = [
  ['ES1001', 'ES1002'],   // 입문
  ['ES2001', 'ES2002'],   // 중급
  ['ES3001', 'ES3002'],   // 고급
];

// AP 학점 코드 패턴 (F000017 등)
const AP_CODE_RE = /^[A-Z]\d{6}$/;
const AP_EF_MAX = 4; // AP로 EF 인정 최대 학점

// EF 세부 영역 코드
const EF_MATH = new Set(['EF1001','EF1008','EF1009','EF1011','EF1012','EF1013','EF1014','EF1015','EF1016','EF1017','EF2007','EF2008','EF2031','EF2032','EF2033']);
const EF_PHYS = new Set(['EF1004','EF1005','EF1051','EF2004','EF2036']);
const EF_CHEM = new Set(['EF1002','EF1006','EF1007','EF2002','EF2005','EF2034']);
const EF_DL   = new Set(['EF1003','EF2003','EF2006','EF2035','EF2039']);

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

  const earned = { VC:0, EF:0, EL:0, MN:0, HASS:0, ESP:0, IR:0, GR:0, CAPS:0, EN:0, RC:0, FR:0, total:0 };
  const efSub = { math:0, physics:0, chem:0, dl:0 };
  let espAdvDone = 0;
  let apCreditCount = 0; // 이수한 AP 총 학점
  let elUpperCount = 0;  // EL 4/5 앞자리 이수 수
  const completedEspCodes = new Set();

  for (const row of data) {
    const { code, category: storedCat, credits: rawCredits } = row.courses || {};
    if (!code) continue;
    const category = resolveCategory(code, storedCat);

    // SLP 0.5학점 보정 (DB INTEGER 타입일 때 0으로 저장된 경우)
    let cr = Number(rawCredits) || 0;
    if (RC_SLP.has(code) && cr === 0) cr = 0.5;

    if (category === 'GR') {
      // GR: 졸업학점 미포함
      earned.GR += cr;

    } else if (category === 'RC') {
      if (!RC_EXCLUDED.has(code)) {
        earned.RC += cr;
        earned.total += cr;
      }

    } else if (category === 'ESP') {
      completedEspCodes.add(code);
      if (ESP_ADV.has(code)) espAdvDone++;

    } else if (category === 'FR') {
      earned.FR += cr;

    } else if (category === 'EF') {
      if (AP_CODE_RE.test(code)) {
        // AP 학점: 별도 누적, 나중에 4학점 cap 적용
        apCreditCount += cr;
      } else {
        earned.EF += cr;
        earned.total += cr;
        // 세부 영역 분류
        if (EF_MATH.has(code))      efSub.math    += cr;
        else if (EF_PHYS.has(code)) efSub.physics += cr;
        else if (EF_CHEM.has(code)) efSub.chem    += cr;
        else if (EF_DL.has(code))   efSub.dl      += cr;
      }

    } else if (category === 'EL') {
      earned.EL += cr;
      earned.total += cr;
      // EL 4/5 앞자리 과목 카운트 (고학년 전공심화)
      const levelDigit = parseInt(String(code).replace(/^EL/, '')[0]);
      if (levelDigit >= 4) elUpperCount++;

    } else {
      earned[category] = (earned[category] || 0) + cr;
      earned.total += cr;
    }
  }

  // ESP 최종 처리 (고급 2개 모두 이수 시 4학점)
  earned.ESP = espAdvDone >= 2 ? 4 : 0;
  earned.total += earned.ESP;

  // FR 최대 12학점 반영
  const frCounted = Math.min(earned.FR, 12);
  earned.total += frCounted;

  // AP → EF 최대 4학점 인정
  const apCounted = Math.min(apCreditCount, AP_EF_MAX);
  earned.EF += apCounted;
  earned.total += apCounted;

  // ESP 단계 자동 처리: 현재 이수 단계 기준 이전 단계 모두 완료로 간주
  // (예: ES3001 있으면 ES1001/2, ES2001/2도 이수 처리)
  let espStageReached = -1;
  for (let i = ESP_STAGES.length - 1; i >= 0; i--) {
    if (ESP_STAGES[i].some(c => completedEspCodes.has(c))) {
      espStageReached = i;
      break;
    }
  }
  // espStageReached: 실제 이수한 최고 단계 인덱스 (-1이면 미이수)
  // 이전 단계 코드 목록 (UI용)
  const espAutoCompleted = espStageReached > 0
    ? ESP_STAGES.slice(0, espStageReached).flat()
    : [];

  return Response.json({
    earned,
    required: { VC:8, EF:28, EL:40, MN:16, HASS:4, ESP:4, IR:4, CAPS:4, EN:4, FR:12, RC:4, total:128 },
    espAdvDone,
    espStageReached,
    espAutoCompleted,
    apCreditCount,
    apCounted,
    efSub,
    efSubRequired: { math:8, physics:4, chem:4, dl:4 },
    elUpperCount,
    elUpperRequired: 2,
  });
}
