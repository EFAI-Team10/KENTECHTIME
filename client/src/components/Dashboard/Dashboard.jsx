import React, { useEffect, useState } from 'react';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts';
import { coursesAPI } from '../../api';
import './Dashboard.css';

const REQUIRED = { VC: 8, EF: 28, EL: 40, total: 128 };

// 포털에서 복사한 텍스트에서 과목코드 추출 (대문자+숫자 패턴)
function parseCodes(text) {
  const matches = text.match(/[A-Z]{2,6}\d{3,6}/g);
  return matches ? [...new Set(matches)] : [];
}

export default function Dashboard() {
  const [earned, setEarned] = useState({ VC: 0, EF: 0, EL: 0, total: 0 });
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState(null); // { matched, unmatched }
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  const loadRequirements = () => {
    coursesAPI.getRequirements()
      .then(res => setEarned(res.data.earned))
      .catch(() => {});
  };

  useEffect(() => { loadRequirements(); }, []);

  const chartData = [
    { name: 'EL', value: Math.round((earned.EL / REQUIRED.EL) * 100), fill: earned.EL >= REQUIRED.EL ? '#27AE60' : '#E74C3C' },
    { name: 'EF', value: Math.round((earned.EF / REQUIRED.EF) * 100), fill: earned.EF >= REQUIRED.EF ? '#4A90D9' : '#E67E22' },
    { name: 'VC', value: Math.round((earned.VC / REQUIRED.VC) * 100), fill: earned.VC >= REQUIRED.VC ? '#8E44AD' : '#95A5A6' },
  ];

  const handleParse = () => {
    const codes = parseCodes(pasteText);
    if (codes.length === 0) {
      alert('과목코드를 찾을 수 없습니다.\n북마클릿을 사용해 포털에서 데이터를 복사했는지 확인해주세요.');
      return;
    }
    coursesAPI.importByCodes(codes)
      .then(res => setPreview(res.data))
      .catch(() => alert('서버 오류가 발생했습니다.'));
  };

  const handleConfirm = async () => {
    setImporting(true);
    try {
      setImportDone(true);
      loadRequirements();
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setShowImport(false);
    setPasteText('');
    setPreview(null);
    setImportDone(false);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>졸업 요건 현황</h2>
        <button className="import-btn" onClick={() => setShowImport(true)}>
          수강이력 가져오기
        </button>
      </div>

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
              <span className="credits-text" style={{ color: earned[cat] >= req ? '#4A90D9' : '#555' }}>
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

      {showImport && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            {importDone ? (
              <>
                <h3>가져오기 완료</h3>
                <p className="import-success">
                  {preview?.matched?.length || 0}개 과목이 수강이력에 등록되었습니다.
                </p>
                <div className="import-modal-btns">
                  <button className="confirm-import-btn" onClick={handleClose}>확인</button>
                </div>
              </>
            ) : preview ? (
              <>
                <h3>수강이력 미리보기</h3>
                <div className="preview-section">
                  <p className="preview-label matched-label">매칭된 과목 ({preview.matched.length}개)</p>
                  <ul className="preview-list">
                    {preview.matched.map(c => (
                      <li key={c.code}>
                        <span className="code-badge">{c.code}</span>
                        <span>{c.name}</span>
                        <span className="credits-badge">{c.credits}학점</span>
                      </li>
                    ))}
                  </ul>
                  {preview.unmatched.length > 0 && (
                    <>
                      <p className="preview-label unmatched-label">DB에 없는 코드 ({preview.unmatched.length}개)</p>
                      <p className="unmatched-codes">{preview.unmatched.join(', ')}</p>
                    </>
                  )}
                </div>
                <div className="import-modal-btns">
                  <button onClick={() => setPreview(null)}>다시 붙여넣기</button>
                  <button
                    className="confirm-import-btn"
                    onClick={handleConfirm}
                    disabled={importing || preview.matched.length === 0}
                  >
                    {importing ? '등록 중...' : '수강이력 등록'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>수강이력 가져오기</h3>
                <div className="bookmarklet-guide">
                  <p className="guide-step"><span>1</span> 아래 북마클릿 코드를 브라우저 즐겨찾기에 저장하세요.</p>
                  <code className="bookmarklet-code" onClick={e => {
                    navigator.clipboard.writeText(e.target.innerText);
                    alert('복사되었습니다.');
                  }}>
                    {`javascript:(function(){var rows=document.querySelectorAll('[role="row"]');var out=[];rows.forEach(function(r){var cells=r.querySelectorAll('[role="gridcell"]');if(cells.length>0){var texts=Array.from(cells).map(function(c){return c.innerText.trim().replace(/\\n/g,' ');});out.push(texts.join('\\t'));}});var text=out.join('\\n');navigator.clipboard.writeText(text).then(function(){alert('복사 완료! KENTECHTIME으로 돌아가 붙여넣기 하세요.');}).catch(function(){var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('복사 완료!');});})();`}
                  </code>
                  <p className="guide-step"><span>2</span> KENTECH 포털 <b>성적조회 페이지</b>에서 즐겨찾기를 클릭하세요.</p>
                  <p className="guide-step"><span>3</span> 복사된 내용을 아래에 붙여넣고 "분석" 버튼을 누르세요.</p>
                </div>
                <textarea
                  className="paste-area"
                  placeholder="포털에서 복사한 내용을 여기에 붙여넣으세요..."
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={6}
                />
                <div className="import-modal-btns">
                  <button onClick={handleClose}>취소</button>
                  <button
                    className="confirm-import-btn"
                    onClick={handleParse}
                    disabled={!pasteText.trim()}
                  >
                    분석
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
