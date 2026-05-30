'use client';
import { useEffect, useState } from 'react';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts';
import { coursesAPI } from '@/lib/api-client';
import './Dashboard.css';

const REQUIRED = { VC: 8, EF: 28, EL: 40, total: 128 };

export default function Dashboard() {
  const [earned, setEarned] = useState({ VC: 0, EF: 0, EL: 0, total: 0 });

  useEffect(() => {
    coursesAPI.getRequirements()
      .then(res => setEarned(res.data.earned))
      .catch(() => {});
  }, []);

  const chartData = [
    { name: 'EL', value: Math.round((earned.EL / REQUIRED.EL) * 100), fill: earned.EL >= REQUIRED.EL ? '#27AE60' : '#E74C3C' },
    { name: 'EF', value: Math.round((earned.EF / REQUIRED.EF) * 100), fill: earned.EF >= REQUIRED.EF ? '#4A90D9' : '#E67E22' },
    { name: 'VC', value: Math.round((earned.VC / REQUIRED.VC) * 100), fill: earned.VC >= REQUIRED.VC ? '#8E44AD' : '#95A5A6' },
  ];

  return (
    <div className="dashboard">
      <h2>졸업 요건 현황</h2>
      <div className="dashboard-body">
        <ResponsiveContainer width="50%" height={220}>
          <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="90%" data={chartData}>
            <RadialBar label={{ position: 'insideStart', fill: '#fff', fontSize: 11 }} dataKey="value" />
            <Legend />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="requirements-list">
          {Object.entries({ VC: 8, EF: 28, EL: 40 }).map(([cat, req]) => (
            <div key={cat} className="requirement-item">
              <span className="cat-label">{cat}</span>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, (earned[cat] / req) * 100)}%`,
                    backgroundColor: earned[cat] >= req ? '#4A90D9' : '#E74C3C',
                  }}
                />
              </div>
              <span className="credits-text" style={{ color: earned[cat] >= req ? '#4A90D9' : '#E74C3C' }}>
                {earned[cat]} / {req}학점
              </span>
            </div>
          ))}
          <div className="requirement-item total">
            <span>총계</span>
            <span style={{ color: earned.total >= REQUIRED.total ? '#4A90D9' : '#555' }}>
              {earned.total} / {REQUIRED.total}학점
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
