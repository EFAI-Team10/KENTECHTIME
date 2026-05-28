/**
 * 한글 시간표 문자열을 JSONB 형식의 timeslots 배열로 변환하는 유틸리티
 * 예: "월요일 12:00~14:00 / 목요일 12:00~14:00"
 *     => [{"day": "MON", "start": "12:00", "end": "14:00"}, {"day": "THU", "start": "12:00", "end": "14:00"}]
 */
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

module.exports = { parseTimeslots };
