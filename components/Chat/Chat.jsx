'use client';
import { useState, useRef, useEffect } from 'react';
import { chatAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './Chat.css';

export default function Chat({ semester, onScheduleUpdate }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '안녕하세요! 시간표 수정 요청을 입력해주세요. (예: "목요일 오전 수업은 빼줘")' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const currentSchedule = useStore(s => s.currentSchedule);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await chatAPI.send({ message: input, currentSchedule, semester, history: messages });
      const { reply, plans } = res.data;
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: reply || '시간표를 업데이트했습니다.' },
      ]);
      if (onScheduleUpdate && plans?.length) onScheduleUpdate(plans[0]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '처리 중 오류가 발생했습니다. 다시 시도해주세요.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <h3 className="chat-title">AI 시간표 도우미</h3>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <span>{msg.content}</span>
          </div>
        ))}
        {loading && <div className="message assistant typing">처리 중...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="시간표 수정 요청 입력..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading}>전송</button>
      </div>
    </div>
  );
}
