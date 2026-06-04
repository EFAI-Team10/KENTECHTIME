'use client';
import { useState, useEffect } from 'react';
import { coursesAPI, usersAPI } from '@/lib/api-client';
import { parseGradeData, CONSOLE_COMMAND, BOOKMARKLET_HREF_HTML } from '@/lib/gradeParser';
import useStore from '@/lib/store';
import './SettingsModal.css';

const CATEGORIES = ['VC','EF','EL','MN','HASS','ESP','IR','GR','CAPS','EN','RC','FR','GS'];
const TRACKS = ['전기/전자', '재료/화학', '인공지능', '원자력'];

const ELECTIVE_OPTIONS = [
  { value: 'EN',   label: 'EN (영어)' },
  { value: 'HASS', label: 'HASS (인문사회)' },
  { value: 'MN',   label: 'MN (경영)' },
  { value: 'EL',   label: 'EL (전공선택)' },
  { value: 'FR',   label: 'FR (학점교류)' },
];

export default function SettingsModal({ onClose }) {
  const { user, setUser } = useStore(s => ({ user: s.user, setUser: s.setUser }));

  // ── 내 정보 ──
  const [profile, setProfile] = useState({ name: '', student_id: '', grade: 0 });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDone, setProfileDone] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (user) {
      setProfile({
        name:       user.name       || '',
        student_id: user.student_id || '',
        grade:      user.grade      || 0,
      });
    }
  }, [user]);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileError('');
    setProfileDone(false);
    try {
      const res = await usersAPI.updateProfile(profile);
      setUser(res.data.user);
      setProfileDone(true);
    } catch {
      setProfileError('저장 중 오류가 발생했습니다.');
    } finally {
      setProfileSaving(false);
    }
  };

  // ── 추천 설정 ──
  const [recPref, setRecPref] = useState({
    preferred_tracks: [],
    last_semester: false,
    elective_cats: [],
    max_credits: 21,
  });
  const [recPrefSaving, setRecPrefSaving] = useState(false);
  const [recPrefDone, setRecPrefDone] = useState(false);

  useEffect(() => {
    usersAPI.getPreferences()
      .then(res => {
        const p = res.data.preferences;
        if (p) setRecPref({
          preferred_tracks: p.preferred_tracks || [],
          last_semester:    !!p.last_semester,
          elective_cats:    p.elective_cats || [],
          max_credits:      p.max_credits   ?? 21,
        });
      })
      .catch(() => {});
  }, []);

  const toggleTrack = (track) => {
    setRecPref(p => {
      const tracks = p.preferred_tracks.includes(track)
        ? p.preferred_tracks.filter(t => t !== track)
        : [...p.preferred_tracks, track];
      return { ...p, preferred_tracks: tracks };
    });
    setRecPrefDone(false);
  };

  const toggleElectiveCat = (cat) => {
    setRecPref(p => {
      const cats = p.elective_cats.includes(cat)
        ? p.elective_cats.filter(c => c !== cat)
        : [...p.elective_cats, cat];
      return { ...p, elective_cats: cats };
    });
    setRecPrefDone(false);
  };

  const handleRecPrefSave = async () => {
    setRecPrefSaving(true);
    setRecPrefDone(false);
    try {
      await usersAPI.savePreferences(recPref);
      setRecPrefDone(true);
    } catch {}
    finally { setRecPrefSaving(false); }
  };

  const [mode, setMode] = useState('choose'); // 'choose' | 'portal' | 'manual'

  // 포털 모드
  const [pasteText, setPasteText] = useState('');
  const [portalPreview, setPortalPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [portalDone, setPortalDone] = useState(false);

  // 수동 모드
  const [allCourses, setAllCourses] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [courseSearch, setCourseSearch] = useState('');
  const [manualLoaded, setManualLoaded] = useState(false);
  const [manualDone, setManualDone] = useState(false);

  // 전체 삭제 모드
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearDone, setClearDone] = useState(false);

  // 수동 모드 진입 시 과목 목록 + 기존 수강이력 로드
  useEffect(() => {
    if (mode !== 'manual' || manualLoaded) return;
    Promise.all([coursesAPI.getAll(), coursesAPI.getCompleted()])
      .then(([allRes, completedRes]) => {
        setAllCourses(allRes.data.courses || []);
        const ids = new Set((completedRes.data.courses || []).map(c => c.id));
        setSelectedIds(ids);
        setManualLoaded(true);
      })
      .catch(() => {});
  }, [mode, manualLoaded]);

  // 포털 분석 — 전체 과목 정보 포함
  const handlePortalAnalyze = () => {
    const { toImport, external } = parseGradeData(pasteText);
    if (toImport.length === 0 && external.length === 0) {
      alert('과목코드를 찾을 수 없습니다.\n전체성적조회 페이지에서 콘솔 커맨드를 실행했는지 확인해주세요.');
      return;
    }
    setPortalPreview({ toImport, external });
  };

  // 포털 확인 → importByCodes 호출 (자동 생성 포함)
  const handlePortalConfirm = async () => {
    setSaving(true);
    try {
      await coursesAPI.importByCodes(portalPreview.toImport, { replace: true });
      setPortalDone(true);
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 수동 저장 → saveCompleted 호출 (전체 교체)
  const handleManualSave = async () => {
    setSaving(true);
    try {
      const courses = [...selectedIds].map(id => ({
        course_id: id,
        semester: '입력',
        grade: 'P',
      }));
      await coursesAPI.saveCompleted(courses);
      setManualDone(true);
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = async () => {
    setSaving(true);
    try {
      await coursesAPI.saveCompleted([]);
      setClearConfirm(false);
      setClearDone(true);
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCourse = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredCourses = allCourses.filter(c =>
    c.name.includes(courseSearch) || c.code.includes(courseSearch)
  );
  const coursesByCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = filteredCourses.filter(c => c.category === cat);
    return acc;
  }, {});

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>설정</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {/* ── 내 정보 ── */}
        <div className="settings-section">
          <h3>내 정보</h3>
          <div className="profile-form">
            <div className="profile-field">
              <label>이름</label>
              <input
                type="text"
                value={profile.name}
                onChange={e => { setProfile(p => ({ ...p, name: e.target.value })); setProfileDone(false); }}
                placeholder="이름 입력"
              />
            </div>
            <div className="profile-field">
              <label>학번</label>
              <input
                type="text"
                value={profile.student_id}
                onChange={e => { setProfile(p => ({ ...p, student_id: e.target.value })); setProfileDone(false); }}
                placeholder="학번 입력 (예: 20240001)"
              />
            </div>
            <div className="profile-field">
              <label>학년</label>
              <select
                value={profile.grade}
                onChange={e => { setProfile(p => ({ ...p, grade: parseInt(e.target.value) })); setProfileDone(false); }}
              >
                <option value={0}>선택</option>
                <option value={1}>1학년</option>
                <option value={2}>2학년</option>
                <option value={3}>3학년</option>
                <option value={4}>4학년</option>
              </select>
            </div>
          </div>
          {profileError && <p className="profile-error">{profileError}</p>}
          <div className="settings-btns">
            {profileDone && <span className="profile-saved">저장되었습니다</span>}
            <button
              className="btn-primary"
              onClick={handleProfileSave}
              disabled={profileSaving}
            >
              {profileSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* ── 추천 설정 ── */}
        <div className="settings-section">
          <h3>추천 설정</h3>
          <div className="profile-form">
            <div className="pref-elective-field">
              <span className="pref-elective-label">관심 트랙</span>
              <div className="pref-elective-chips">
                {TRACKS.map(track => {
                  const idx = recPref.preferred_tracks.indexOf(track);
                  const selected = idx !== -1;
                  return (
                    <label
                      key={track}
                      className={`pref-chip ${selected ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleTrack(track)}
                      />
                      {selected && <span className="pref-chip-order">{idx + 1}</span>}
                      {track}
                    </label>
                  );
                })}
              </div>
              <p className="pref-elective-hint">선택한 순서대로 EL 과목 우선순위가 정해집니다.</p>
            </div>
            <div className="profile-field">
              <label style={{ width: 80 }}>최대 학점</label>
              <input
                type="number"
                min={4} max={24}
                value={recPref.max_credits}
                onChange={e => { setRecPref(p => ({ ...p, max_credits: parseInt(e.target.value) || 21 })); setRecPrefDone(false); }}
                style={{ width: 64 }}
              />
              <span style={{ fontSize: 12, color: '#888', marginLeft: 6 }}>학점 / 학기 (기본 21)</span>
            </div>
            <div className="pref-toggle-field">
              <label className={`pref-toggle ${recPref.last_semester ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={recPref.last_semester}
                  onChange={e => { setRecPref(p => ({ ...p, last_semester: e.target.checked })); setRecPrefDone(false); }}
                />
                막학기 모드 (최소 4학점만 채워도 됨)
              </label>
            </div>
            <div className="pref-elective-field">
              <span className="pref-elective-label">남는 학점 채울 선호 영역</span>
              <div className="pref-elective-chips">
                {ELECTIVE_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className={`pref-chip ${recPref.elective_cats.includes(value) ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={recPref.elective_cats.includes(value)}
                      onChange={() => toggleElectiveCat(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="pref-elective-hint">선택 안 하면 기본 순서로 채웁니다.</p>
            </div>
          </div>
          <div className="settings-btns">
            {recPrefDone && <span className="profile-saved">저장되었습니다</span>}
            <button className="btn-primary" onClick={handleRecPrefSave} disabled={recPrefSaving}>
              {recPrefSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* ── 기수강 과목 관리 ── */}
        <div className="settings-section">
          <h3>기수강 과목 관리</h3>

          {/* 방식 선택 */}
          {mode === 'choose' && (
            <>
              <div className="settings-mode-select">
                <button className="settings-mode-btn" onClick={() => { setMode('portal'); setPortalPreview(null); setPasteText(''); setPortalDone(false); }}>
                  <span className="mode-icon">🖥️</span>
                  <div>
                    <div className="mode-title">포털에서 자동 가져오기</div>
                    <div className="mode-desc">KIS 포털 성적 데이터를 복사해 붙여넣기</div>
                  </div>
                </button>
                <button className="settings-mode-btn" onClick={() => { setMode('manual'); setManualDone(false); }}>
                  <span className="mode-icon">✏️</span>
                  <div>
                    <div className="mode-title">직접 선택하기</div>
                    <div className="mode-desc">체크박스로 직접 선택 (기존 이력 교체)</div>
                  </div>
                </button>
              </div>

              <div className="danger-zone">
                {clearDone ? (
                  <div className="clear-done-msg">
                    <span>수강이력이 모두 삭제되었습니다.</span>
                    <button onClick={() => { setClearDone(false); onClose(); }}>확인</button>
                  </div>
                ) : clearConfirm ? (
                  <div className="clear-confirm">
                    <p>수강이력을 <strong>모두 삭제</strong>하시겠습니까?<br/>
                      <span className="clear-warn">수동으로 추가한 과목 포함 모든 이력이 삭제됩니다.</span>
                    </p>
                    <div className="clear-confirm-btns">
                      <button onClick={() => setClearConfirm(false)} disabled={saving}>취소</button>
                      <button className="btn-danger" onClick={handleClearAll} disabled={saving}>
                        {saving ? '삭제 중...' : '전체 삭제'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-clear-all" onClick={() => setClearConfirm(true)}>
                    수강이력 전체 삭제
                  </button>
                )}
              </div>
            </>
          )}

          {/* 포털 모드 */}
          {mode === 'portal' && (
            portalDone ? (
              <div className="settings-done">
                <p className="done-msg">✓ {portalPreview?.toImport?.length || 0}개 과목이 수강이력에 추가되었습니다.</p>
                <div className="settings-btns">
                  <button onClick={() => { setMode('choose'); setPortalDone(false); }}>다른 방식으로</button>
                  <button className="btn-primary" onClick={onClose}>완료</button>
                </div>
              </div>
            ) : portalPreview ? (
              <>
                <div className="portal-preview">
                  {portalPreview.toImport.length > 0 && (
                    <>
                      <p className="preview-label matched-label">등록할 과목 ({portalPreview.toImport.length}개)</p>
                      <ul className="preview-list">
                        {portalPreview.toImport.map((c, i) => (
                          <li key={i}>
                            <span className="code-badge">{c.category}</span>
                            <span className="course-name-text">{c.name}</span>
                            <span className="credits-badge">{c.credits}학점</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {portalPreview.external.length > 0 && (
                    <>
                      <p className="preview-label external-label">타대 과목 ({portalPreview.external.length}개) — Dashboard에서 기타 입력</p>
                      <ul className="preview-list">
                        {portalPreview.external.map((c, i) => (
                          <li key={i}>
                            <span className="code-badge ext-badge">{c.category}</span>
                            <span className="course-name-text">{c.name || c.code}</span>
                            {c.credits ? <span className="credits-badge">{c.credits}학점</span> : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="settings-btns">
                  <button onClick={() => setPortalPreview(null)}>다시 붙여넣기</button>
                  <button onClick={() => setMode('choose')}>방식 변경</button>
                  <button
                    className="btn-primary"
                    onClick={handlePortalConfirm}
                    disabled={saving || portalPreview.toImport.length === 0}
                  >
                    {saving ? '저장 중...' : `${portalPreview.toImport.length}개 추가`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="portal-guide-sm">
                  <div className="guide-row"><span className="guide-num">1</span><span>KIS 포털 → 사용자서비스 → 성적 → <b>전체성적조회</b> → 조회</span></div>
                  <div className="guide-row"><span className="guide-num">2</span><span>아래 버튼을 <b>북마크 바로 드래그</b>해서 설치 (한 번만) — 또는 클릭하면 F12 커맨드 복사</span></div>
                  <div className="bookmarklet-row">
                    <span dangerouslySetInnerHTML={{ __html:
                      `<a href="${BOOKMARKLET_HREF_HTML}" class="bookmarklet-drag-btn" title="북마크 바로 드래그해서 설치">📎 포털 성적 가져오기</a>`
                    }} />
                    <span className="bookmarklet-hint">← 북마크 바로 드래그 (한 번만)</span>
                  </div>
                  <div className="guide-row"><span className="guide-num">3</span><span>포털 전체성적조회 페이지에서 북마클릿 클릭 <span className="guide-note">(F12 방식: 콘솔에 붙여넣기 후 Enter)</span></span></div>
                  <div className="guide-row"><span className="guide-num">4</span><span>화면 우측 하단 <b>파란 버튼</b> 클릭 → 복사 후 아래에 붙여넣고 <b>분석</b></span></div>
                </div>
                <textarea
                  className="settings-paste"
                  placeholder="콘솔 실행 후 복사된 내용을 여기에 붙여넣으세요..."
                  onChange={e => setPasteText(e.target.value)}
                  rows={5}
                />
                <div className="settings-btns">
                  <button onClick={() => setMode('choose')}>이전</button>
                  <button className="btn-primary" onClick={handlePortalAnalyze} disabled={!pasteText.trim()}>분석</button>
                </div>
              </>
            )
          )}

          {/* 수동 모드 */}
          {mode === 'manual' && (
            manualDone ? (
              <div className="settings-done">
                <p className="done-msg">✓ 수강이력이 저장되었습니다. ({selectedIds.size}과목)</p>
                <div className="settings-btns">
                  <button onClick={() => { setMode('choose'); setManualDone(false); }}>다른 방식으로</button>
                  <button className="btn-primary" onClick={onClose}>완료</button>
                </div>
              </div>
            ) : (
              <>
                <p className="manual-note">현재 수강이력이 선택한 과목으로 <b>교체</b>됩니다.</p>
                <input
                  className="settings-search"
                  type="text"
                  placeholder="과목명 또는 코드 검색..."
                  value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)}
                />
                {!manualLoaded ? (
                  <p className="loading-msg">과목 목록 불러오는 중...</p>
                ) : allCourses.length === 0 ? (
                  <p className="loading-msg">개설 과목 데이터가 없습니다.</p>
                ) : (
                  <div className="settings-course-list">
                    {CATEGORIES.map(cat => coursesByCategory[cat].length > 0 && (
                      <div key={cat} className="course-category">
                        <h4 className={`cat-title cat-${cat}`}>{cat}</h4>
                        {coursesByCategory[cat].map(course => (
                          <label key={course.id} className={`course-item ${selectedIds.has(course.id) ? 'checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(course.id)}
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
                <div className="settings-btns">
                  <span className="selected-count">선택: {selectedIds.size}과목</span>
                  <button onClick={() => setMode('choose')}>이전</button>
                  <button className="btn-primary" onClick={handleManualSave} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
