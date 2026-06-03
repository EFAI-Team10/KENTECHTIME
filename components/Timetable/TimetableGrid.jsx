'use client';
import { useState } from 'react';
import './TimetableGrid.css';

const TRACKS = ['전기/전자', '재료/화학', '인공지능', '원자력'];
const TRACK_COLOR = {
  '전기/전자': '#4A90D9',
  '재료/화학': '#27AE60',
  '인공지능': '#8E44AD',
  '원자력': '#E67E22',
};
const SCHEDULE_COLORS = ['#4A90D9', '#E67E22', '#27AE60', '#8E44AD', '#E74C3C', '#16A085', '#D35400'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_KO = { MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금' };
const HOURS = Array.from({ length: 11 }, (_, i) => i + 9);

function pad(h) { return `${String(h).padStart(2, '0')}:00`; }

function slotsConflict(a = [], b = []) {
  return a.some(sa => b.some(sb => sa.day === sb.day && sa.start < sb.end && sb.start < sa.end));
}

function sortCourses(courses, userGrade, trackOrder) {
  const keyOf = (c) => {
    const gradeMatch  = c.target_grade === userGrade;
    const noGrade     = c.target_grade === 0;
    const trackIdx    = trackOrder.indexOf(c.track);
    const trackMatch  = trackIdx !== -1;
    const isEL        = c.category === 'EL';
    const isEF        = c.category === 'EF';

    // 1순위: EL + 내 학년 + 선택 트랙 (트랙 순서 내에서 세부 정렬)
    if (isEL && gradeMatch && trackMatch)   return [0, trackIdx, 0];

    // 2순위: 비EL·비EF + 학년 제한 없음 (MN/HASS/EN/ESP 등 졸업 필수 영역)
    if (!isEL && !isEF && noGrade)          return [1, 0, 0];

    // 3순위: EF + 학년 제한 없음
    if (isEF && noGrade)                    return [2, 0, 0];

    // 4순위: EL + 내 학년 + 트랙 미선택
    if (isEL && gradeMatch && !trackMatch)  return [3, 0, 0];

    // 5순위: 나머지 — 학년 거리순, 그 안에서 선택 트랙 우선
    const gradeDist = noGrade ? 0.5 : Math.abs(c.target_grade - userGrade);
    return [4, gradeDist, trackMatch ? trackIdx : 999];
  };

  return [...courses].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
}

export default function TimetableGrid({ courses = [], allCourses = [], userGrade = 1, onAdd, onRemove, coursesLoading = false }) {
  const [trackOrder, setTrackOrder] = useState([]);
  const [pickerSlot, setPickerSlot] = useState(null);

  const colorMap = {};
  courses.forEach((c, i) => { colorMap[c.id] = SCHEDULE_COLORS[i % SCHEDULE_COLORS.length]; });

  const toggleTrack = (track) =>
    setTrackOrder(prev =>
      prev.includes(track) ? prev.filter(t => t !== track) : [...prev, track]
    );

  // 셀 [hour:00, hour+1:00) 구간과 겹치는 과목 탐색 (30분 단위 시작 과목 포함)
  const coversCell = (s, day, hour) =>
    s.day === day && s.start < pad(hour + 1) && s.end > pad(hour);

  const getCourseAt = (day, hour) =>
    courses.find(c => (c.timeslots || []).some(s => coversCell(s, day, hour)));

  const pickerCourse = pickerSlot ? getCourseAt(pickerSlot.day, pickerSlot.hour) : null;

  const pickerList = pickerSlot
    ? sortCourses(
        allCourses.filter(c => (c.timeslots || []).some(s =>
          coversCell(s, pickerSlot.day, pickerSlot.hour)
        )),
        userGrade,
        trackOrder
      )
    : [];

  return (
    <div className="timetable-wrapper">
      {/* 트랙 우선순위 선택 */}
      <div className="track-selector">
        <span className="ts-label">트랙 우선순위</span>
        <div className="ts-checks">
          {TRACKS.map(track => {
            const idx = trackOrder.indexOf(track);
            const sel = idx !== -1;
            return (
              <label
                key={track}
                className={`ts-item ${sel ? 'sel' : ''}`}
                style={sel ? { borderColor: TRACK_COLOR[track], background: TRACK_COLOR[track] + '18' } : {}}
              >
                <input type="checkbox" checked={sel} onChange={() => toggleTrack(track)} />
                {sel && <span className="ts-num" style={{ background: TRACK_COLOR[track] }}>{idx + 1}</span>}
                <span className="ts-name">{track}</span>
              </label>
            );
          })}
        </div>
        {trackOrder.length > 0 && (
          <button className="ts-reset" onClick={() => setTrackOrder([])}>초기화</button>
        )}
      </div>

      {/* 시간표 그리드 */}
      <div className="timetable-grid">
        <div className="timetable-header">
          <div className="time-col" />
          {DAYS.map(d => <div key={d} className="day-col">{DAY_KO[d]}</div>)}
        </div>
        {HOURS.map(hour => (
          <div key={hour} className="timetable-row">
            <div className="time-col">{hour}:00</div>
            {DAYS.map(day => {
              const course = getCourseAt(day, hour);
              const isActive = pickerSlot?.day === day && pickerSlot?.hour === hour;
              return (
                <div
                  key={day}
                  className={`cell ${course ? 'occupied' : 'empty'} ${isActive ? 'active-cell' : ''}`}
                  style={course ? { background: colorMap[course.id] } : {}}
                  onClick={() => setPickerSlot({ day, hour })}
                  title={course?.name}
                >
                  {course
                    ? <span className="cell-text">{course.name}</span>
                    : <span className="cell-plus">+</span>
                  }
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 과목 선택 패널 */}
      {pickerSlot && (
        <>
          <div className="picker-backdrop" onClick={() => setPickerSlot(null)} />
          <div className="course-picker">
            <div className="picker-header">
              <span className="picker-title">
                {DAY_KO[pickerSlot.day]}요일 {pickerSlot.hour}:00
              </span>
              <button className="picker-close" onClick={() => setPickerSlot(null)}>✕</button>
            </div>

            <div className="picker-body">
              {/* 이미 등록된 과목 — 상단 정보 + 제거 버튼 */}
              {pickerCourse && (
                <div className="picker-occupied">
                  {pickerCourse.track && (
                    <span className="pk-track-badge" style={{ background: TRACK_COLOR[pickerCourse.track] || '#aaa' }}>
                      {pickerCourse.track}
                    </span>
                  )}
                  <div className="pk-name">{pickerCourse.name}</div>
                  <div className="pk-meta">{pickerCourse.code} · {pickerCourse.credits}학점</div>
                  {pickerCourse.target_grade > 0 && (
                    <div className="pk-grade-text">{pickerCourse.target_grade}학년 권장</div>
                  )}
                  <button
                    className="pk-remove-btn"
                    onClick={() => { onRemove?.(pickerCourse); setPickerSlot(null); }}
                  >
                    시간표에서 제거
                  </button>
                  <div className="picker-divider">이 시간대 다른 과목</div>
                </div>
              )}

              {/* 수강 가능한 과목 목록 */}
              {coursesLoading ? (
                <p className="picker-empty">과목 불러오는 중...</p>
              ) : pickerList.length === 0 ? (
                <p className="picker-empty">이 시간대에 개설된 과목이 없습니다.</p>
              ) : (
                <ul className="picker-list">
                  {pickerList.map(c => {
                    const conflict = courses.some(sc =>
                      sc.id !== c.id && slotsConflict(sc.timeslots, c.timeslots)
                    );
                    const added = courses.some(sc => sc.id === c.id);
                    return (
                      <li
                        key={c.id}
                        className={`pk-item ${conflict ? 'pk-conflict' : ''} ${added ? 'pk-added' : ''}`}
                        onClick={() => !conflict && !added && (onAdd?.(c), setPickerSlot(null))}
                      >
                        <div className="pk-item-tags">
                          {c.track && (
                            <span className="pk-track-badge" style={{ background: TRACK_COLOR[c.track] || '#aaa' }}>
                              {c.track}
                            </span>
                          )}
                          {c.target_grade > 0 && (
                            <span className="pk-grade-badge">{c.target_grade}학년</span>
                          )}
                          {conflict && <span className="pk-status conflict">충돌</span>}
                          {added && <span className="pk-status added">추가됨</span>}
                        </div>
                        <div className="pk-item-name">{c.name}</div>
                        <div className="pk-item-meta">{c.code}{c.section ? ` (${c.section}분반)` : ''} · {c.credits}학점</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
