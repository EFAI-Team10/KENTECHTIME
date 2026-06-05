'use client';
import { useState, useEffect } from 'react';
import { coursesAPI, usersAPI } from '@/lib/api-client';
import { parseGradeData, CONSOLE_COMMAND, BOOKMARKLET_HREF_HTML } from '@/lib/gradeParser';
import useStore from '@/lib/store';
import { useTheme } from '@/contexts/ThemeContext';
import { THEMES } from '@/lib/themes';
import './SettingsModal.css';

const CATEGORIES = ['VC','EF','EL','MN','HASS','ESP','IR','GR','CAPS','EN','RC','FR','GS'];
const TRACKS = ['전기/전자', '재료/화학', '인공지능'];
const TRACK_ALIAS = { '원자력': '재료/화학', 'AI': '인공지능', '신소재': '재료/화학' };
function normalizePreferredTracks(arr) {
  return (arr || [])
    .map(t => TRACK_ALIAS[t] || t)
    .filter((t, i, a) => TRACKS.includes(t) && a.indexOf(t) === i);
}

const ELECTIVE_OPTIONS = [
  { value: 'EN',   label: 'EN (창업)' },
  { value: 'HASS', label: 'HASS (인문사회)' },
  { value: 'MN',   label: 'MN (필수교양)' },
  { value: 'EL',   label: 'EL (전공선택)' },
  { value: 'FR',   label: 'FR (자유학점)' },
];

export default function SettingsModal({ onClose, onTrackOrderChange }) {
  const { user, setUser } = useStore(s => ({ user: s.user, setUser: s.setUser }));
  const { themeIdx, setTheme } = useTheme();

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
    prefer_compact: false,
    elective_cats: [],
    max_credits: 16,
  });
  const [recPrefSaving, setRecPrefSaving] = useState(false);
  const [recPrefDone, setRecPrefDone] = useState(false);

  useEffect(() => {
    usersAPI.getPreferences()
      .then(res => {
        const p = res.data.preferences;
        if (p) setRecPref({
          preferred_tracks: normalizePreferredTracks(p.preferred_tracks),
          last_semester:    !!p.last_semester,
          prefer_compact:   !!p.prefer_compact,
          elective_cats:    p.elective_cats || [],
          max_credits:      p.max_credits   ?? 16,
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
      onTrackOrderChange?.(recPref.preferred_tracks || []);
      setRecPrefDone(true);
    } catch {
      alert('추천 설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
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

        {/* ── 색상 테마 ── */}
        <div className="settings-section">
          <h3>색상 테마</h3>
          <div className="theme-grid">
            {THEMES.map((t, i) => (
              <button
                key={i}
                className={`theme-card ${themeIdx === i ? 'selected' : ''}`}
                onClick={() => setTheme(i)}
              >
                <div className="theme-swatches">
                  {t.preview.map((color, j) => (
                    <span key={j} className="theme-swatch" style={{ background: color }} />
                  ))}
                </div>
                <span className="theme-name">{t.name}</span>
              </button>
            ))}
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
                onChange={e => { setRecPref(p => ({ ...p, max_credits: parseInt(e.target.value) || 16 })); setRecPrefDone(false); }}
                style={{ width: 64 }}
              />
              <span style={{ fontSize: 12, color: '#888', marginLeft: 6 }}>학점 / 학기 (기본 16)</span>
            </div>
            <div className="pref-toggle-field">
              <div className="toggle-row">
                <span>막학기 모드 {recPref.last_semester ? '(최소 4학점만 채움)' : '(끄면 최소 10학점)'}</span>
                <button
                  type="button"
                  className={`toggle ${recPref.last_semester ? 'on' : ''}`}
                  onClick={() => { setRecPref(p => ({ ...p, last_semester: !p.last_semester })); setRecPrefDone(false); }}
                  aria-pressed={recPref.last_semester}
                >
                  <div className="toggle-thumb" />
                </button>
              </div>
            </div>
            <div className="pref-toggle-field">
              <div className="toggle-row">
                <span>공강 최소화 {recPref.prefer_compact ? '(과목 간 빈 시간 최소로 추천)' : '(끄면 우선순위 순)'}</span>
                <button
                  type="button"
                  className={`toggle ${recPref.prefer_compact ? 'on' : ''}`}
                  onClick={() => { setRecPref(p => ({ ...p, prefer_compact: !p.prefer_compact })); setRecPrefDone(false); }}
                  aria-pressed={recPref.prefer_compact}
                >
                  <div className="toggle-thumb" />
                </button>
              </div>
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

      </div>
    </div>
  );
}
