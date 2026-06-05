'use client';
import { useEffect, useState } from 'react';
import { trackerAPI } from '@/lib/api-client';
import useStore from '@/lib/store';
import './Tracker.css';

export default function Tracker({ refreshKey = 0, isConfirmed = false }) {
  const [data, setData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const semester = useStore(s => s.semester);

  const fetchData = async () => {
    try {
      const res = await trackerAPI.get(semester);
      setData(res.data.tracker);
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch {}
  };

  useEffect(() => {
    if (!isConfirmed) return;
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [semester, refreshKey, isConfirmed]);

  return (
    <div className="tracker">
      <div className="tracker-header">
        <h3>수강 희망 경쟁률</h3>
        {isConfirmed && lastUpdated && <span className="updated">업데이트: {lastUpdated}</span>}
      </div>
      {!isConfirmed ? (
        <div className="tracker-locked">
          <span className="tracker-locked-icon">🔒</span>
          <span className="tracker-locked-main">시간표를 &apos;확정&apos;해야 경쟁률을 조회할 수 있습니다.</span>
          <span className="tracker-locked-sub">내 시간표 탭에서 저장 후 <strong>확정</strong> 버튼을 눌러주세요.</span>
        </div>
      ) : data.length === 0 ? (
        <p className="empty">데이터가 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr><th>과목명</th><th>코드</th><th>수강 희망자</th></tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <td>{row.course?.name}</td>
                <td>{row.course?.code}</td>
                <td>{row.applicants}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
