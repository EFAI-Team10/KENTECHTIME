'use client';
import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { coursesAPI } from '@/lib/api-client';
import { parseGradeData, CONSOLE_COMMAND, BOOKMARKLET_HREF_HTML } from '@/lib/gradeParser';
import './Dashboard.css';

// 졸업요건 학점 (학사편람 기준)
const REQUIRED = { VC: 8, EF: 28, EL: 40, MN: 16, HASS: 4, ESP: 4, IR: 4, CAPS: 4, EN: 4, FR: 12, RC: 4, total: 128 };
// FR overflow 계산 대상 카테고리 (요구학점이 있는 카테고리)
const CAT_OVERFLOW_TARGET = { VC: 8, EF: 28, EL: 40, MN: 16, HASS: 4, IR: 4, CAPS: 4, EN: 4, RC: 4 };
const CAT_COLORS = {
  EL: '#27AE60', EF: '#4A90D9', VC: '#8E44AD',
  MN: '#F39C12', HASS: '#E74C3C', ESP: '#1A5276',
  IR: '#16A085', CAPS: '#626567', EN: '#2471A3',
  FR: '#717D7E', RC: '#196F3D', GR: '#CA6F1E', GS: '#6C3483',
};
const CATEGORIES = ['EF','EL','VC','MN','HASS','ESP','IR','GR','CAPS','EN','RC','FR','GS'];
const CAT_ORDER = ['EF','VC','EL','MN','HASS','EN','IR','CAPS','ESP','RC','FR','GR'];


const EMPTY_EXT = { name: '', source: '', credits: '', category: 'EL' };

function formatSemLabel(sem) {
  if (!sem || sem === 'imported') return '가져온 이력';
  if (sem === 'external') return '외부 과목';
  const m = sem.match(/^(\d{4})-(spring|fall|summer|winter)$/);
  if (!m) return sem;
  const ko = { spring: '봄학기', fall: '가을학기', summer: '하계', winter: '동계' };
  return `${m[1]}년 ${ko[m[2]]}`;
}

function semSortKey(sem) {
  if (!sem || sem === 'imported') return '0000-z';
  const m = sem.match(/^(\d{4})-(spring|fall|summer|winter)$/);
  if (!m) return sem;
  const order = { spring: '1', summer: '2', fall: '3', winter: '4' };
  return `${m[1]}-${order[m[2]] || '0'}`;
}

export default function Dashboard({ onImportSuccess, currentSchedule = [], irTaking = {} }) {
  const [earned, setEarned] = useState({ VC: 0, EF: 0, EL: 0, MN: 0, HASS: 0, ESP: 0, IR: 0, GR: 0, CAPS: 0, EN: 0, RC: 0, FR: 0, total: 0 });
  const [overflows, setOverflows] = useState({});
  const [espStages, setEspStages] = useState([]);
  const [espStageReached, setEspStageReached] = useState(-1);
  const [espAutoCompleted, setEspAutoCompleted] = useState([]);
  const [apCreditCount, setApCreditCount] = useState(0);
  const [apCounted, setApCounted] = useState(0);
  const [efSub, setEfSub] = useState({ math: 0, physics: 0, chem: 0, dl: 0 });
  const [efSubRequired] = useState({ math: 8, physics: 4, chem: 4, dl: 4 });
  const [elUpperCount, setElUpperCount] = useState(0);

  // 시간표 과목 → 카테고리별 계획 학점
  const planned = {};
  for (const c of currentSchedule) {
    const cat = c.category || 'EL';
    planned[cat] = (planned[cat] || 0) + Number(c.credits || 0);
  }

  // 시간표에서 EL4/5 과목 수 (미리보기용)
  const plannedElUpper = (currentSchedule || []).filter(c => {
    if (c.category !== 'EL') return false;
    const level = parseInt(String(c.code || '').replace(/^EL/, '')[0]);
    return level >= 4;
  }).length;

  // 시간표 추가 시 각 카테고리 초과분 → FR 미리보기
  const plannedFRExtra = Object.entries(CAT_OVERFLOW_TARGET).reduce((sum, [cat, req]) => {
    const got      = earned[cat] || 0;
    const plan     = planned[cat] || 0;
    const alreadyOver = Math.max(0, got - req);        // 이미 earned.FR에 반영된 초과분
    const projected   = Math.max(0, got + plan - req); // earned+planned 기준 초과분
    return sum + Math.max(0, projected - alreadyOver);
  }, 0);
  // FR 바의 계획 학점 = 직접 FR 과목 + 타 카테고리 초과 예정분
  planned['FR'] = (planned['FR'] || 0) + plannedFRExtra;
  // IR 토글 수강 중 → 계획 학점 반영 (IR1: 4학점, IR2: 4학점)
  if (irTaking.ir1) planned.IR = (planned.IR || 0) + 4;
  if (irTaking.ir2) planned.IR = (planned.IR || 0) + 4;
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = useState('portal');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState(null); // { matched, unmatched, external }
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [extForm, setExtForm] = useState(EMPTY_EXT);
  const [extDone, setExtDone] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadRequirements = () => {
    coursesAPI.getRequirements()
      .then(res => {
        const d = res.data;
        setEarned(d.earned);
        setOverflows(d.overflows || {});
        setEspStages(d.espStages || []);
        setEspStageReached(d.espStageReached ?? -1);
        setEspAutoCompleted(d.espAutoCompleted || []);
        setApCreditCount(d.apCreditCount || 0);
        setApCounted(d.apCounted || 0);
        setEfSub(d.efSub || { math: 0, physics: 0, chem: 0, dl: 0 });
        setElUpperCount(d.elUpperCount || 0);
      })
      .catch(() => {});
  };

  useEffect(() => { loadRequirements(); }, []);

  // 카테고리별 도넛 차트
  const donutData = Object.entries(REQUIRED)
    .filter(([cat]) => cat !== 'total')
    .map(([cat, req]) => ({
      name: cat,
      value: req,
      fill: (earned[cat] || 0) >= req ? (CAT_COLORS[cat] || '#4A90D9') : '#e8eaf0',
    }));
  const totalPct = Math.round((earned.total / REQUIRED.total) * 100);
  const plannedTotal = Object.values(planned).reduce((s, v) => s + v, 0);

  const handleParse = () => {
    const { toImport, external } = parseGradeData(pasteText);
    if (toImport.length === 0 && external.length === 0) {
      alert('과목코드를 찾을 수 없습니다.\n전체성적조회 페이지에서 콘솔 커맨드를 실행했는지 확인해주세요.');
      return;
    }
    setPreview({ toImport, external });
  };

  const handleConfirm = async () => {
    setImporting(true);
    try {
      // replace=true: 기존 portal import 전체 교체 (수동 추가 과목은 유지)
      await coursesAPI.importByCodes(preview.toImport, { replace: true });
      setImportDone(true);
      loadRequirements();
      setHistory(null);
      onImportSuccess?.();
    } catch {
      alert('서버 오류가 발생했습니다.');
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
        credits: parseFloat(extForm.credits),
        category: extForm.category,
      });
      setExtDone(true);
      loadRequirements();
      setHistory(null);
      onImportSuccess?.();
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const loadHistory = () => {
    setLoadingHistory(true);
    coursesAPI.getCompleted()
      .then(res => setHistory(res.data.courses || []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  };

  const toggleHistory = () => {
    if (!showHistory && history === null) loadHistory();
    setShowHistory(v => !v);
  };

  const handleDeleteCourse = async (courseId) => {
    try {
      await coursesAPI.removeCompleted(courseId);
      setHistory(h => h.filter(c => c.id !== courseId));
      loadRequirements();
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
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
        <div className="donut-wrapper">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={donutData}
                cx="50%" cy="50%"
                innerRadius="55%" outerRadius="80%"
                startAngle={90} endAngle={-270}
                dataKey="value"
                paddingAngle={1}
              >
                {donutData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <span className="donut-pct">{totalPct}%</span>
            <span className="donut-sub">
              {earned.total}{plannedTotal > 0 && <span className="planned-count" style={{ fontSize: 11 }}>+{plannedTotal}</span>} / {REQUIRED.total}학점
            </span>
          </div>
        </div>
        <div className="requirements-list">
          {Object.entries(REQUIRED).filter(([cat]) => cat !== 'total').map(([cat, req]) => {
            const got       = earned[cat] || 0;
            const plan      = planned[cat] || 0;
            const overflow  = overflows[cat] || 0;
            const color     = CAT_COLORS[cat] || '#4A90D9';
            const met       = got >= req;
            const earnedPct = Math.min(100, (got / req) * 100);
            const planPct   = Math.min(100, ((got + plan) / req) * 100);

            // ESP: 전용 바 계산
            const espTotal = 6;
            const espDone  = cat === 'ESP' ? espStages.reduce((s, st) => s + st.doneCount, 0) : 0;
            const espPlan  = cat === 'ESP' ? espStages.reduce((s, st) =>
              s + Math.min(2 - st.doneCount, (currentSchedule || []).filter(c => st.codes.includes(c.code)).length), 0) : 0;

            return (
              <div key={cat} className="requirement-item-block">
                <div className="requirement-item">
                  <span className="cat-label">{cat}</span>

                  {cat === 'ESP' && espStages.length > 0 ? (
                    /* ESP 단일 연속 바 */
                    <div className="esp-uni-bar-inline">
                      {espPlan > 0 && (
                        <div className="esp-uni-fill planned"
                          style={{ width: `${Math.min(100, ((espDone + espPlan) / espTotal) * 100)}%` }} />
                      )}
                      <div className="esp-uni-fill done"
                        style={{ width: `${(espDone / espTotal) * 100}%` }} />
                      <div className="esp-uni-divider" style={{ left: '33.33%' }} />
                      <div className="esp-uni-divider" style={{ left: '66.66%' }} />
                      <div className="esp-uni-stage-labels">
                        {espStages.map(st => (
                          <span key={st.label}
                            className={`esp-uni-label ${st.doneCount === 2 ? 'done' : st.doneCount > 0 ? 'partial' : ''}`}>
                            {st.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* 일반 프로그레스 바 */
                    <div className="progress-bar">
                      {plan > 0 && (
                        <div className="progress-fill progress-planned"
                          style={{ width: `${planPct}%`, backgroundColor: color }} />
                      )}
                      <div className="progress-fill"
                        style={{ width: `${earnedPct}%`, backgroundColor: met ? color : '#E74C3C' }} />
                    </div>
                  )}

                  <div className="credits-col">
                    <span className="credits-text" style={{ color: met ? color : '#555' }}>
                      {cat === 'ESP'
                        ? `${got} / ${req}학점`
                        : <>{got}{plan > 0 && <span className="planned-count">+{plan}</span>} / {req}학점</>
                      }
                    </span>
                  </div>
                </div>

                {/* EF 세부 요건 + 초과분 FR 안내 */}
                {cat === 'EF' && (
                  <div className="sub-requirements">
                    {[
                      { key: 'math',    label: '수학',  req: efSubRequired.math    },
                      { key: 'physics', label: '물리',  req: efSubRequired.physics },
                      { key: 'chem',    label: '화학',  req: efSubRequired.chem    },
                      { key: 'dl',      label: 'AI/DL', req: efSubRequired.dl      },
                    ].map(({ key, label, req: sr }) => {
                      const sg = efSub[key] || 0;
                      const ok = sg >= sr;
                      return (
                        <span key={key} className={`sub-req-chip ${ok ? 'ok' : 'ng'}`}>
                          {ok ? '✓' : '✗'} {label} {sg}/{sr}학점
                        </span>
                      );
                    })}
                    {apCounted > 0 && (
                      <span className="sub-req-chip ap">AP {apCounted}학점 인정{apCreditCount > apCounted ? ` (총 ${apCreditCount}학점 중)` : ''}</span>
                    )}
                    {overflow > 0 && (
                      <span className="sub-req-chip overflow">+{overflow}학점 초과 → FR 산정</span>
                    )}
                  </div>
                )}

                {/* EL 고학년 필수 바 + 초과분 */}
                {cat === 'EL' && (
                  <div className="sub-requirements">
                    <div className="esp-uni-bar-inline">
                      {plannedElUpper > 0 && elUpperCount < 2 && (
                        <div className="esp-uni-fill planned"
                          style={{ width: `${Math.min(100, ((elUpperCount + plannedElUpper) / 2) * 100)}%` }} />
                      )}
                      <div className="esp-uni-fill done"
                        style={{ width: `${Math.min(100, (elUpperCount / 2) * 100)}%` }} />
                      <div className="esp-uni-divider" style={{ left: '50%' }} />
                      <div className="esp-uni-stage-labels">
                        <span className={`esp-uni-label ${elUpperCount >= 1 ? 'done' : ''}`}>EL4/5 ①</span>
                        <span className={`esp-uni-label ${elUpperCount >= 2 ? 'done' : ''}`}>EL4/5 ②</span>
                      </div>
                    </div>
                    {overflow > 0 && (
                      <span className="sub-req-chip overflow">+{overflow}학점 초과 → FR 산정</span>
                    )}
                  </div>
                )}

                {/* 기타 카테고리 초과분 */}
                {!['EF','EL','ESP','FR'].includes(cat) && overflow > 0 && (
                  <div className="sub-requirements">
                    <span className="sub-req-chip overflow">+{overflow}학점 초과 → FR 산정</span>
                  </div>
                )}

                {/* ESP 이전 단계 자동완료 안내 */}
                {cat === 'ESP' && espStageReached > 0 && (
                  <div className="sub-requirements">
                    <span className="sub-req-chip ap">↑ 이전 단계 자동 이수 인정</span>
                  </div>
                )}

                {/* FR: 실이수 + 초과 안내 */}
                {cat === 'FR' && earned.FR > 0 && (
                  <div className="sub-requirements">
                    {earned.FR > req
                      ? <span className="sub-req-chip overflow">실이수 {earned.FR}학점 (12학점 초과 — {earned.FR - req}학점 미인정)</span>
                      : <span className="sub-req-chip ap">실이수 {earned.FR}학점 (최대 {req}학점 인정)</span>
                    }
                  </div>
                )}
              </div>
            );
          })}

          {/* GR: 졸업학점 미포함 */}
          {earned.GR > 0 && (
            <div className="requirement-item extra">
              <span className="cat-label" style={{ color: CAT_COLORS.GR }}>GR</span>
              <span className="credits-text extra-credits">{earned.GR}학점 이수 (졸업학점 미포함)</span>
            </div>
          )}
          <div className="requirement-item total">
            <span>졸업요건 총계</span>
            <span style={{ color: earned.total >= REQUIRED.total ? '#4A90D9' : '#555' }}>
              {earned.total}{plannedTotal > 0 && <span className="planned-count">+{plannedTotal}</span>} / {REQUIRED.total}학점
              {earned.total > REQUIRED.total && <span className="total-over"> (초과)</span>}
            </span>
          </div>
        </div>
      </div>

      {/* ── 수강이력 ── */}
      <div className="history-section">
        <button className="history-toggle" onClick={toggleHistory}>
          <span>수강이력</span>
          {history && (
            <span className="history-summary">
              {history.length}과목 &middot; {history.reduce((s, c) => s + (c.credits || 0), 0)}학점
            </span>
          )}
          <span className={`toggle-arrow${showHistory ? ' open' : ''}`}>▾</span>
        </button>
        {showHistory && (
          <div className="history-list">
            {loadingHistory ? (
              <p className="history-empty">불러오는 중…</p>
            ) : !history?.length ? (
              <p className="history-empty">등록된 수강이력이 없습니다.</p>
            ) : (() => {
              const grouped = {};
              history.forEach(c => { const s = c.semester || 'imported'; if (!grouped[s]) grouped[s] = []; grouped[s].push(c); });
              const sems = Object.keys(grouped).sort((a, b) => semSortKey(b).localeCompare(semSortKey(a)));
              return sems.map(sem => (
                <div key={sem} className="history-sem-group">
                  <div className="history-sem-label">{formatSemLabel(sem)}</div>
                  {[...grouped[sem]]
                    .sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category))
                    .map(course => (
                      <div key={course.id} className="history-item">
                        <span className="history-cat" style={{ background: (CAT_COLORS[course.category] || '#888') + '22', color: CAT_COLORS[course.category] || '#888' }}>
                          {course.category}
                        </span>
                        <span className="history-name">{course.name}</span>
                        <span className="history-credits">{course.credits}학점</span>
                        <button className="history-del" onClick={() => handleDeleteCourse(course.id)}>삭제</button>
                      </div>
                    ))}
                </div>
              ));
            })()}
          </div>
        )}
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
                    {preview?.toImport?.length || 0}개 과목이 수강이력에 등록되었습니다.
                  </p>
                  <div className="import-modal-btns">
                    <button className="confirm-import-btn" onClick={handleClose}>확인</button>
                  </div>
                </>
              ) : preview ? (
                <>
                  <div className="preview-section">
                    {preview.toImport?.length > 0 && (
                      <>
                        <p className="preview-label matched-label">등록할 과목 ({preview.toImport.length}개)</p>
                        <ul className="preview-list">
                          {preview.toImport.map((c, i) => (
                            <li key={i}>
                              <span className="code-badge">{c.category}</span>
                              <span className="ext-name-text">{c.name}</span>
                              <span className="credits-badge">{c.credits}학점</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {preview.external?.length > 0 && (
                      <>
                        <p className="preview-label external-label">분류 불명 타대 과목 ({preview.external.length}개) — 기타 탭에서 직접 추가</p>
                        <ul className="preview-list">
                          {preview.external.map((c, i) => (
                            <li key={i}>
                              <span className="code-badge ext-badge">{c.category || '?'}</span>
                              <span className="ext-name-text">{c.name || c.code}</span>
                              <button className="ext-fill-btn" onClick={() => prefillExternal(c)}>추가</button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  <div className="import-modal-btns">
                    <button onClick={() => setPreview(null)}>다시 붙여넣기</button>
                    <button
                      className="confirm-import-btn"
                      onClick={handleConfirm}
                      disabled={importing || !preview.toImport?.length}
                    >
                      {importing ? '등록 중...' : `${preview.toImport?.length || 0}개 등록`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bookmarklet-guide">
                    <p className="guide-step"><span>1</span> KIS 포털 → 사용자서비스 → 성적 → <b>전체성적조회</b> → 조회</p>
                    <p className="guide-step"><span>2</span> 아래 버튼을 <b>북마크 바로 드래그</b>해서 설치 (한 번만) — 또는 클릭하면 F12 커맨드 복사</p>
                    <div className="bookmarklet-row">
                      <span dangerouslySetInnerHTML={{ __html:
                        `<a href="${BOOKMARKLET_HREF_HTML}" class="bookmarklet-drag-btn" title="북마크 바로 드래그해서 설치">📎 포털 성적 가져오기</a>`
                      }} />
                      <span className="bookmarklet-hint">← 북마크 바로 드래그 (한 번만)</span>
                    </div>
                    <p className="guide-step"><span>3</span> 포털 전체성적조회 페이지에서 북마클릿 클릭 <span className="guide-note">(F12 방식: 콘솔에 붙여넣기 후 Enter)</span></p>
                    <p className="guide-step"><span>4</span> 화면 우측 하단 <b>파란 버튼</b> 클릭 → 복사 후 아래에 붙여넣고 "분석"<br/><span className="guide-note">타대 계절학기 과목도 자동으로 감지됩니다.</span></p>
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
                          min="0.5" max="12" step="0.5"
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
