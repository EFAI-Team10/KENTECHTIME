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
};

function getCategoryFromCode(code) {
  if (!code) return 'EL';
  const fullPrefix = String(code).match(/^[A-Z]+/)?.[0] ?? '';
  for (let len = fullPrefix.length; len >= 1; len--) {
    const mapped = PREFIX_TO_CATEGORY[fullPrefix.slice(0, len)];
    if (mapped) return mapped;
  }
  return 'EL';
}

function parseTimeslots(timetableStr) {
  if (!timetableStr || typeof timetableStr !== 'string') return [];
  if (timetableStr.trim() === '시간미정' || timetableStr.trim() === '') return [];

  const slots = [];
  const parts = timetableStr.split('/');

  const dayMap = {
    '월요일': 'MON', '월': 'MON',
    '화요일': 'TUE', '화': 'TUE',
    '수요일': 'WED', '수': 'WED',
    '목요일': 'THU', '목': 'THU',
    '금요일': 'FRI', '금': 'FRI',
    '토요일': 'SAT', '토': 'SAT',
    '일요일': 'SUN', '일': 'SUN'
  };

  const timeRegex = /(\d{2}:\d{2})\s*[~-]\s*(\d{2}:\d{2})/;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // 요일 탐색
    let matchedDay = null;
    for (const [korDay, engDay] of Object.entries(dayMap)) {
      if (trimmed.includes(korDay)) {
        matchedDay = engDay;
        break;
      }
    }

    // 시간 탐색
    const timeMatch = trimmed.match(timeRegex);
    if (matchedDay && timeMatch) {
      slots.push({
        day: matchedDay,
        start: timeMatch[1],
        end: timeMatch[2]
      });
    }
  }

  return slots;
}

module.exports = { parseTimeslots, getCategoryFromCode };
