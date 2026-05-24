import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, coursesAPI, usersAPI } from '../api';
import useStore from '../store';
import './RegisterPage.css';

const STEPS = ['기본 정보', '기수강 과목', '선호도'];
const TRACKS = ['AI', '신소재', '에너지그리드', '공통'];
const DAYS = [
  { value: 'MON', label: '월' },
  { value: 'TUE', label: '화' },
  { value: 'WED', label: '수' },
  { value: 'THU', label: '목' },
  { value: 'FRI', label: '금' },
];

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1
  const [form, setForm] = useState({ email: '', name: '', student_id: '', grade: '', password: '' });

  // Step 2
  const [allCourses, setAllCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [courseSearch, setCourseSearch] = useState('');

  // Step 3
  const [prefs, setPrefs] = useState({
    preferred_tracks: [],
    avoid_morning: false,
    day_off: [],
    preferred_gap: 60,
  });

  const { setToken, setUser } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (step === 1) {
      coursesAPI.getAll().then(res => setAllCourses(res.data.courses)).catch(() => {});
    }
  }, [step]);

  // Step 1 제출 → 회원가입 API
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.register(form);
      setToken(res.data.token);
      setUser(res.data.user);
      setStep(1);
    } catch (err) {
      setError(err.response?.data?.error || '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 제출 → 기수강 과목 저장
  const handleSaveCourses = async () => {
    setLoading(true);
    try {
      const courses = [...selectedCourseIds].map(id => ({ course_id: id }));
      await coursesAPI.saveCompleted(courses);
      setStep(2);
    } catch {
      setError('과목 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 제출 → 선호도 저장 후 메인 이동
  const handleSavePrefs = async () => {
    setLoading(true);
    try {
      await usersAPI.savePreferences({
        preferred_tracks: prefs.preferred_tracks,
        avoid_morning: prefs.avoid_morning,
        day_off: prefs.day_off,
        preferred_gap: prefs.preferred_gap,
      });
      navigate('/');
    } catch {
      setError('선호도 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCourse = (id) => {
    setSelectedCourseIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePrefArray = (key, value) => {
    setPrefs(prev => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

  const filteredCourses = allCourses.filter(c =>
    c.name.includes(courseSearch) || c.code.includes(courseSearch)
  );
  const coursesByCategory = ['VC', 'EF', 'EL'].reduce((acc, cat) => {
    acc[cat] = filteredCourses.filter(c => c.category === cat);
    return acc;
  }, {});

  return (
    <div className="auth-page">
      <div className="register-card">
        {/* 스테퍼 */}
        <div className="stepper">
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div className={`step-item ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                <div className="step-circle">{i < step ? '✓' : i + 1}</div>
                <span className="step-label">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {/* Step 1: 기본 정보 */}
        {step === 0 && (
          <form onSubmit={handleRegister}>
            <h2>기본 정보 입력</h2>
            <input
              type="email"
              placeholder="학교 이메일 (@kentech.ac.kr)"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="이름"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="학번"
              value={form.student_id}
              onChange={e => setForm({ ...form, student_id: e.target.value })}
            />
            <select value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} required>
              <option value="">학년 선택</option>
              {[1, 2, 3, 4].map(g => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <input
              type="password"
              placeholder="비밀번호 (8자 이상)"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? '처리 중...' : '다음'}
            </button>
            <p className="auth-link">이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
          </form>
        )}

        {/* Step 2: 기수강 과목 */}
        {step === 1 && (
          <div className="step-content">
            <h2>기수강 과목 선택</h2>
            <p className="step-desc">이전에 수강 완료한 과목을 모두 선택해주세요.</p>
            <input
              className="search-input"
              type="text"
              placeholder="과목명 또는 코드 검색..."
              value={courseSearch}
              onChange={e => setCourseSearch(e.target.value)}
            />
            {allCourses.length === 0 ? (
              <p className="empty-msg">아직 개설 과목 데이터가 없습니다.<br />관리자가 추가한 후 마이페이지에서 설정할 수 있습니다.</p>
            ) : (
              <div className="course-list">
                {['VC', 'EF', 'EL'].map(cat => coursesByCategory[cat].length > 0 && (
                  <div key={cat} className="course-category">
                    <h3 className={`cat-title cat-${cat}`}>{cat}</h3>
                    {coursesByCategory[cat].map(course => (
                      <label key={course.id} className={`course-item ${selectedCourseIds.has(course.id) ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.has(course.id)}
                          onChange={() => toggleCourse(course.id)}
                        />
                        <span className="course-name">{course.name}</span>
                        <span className="course-meta">{course.code} · {course.credits}학점</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="step-footer">
              <span className="selected-count">선택: {selectedCourseIds.size}과목</span>
              <button onClick={handleSaveCourses} disabled={loading}>
                {loading ? '저장 중...' : '다음'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 선호도 */}
        {step === 2 && (
          <div className="step-content">
            <h2>선호도 설정</h2>
            <p className="step-desc">시간표 추천에 활용됩니다.</p>

            <div className="pref-section">
              <label className="pref-label">관심 트랙</label>
              <div className="chip-group">
                {TRACKS.map(track => (
                  <button
                    key={track}
                    type="button"
                    className={`chip ${prefs.preferred_tracks.includes(track) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('preferred_tracks', track)}
                  >
                    {track}
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">공강 요일</label>
              <div className="chip-group">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    className={`chip ${prefs.day_off.includes(d.value) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('day_off', d.value)}
                  >
                    {d.label}요일
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">아침 수업 기피 (9:00 이전)</label>
              <div className="toggle-row">
                <span>{prefs.avoid_morning ? '기피함' : '상관없음'}</span>
                <button
                  type="button"
                  className={`toggle ${prefs.avoid_morning ? 'on' : ''}`}
                  onClick={() => setPrefs(p => ({ ...p, avoid_morning: !p.avoid_morning }))}
                >
                  <div className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">최소 공강 시간: {prefs.preferred_gap}분</label>
              <input
                type="range"
                min="0"
                max="120"
                step="15"
                value={prefs.preferred_gap}
                onChange={e => setPrefs(p => ({ ...p, preferred_gap: Number(e.target.value) }))}
                className="range-input"
              />
              <div className="range-labels"><span>0분</span><span>120분</span></div>
            </div>

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(1)}>이전</button>
              <button onClick={handleSavePrefs} disabled={loading}>
                {loading ? '저장 중...' : '완료'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
