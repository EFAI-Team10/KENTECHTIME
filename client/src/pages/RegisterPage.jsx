import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api';
import useStore from '../store';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', name: '', student_id: '', grade: '', password: '' });
  const [error, setError] = useState('');
  const { setToken, setUser } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await authAPI.register(form);
      setToken(res.data.token);
      setUser(res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || '회원가입에 실패했습니다.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>회원가입</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="학교 이메일 (@kentech.ac.kr)"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            required
          />
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
          />
          <select value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} required>
            <option value="">학년 선택</option>
            {[1, 2, 3, 4].map(g => <option key={g} value={g}>{g}학년</option>)}
          </select>
          <input
            type="password"
            placeholder="비밀번호"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">가입하기</button>
        </form>
        <p className="auth-link">이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
      </div>
    </div>
  );
}
