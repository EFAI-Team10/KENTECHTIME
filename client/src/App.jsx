import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import MainPage from './pages/MainPage';
import useStore from './store';
import { usersAPI } from './api';

function PrivateRoute({ children }) {
  const token = useStore(s => s.token);
  return token ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  const { token, user, setUser, logout } = useStore();

  useEffect(() => {
    if (token && !user) {
      usersAPI.getMe()
        .then(res => setUser(res.data.user))
        .catch(() => logout());
    }
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/register" element={<Navigate to="/auth" replace />} />
        <Route path="/" element={<PrivateRoute><MainPage /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
