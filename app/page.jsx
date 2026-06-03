'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import TimetableGrid from '@/components/Timetable/TimetableGrid';
import Dashboard from '@/components/Dashboard/Dashboard';
import Chat from '@/components/Chat/Chat';
import Tracker from '@/components/Tracker/Tracker';
import SettingsModal from '@/components/Settings/SettingsModal';
import { scheduleAPI, usersAPI, coursesAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './main.css';

export default function MainPage() {
  const router = useRouter();
  const { semester, currentSchedule, setCurrentSchedule, user, token, logout } = useStore();

  const [mounted, setMounted] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [allCourses, setAllCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!token) { router.replace('/auth'); return; }
    loadRecommendations();
    setCoursesLoading(true);
    coursesAPI.getAll({ semester })
      .then(res => setAllCourses(res.data.courses || []))
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
  }, [mounted, token]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const res = await scheduleAPI.recommend({ semester });
      setPlans(res.data.plans);
      if (res.data.plans.length > 0) {
        setCurrentSchedule(res.data.plans[0]);
        setSelectedPlan(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelect = (i) => {
    setSelectedPlan(i);
    setCurrentSchedule(plans[i]);
  };

  const handleAddCourse = (course) => {
    const conflict = currentSchedule.some(c =>
      (c.timeslots || []).some(sa =>
        (course.timeslots || []).some(sb =>
          sa.day === sb.day && sa.start < sb.end && sb.start < sa.end
        )
      )
    );
    if (!conflict) setCurrentSchedule([...currentSchedule, course]);
  };

  const handleRemoveCourse = (course) => {
    setCurrentSchedule(currentSchedule.filter(c => c.id !== course.id));
  };

  const saveSchedule = async () => {
    const courseIds = currentSchedule.map(c => c.id);
    try {
      await scheduleAPI.save({ courseIds, semester });
      alert('시간표가 저장되었습니다.');
    } catch {
      alert('저장에 실패했습니다.');
    }
  };

  const openWithdrawModal = () => {
    setWithdrawError('');
    setShowWithdrawModal(true);
  };

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

  return (
    <div className="main-page">
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <header className="main-header">
        <span className="logo">KENTECHTIME</span>
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
              {withdrawLoading ? (
                <p>처리 중...</p>
              ) : (
                <GoogleLogin onSuccess={handleWithdrawSuccess} onError={handleWithdrawError} />
              )}
            </div>
            <div className="withdraw-modal-btns">
              <button onClick={() => setShowWithdrawModal(false)} disabled={withdrawLoading}>취소</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        <Dashboard />

        <section className="schedule-section">
          <div className="plan-controls">
            <div className="plan-tabs">
              {plans.map((_, i) => (
                <button
                  key={i}
                  className={selectedPlan === i ? 'active' : ''}
                  onClick={() => handlePlanSelect(i)}
                >
                  Plan {String.fromCharCode(65 + i)}
                </button>
              ))}
            </div>
            <div className="action-btns">
              <button onClick={loadRecommendations} disabled={loading}>
                {loading ? '생성 중...' : '새 추천'}
              </button>
              <button className="save-btn" onClick={saveSchedule}>저장</button>
            </div>
          </div>
          <TimetableGrid
            courses={currentSchedule}
            allCourses={allCourses}
            userGrade={user?.grade || 1}
            onAdd={handleAddCourse}
            onRemove={handleRemoveCourse}
            coursesLoading={coursesLoading}
          />
        </section>

        <Chat semester={semester} onScheduleUpdate={(plan) => {
          setPlans(prev => [plan, ...prev.slice(1)]);
          setCurrentSchedule(plan);
          setSelectedPlan(0);
        }} />
        <Tracker />
      </div>
    </div>
  );
}
