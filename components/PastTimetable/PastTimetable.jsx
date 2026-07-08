'use client';
import { useState, useEffect } from 'react';
import TimetableGrid from '@/components/Timetable/TimetableGrid';
import { scheduleAPI } from '@/lib/api-client';
import './PastTimetable.css';

const SEM_LABEL = { spring: '봄학기', fall: '가을학기' };

function formatSemLabel(sem) {
  const m = sem.match(/^(\d{4})-(spring|fall)$/);
  if (!m) return sem;
  return `${m[1]}년 ${SEM_LABEL[m[2]]}`;
}

export default function PastTimetable() {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState(null);       // { available, exactSemesters, hasAnyHistory }
  const [selected, setSelected] = useState('');
  const [courses, setCourses] = useState([]);
  const [semLabel, setSemLabel] = useState('');
  const [isApproximate, setIsApproximate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || meta !== null) return;
    scheduleAPI.getPastSemesters()
      .then(res => setMeta(res.data))
      .catch(() => setMeta({ available: [], exactSemesters: [], hasAnyHistory: false }));
  }, [open, meta]);

  const handleLoad = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    setCourses([]);
    setSemLabel('');
    setIsApproximate(false);
    try {
      const res = await scheduleAPI.getPast(selected);
      setCourses(res.data.courses || []);
      setSemLabel(res.data.semLabel || '');
      setIsApproximate(res.data.isApproximate || false);
    } catch (err) {
      setError(err.response?.data?.error || '시간표를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    setOpen(v => !v);
    if (open) { setCourses([]); setSemLabel(''); setError(''); setSelected(''); setIsApproximate(false); }
  };

  const available = meta?.available || [];
  const exactSemesters = new Set(meta?.exactSemesters || []);

  return (
    <div className="past-timetable">
      <button className="past-toggle" onClick={handleToggle}>
        <span>과거 시간표 조회</span>
        <span className={`toggle-arrow${open ? ' open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="past-body">
          {meta === null ? (
            <p className="past-loading">불러오는 중...</p>
          ) : available.length === 0 ? (
            <p className="past-empty">개설교과목 데이터를 찾을 수 없습니다.</p>
          ) : (
            <>
              <div className="past-controls">
                <select
                  className="past-select"
                  value={selected}
                  onChange={e => {
                    setSelected(e.target.value);
                    setCourses([]); setSemLabel(''); setError(''); setIsApproximate(false);
                  }}
                >
                  <option value="">학기 선택...</option>
                  {available.map(sem => (
                    <option key={sem} value={sem}>
                      {formatSemLabel(sem)}
                      {exactSemesters.has(sem) ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="past-load-btn"
                  onClick={handleLoad}
                  disabled={!selected || loading}
                >
                  {loading ? '불러오는 중...' : '조회'}
                </button>
              </div>

              {error && <p className="past-error">{error}</p>}

              {semLabel && (
                <div className="past-result">
                  {isApproximate && (
                    <p className="past-approximate-note">
                      ※ 학기별 수강이력 정보가 없어 전체 수강이력 기준으로 표시합니다.
                      포털에서 수강이력을 다시 가져오면 학기별로 정확히 조회할 수 있습니다.
                    </p>
                  )}
                  <p className="past-sem-label">
                    {semLabel} 시간표
                    {courses.length === 0
                      ? ' — 매칭된 과목이 없습니다.'
                      : ` (${courses.length}과목 · ${courses.reduce((s, c) => s + (c.credits || 0), 0)}학점)`
                    }
                  </p>
                  {courses.length > 0 && (
                    <>
                      <p className="past-note">※ 분반별로 시간이 다른 과목은 첫 번째 분반 기준으로 표시됩니다.</p>
                      <TimetableGrid courses={courses} readOnly />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
