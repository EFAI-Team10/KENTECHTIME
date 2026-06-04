import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

const PREFIX_TO_CAT = {
  EF:'EF', EL:'EL', EN:'EN', ES:'ESP', FR:'FR', GR:'GR',
  HA:'HASS', IR:'IR', MN:'MN', RC:'RC', VC:'VC', CA:'CAPS',
  GS:'GS',
};
function resolveCategory(code, stored) {
  const fullPrefix = String(code || '').match(/^[A-Z]+/)?.[0] ?? '';
  for (let len = fullPrefix.length; len >= 1; len--) {
    const mapped = PREFIX_TO_CAT[fullPrefix.slice(0, len)];
    if (mapped) return mapped;
  }
  return stored ?? 'EL';
}

const RC_EXCLUDED = new Set(['RC1011', 'RC1012', 'RC1013']);
const RC_SLP      = new Set(['RC2001', 'RC2002']);
const ESP_ADV     = new Set(['ES3001', 'ES3002']);
const ESP_STAGES  = [
  { label: '입문', codes: ['ES1001', 'ES1002'] },
  { label: '중급', codes: ['ES2001', 'ES2002'] },
  { label: '고급', codes: ['ES3001', 'ES3002'] },
];
const AP_CODE_RE = /^[A-Z]\d{6}$/;
const AP_EF_MAX  = 4;

const EF_MATH = new Set(['EF1001','EF1008','EF1009','EF1011','EF1012','EF1013','EF1014','EF1015','EF1016','EF1017','EF2007','EF2008','EF2031','EF2032','EF2033']);
const EF_PHYS = new Set(['EF1004','EF1005','EF1051','EF2004','EF2036']);
const EF_CHEM = new Set(['EF1002','EF1006','EF1007','EF2002','EF2005','EF2034']);
const EF_DL   = new Set(['EF1003','EF2003','EF2006','EF2035','EF2039']);

// 카테고리별 필수 학점 (초과분 → FR 산정 기준)
const CAT_REQUIRED = { VC:8, EF:28, EL:40, MN:16, HASS:4, IR:4, CAPS:4, EN:4, RC:4 };

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
  let espAdvDone   = 0;
  let apCreditCount = 0;
  let elUpperCount  = 0;
  const completedEspCodes = new Set();

  for (const row of data) {
    const { code, category: storedCat, credits: rawCredits } = row.courses || {};
    if (!code) continue;
    const category = resolveCategory(code, storedCat);

    let cr = Number(rawCredits) || 0;
    if (RC_SLP.has(code) && cr === 0) cr = 0.5;

    if (category === 'GR') {
      earned.GR += cr;

    } else if (category === 'RC') {
      if (!RC_EXCLUDED.has(code)) {
        earned.RC += cr;
      }

    } else if (category === 'ESP') {
      completedEspCodes.add(code);
      if (ESP_ADV.has(code)) espAdvDone++;

    } else if (category === 'FR') {
      earned.FR += cr;

    } else if (category === 'EF') {
      if (AP_CODE_RE.test(code)) {
        apCreditCount += cr;
      } else {
        earned.EF += cr;
        if (EF_MATH.has(code))      efSub.math    += cr;
        else if (EF_PHYS.has(code)) efSub.physics += cr;
        else if (EF_CHEM.has(code)) efSub.chem    += cr;
        else if (EF_DL.has(code))   efSub.dl      += cr;
      }

    } else if (category === 'EL' || category === 'GS') {
      earned.EL += cr;
      if (category === 'EL') {
        const levelDigit = parseInt(String(code).replace(/^EL/, '')[0]);
        if (levelDigit >= 4) elUpperCount++;
      }

    } else {
      earned[category] = (earned[category] || 0) + cr;
    }
  }

  // ESP: 고급 2개 이수 시 4학점
  earned.ESP = espAdvDone >= 2 ? 4 : 0;

  // AP → EF 최대 4학점
  const apCounted = Math.min(apCreditCount, AP_EF_MAX);
  earned.EF += apCounted;

  // RC 최종 (체육 제외 후 earned.RC 사용)

  // ── 카테고리 초과분 → FR 풀로 이동 ──
  const overflows = {};
  for (const [cat, req] of Object.entries(CAT_REQUIRED)) {
    const got = earned[cat] || 0;
    if (got > req) {
      overflows[cat] = got - req;
      earned.FR += got - req;
    }
  }

  // 졸업 총계 계산 (FR은 최대 12학점만 인정, 나머지는 실이수 표시)
  const frForGrad = Math.min(earned.FR, 12);
  earned.total =
    Math.min(earned.VC,   CAT_REQUIRED.VC)   +
    Math.min(earned.EF,   CAT_REQUIRED.EF)   +
    Math.min(earned.EL,   CAT_REQUIRED.EL)   +
    Math.min(earned.MN,   CAT_REQUIRED.MN)   +
    Math.min(earned.HASS, CAT_REQUIRED.HASS) +
    Math.min(earned.IR,   CAT_REQUIRED.IR)   +
    Math.min(earned.CAPS, CAT_REQUIRED.CAPS) +
    Math.min(earned.EN,   CAT_REQUIRED.EN)   +
    Math.min(earned.RC,   CAT_REQUIRED.RC)   +
    earned.ESP +
    frForGrad;

  // ESP 단계별 이수 현황
  const espStages = ESP_STAGES.map(({ label, codes }) => ({
    label,
    codes,
    doneCount: codes.filter(c => completedEspCodes.has(c)).length,
  }));

  // ESP 이전 단계 자동 완료 처리
  let espStageReached = -1;
  for (let i = ESP_STAGES.length - 1; i >= 0; i--) {
    if (ESP_STAGES[i].codes.some(c => completedEspCodes.has(c))) {
      espStageReached = i; break;
    }
  }
  const espAutoCompleted = espStageReached > 0
    ? ESP_STAGES.slice(0, espStageReached).flatMap(s => s.codes)
    : [];

  return Response.json({
    earned,
    required: { VC:8, EF:28, EL:40, MN:16, HASS:4, ESP:4, IR:4, CAPS:4, EN:4, FR:12, RC:4, total:128 },
    overflows,           // { EF: 4, EL: 0, ... } 초과분
    espAdvDone,
    espStages,           // [{label, codes, doneCount}, ...]
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
