import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI, coursesAPI } from '../api';
import useStore from '../store';
import './OnboardingPage.css';

const STEPS = ['기본 정보', '기수강 과목', '선호도'];
const TRACKS = ['AI', '신소재', '에너지그리드', '공통'];
const DAYS = [
  { value: 'MON', label: '월' },
  { value: 'TUE', label: '화' },
  { value: 'WED', label: '수' },
  { value: 'THU', label: '목' },
  { value: 'FRI', label: '금' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const idToken = location.state?.idToken;
  const googleProfile = location.state?.googleProfile;
  const { setToken, setUser } = useStore();

  useEffect(() => {
    if (!idToken) navigate('/auth', { replace: true });
  }, [idToken, navigate]);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: googleProfile?.name || '',
    student_id: '',
    semester: '',
  });

  const [allCourses, setAllCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [courseSearch, setCourseSearch] = useState('');

  const [prefs, setPrefs] = useState({
    preferred_tracks: [],
    avoid_morning: false,
    day_off: [],
    preferred_gap: 60,
  });

  useEffect(() => {
    if (step === 1 && allCourses.length === 0) {
      coursesAPI.getAll().then(res => setAllCourses(res.data.courses || [])).catch(() => {});
    }
  }, [step, allCourses.length]);

  const handleStep1Next = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.student_id.trim() || !form.semester) {
      setError('이름·학번·학기차를 모두 입력해주세요.');
      return;
    }
    setStep(1);
  };

  const handleStep2Next = () => {
    setStep(2);
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.googleRegister({
        id_token: idToken,
        name: form.name.trim(),
        student_id: form.student_id.trim(),
        semester: Number(form.semester),
        completed_course_ids: [...selectedCourseIds],
        preferences: prefs,
      });
      setToken(res.data.token);
      setUser(res.data.user);
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || '가입에 실패했습니다.';
      setError(msg);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setTimeout(() => navigate('/auth', { replace: true }), 1500);
      }
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

  if (!idToken) return null;

  return (
    <div className="auth-page">
      <div className="register-card">
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

        {step === 0 && (
          <form onSubmit={handleStep1Next}>
            <h2>기본 정보 입력</h2>
            {googleProfile?.email && (
              <p className="step-desc">{googleProfile.email}로 가입을 진행합니다.</p>
            )}
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
              required
            />
            <select
              value={form.semester}
              onChange={e => setForm({ ...form, semester: e.target.value })}
              required
            >
              <option value="">학기차 선택</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>{s}학기차</option>
              ))}
            </select>
            <button type="submit" disabled={loading}>다음</button>
          </form>
        )}

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
              <button className="btn-secondary" onClick={() => setStep(0)}>이전</button>
              <button onClick={handleStep2Next}>다음</button>
            </div>
          </div>
        )}

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
              <button onClick={handleFinish} disabled={loading}>
                {loading ? '가입 중...' : '완료'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}