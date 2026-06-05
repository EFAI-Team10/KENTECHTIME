'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, coursesAPI, usersAPI } from '@/lib/api-client';
import { parseGradeData, CONSOLE_COMMAND, BOOKMARKLET_HREF_HTML } from '@/lib/gradeParser';
import useStore from '@/lib/store';
import './onboarding.css';

const STEPS = ['기본 정보', '기수강 과목', '선호도'];
const TRACKS = ['전기/전자', '재료/화학', '인공지능'];
const ELECTIVE_OPTIONS = [
  { value: 'EN',   label: 'EN (창업)' },
  { value: 'HASS', label: 'HASS (인문사회)' },
  { value: 'MN',   label: 'MN (필수교양)' },
  { value: 'EL',   label: 'EL (전공선택)' },
  { value: 'FR',   label: 'FR (자유학점)' },
];
export default function OnboardingPage() {
  const router = useRouter();
  const { setToken, setUser } = useStore();

  const [idToken, setIdToken] = useState(null);
  const [googleProfile, setGoogleProfile] = useState(null);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ name: '', student_id: '', semester: '' });

  const [allCourses, setAllCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [courseSearch, setCourseSearch] = useState('');

  const [prefs, setPrefs] = useState({
    preferred_tracks: [],
    max_credits: 16,
    last_semester: false,
    prefer_compact: false,
    elective_cats: [],
  });

  useEffect(() => {
    const raw = sessionStorage.getItem('authState');
    if (!raw) { router.replace('/auth'); return; }
    try {
      const { idToken: t, googleProfile: p } = JSON.parse(raw);
      setIdToken(t);
      setGoogleProfile(p);
      setForm(f => ({ ...f, name: p?.name || '' }));
    } catch {
      router.replace('/auth');
    }
  }, [router]);

  // 기수강 과목 입력 방식
  const [inputMode, setInputMode] = useState('choose'); // 'choose' | 'portal' | 'manual'
  const [pasteText, setPasteText] = useState('');
  const [portalPreview, setPortalPreview] = useState(null);

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

  const handleStep2Next = () => setStep(2);

  const handlePortalAnalyze = () => {
    const { toImport, external } = parseGradeData(pasteText);
    if (toImport.length === 0 && external.length === 0) {
      setError('과목코드를 찾을 수 없습니다. 전체성적조회 페이지에서 콘솔 커맨드를 실행했는지 확인해주세요.');
      return;
    }
    const importCodes = new Set(toImport.map(i => i.code));
    // 같은 코드가 여러 학기에 걸쳐 DB에 존재할 수 있으므로 코드당 1개만 선택
    const seenCodes = new Set();
    const matched = allCourses.filter(c => {
      if (!importCodes.has(c.code) || seenCodes.has(c.code)) return false;
      seenCodes.add(c.code);
      return true;
    });
    const matchedCodes = new Set(matched.map(c => c.code));
    const unmatched = [...importCodes].filter(code => !matchedCodes.has(code));
    setPortalPreview({ matched, unmatched, external });
    setError('');
  };

  const handlePortalConfirm = () => {
    setSelectedCourseIds(new Set(portalPreview.matched.map(c => c.id)));
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
      sessionStorage.removeItem('authState');
      setToken(res.data.token);
      setUser(res.data.user);
      // 추천 설정 전체 저장 (설정 화면과 동일 항목)
      try { await usersAPI.savePreferences(prefs); } catch {}
      router.push('/');
    } catch (err) {
      const msg = err.response?.data?.error || '가입에 실패했습니다.';
      setError(msg);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setTimeout(() => router.replace('/auth'), 1500);
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
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
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
            <div key={i} style={{ display: 'contents' }}>
              <div className={`step-item ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                <div className="step-circle">{i < step ? '✓' : i + 1}</div>
                <span className="step-label">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
            </div>
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
            <h2>기수강 과목 입력</h2>
            <p className="step-desc">이전에 수강 완료한 과목을 입력해주세요.</p>

            {inputMode === 'choose' && (
              <div className="input-mode-select">
                <button className="mode-btn" onClick={() => { setInputMode('portal'); setPortalPreview(null); setPasteText(''); }}>
                  <span className="mode-icon">🖥️</span>
                  <div>
                    <div className="mode-title">포털에서 자동 가져오기</div>
                    <div className="mode-desc">KIS 포털 성적 데이터를 복사해 붙여넣기</div>
                  </div>
                </button>
                <button className="mode-btn" onClick={() => setInputMode('manual')}>
                  <span className="mode-icon">✏️</span>
                  <div>
                    <div className="mode-title">직접 선택하기</div>
                    <div className="mode-desc">체크박스로 수강한 과목을 직접 선택</div>
                  </div>
                </button>
              </div>
            )}

            {inputMode === 'portal' && (
              portalPreview ? (
                <>
                  <div className="portal-preview">
                    {portalPreview.matched.length > 0 && (
                      <>
                        <p className="preview-label matched-label">인식된 KENTECH 과목 ({portalPreview.matched.length}개)</p>
                        <ul className="preview-list">
                          {portalPreview.matched.map(c => (
                            <li key={c.id}>
                              <span className="code-badge">{c.code}</span>
                              <span className="course-name-text">{c.name}</span>
                              <span className="credits-badge">{c.credits}학점</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {portalPreview.unmatched.length > 0 && (
                      <>
                        <p className="preview-label unmatched-label">DB 미등록 코드 ({portalPreview.unmatched.length}개)</p>
                        <p className="unmatched-codes">{portalPreview.unmatched.join(', ')}</p>
                      </>
                    )}
                    {portalPreview.external.length > 0 && (
                      <>
                        <p className="preview-label external-label">타대 과목 ({portalPreview.external.length}개) — 가입 후 별도 등록</p>
                        <ul className="preview-list">
                          {portalPreview.external.map((c, i) => (
                            <li key={i}>
                              <span className="code-badge ext-badge">{c.category}</span>
                              <span className="course-name-text">{c.name || c.code}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  <div className="step-footer">
                    <button className="btn-secondary" onClick={() => setPortalPreview(null)}>다시 붙여넣기</button>
                    <button className="btn-secondary" onClick={() => setInputMode('choose')}>방식 변경</button>
                    <button onClick={handlePortalConfirm} disabled={portalPreview.matched.length === 0}>
                      확인 ({portalPreview.matched.length}개)
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="portal-guide">
                    <div className="guide-step-item">
                      <span className="guide-num">1</span>
                      <div>KIS 포털 → 사용자서비스 → 성적 → <b>전체성적조회</b> → 조회<br/>
                        <span className="guide-url">https://kis.kentech.ac.kr/main.do</span>
                      </div>
                    </div>
                    <div className="guide-step-item">
                      <span className="guide-num">2</span>
                      <span>아래 버튼을 <b>북마크 바로 드래그</b> (한 번만) — 또는 클릭하면 F12 커맨드 복사</span>
                    </div>
                    <div className="bookmarklet-row">
                      <span dangerouslySetInnerHTML={{ __html:
                        `<a href="${BOOKMARKLET_HREF_HTML}" class="bookmarklet-drag-btn" title="북마크 바로 드래그해서 설치">📎 포털 성적 가져오기</a>`
                      }} />
                      <span className="bookmarklet-hint">← 북마크 바로 드래그 (한 번만)</span>
                    </div>
                    <div className="guide-step-item">
                      <span className="guide-num">3</span>
                      <span>추출 완료 후 화면 우측 하단 <b>파란 버튼</b>을 클릭해서 복사</span>
                    </div>
                    <div className="guide-step-item">
                      <span className="guide-num">4</span>
                      <span>복사된 내용을 아래에 붙여넣고 <b>분석</b></span>
                    </div>
                  </div>
                  <textarea className="paste-area" placeholder="콘솔 실행 후 복사된 내용을 여기에 붙여넣으세요..." value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5} />
                  <div className="step-footer">
                    <button className="btn-secondary" onClick={() => setInputMode('choose')}>이전</button>
                    <button onClick={handlePortalAnalyze} disabled={!pasteText.trim()}>분석</button>
                  </div>
                </>
              )
            )}

            {inputMode === 'manual' && (
              <>
                <input className="search-input" type="text" placeholder="과목명 또는 코드 검색..." value={courseSearch} onChange={e => setCourseSearch(e.target.value)} />
                {allCourses.length === 0 ? (
                  <p className="empty-msg">아직 개설 과목 데이터가 없습니다.<br/>관리자가 추가한 후 마이페이지에서 설정할 수 있습니다.</p>
                ) : (
                  <div className="course-list">
                    {['VC', 'EF', 'EL'].map(cat => coursesByCategory[cat].length > 0 && (
                      <div key={cat} className="course-category">
                        <h3 className={`cat-title cat-${cat}`}>{cat}</h3>
                        {coursesByCategory[cat].map(course => (
                          <label key={course.id} className={`course-item ${selectedCourseIds.has(course.id) ? 'checked' : ''}`}>
                            <input type="checkbox" checked={selectedCourseIds.has(course.id)} onChange={() => toggleCourse(course.id)} />
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
                  <button className="btn-secondary" onClick={() => setInputMode('choose')}>이전</button>
                  <button onClick={handleStep2Next}>다음</button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <h2>선호도 설정</h2>
            <p className="step-desc">시간표 추천에 활용됩니다.</p>

            <div className="pref-section">
              <label className="pref-label">관심 트랙</label>
              <div className="chip-group">
                {TRACKS.map(track => {
                  const idx = prefs.preferred_tracks.indexOf(track);
                  const selected = idx !== -1;
                  return (
                    <button
                      key={track}
                      type="button"
                      className={`chip ${selected ? 'selected' : ''}`}
                      onClick={() => togglePrefArray('preferred_tracks', track)}
                    >
                      {selected && <span className="chip-order">{idx + 1}</span>}
                      {track}
                    </button>
                  );
                })}
              </div>
              <p className="pref-hint">선택한 순서대로 EL 과목 우선순위가 정해집니다.</p>
            </div>

            <div className="pref-section">
              <label className="pref-label">최대 학점</label>
              <div className="toggle-row">
                <input
                  type="number"
                  min={4} max={24}
                  value={prefs.max_credits}
                  onChange={e => setPrefs(p => ({ ...p, max_credits: parseInt(e.target.value) || 16 }))}
                  style={{ width: 72 }}
                />
                <span style={{ fontSize: 12, color: '#888' }}>학점 / 학기 (기본 16)</span>
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">막학기 모드</label>
              <div className="toggle-row">
                <span>{prefs.last_semester ? '최소 4학점만 채움' : '끄면 최소 10학점'}</span>
                <button
                  type="button"
                  className={`toggle ${prefs.last_semester ? 'on' : ''}`}
                  onClick={() => setPrefs(p => ({ ...p, last_semester: !p.last_semester }))}
                >
                  <div className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">공강 최소화</label>
              <div className="toggle-row">
                <span>{prefs.prefer_compact ? '과목 간 빈 시간 최소로 추천' : '끄면 우선순위 순'}</span>
                <button
                  type="button"
                  className={`toggle ${prefs.prefer_compact ? 'on' : ''}`}
                  onClick={() => setPrefs(p => ({ ...p, prefer_compact: !p.prefer_compact }))}
                >
                  <div className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="pref-section">
              <label className="pref-label">남는 학점 채울 선호 영역</label>
              <div className="chip-group">
                {ELECTIVE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${prefs.elective_cats.includes(value) ? 'selected' : ''}`}
                    onClick={() => togglePrefArray('elective_cats', value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="pref-hint">선택 안 하면 기본 순서로 채웁니다.</p>
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
