import React, { useEffect, useState } from 'react';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts';
import { coursesAPI } from '../../api';
import { parseGradeData, CONSOLE_COMMAND } from '../../utils/gradeParser';
import './Dashboard.css';

const REQUIRED = { VC: 8, EF: 28, EL: 40, total: 128 };
const CATEGORIES = ['EF','EL','VC','MN','HASS','ESP','IR','GR','CAPS','EN','RC','FR'];


const EMPTY_EXT = { name: '', source: '', credits: '', category: 'EL' };

export default function Dashboard() {
  const [earned, setEarned] = useState({ VC: 0, EF: 0, EL: 0, total: 0 });
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = useState('portal');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState(null); // { matched, unmatched, external }
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [extForm, setExtForm] = useState(EMPTY_EXT);
  const [extDone, setExtDone] = useState(false);

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
    const { kentech, external } = parseGradeData(pasteText);

    if (kentech.length === 0 && external.length === 0) {
      alert('과목코드를 찾을 수 없습니다.\n북마클릿을 사용해 전체성적조회 페이지에서 데이터를 복사했는지 확인해주세요.');
      return;
    }

    if (kentech.length > 0) {
      coursesAPI.importByCodes(kentech)
        .then(res => setPreview({ ...res.data, external }))
        .catch(() => alert('서버 오류가 발생했습니다.'));
    } else {
      setPreview({ matched: [], unmatched: [], external });
    }
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
    setActiveTab('portal');
    setPasteText('');
    setPreview(null);
    setImportDone(false);
    setExtForm(EMPTY_EXT);
    setExtDone(false);
  };

  const handleExtSubmit = async () => {
    if (!extForm.name.trim() || !extForm.source.trim() || !extForm.credits) return;
    setImporting(true);
    try {
      await coursesAPI.addExternal({
        name: extForm.name.trim(),
        source: extForm.source.trim(),
        credits: parseInt(extForm.credits, 10),
        category: extForm.category,
      });
      setExtDone(true);
      loadRequirements();
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setImporting(false);
    }
  };

  // 타대 과목을 기타 탭에 자동 채워서 이동 (과목명·학점·영역 자동 입력)
  const prefillExternal = (item) => {
    setExtForm({ name: item.name, source: '', credits: item.credits || '', category: item.category });
    setActiveTab('manual');
    setExtDone(false);
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
            <h3>수강이력 입력</h3>

            <div className="import-tabs">
              <button
                className={`import-tab${activeTab === 'portal' ? ' active' : ''}`}
                onClick={() => { setActiveTab('portal'); setPreview(null); setImportDone(false); }}
              >
                포털 가져오기
              </button>
              <button
                className={`import-tab${activeTab === 'manual' ? ' active' : ''}`}
                onClick={() => { setActiveTab('manual'); setExtDone(false); }}
              >
                기타 직접 입력
              </button>
            </div>

            {/* ── 포털 탭 ── */}
            {activeTab === 'portal' && (
              importDone ? (
                <>
                  <p className="import-success">
                    {preview?.matched?.length || 0}개 과목이 수강이력에 등록되었습니다.
                  </p>
                  <div className="import-modal-btns">
                    <button className="confirm-import-btn" onClick={handleClose}>확인</button>
                  </div>
                </>
              ) : preview ? (
                <>
                  <div className="preview-section">
                    {/* KENTECH 매칭 과목 */}
                    {preview.matched.length > 0 && (
                      <>
                        <p className="preview-label matched-label">KENTECH 과목 ({preview.matched.length}개)</p>
                        <ul className="preview-list">
                          {preview.matched.map(c => (
                            <li key={c.code}>
                              <span className="code-badge">{c.code}</span>
                              <span>{c.name}</span>
                              <span className="credits-badge">{c.credits}학점</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {/* KENTECH DB에 없는 코드 */}
                    {preview.unmatched.length > 0 && (
                      <>
                        <p className="preview-label unmatched-label">DB에 없는 KENTECH 코드 ({preview.unmatched.length}개)</p>
                        <p className="unmatched-codes">{preview.unmatched.join(', ')}</p>
                      </>
                    )}

                    {/* 타대 과목 */}
                    {preview.external?.length > 0 && (
                      <>
                        <p className="preview-label external-label">타대 과목 — 직접 등록 필요 ({preview.external.length}개)</p>
                        <ul className="preview-list">
                          {preview.external.map((c, i) => (
                            <li key={i}>
                              <span className="code-badge ext-badge">{c.category}</span>
                              <span className="ext-code-text">{c.code}</span>
                              <span className="ext-name-text">{c.name}</span>
                              <button className="ext-fill-btn" onClick={() => prefillExternal(c)}>
                                추가
                              </button>
                            </li>
                          ))}
                        </ul>
                        <p className="ext-notice">"추가" 버튼을 누르면 기타 탭에 자동으로 채워집니다.</p>
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
                      {importing ? '등록 중...' : 'KENTECH 과목 등록'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bookmarklet-guide">
                    <p className="guide-step"><span>1</span> KIS 포털 → 사용자서비스 → 성적 → <b>전체성적조회</b> → 조회</p>
                    <p className="guide-step"><span>2</span> <b>F12</b> → Console 탭에 아래 코드 붙여넣기 후 Enter</p>
                    <code className="bookmarklet-code" onClick={() => {
                      navigator.clipboard.writeText(CONSOLE_COMMAND);
                      alert('복사되었습니다.');
                    }}>
                      여기를 클릭해서 복사
                    </code>
                    <p className="guide-step"><span>3</span> 추출 완료 후 화면 우측 하단 <b>파란 버튼</b>을 클릭해서 복사</p>
                    <p className="guide-step"><span>4</span> 복사된 내용을 아래에 붙여넣고 "분석" 버튼을 누르세요.<br/><span className="guide-note">타대 계절학기 과목도 자동으로 감지됩니다.</span></p>
                  </div>
                  <textarea
                    className="paste-area"
                    placeholder="포털에서 복사한 내용을 여기에 붙여넣으세요..."
                    onChange={e => setPasteText(e.target.value)}
                    rows={6}
                  />
                  <div className="import-modal-btns">
                    <button onClick={handleClose}>취소</button>
                    <button className="confirm-import-btn" onClick={handleParse} disabled={!pasteText.trim()}>
                      분석
                    </button>
                  </div>
                </>
              )
            )}

            {/* ── 기타 직접 입력 탭 ── */}
            {activeTab === 'manual' && (
              extDone ? (
                <>
                  <p className="import-success">과목이 수강이력에 등록되었습니다.</p>
                  <div className="import-modal-btns">
                    <button onClick={() => { setExtForm(EMPTY_EXT); setExtDone(false); }}>추가 입력</button>
                    <button className="confirm-import-btn" onClick={handleClose}>완료</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ext-form">
                    <p className="ext-form-desc">
                      타대 계절학기 등 KENTECH 포털에 없는 과목을 직접 입력하세요.<br/>
                      <span className="ext-example">예) 서울대 계절학기, 연세대 하계 수업</span>
                    </p>
                    <div className="ext-field">
                      <label>출처 <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="예: 서울대 계절학기"
                        value={extForm.source}
                        onChange={e => setExtForm(f => ({ ...f, source: e.target.value }))}
                      />
                    </div>
                    <div className="ext-field">
                      <label>과목명 <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="예: 선형대수학"
                        value={extForm.name}
                        onChange={e => setExtForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="ext-row">
                      <div className="ext-field">
                        <label>학점 <span className="required">*</span></label>
                        <input
                          type="number"
                          min="1" max="12"
                          placeholder="3"
                          value={extForm.credits}
                          onChange={e => setExtForm(f => ({ ...f, credits: e.target.value }))}
                        />
                      </div>
                      <div className="ext-field">
                        <label>영역 <span className="required">*</span></label>
                        <select
                          value={extForm.category}
                          onChange={e => setExtForm(f => ({ ...f, category: e.target.value }))}
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="import-modal-btns">
                    <button onClick={handleClose}>취소</button>
                    <button
                      className="confirm-import-btn"
                      onClick={handleExtSubmit}
                      disabled={importing || !extForm.name.trim() || !extForm.source.trim() || !extForm.credits}
                    >
                      {importing ? '등록 중...' : '등록'}
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
