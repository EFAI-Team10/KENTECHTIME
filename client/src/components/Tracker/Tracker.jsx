import React, { useEffect, useState } from 'react';
import { trackerAPI } from '../../api';
import './Tracker.css';

export default function Tracker() {
  const [data, setData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = async () => {
    try {
      const res = await trackerAPI.get();
      setData(res.data.tracker);
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="tracker">
      <div className="tracker-header">
        <h3>수강 희망 경쟁률</h3>
        {lastUpdated && <span className="updated">업데이트: {lastUpdated}</span>}
      </div>
      {data.length === 0 ? (
        <p className="empty">데이터가 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr><th>과목 코드</th><th>수강 희망자</th></tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.course_id}>
                <td>{row.course_id}</td>
                <td>{row.applicants}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
