import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TimetableGrid from '../components/Timetable/TimetableGrid';
import Dashboard from '../components/Dashboard/Dashboard';
import Chat from '../components/Chat/Chat';
import Tracker from '../components/Tracker/Tracker';
import { scheduleAPI, usersAPI } from '../api';
import useStore from '../store';
import './MainPage.css';

export default function MainPage() {
  const { semester, currentSchedule, setCurrentSchedule, user, logout } = useStore();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

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

  useEffect(() => { loadRecommendations(); }, []);

  const handlePlanSelect = (i) => {
    setSelectedPlan(i);
    setCurrentSchedule(plans[i]);
  };

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawLoading(true);
    try {
      await usersAPI.deleteAccount(withdrawPassword);
      logout();
    } catch (err) {
      setWithdrawError(err.response?.data?.error || '탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const openWithdrawModal = () => {
    setWithdrawPassword('');
    setWithdrawError('');
    setShowWithdrawModal(true);
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

  return (
    <div className="main-page">
      <header className="main-header">
        <span className="logo">KENTECHTIME</span>
        <div className="header-right">
          {user && user.role === 'admin' && (
            <Link to="/admin" className="admin-link-btn" style={{ marginRight: '16px', color: '#6366f1', textDecoration: 'none', fontWeight: 'bold' }}>
              관리자 콘솔
            </Link>
          )}
          {user && <span className="username">{user.name}</span>}
          <button className="logout-btn" onClick={logout}>로그아웃</button>
          <button className="withdraw-btn" onClick={openWithdrawModal}>회원 탈퇴</button>
        </div>
      </header>

      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="withdraw-modal" onClick={(e) => e.stopPropagation()}>
            <h3>회원 탈퇴</h3>
            <p>탈퇴하면 시간표, 수강 기록, 선호도 등 모든 데이터가 <strong>영구 삭제</strong>됩니다.</p>
            <p>계속하려면 비밀번호를 입력하세요.</p>
            <input
              type="password"
              placeholder="비밀번호"
              value={withdrawPassword}
              onChange={(e) => setWithdrawPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWithdraw()}
              className="withdraw-password-input"
              autoFocus
            />
            {withdrawError && <p className="withdraw-error">{withdrawError}</p>}
            <div className="withdraw-modal-btns">
              <button onClick={() => setShowWithdrawModal(false)} disabled={withdrawLoading}>취소</button>
              <button
                className="confirm-withdraw-btn"
                onClick={handleWithdraw}
                disabled={withdrawLoading || !withdrawPassword}
              >
                {withdrawLoading ? '처리 중...' : '탈퇴 확인'}
              </button>
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
          <TimetableGrid courses={currentSchedule} />
        </section>

        <Chat semester={semester} onScheduleUpdate={setCurrentSchedule} />
        <Tracker />
      </div>
    </div>
  );
}
