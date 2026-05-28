import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainPage from './pages/MainPage';
import AdminPage from './pages/AdminPage';
import useStore from './store';
import { usersAPI } from './api';

function PrivateRoute({ children }) {
  const token = useStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { token, user } = useStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { token, user, setUser, logout } = useStore();

  // 새로고침 시 token은 있지만 user가 null인 경우 서버에서 복원
  useEffect(() => {
    if (token && !user) {
      usersAPI.getMe()
        .then(res => setUser(res.data.user))
        .catch(() => logout()); // 토큰 만료 시 로그아웃
    }
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/" element={<PrivateRoute><MainPage /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
