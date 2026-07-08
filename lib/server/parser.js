/**
 * 한글 시간표 문자열을 JSONB 형식의 timeslots 배열로 변환
 * 예: "월요일 12:00~14:00 / 목요일 12:00~14:00"
 *  => [{ day: "MON", start: "12:00", end: "14:00" }, { day: "THU", start: "12:00", end: "14:00" }]
 */

const PREFIX_TO_CATEGORY = {
  EF: 'EF',
  EL: 'EL',
  EN: 'EN',
  ES: 'ESP',
  FR: 'FR',
  GR: 'GR',
  HA: 'HASS',
  IR: 'IR',
  MN: 'MN',
  RC: 'RC',
  VC: 'VC',
  CA: 'CAPS',
  EE: 'FR', // 대학원 과목 (학부생 수강 시 자유학점으로 인정)
};

// 대학원 과목 여부 (학부생이 수강 시 자유학점(FR) 인정, 졸업학점 포함 여부는 사용자가 선택)
export function isGraduateCourse(code) {
  return /^EE/.test(String(code || ''));
}

export function getCategoryFromCode(code) {
  if (!code) return null;
  // AP 학점 코드 (예: F000017) → EF
  if (/^[A-Z]\d{6}$/.test(String(code))) return 'EF';
  const fullPrefix = String(code).match(/^[A-Z]+/)?.[0] ?? '';
  for (let len = fullPrefix.length; len >= 1; len--) {
    const mapped = PREFIX_TO_CATEGORY[fullPrefix.slice(0, len)];
    if (mapped) return mapped;
  }
  // 매핑 실패 시 null 반환 → 호출부에서 DB 저장값 사용
  return null;
}

const DAY_MAP = {
  '월요일': 'MON', '월': 'MON',
  '화요일': 'TUE', '화': 'TUE',
  '수요일': 'WED', '수': 'WED',
  '목요일': 'THU', '목': 'THU',
  '금요일': 'FRI', '금': 'FRI',
  '토요일': 'SAT', '토': 'SAT',
  '일요일': 'SUN', '일': 'SUN',
};

const TIME_REGEX = /(\d{2}:\d{2})\s*[~-]\s*(\d{2}:\d{2})/;

export function parseTimeslots(timetableStr) {
  if (!timetableStr || typeof timetableStr !== 'string') return [];
  const trimmed = timetableStr.trim();
  if (trimmed === '' || trimmed === '시간미정') return [];

  const slots = [];

  for (const part of trimmed.split('/')) {
    const p = part.trim();
    if (!p) continue;

    let matchedDay = null;
    for (const [kor, eng] of Object.entries(DAY_MAP)) {
      if (p.includes(kor)) { matchedDay = eng; break; }
    }

    const timeMatch = p.match(TIME_REGEX);
    if (matchedDay && timeMatch) {
      slots.push({ day: matchedDay, start: timeMatch[1], end: timeMatch[2] });
    }
  }

  return slots;
}
