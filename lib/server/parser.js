/**
 * 한글 시간표 문자열을 JSONB 형식의 timeslots 배열로 변환
 * 예: "월요일 12:00~14:00 / 목요일 12:00~14:00"
 *  => [{ day: "MON", start: "12:00", end: "14:00" }, { day: "THU", start: "12:00", end: "14:00" }]
 */

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
