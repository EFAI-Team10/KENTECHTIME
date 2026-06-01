export const KENTECH_CODE_RE = /^([A-Z]{2,6}\d{3,6}|[A-Z]\d{6})$/;
const SKIP_RE = /^(영역구분|교과목코드|교과목명|합계|소계|인정|이수|취득|신청|평균|비고|학점|제목|작성일|작성자|구분|일자|결재명|진행상태|요청제목|요청일시|\*|-)$/;
const KENTECH_CATS = new Set(['EF','EL','VC','MN','HASS','ESP','IR','GR','CAPS','EN','RC','FR']);

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
      if (!code || /^\d+$/.test(cat) || SKIP_RE.test(cat) || SKIP_RE.test(code) || /[가-힣]/.test(code)) continue;
      // 성적 열이 있는데 비어있으면 미이수 과목 → 건너뜀
      if (grade !== null && grade === '') continue;
      if (seen.has(code)) continue;
      seen.add(code);

      const info = { code, category: cat || 'EL', name: name || code, credits };

      if (KENTECH_CODE_RE.test(code)) {
        toImport.push(info);
      } else if (code.includes('.') || /(공유|학점교류)/.test(name)) {
        // 타대학 학점교류/학점공유 과목 → FR 카테고리로 자동 분류
        toImport.push({ ...info, category: 'FR' });
      } else if (KENTECH_CATS.has(cat)) {
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
// 중첩 스크롤 지원: 전체 스크롤 안에 학기별 세부 스크롤이 최대 16개 있어도 동작
export const CONSOLE_COMMAND =
`(function(){
  var SKIP=/^(영역구분|교과목코드|교과목명|합계|소계|인정|이수|취득|신청|평균|비고|학점|제목|작성일|작성자|구분|일자|결재명|진행상태|요청제목|요청일시|\\*|-)$/;
  var seen=new Set(),out=[],done=new Set();
  function txt(c){var t=(c.innerText||'').trim().replace(/\\s+/g,' ');if(!t){var inp=c.querySelector('input');if(inp)t=(inp.value||inp.getAttribute('value')||'').trim();}if(!t){var a=c.getAttribute('aria-label')||'';t=a.replace(/^\\d+행 \\d+열\\s*/,'').trim();}return t;}
  function isCode(s){return s&&s.length>=4&&s.length<=12&&!/[ㄱ-ㅎ가-힣]/.test(s)&&/[A-Za-z]/.test(s)&&/\\d/.test(s);}
  function extract(){document.querySelectorAll('[role="row"]').forEach(function(r){var cells=Array.from(r.querySelectorAll('[role="gridcell"]'));if(!cells.length)cells=Array.from(r.children).filter(function(el){return el.tagName==='DIV'||el.tagName==='TD';});if(cells.length<3)return;var texts=cells.map(txt);var ci=-1;for(var i=0;i<Math.min(texts.length,8);i++){if(isCode(texts[i])){ci=i;break;}}if(ci===-1){var fb=texts[1];if(fb&&fb.length>=4&&fb.length<=15&&!/^\\d+$/.test(fb)&&!SKIP.test(fb)&&!/[가-힣]/.test(fb))ci=1;else return;}var code=texts[ci];if(!code||SKIP.test(code)||/^\\d+$/.test(code)||/[가-힣]/.test(code))return;if(seen.has(code))return;seen.add(code);out.push([(ci>0?texts[ci-1]:''),code,texts[ci+1]||'',texts[ci+2]||'',texts[ci+3]||''].join('\\t'));});}
  function finish(){if(!out.length){alert('과목 정보를 찾을 수 없습니다.\\n전체성적조회 페이지에서 실행해주세요.');return;}var text=out.join('\\n');var old=document.getElementById('__kt_btn');if(old)old.parentNode.removeChild(old);var btn=document.createElement('button');btn.id='__kt_btn';btn.textContent=out.length+'개 과목 수집 완료 — 클릭해서 복사';btn.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:14px 22px;background:#2563eb;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);';btn.onclick=function(){navigator.clipboard.writeText(text).then(function(){btn.textContent='✓ 복사됨! KENTECHTIME에 붙여넣기 하세요';btn.style.background='#16a34a';setTimeout(function(){if(btn.parentNode)btn.parentNode.removeChild(btn);},3000);}).catch(function(){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:0;left:0;width:2px;height:2px;';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);btn.textContent='✓ 복사됨!';btn.style.background='#16a34a';setTimeout(function(){if(btn.parentNode)btn.parentNode.removeChild(btn);},3000);});};document.body.appendChild(btn);}
  // 현재 DOM에 있는 모든 스크롤 가능 컨테이너를 수집 (외부→내부 순)
  function scan(){var all=[];document.querySelectorAll('[role="row"]').forEach(function(r){var p=r.parentElement;while(p&&p!==document.body){if(p.scrollHeight>p.clientHeight+10&&p.clientHeight>0&&all.indexOf(p)===-1)all.push(p);p=p.parentElement;}});all.sort(function(a,b){if(a.contains(b))return -1;if(b.contains(a))return 1;return 0;});return all;}
  // 컨테이너 하나를 끝까지 스크롤하며 추출
  // 40px(≈1행) 단위로 천천히 이동, 바닥에서 새 행이 2연속 없을 때만 완료
  function scrollFully(c,cb){if(done.has(c)){cb();return;}done.add(c);extract();if(c.scrollHeight<=c.clientHeight+10){cb();return;}try{c.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}setTimeout(function(){extract();var prevSize=seen.size;var stableAtBottom=0;var safetyCount=0;function step(){safetyCount++;if(safetyCount>120){cb();return;}c.scrollTop+=40;c.dispatchEvent(new Event('scroll',{bubbles:true}));setTimeout(function(){extract();var atBottom=c.scrollTop>=c.scrollHeight-c.clientHeight-5;var currSize=seen.size;if(currSize>prevSize){stableAtBottom=0;prevSize=currSize;}if(atBottom)stableAtBottom++;if(atBottom&&stableAtBottom>=2){cb();}else{step();}},80);}step();},100);}
  // 큐에서 outer의 자식 컨테이너만 꺼내어 순서대로 처리
  function drainKids(outer,q,cb){var kids=q.filter(function(x){return outer.contains(x)&&!done.has(x);});kids.forEach(function(x){q.splice(q.indexOf(x),1);});var i=0;function next(){if(i>=kids.length){cb();return;}scrollFully(kids[i++],next);}next();}
  extract();
  var q=scan();
  if(!q.length){finish();return;}
  function go(){
    if(!q.length){finish();return;}
    var c=q.shift();
    if(done.has(c)){go();return;}
    // 큐 안에 c의 자식이 있으면 → c는 외부 컨테이너: 단계적으로 스크롤하며 내부 처리
    var isOuter=q.some(function(x){return c.contains(x);});
    if(!isOuter){
      scrollFully(c,function(){
        // 스크롤 후 새로 나타난 컨테이너 추가
        scan().forEach(function(nc){if(!done.has(nc)&&q.indexOf(nc)===-1)q.push(nc);});
        go();
      });
    } else {
      done.add(c);
      // 초기 visible 내부 컨테이너 처리 후 스크롤 시작
      drainKids(c,q,function startScroll(){
        function outerStep(){
          if(c.scrollHeight<=c.clientHeight+10){go();return;}
          c.scrollTop+=Math.max(60,Math.floor(c.clientHeight*0.3));
          c.dispatchEvent(new Event('scroll',{bubbles:true}));
          setTimeout(function(){
            extract();
            // 외부 스크롤로 새로 나타난 컨테이너 발견
            scan().forEach(function(nc){if(!done.has(nc)&&q.indexOf(nc)===-1)q.unshift(nc);});
            // ★ 발견 즉시 현재 위치에서 처리 (다음 스크롤 전에)
            drainKids(c,q,function(){
              if(c.scrollTop<c.scrollHeight-c.clientHeight-5){outerStep();}
              else{go();}
            });
          },150);
        }
        outerStep();
      });
    }
  }
  go();
})();`;
