'use client';
import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './auth.css';

export default function AuthPage() {
  const [error, setError] = useState('');
  const { setToken, setUser } = useStore();
  const router = useRouter();

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    const idToken = credentialResponse?.credential;
    if (!idToken) { setError('Google 인증 응답이 비어있습니다.'); return; }

    try {
      const res = await authAPI.googleLogin(idToken);
      if (res.data.is_new_user) {
        sessionStorage.setItem('authState', JSON.stringify({
          idToken,
          googleProfile: res.data.google,
        }));
        router.push('/onboarding');
        return;
      }
      setToken(res.data.token);
      setUser(res.data.user);
      router.push('/');
    } catch (err) {
      setError(err.response?.data?.error || '로그인에 실패했습니다.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>KENTECHTIME</h1>
        <p className="subtitle">KENTECH 맞춤형 시간표 추천 서비스</p>
        <p className="auth-hint">@kentech.ac.kr 계정으로 시작하세요</p>
        <div className="google-btn-wrapper">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google 로그인이 취소되었거나 실패했습니다.')}
          />
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
