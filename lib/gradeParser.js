export const KENTECH_CODE_RE = /^([A-Z]{2,6}\d{3,6}|[A-Z]\d{6})$/;
const SKIP_RE = /^(영역구분|교과목코드|교과목명|합계|소계|인정|이수|취득|신청|평균|비고|학점|제목|작성일|작성자|구분|일자|결재명|진행상태|요청제목|요청일시|\*|-)$/;
const KENTECH_CATS = new Set(['EF','EL','VC','MN','HASS','ESP','IR','GR','CAPS','EN','RC','FR']);

// AP 학점 코드 (예: F000017) — 무조건 EF 영역으로 인정
const AP_CODE_RE = /^[A-Z]\d{6}$/;
// 타대학 학점교류/학점공유 과목 — 무조건 FR 영역으로 인정
const EXCHANGE_RE = /(공유|학점교류|교류)/;

// toImport: 자동 등록 가능한 과목 전부 (KENTECH 코드 + FR 같이 분류가 명확한 타대 과목 포함)
// external: 분류 불명확한 타대 과목 (사용자가 직접 출처·학점 입력 필요)
export function parseGradeData(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const toImport = [];
  const external = [];
  const seen = new Set();

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length >= 3) {
      const [cat, code, name] = cols;
      const credits = cols[3] ? parseFloat(cols[3]) || 0 : 0;
      const grade = cols[4] !== undefined ? cols[4] : null;
      const semester = cols[5] ? cols[5].trim() || null : null;
      if (!code || /^\d+$/.test(cat) || SKIP_RE.test(cat) || SKIP_RE.test(code) || /[가-힣]/.test(code)) continue;
      // 성적 열이 있는데 비어있으면 미이수 과목 → 건너뜀
      if (grade !== null && grade === '') continue;
      // 낙제(F)·Unpass(U) 과목은 기수강 처리하면 안 됨 → 건너뜀
      if (grade !== null && /^(F|U)$/i.test(grade.trim())) continue;
      if (seen.has(code)) continue;
      seen.add(code);

      // 카테고리 자동 결정: AP → EF, 학점교류/공유 → FR (영역구분·과목명·코드로 판별)
      const isAP       = AP_CODE_RE.test(code);
      const isExchange = code.includes('.') || EXCHANGE_RE.test(name) || EXCHANGE_RE.test(cat);

      let category;
      if (isAP)            category = 'EF';
      else if (isExchange) category = 'FR';
      else if (KENTECH_CATS.has(cat)) category = cat;
      else                 category = cat || 'EL';

      const info = { code, category, name: name || code, credits, ...(semester ? { semester } : {}) };

      if (isAP || isExchange || KENTECH_CODE_RE.test(code) || KENTECH_CATS.has(cat)) {
        toImport.push(info);
      } else {
        external.push(info);
      }
    } else {
      // 구형 비구조화 텍스트 fallback
      const matches = line.match(/[A-Z]{2,6}\d{3,6}|[A-Z]\d{6}/g) || [];
      matches.forEach(code => {
        if (!seen.has(code)) {
          seen.add(code);
          toImport.push({ code, category: 'EL', name: code, credits: 0 });
        }
      });
    }
  }
  return { toImport, external };
}

// 포털 콘솔 커맨드 (전체성적조회 페이지 F12 > Console에 붙여넣기)
// 포털은 실제 <tr>/role=row 테이블이 아니라 학기 헤더·과목 그리드·요약줄이
// 전부 형제(sibling) div로 나열되는 구조라, 과목 그리드(role=grid)를 만나면
// 바로 앞 형제에서 "YYYY학년도 N학기" 텍스트를 찾아 학기를 태깅한다.
export const CONSOLE_COMMAND =
`(function(){
  var seen=new Set(),out=[];
  function txt(e){return e?(e.innerText||e.textContent||'').trim():'';}
  function parseSem(t){t=t.replace(/\\s+/g,' ').trim();var m=t.match(/(\\d{4})(?:학년도)?\\s*(\\d)\\s*학기/);if(m)return m[1]+(m[2]==='1'?'-spring':'-fall');m=t.match(/(\\d{4})(?:학년도)?\\s*(하계|동계)계절학기/);if(m)return m[1]+(m[2]==='하계'?'-summer':'-winter');return null;}
  function cellTxt(c){var t=c.querySelector('.cl-text');return txt(t||c);}
  function findSem(g){var s=g.previousElementSibling,h=0;while(s&&h<6){var sem=parseSem(txt(s));if(sem)return sem;s=s.previousElementSibling;h++;}return '';}
  function extractGrid(g){var sem=findSem(g);if(!sem)return;g.querySelectorAll('[role="row"]').forEach(function(r){var cm={};r.querySelectorAll('[role="gridcell"]').forEach(function(c){var i=parseInt(c.getAttribute('aria-colindex'),10);if(i)cm[i]=cellTxt(c);});var code=cm[2];if(!code||seen.has(code))return;seen.add(code);out.push([cm[1]||'',code,cm[3]||'',cm[4]||'',cm[5]||'',sem].join('\\t'));});}
  function extractAll(){document.querySelectorAll('[role="grid"]').forEach(extractGrid);}
  var btn=document.createElement('button');btn.id='__kt_btn';btn.textContent='⏳ 과목 수집 중… 스크롤 건드리지 마세요';btn.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:14px 22px;background:#6b7280;color:#fff;border:none;border-radius:10px;cursor:default;font-size:15px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);';document.body.appendChild(btn);
  function finish(){var old=document.getElementById('__kt_btn');if(old)old.parentNode.removeChild(old);if(!out.length){alert('과목 정보를 찾을 수 없습니다.\\n전체성적조회 페이지에서 실행해주세요.');return;}var text=out.join('\\n');var b=document.createElement('button');b.id='__kt_btn';b.textContent=out.length+'개 과목 수집 완료 — 클릭해서 복사';b.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:14px 22px;background:#2563eb;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);';b.onclick=function(){navigator.clipboard.writeText(text).then(function(){b.textContent='✓ 복사됨! KENTECHTIME에 붙여넣기 하세요';b.style.background='#16a34a';setTimeout(function(){if(b.parentNode)b.parentNode.removeChild(b);},3000);}).catch(function(){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:0;left:0;width:2px;height:2px;';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);b.textContent='✓ 복사됨!';b.style.background='#16a34a';setTimeout(function(){if(b.parentNode)b.parentNode.removeChild(b);},3000);});};document.body.appendChild(b);}
  function scrollInner(cb){var ps=Array.from(document.querySelectorAll('[role="grid"] .cl-scrollbar')).filter(function(p){return p.scrollHeight>p.clientHeight+5;});var i=0;function next(){if(i>=ps.length){cb();return;}var p=ps[i++];var safety=0;function step(){safety++;extractAll();if(safety>60||p.scrollTop>=p.scrollHeight-p.clientHeight-5){next();return;}p.scrollTop+=100;p.dispatchEvent(new Event('scroll',{bubbles:true}));setTimeout(step,60);}step();}next();}
  setTimeout(function(){extractAll();var grids=document.querySelectorAll('[role="grid"]');var outer=grids.length?grids[0].closest('.cl-layout.cl-scrollbar[role="layout"]'):null;if(!outer)outer=document.querySelector('.cl-layout.cl-scrollbar[role="layout"]');function outerStep(safety){safety=(safety||0)+1;extractAll();if(!outer||safety>200||outer.scrollTop>=outer.scrollHeight-outer.clientHeight-5){scrollInner(finish);return;}outer.scrollTop+=Math.max(200,Math.floor(outer.clientHeight*0.8));outer.dispatchEvent(new Event('scroll',{bubbles:true}));setTimeout(function(){outerStep(safety);},150);}outerStep(0);},200);
})();`;

// 북마클릿: CONSOLE_COMMAND를 그대로 URL 인코딩해서 외부 서버 의존 없이 동작
export const BOOKMARKLET_HREF_HTML =
  `javascript:${encodeURIComponent(CONSOLE_COMMAND)}`
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
