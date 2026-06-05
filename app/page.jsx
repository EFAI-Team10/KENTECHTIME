'use client';
import { useEffect, useState } from 'react';

const VALID_TRACKS = ['전기/전자', '재료/화학', '인공지능'];
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
          .map(t => ({ slot: t.slot, courses: (t.courses || []).filter(c => c.id) }));
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

  // ── 추천 → 내 시간표 복사/붙여넣기 ──
  const copyCurrentRec = () => {
    if (view.type !== 'rec') return;
    setCopyBuffer(recommendations[view.idx] || []);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const pasteIntoMy = () => {
    if (view.type !== 'my' || !copyBuffer) return;
    updateMyCourses(() => [...copyBuffer]);
  };

  // ── 내 시간표 추가/삭제 ──
  const addMyTimetable = () => {
    const used = myTimetables.map(t => t.slot);
    let slot = 0; while (used.includes(slot)) slot++;
    setMyTimetables(prev => [...prev, { slot, courses: [] }]);
    setView({ type: 'my', idx: myTimetables.length });
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

              <span className="tab-divider" />

              {myTimetables.map((t, i) => {
                const saved = savedSlots.has(t.slot);
                return (
                  <button
                    key={`my-${t.slot}`}
                    className={`my-tab ${!isRec && view.idx === i ? 'active' : ''} ${saved ? 'saved' : 'unsaved'}`}
                    onClick={() => selectMy(i)}
                    title={
                      (confirmedSlot === t.slot ? '확정됨 (경쟁률 반영) · ' : '') +
                      (saved ? '저장됨' : '미저장 (변경사항 있음)')
                    }
                  >
                    내 시간표 {i + 1}
                    {confirmedSlot === t.slot && <span className="confirmed-mark"> ✓</span>}
                    <span className="save-dot">{saved ? '저장됨' : '●'}</span>
                  </button>
                );
              })}
              <button className="tab-add" onClick={addMyTimetable} title="내 시간표 추가">＋</button>
            </div>

            <div className="action-btns">
              {isRec ? (
                <>
                  <button onClick={loadRecommendations} disabled={loading}>
                    {loading ? '생성 중...' : '새 추천'}
                  </button>
                  <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyCurrentRec}>
                    {copied ? '✅ 복사 완료' : '📋 복사'}
                  </button>
                </>
              ) : (
                <>
                  <button className="paste-btn" onClick={pasteIntoMy} disabled={!copyBuffer}>
                    붙여넣기{copyBuffer ? '' : ' (복사 먼저)'}
                  </button>
                  <button className="save-btn" onClick={saveMyTimetable}>저장</button>
                  <button className="confirm-btn" onClick={confirmMyTimetable}>확정</button>
                  {myTimetables.length > 1 && (
                    <button className="delete-tt-btn" onClick={() => deleteMyTimetable(view.idx)}>삭제</button>
                  )}
                </>
              )}
            </div>
          </div>

          {isRec && (
            <p className="rec-hint">추천은 읽기 전용입니다. <b>📋 복사</b> 후 <b>내 시간표</b> 탭에서 <b>붙여넣기</b> 하세요.</p>
          )}

          <TimetableGrid
            courses={currentCourses}
            allCourses={allCourses}
            userGrade={user?.grade || 1}
            completedCodes={completedCodes}
            trackOrder={trackOrder}
            onTrackOrderChange={setTrackOrder}
            onAdd={handleAddCourse}
            onRemove={handleRemoveCourse}
            coursesLoading={coursesLoading}
            readOnly={isRec}
          />

          <div className="ir-section">
            <span className="ir-section-label">개별연구 (IR)</span>
            {[
              { key: 'ir1', label: 'IR1', desc: '필수' },
              { key: 'ir2', label: 'IR2', desc: '선택' },
            ].map(({ key, label, desc }) => (
              <button
                key={key}
                className={`ir-chip${irTaking[key] ? ' ir-chip--taking' : ''}`}
                onClick={() => setIrTaking(prev => ({ ...prev, [key]: !prev[key] }))}
                title={irTaking[key] ? '수강 중 — 클릭하여 해제' : '클릭하면 수강 중으로 표시'}
              >
                {label}
                <span className="ir-chip-desc">{desc}</span>
                {irTaking[key] && <span className="ir-chip-badge">수강 중</span>}
              </button>
            ))}
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
        <Tracker refreshKey={trackerKey} />
      </div>
    </div>
  );
}
