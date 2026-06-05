'use client';
import { useEffect, useState } from 'react';

const VALID_TRACKS = ['전기/전자', '재료/화학', '인공지능'];
const TRACK_COLOR = {
  '전기/전자': '#7289FF',
  '재료/화학': '#6CDD8F',
  '인공지능': '#F05268',
};
const TRACK_ALIAS = { '원자력': '재료/화학', 'AI': '인공지능', '신소재': '재료/화학' };
function normalizePreferredTracks(arr) {
  return (arr || [])
    .map(t => TRACK_ALIAS[t] || t)
    .filter((t, i, a) => VALID_TRACKS.includes(t) && a.indexOf(t) === i);
}
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';

function formatSemester(sem) {
  if (!sem) return '';
  const m = sem.match(/^(\d{4})-(spring|fall|summer|winter)$/);
  if (!m) return sem;
  const ko = { spring: '봄학기', fall: '가을학기', summer: '하계', winter: '동계' };
  return `${m[1]}년 ${ko[m[2]]}`;
}
import TimetableGrid from '@/components/Timetable/TimetableGrid';
import Dashboard from '@/components/Dashboard/Dashboard';
import Chat from '@/components/Chat/Chat';
import Tracker from '@/components/Tracker/Tracker';
import { useTheme } from '@/contexts/ThemeContext';
import SettingsModal from '@/components/Settings/SettingsModal';
import { scheduleAPI, usersAPI, coursesAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './main.css';

const slotsConflict = (a = [], b = []) =>
  (a || []).some(sa => (b || []).some(sb =>
    sa.day === sb.day && sa.start < sb.end && sb.start < sa.end));

export default function MainPage() {
  const router = useRouter();
  const { semester, currentSchedule, setCurrentSchedule, user, token, logout } = useStore();
  const { theme } = useTheme();
  const irColor = theme?.catColors?.IR ?? '#EF8862';

  const [mounted, setMounted] = useState(false);

  // 추천 (읽기전용) / 내 시간표 (편집)
  const [recommendations, setRecommendations] = useState([]);          // [[course,...], ...]
  const [myTimetables, setMyTimetables] = useState([{ slot: 0, courses: [] }]);
  const [confirmedSlot, setConfirmedSlot] = useState(null);            // 경쟁률 반영 슬롯
  const [savedSlots, setSavedSlots] = useState(new Set());             // DB에 저장된(미수정) 슬롯
  const [view, setView] = useState({ type: 'rec', idx: 0 });           // 현재 보고있는 탭
  const [copyBuffer, setCopyBuffer] = useState(null);                  // 추천 → 내 시간표 복사 버퍼
  const [copied, setCopied] = useState(false);                         // 복사 완료 피드백
  const [trackerKey, setTrackerKey] = useState(0);                     // 확정 시 경쟁률 새로고침

  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [allCourses, setAllCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [completedCodes, setCompletedCodes] = useState(new Set());
  const [preferences, setPreferences] = useState({});
  const [trackOrder, setTrackOrder] = useState([]);
  const [irTaking, setIrTaking] = useState({ ir1: false, ir2: false });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!token) { router.replace('/auth'); return; }
    initializePage();
    setCoursesLoading(true);
    Promise.all([
      coursesAPI.getAll({ semester }),
      coursesAPI.getCompleted(),
    ]).then(([allRes, completedRes]) => {
      setAllCourses(allRes.data.courses || []);
      const codes = new Set((completedRes.data.courses || []).map(c => c.code).filter(Boolean));
      setCompletedCodes(codes);
    }).catch(() => {}).finally(() => setCoursesLoading(false));
  }, [mounted, token]);

  // 현재 보고있는 탭의 과목 목록 → store(currentSchedule) 동기화 (대시보드·그리드 공용)
  const currentCourses = view.type === 'rec'
    ? (recommendations[view.idx] || [])
    : (myTimetables[view.idx]?.courses || []);

  useEffect(() => {
    setCurrentSchedule(currentCourses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, recommendations, myTimetables]);

  const initializePage = async () => {
    setLoading(true);
    try {
      let prefs = {};
      try {
        const prefRes = await usersAPI.getPreferences();
        if (prefRes.data.preferences) prefs = prefRes.data.preferences;
        setPreferences(prefs);
        setTrackOrder(normalizePreferredTracks(prefs.preferred_tracks));
      } catch {}

      // 추천 생성 (항상 — 읽기전용 탭)
      try {
        const res = await scheduleAPI.recommend({ semester, preferences: prefs });
        setRecommendations(res.data.plans || []);
      } catch {}

      // 내 시간표 로드
      try {
        const myRes = await scheduleAPI.getMy(semester);
        const tts = (myRes.data.timetables || [])
          .map(t => ({ slot: t.slot, name: t.name || null, courses: (t.courses || []).filter(c => c.id) }));
        setMyTimetables(tts.length > 0 ? tts : [{ slot: 0, courses: [] }]);
        setSavedSlots(new Set(tts.map(t => t.slot))); // 로드된 슬롯 = 저장된 상태
        setConfirmedSlot(myRes.data.activeSlot ?? null);
        // 저장된 내 시간표가 있으면 그걸 먼저 보여줌
        if (tts.some(t => t.courses.length > 0)) {
          setView({ type: 'my', idx: 0 });
        } else {
          setView({ type: 'rec', idx: 0 });
        }
      } catch {
        setView({ type: 'rec', idx: 0 });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // '새 추천' — 추천만 다시 생성 (내 시간표 유지)
  const loadRecommendations = async () => {
    setLoading(true);
    try {
      let prefs = preferences;
      try {
        const prefRes = await usersAPI.getPreferences();
        if (prefRes.data.preferences) { prefs = prefRes.data.preferences; setPreferences(prefs); }
      } catch {}
      const res = await scheduleAPI.recommend({
        semester,
        preferences: { ...prefs, preferred_tracks: trackOrder },
      });
      setRecommendations(res.data.plans || []);
      setView({ type: 'rec', idx: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── 탭 선택 ──
  const selectRec = (i) => setView({ type: 'rec', idx: i });
  const selectMy  = (i) => setView({ type: 'my',  idx: i });

  // ── 트랙 우선순위 토글 (버튼 위치 고정, 순위 숫자만 변동) ──
  const toggleTrack = (track) => {
    setTrackOrder(prev => prev.includes(track)
      ? prev.filter(t => t !== track)
      : [...prev, track]);
  };

  // ── 내 시간표 편집 ──
  const markDirty = (slot) => setSavedSlots(prev => {
    if (!prev.has(slot)) return prev;
    const n = new Set(prev); n.delete(slot); return n;
  });

  const updateMyCourses = (updater) => {
    const slot = myTimetables[view.idx]?.slot;
    setMyTimetables(prev => prev.map((t, i) =>
      i === view.idx ? { ...t, courses: updater(t.courses) } : t));
    if (slot != null) markDirty(slot); // 수정되면 '미저장' 상태로
  };

  const handleAddCourse = (course) => {
    if (view.type !== 'my') return;
    const cur = myTimetables[view.idx]?.courses || [];
    const conflict = cur.some(c => slotsConflict(c.timeslots, course.timeslots));
    if (!conflict) updateMyCourses(cs => [...cs, course]);
  };

  const handleRemoveCourse = (course) => {
    if (view.type !== 'my') return;
    updateMyCourses(cs => cs.filter(c => c.id !== course.id));
  };

  // 충돌 과목을 클릭하면 겹치는 기존 과목을 제거하고 교체
  const handleReplaceCourse = (course) => {
    if (view.type !== 'my') return;
    updateMyCourses(cs => [
      ...cs.filter(c => c.id !== course.id && !slotsConflict(c.timeslots, course.timeslots)),
      course,
    ]);
  };

  // ── 복사/붙여넣기 (추천·내 시간표 모두 복사 가능) ──
  const copyCurrent = () => {
    setCopyBuffer(currentCourses);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const pasteIntoMy = () => {
    if (view.type !== 'my' || !copyBuffer) return;
    updateMyCourses(() => [...copyBuffer]);
  };

  // ── 내 시간표 추가/삭제/이름변경 ──
  const addMyTimetable = () => {
    const used = myTimetables.map(t => t.slot);
    let slot = 0; while (used.includes(slot)) slot++;
    setMyTimetables(prev => [...prev, { slot, courses: [], name: null }]);
    setView({ type: 'my', idx: myTimetables.length });
  };

  const renameMyTimetable = async (idx) => {
    const t = myTimetables[idx];
    if (!t) return;
    const input = window.prompt('내 시간표 이름을 입력하세요 (비우면 기본 이름)', t.name || '');
    if (input === null) return; // 취소
    const name = input.trim().slice(0, 40);
    setMyTimetables(prev => prev.map((x, i) => i === idx ? { ...x, name: name || null } : x));
    try { await scheduleAPI.setName({ semester, slot: t.slot, name }); } catch {}
  };

  const deleteMyTimetable = async (idx) => {
    const t = myTimetables[idx];
    if (!t) return;
    try { await scheduleAPI.deleteSlot(semester, t.slot); } catch {}
    setMyTimetables(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [{ slot: 0, courses: [] }];
    });
    if (confirmedSlot === t.slot) setConfirmedSlot(null);
    setSavedSlots(prev => { const n = new Set(prev); n.delete(t.slot); return n; });
    setView({ type: 'my', idx: 0 });
  };

  // ── 저장 / 확정 ──
  const saveMyTimetable = async () => {
    if (view.type !== 'my') return;
    const t = myTimetables[view.idx];
    try {
      await scheduleAPI.save({ courseIds: t.courses.map(c => c.id), semester, slot: t.slot });
      setSavedSlots(prev => new Set(prev).add(t.slot));
      alert('내 시간표가 저장되었습니다.');
    } catch {
      alert('저장에 실패했습니다.');
    }
  };

  const confirmMyTimetable = async () => {
    if (view.type !== 'my') return;
    const t = myTimetables[view.idx];
    const totalCr = (t.courses || []).reduce((s, c) => s + (c.credits || 0), 0);
    const minCr = preferences.last_semester ? 4 : 10;
    if (totalCr === 0) { alert('빈 시간표는 확정할 수 없습니다.'); return; }
    if (totalCr < minCr) {
      alert(`확정하려면 최소 ${minCr}학점이 필요합니다. (현재 ${totalCr}학점)`);
      return;
    }
    try {
      await scheduleAPI.save({ courseIds: t.courses.map(c => c.id), semester, slot: t.slot });
      await scheduleAPI.setActive({ semester, slot: t.slot });
      setSavedSlots(prev => new Set(prev).add(t.slot));
      setConfirmedSlot(t.slot);
      setTrackerKey(k => k + 1); // 경쟁률 새로고침
      alert('이 시간표가 확정되어 경쟁률에 반영됩니다.');
    } catch {
      alert('확정에 실패했습니다.');
    }
  };

  const cancelConfirmMyTimetable = async () => {
    try {
      await scheduleAPI.cancelActive(semester);
      setConfirmedSlot(null);
      setTrackerKey(k => k + 1);
    } catch {
      alert('확정 취소에 실패했습니다.');
    }
  };

  const openWithdrawModal = () => { setWithdrawError(''); setShowWithdrawModal(true); };

  const handleWithdrawSuccess = async (credentialResponse) => {
    setWithdrawError('');
    setWithdrawLoading(true);
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      setWithdrawError('Google 인증 응답이 비어있습니다.');
      setWithdrawLoading(false);
      return;
    }
    try {
      await usersAPI.deleteAccount(idToken);
      logout();
      router.replace('/auth');
    } catch (err) {
      setWithdrawError(err.response?.data?.error || '탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleWithdrawError = () => {
    setWithdrawError('Google 재인증이 취소되었거나 실패했습니다.');
  };

  if (!mounted) return null;

  const isRec = view.type === 'rec';

  return (
    <div className="main-page">
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onTrackOrderChange={setTrackOrder} />}
      <header className="main-header">
        <span className="logo">KENTECHTIME</span>
        <span className="semester-chip">{formatSemester(semester)}</span>
        <div className="header-right">
          {user && <span className="username">{user.name}</span>}
          <button className="settings-btn" onClick={() => setShowSettings(true)}>설정</button>
          <button className="logout-btn" onClick={() => { logout(); router.replace('/auth'); }}>로그아웃</button>
          <button className="withdraw-btn" onClick={openWithdrawModal}>회원 탈퇴</button>
        </div>
      </header>

      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="withdraw-modal" onClick={e => e.stopPropagation()}>
            <h3>회원 탈퇴</h3>
            <p>탈퇴하면 시간표, 수강 기록, 선호도 등 모든 데이터가 <strong>영구 삭제</strong>됩니다.</p>
            <p>계속하려면 Google 계정으로 다시 인증해주세요.</p>
            {withdrawError && <p className="withdraw-error">{withdrawError}</p>}
            <div className="withdraw-google-wrapper">
              {withdrawLoading ? <p>처리 중...</p>
                : <GoogleLogin onSuccess={handleWithdrawSuccess} onError={handleWithdrawError} />}
            </div>
            <div className="withdraw-modal-btns">
              <button onClick={() => setShowWithdrawModal(false)} disabled={withdrawLoading}>취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        <Dashboard onImportSuccess={loadRecommendations} currentSchedule={currentCourses} irTaking={irTaking} />

        <section className="schedule-section">
          <div className="plan-controls">
            <div className="plan-tabs">
              {recommendations.map((_, i) => (
                <button
                  key={`rec-${i}`}
                  className={isRec && view.idx === i ? 'active' : ''}
                  onClick={() => selectRec(i)}
                >
                  추천 {String.fromCharCode(65 + i)}
                </button>
              ))}

              {/* 트랙 우선순위 — 추천 탭에서만 표시, 버튼 위치 고정 */}
              {isRec && (
                <div className="track-mini">
                  <span className="track-mini-label">트랙 우선순위</span>
                  {VALID_TRACKS.map(track => {
                    const idx = trackOrder.indexOf(track);
                    const sel = idx !== -1;
                    return (
                      <button
                        key={track}
                        type="button"
                        className={`track-chip ${sel ? 'sel' : ''}`}
                        style={sel ? { borderColor: TRACK_COLOR[track], background: TRACK_COLOR[track] + '18' } : {}}
                        onClick={() => toggleTrack(track)}
                      >
                        {sel && <span className="track-num" style={{ background: TRACK_COLOR[track] }}>{idx + 1}</span>}
                        {track}
                      </button>
                    );
                  })}
                  {trackOrder.length > 0 && (
                    <button className="track-reset" onClick={() => setTrackOrder([])}>초기화</button>
                  )}
                </div>
              )}
            </div>

            <div className="action-btns">
              {isRec ? (
                <>
                  <button onClick={loadRecommendations} disabled={loading}>
                    {loading ? '생성 중...' : '새 추천'}
                  </button>
                  <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyCurrent}>
                    {copied ? '✅ 복사 완료' : '📋 복사'}
                  </button>
                </>
              ) : (
                <>
                  <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyCurrent}>
                    {copied ? '✅ 복사 완료' : '📋 복사'}
                  </button>
                  <button className="paste-btn" onClick={pasteIntoMy} disabled={!copyBuffer}>
                    붙여넣기{copyBuffer ? '' : ' (복사 먼저)'}
                  </button>
                  <button className="rename-btn" onClick={() => renameMyTimetable(view.idx)}>✎ 이름</button>
                  <button className="save-btn" onClick={saveMyTimetable}>저장</button>
                  {confirmedSlot === myTimetables[view.idx]?.slot ? (
                    <button className="cancel-confirm-btn" onClick={cancelConfirmMyTimetable}>확정 취소</button>
                  ) : (() => {
                    const courses = myTimetables[view.idx]?.courses || [];
                    const totalCr = courses.reduce((s, c) => s + (c.credits || 0), 0);
                    const minCr = preferences.last_semester ? 4 : 10;
                    const disabled = totalCr < minCr;
                    const title = totalCr === 0
                      ? '빈 시간표는 확정할 수 없습니다'
                      : disabled
                        ? `최소 ${minCr}학점 필요 (현재 ${totalCr}학점)${preferences.last_semester ? '' : ' — 막학기 모드 시 4학점'}`
                        : '';
                    return (
                      <button className="confirm-btn" onClick={confirmMyTimetable} disabled={disabled} title={title}>확정</button>
                    );
                  })()}
                  {myTimetables.length > 1 && (
                    <button className="delete-tt-btn" onClick={() => deleteMyTimetable(view.idx)}>삭제</button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 내 시간표 탭 — 추천 탭 아래 별도 줄 */}
          <div className="plan-tabs my-tabs-row">
            {myTimetables.map((t, i) => {
              const saved = savedSlots.has(t.slot);
              return (
                <button
                  key={`my-${t.slot}`}
                  className={`my-tab ${!isRec && view.idx === i ? 'active' : ''} ${saved ? 'saved' : 'unsaved'}`}
                  onClick={() => selectMy(i)}
                  onDoubleClick={() => renameMyTimetable(i)}
                  title={
                    (confirmedSlot === t.slot ? '확정됨 (경쟁률 반영) · ' : '') +
                    (saved ? '저장됨' : '미저장 (변경사항 있음)') +
                    ' · 더블클릭하여 이름 변경'
                  }
                >
                  {t.name || `내 시간표 ${i + 1}`}
                  {confirmedSlot === t.slot && <span className="confirmed-mark"> ✓</span>}
                  <span className="save-dot">{saved ? '저장됨' : '●'}</span>
                </button>
              );
            })}
            <button className="tab-add" onClick={addMyTimetable} title="내 시간표 추가">＋</button>
          </div>

          <TimetableGrid
            courses={currentCourses}
            allCourses={allCourses}
            userGrade={user?.grade || 1}
            completedCodes={completedCodes}
            trackOrder={trackOrder}
            onTrackOrderChange={setTrackOrder}
            onAdd={handleAddCourse}
            onRemove={handleRemoveCourse}
            onReplace={handleReplaceCourse}
            coursesLoading={coursesLoading}
            readOnly={isRec}
          />

          <div className="ir-section">
            <span className="ir-section-label">개별연구 (IR)</span>
            {[
              { key: 'ir1', label: 'IR1', desc: '필수' },
              { key: 'ir2', label: 'IR2', desc: '선택' },
            ].map(({ key, label, desc }) => {
              // IR2는 IR1(개별연구 1, IR1001)을 기수강해야 선택 가능
              const locked = key === 'ir2' && !completedCodes.has('IR1001');
              return (
                <button
                  key={key}
                  className={`ir-chip${irTaking[key] ? ' ir-chip--taking' : ''}${locked ? ' ir-chip--locked' : ''}`}
                  style={!locked ? {
                    borderColor: irColor,
                    ...(irTaking[key] ? { background: irColor } : {}),
                  } : {}}
                  disabled={locked}
                  onClick={() => setIrTaking(prev => {
                    if (locked) return prev;
                    const turningOn = !prev[key];
                    // IR1·IR2는 같은 학기 동시 수강 불가 → 하나 켜면 다른 하나 해제
                    if (turningOn) return key === 'ir1' ? { ir1: true, ir2: false } : { ir1: false, ir2: true };
                    return { ...prev, [key]: false };
                  })}
                  title={
                    locked ? 'IR1(개별연구 1)을 기수강해야 IR2를 신청할 수 있습니다'
                    : irTaking[key] ? '수강 중 — 클릭하여 해제'
                    : '클릭하면 수강 중으로 표시'
                  }
                >
                  {label}
                  <span className="ir-chip-desc">{desc}</span>
                  {irTaking[key] && <span className="ir-chip-badge">수강 중</span>}
                  {locked && <span className="ir-chip-badge">🔒 IR1 기수강 필요</span>}
                </button>
              );
            })}
            <span className="ir-section-hint">수강 중인 IR 과목을 체크하면 졸업요건에 반영됩니다</span>
          </div>
        </section>

        <Chat semester={semester} onScheduleUpdate={(plan) => {
          // 챗봇 수정은 현재 내 시간표에 반영 (추천 탭이면 무시 안내 대신 내 시간표 0으로)
          if (view.type === 'my') {
            updateMyCourses(() => plan);
          } else {
            setMyTimetables(prev => prev.map((t, i) => i === 0 ? { ...t, courses: plan } : t));
            setView({ type: 'my', idx: 0 });
          }
        }} />
        <Tracker refreshKey={trackerKey} isConfirmed={confirmedSlot !== null} />
      </div>
    </div>
  );
}
