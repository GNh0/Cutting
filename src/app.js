import {validateProject} from './optimizer.js?v=28666b9e0a48';
import {csv,importRows,readProject} from './io.js?v=28666b9e0a48';
import {dimensionGeometry,rotateBinForView} from './diagram.js?v=28666b9e0a48';
import {groupRemnants,carryRemnantStock} from './remnants.js?v=28666b9e0a48';
import {materialInfo,materialKey,materialLabel,materialGroups,upgradeProject} from './materials.js?v=28666b9e0a48';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
  layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M9 10h12"/>',
  folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1.5-1.5 2M12 17h.01"/>',
  github:'<path d="M9 20c-5 1-5-3-7-3m14 5v-4c0-1-.3-2-1-2.5 4-.5 6-2.2 6-6a5 5 0 0 0-1.5-3.5 5 5 0 0 0-.1-3.5S18 2 15.5 4a13 13 0 0 0-7 0C6 2 4.6 2 4.6 2a5 5 0 0 0-.1 3.5A5 5 0 0 0 3 9c0 3.8 2 5.5 6 6-.7.5-1 1.5-1 2.5V22"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  save:'<path d="M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8"/>',
  file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  sparkles:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4M18 4h4"/>',
  panels:'<rect x="3" y="4" width="11" height="16" rx="1"/><path d="M18 4v16M22 6v12"/>',
  layers:'<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M4 18l8 5 8-5"/>',
  sliders:'<path d="M4 5h16M4 12h16M4 19h16"/><rect x="7" y="3" width="3" height="4" fill="white"/><rect x="14" y="10" width="3" height="4" fill="white"/><rect x="8" y="17" width="3" height="4" fill="white"/>',
  chevron:'<path d="m7 10 5 5 5-5"/>',
  left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
  shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3M12 12l.1.1"/>',
  chart:'<path d="M4 3v18h18M8 16v-5M13 16V6M18 16v-8"/>',
  printer:'<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h1"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  percent:'<path d="m5 19 14-14"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
  square:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-5 4 3 4-5 4 5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>'
};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.file}</svg>`;
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
const FACTORS={mm:1,cm:10,m:1000,in:25.4};
const UNITS={mm:'mm',cm:'cm',m:'m',in:'inch'};
const storageKey='cutting.project.v1',libraryKey='cutting.library.v1';
const row=(label,w,h,qty,extra={})=>({id:crypto.randomUUID(),label,w,h,qty,thickness:null,material:'',manufacturer:'',lot:'',grain:'none',enabled:true,rotate:true,edges:{top:false,bottom:false,left:false,right:false},...extra});
const settings=()=>({kerf:3,trim:0,rotate:true,material:true,grain:false,single:false,priority:'area',quality:'thorough',minRemnant:100});
const demo=()=>{const p=({version:1,id:crypto.randomUUID(),name:'책장 제작 프로젝트',unit:'mm',settings:settings(),parts:[row('측판',800,300,2,{edges:{top:true}}),row('선반',564,300,4,{edges:{top:true}}),row('상·하판',600,320,2,{edges:{top:true}}),row('뒷판',764,564,1),row('보강대',564,80,2)],stocks:[row('자작 합판 18T',2440,1220,3,{grain:'x'})]});for(const r of [...p.parts,...p.stocks])Object.assign(r,{thickness:18,material:'자작 합판'});return p;};
const emptyProject=()=>({version:1,id:crypto.randomUUID(),name:'새 프로젝트',unit:'mm',settings:settings(),parts:[],stocks:[]});
let project=emptyProject(),storageWarning=false;
try {const raw=localStorage.getItem(storageKey);if(raw){const p=JSON.parse(raw);if(p.version===1&&p.settings&&Array.isArray(p.parts)&&Array.isArray(p.stocks)&&p.parts.length<=1000&&p.stocks.length<=1000){project=upgradeProject(p);project.settings={...settings(),...p.settings,material:true};project.unit=FACTORS[p.unit]?p.unit:'mm';}}}catch{}
let inputTab='parts',resultTab='layout',result=null,resultProject=null,dirty=false,selectedSheet=0,selectedPart=null,selectedCut=null;
let expanded=new Set(),worker=null,toastTimer=null,view={labels:true,cuts:false,zoom:100,rotated:false,pan:false};
const f=()=>FACTORS[project.unit]||1;
const n=(v,digits=2)=>Number(v.toFixed(digits)).toLocaleString('ko-KR',{maximumFractionDigits:digits});
const dim=v=>n(v/f(),project.unit==='in'||project.unit==='m'?3:2);
const displayInput=v=>v==null?'':Number((v/f()).toFixed(6));
const groupLabel=(r,request=r.requestOnly??false)=>materialLabel(r,v=>`${dim(v)} ${unit()}`,request);
const area=v=>`${n(v/1000000,3)} m²`;
const unit=()=>UNITS[project.unit]||'mm';
const color=p=>{const source=resultProject?.parts||project.parts;const i=Math.max(0,source.findIndex(r=>r.id===p.id));return ['#d9e4c8','#ede1c2','#c9dede','#d9d8e9','#e3cfbd','#c9dbc5','#e4d3da','#cbd8e7'][i%8];};
const grainLabel=g=>g==='x'?'가로 →':g==='y'?'세로 ↓':'없음';
function notify(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.toggle('error',error);$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;toastTimer=null;},error?6500:3500);}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(project));$('#save-status').textContent='✓ 브라우저에 자동 저장됨';}catch{$('#save-status').textContent='브라우저 저장 불가';if(!storageWarning){storageWarning=true;notify('브라우저 저장 공간을 사용할 수 없습니다. 프로젝트 파일로 저장하세요.',true);}}}
function markDirty(){if(worker)cancelCalculation(false);dirty=Boolean(result);persist();renderNotice();}
function renderEditor(){
  $$('.input-tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.inputTab===inputTab)));
  $('#input-description').textContent=inputTab==='parts'?'부재 치수와 조건을 한 행에 입력하세요.':'보유 원판 치수와 재고를 한 행에 입력하세요.';
  $('#table-scroll-note').textContent=inputTab==='parts'?'두께·재질 필수 · 제조사·LOT 미입력 시 무관':'두께·재질 필수 · 제조사·LOT은 실제 원판 정보';
  const groups=materialGroups(project[inputTab]);
  const text=(r,i,key,label,required=false)=>`<input type="text" maxlength="200" value="${esc(r[key])}" data-field="${key}" aria-label="${i+1}행 ${label}" ${required?'required':''} placeholder="${key==='label'?'이름':required?'입력 필요':inputTab==='parts'?'무관':'미입력'}">`;
  const number=(r,i,key,label)=>`<input type="number" min="0.000001" max="${1000000/f()}" step="any" value="${displayInput(r[key])}" data-field="${key}" aria-label="${i+1}행 ${label}" ${key==='thickness'?'required placeholder="필수"':''}>`;
  $('#input-table').innerHTML=`<table class="editor-table"><colgroup>${[36,132,88,88,64,92,148,128,128,78].map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr><th><span class="sr-only">사용</span></th><th>이름</th><th>가로 <small>(${unit()})</small></th><th>세로 <small>(${unit()})</small></th><th>수량</th><th>두께 <span class="required-mark">필수</span><small>(${unit()})</small></th><th>재질 <span class="required-mark">필수</span></th><th>제조사</th><th>LOT</th><th><span class="sr-only">행 설정과 삭제</span></th></tr></thead><tbody>${groups.map(g=>`<tr class="input-group-heading"><th colspan="10"><span title="${esc(groupLabel(g,inputTab==='parts'))}">${esc(groupLabel(g,inputTab==='parts'))}</span></th></tr>${g.rows.map(({row:r,index:i})=>`<tr data-row="${esc(r.id)}" class="${i%2?'row-even ':''}${r.enabled===false?'row-disabled':''}"><td><input type="checkbox" data-field="enabled" aria-label="${i+1}행 사용" ${r.enabled!==false?'checked':''}></td><td>${text(r,i,'label','이름')}</td><td>${number(r,i,'w','가로')}</td><td>${number(r,i,'h','세로')}</td><td><input type="number" min="1" max="1000" step="1" value="${r.qty}" data-field="qty" aria-label="${i+1}행 수량"></td><td>${number(r,i,'thickness','두께')}</td><td>${text(r,i,'material','재질',true)}</td><td>${text(r,i,'manufacturer','제조사')}</td><td>${text(r,i,'lot','LOT')}</td><td><div class="row-actions"><button class="button quiet" data-action="detail" aria-label="${i+1}행 상세 설정" aria-expanded="${expanded.has(r.id)}" title="결·회전·밴딩 설정">${icon('more')}</button><button class="button quiet" data-action="delete" aria-label="${i+1}행 삭제" title="행 삭제">${icon('close')}</button></div></td></tr>${expanded.has(r.id)?detailRow(r,i):''}`).join('')}`).join('')||'<tr><td colspan="10" class="empty-rows">행 추가를 눌러 입력하세요.</td></tr>'}</tbody></table>`;
  updateEditorTotals();
}
function updateEditorTotals(){
  $('#parts-count').textContent=project.parts.filter(r=>r.enabled!==false).reduce((a,r)=>a+(r.qty||0),0);
  $('#stocks-count').textContent=project.stocks.filter(r=>r.enabled!==false).reduce((a,r)=>a+(r.qty||0),0);
  const active=project[inputTab].filter(r=>r.enabled!==false);const total=active.reduce((a,r)=>a+(r.w*r.h*r.qty||0),0);
  $('#input-total').innerHTML=`<span>총 <strong>${active.reduce((a,r)=>a+(r.qty||0),0)}개</strong> · ${active.length}종</span><span>전체 면적 <strong>${area(total)}</strong></span>`;
}
function detailRow(r,i){return `<tr class="detail-row" data-row="${esc(r.id)}"><td colspan="10"><div class="detail-fields"><label>결 <select data-field="grain" aria-label="${i+1}행 결 방향">${['none','x','y'].map(g=>`<option value="${g}" ${r.grain===g?'selected':''}>${grainLabel(g)}</option>`).join('')}</select></label>${inputTab==='parts'?`<label><input type="checkbox" data-field="rotate" aria-label="${i+1}행 회전 허용" ${r.rotate!==false?'checked':''}>회전 허용</label>`:''}</div>${inputTab==='parts'?`<div class="edge-options"><span>엣지밴딩</span>${[['top','상'],['bottom','하'],['left','좌'],['right','우']].map(([k,l])=>`<label><input type="checkbox" data-edge="${k}" aria-label="${i+1}행 ${l} 엣지밴딩" ${r.edges?.[k]?'checked':''}>${l}</label>`).join('')}</div>`:''}</td></tr>`;}
function renderSettings(){
  $('#project-name').value=project.name;$('#unit').value=project.unit;
  for(const k of ['kerf','trim','minRemnant'])$('#'+k).value=displayInput(project.settings[k]);
  for(const k of ['rotate','grain','single'])$('#'+k).checked=project.settings[k];
  for(const k of ['priority','quality'])$('#'+k).value=project.settings[k];
  $$('.unit-label').forEach(e=>e.textContent=unit());
}
function metric(label,value,suffix,detail,type,featured=false){return `<div class="metric ${featured?'featured':''}"><div class="metric-top">${label}${icon(type)}</div><div class="metric-value">${value}<small>${suffix}</small></div><div class="metric-bottom">${detail}</div></div>`;}
function renderMetrics(){
  const r=result;
  $('#metrics').innerHTML=metric('使用 원판'.replace('使用','사용'),r?r.bins.length:'—','장',r?'서로 다른 원판 '+new Set(r.bins.map(b=>b.stock.id)).size+'종':'계산 후 표시됩니다','layers')+
    metric('자재 이용률',r&&r.stockArea?n(r.usedArea/r.stockArea*100,1):'—','%',r?`${r.placed} / ${r.total}개 부재 배치`:'부재 면적 / 사용 원판 면적','percent',true)+
    metric('남는 면적',r?n(r.wasteArea/1000000,2):'—','m²',r?'톱날·가장자리 여유 포함':'낭비를 더 줄여보세요','square')+
    metric('절단 횟수',r?r.cutCount:'—','회',r?`총 길이 ${n(r.cutLength/1000,2)} m`:'가장자리 정재단 제외','scissors');
}
function renderNotice(){
  if(dirty){$('#result-notice').innerHTML='<div class="notice">입력값이 변경되었습니다. 현재 배치도는 이전 계산 결과입니다. 다시 계산해 주세요.</div>';return;}
  if(!result){$('#result-notice').innerHTML='';return;}
  $('#result-notice').innerHTML=result.unplaced.length?`<div class="notice error">${result.unplaced.length}개 부재를 배치하지 못했습니다. 원판 크기·수량과 두께·재질·지정 제조사·LOT·결 방향을 확인하세요.</div>`:`<div class="notice success">${icon('check')} 모든 부재를 배치했습니다. ${result.iterations}개 후보를 비교한 결과입니다.</div>`;
}
function emptyState(){return `<div class="empty-state"><svg class="empty-illustration" viewBox="0 0 160 130" fill="none" aria-hidden="true"><rect x="14" y="12" width="132" height="104" rx="5" fill="#f0f4e9" stroke="#d4dfc7"/><rect x="25" y="23" width="53" height="82" rx="2" fill="#d9e5c8"/><rect x="84" y="23" width="51" height="40" rx="2" fill="#e9dfc2"/><rect x="84" y="69" width="51" height="36" rx="2" fill="#d1e1db"/><path d="M8 122h145M5 118v8M155 118v8M151 8v108M148 5h7M148 118h7" stroke="#b6c4a7"/><path d="m45 59 5 5 12-13" stroke="#8ca577" stroke-width="2"/></svg><h3>다음 작품의 시작, 한 장의 배치도.</h3><p>부재와 원판을 입력한 뒤 계산하면<br>절단 계획이 이곳에 표시됩니다.</p><button class="button" id="empty-demo">${icon('sparkles')} 예제로 시작하기</button></div>`;}
function updateExportControls(){
  const bin=result?.bins[selectedSheet];
  for(const id of ['toolbar-svg','toolbar-png','print-result'])$('#'+id).disabled=!bin;
  $('#export-target').textContent=bin?bin.stock.label:'내보내기';
  $('#export-target').title=bin?`선택 원판: ${bin.stock.label} · ${dim(bin.stock.w)} × ${dim(bin.stock.h)} ${unit()}`:'';
}
function renderResults(){
  renderMetrics();renderNotice();updateExportControls();
  $$('.result-tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.resultTab===resultTab)));
  if(!result){$('#result-body').innerHTML=emptyState();return;}
  selectedSheet=Math.min(Math.max(selectedSheet,0),Math.max(0,result.bins.length-1));updateExportControls();
  if(resultTab==='summary'){renderSummary();$('#result-body').insertAdjacentHTML('beforeend',remnantTable());return;}
  const controls=result.bins.length?sheetNavigation()+`<div class="drawing-toolbar"><div class="drawing-toggles"><button class="text-button" id="rotate-view" aria-pressed="${view.rotated}" title="화면만 회전합니다">${icon('refresh')} 90° 보기</button><button class="text-button" id="pan-view" aria-pressed="${view.pan}" title="확대한 배치도를 가로로 드래그해 이동">${view.pan?'이동 켜짐':'이동'}</button><label><input type="checkbox" id="view-labels" ${view.labels?'checked':''}>이름·치수</label><label><input type="checkbox" id="view-cuts" ${view.cuts?'checked':''}>절단선</label></div><label class="zoom-control">확대 <input id="zoom" aria-label="배치도 확대" type="range" min="75" max="250" step="25" value="${view.zoom}"><span id="zoom-value">${view.zoom}%</span></label></div>`:'';
  const groups=result.groups||[];
  $('#result-body').innerHTML=controls+groups.map(g=>`<section class="result-group"><header class="result-group-heading"><h3>${g.requestOnly?'미배치 요청 · ':''}${esc(groupLabel(g))}</h3><p>원판 ${g.sheets.length}장 · ${g.placed} / ${g.total}개 배치${g.unplaced?` · 미배치 ${g.unplaced}개`:''}</p></header>${g.sheets.map(i=>sheetCard(result.bins[i],i)).join('')}${unplacedHTML(g.key)}</section>`).join('')+remnantSummary();
}
const cutLabel=(bin,c)=>c.partInstances?.length>1?`공통 절단 (${c.partInstances.length}개 부재)`:bin.parts.find(p=>p.instance===c.partInstance)?.label||'';
function sheetCard(bin,i){
  const usage=bin.parts.reduce((a,p)=>a+p.w*p.h,0)/(bin.stock.w*bin.stock.h)*100;
  const draw=`<div class="drawing-viewport ${view.pan?'pannable':''}"><div class="drawing-content" style="width:${view.zoom}%">${boardSVG(bin,{cuts:resultTab==='cuts'||view.cuts,cut:selectedSheet===i?selectedCut:null,physical:resultTab==='cuts',sheetIndex:i})}</div></div>`;
  const cuts=resultTab==='cuts'?`<aside class="sheet-cut-panel"><h4>절단 순서</h4>${bin.cutPlan?`<p class="cut-plan-note">절단 계획 재구성 · ${bin.cutPlan.originalCount} → ${bin.cuts.length}회</p>`:''}${bin.cutMotion?`<p class="cut-plan-note" title="총 진행은 절단 길이와 다음 절단 시작점까지의 직선 이동을 합한 값입니다. 원판 좌상단 사용 영역에서 시작하며 표시된 가로→·세로↓ 방향 기준입니다. 작업물 운반·회전 시간은 제외합니다.">총 진행 ${n(bin.cutMotion.after.totalDistance/1000,2)} m · 위치 이동 ${n(bin.cutMotion.after.distance/1000,2)} m · 방향 전환 ${bin.cutMotion.after.turns}회</p>`:''}<p class="section-note">왼쪽 위 기준 (${unit()}). 행을 누르면 해당 절단선을 강조합니다. 톱날은 선의 오른쪽/아래쪽을 소모합니다.</p><div class="cut-list"><table><thead><tr><th>#</th><th>방향</th><th>X</th><th>Y</th><th>길이</th><th>부재</th></tr></thead><tbody>${bin.cuts.map((c,j)=>`<tr data-cut="${j}" tabindex="0" class="${selectedSheet===i&&selectedCut===j?'highlight':''}"><td>${j+1}</td><td>${c.axis==='x'?'세로 ↓':'가로 →'}</td><td>${dim(c.x)}</td><td>${dim(c.y)}</td><td>${dim(c.length)}</td><td>${esc(cutLabel(bin,c))}</td></tr>`).join('')||'<tr><td colspan="6">추가 절단 없음</td></tr>'}</tbody></table></div></aside>`:'';
  return `<article class="sheet-card" id="result-sheet-${i}" data-sheet="${i}"><header class="sheet-card-heading"><h3>${esc(bin.stock.label)}</h3><p>${esc(groupLabel(bin.stock))}</p><p>${dim(bin.stock.w)} × ${dim(bin.stock.h)} ${unit()} · ${bin.parts.length}개 부재 · 이용률 ${n(usage,1)}% · 절단 ${bin.cuts.length}회</p></header><div class="${cuts?'sheet-cut-workspace':''}">${draw}${cuts}</div><div class="selected-panel" data-part-info hidden></div><div class="legend">${[...new Map(bin.parts.map(p=>[p.id,p])).values()].map(p=>`<span><i style="background:${color(p)}"></i>${esc(p.label)}</span>`).join('')}<span><i class="waste"></i>남는 영역</span><span><i class="edge"></i>엣지밴딩</span></div><div class="sheet-bottom"><div class="utilization">${esc(bin.stock.label)} · ${bin.parts.length}개 배치</div></div></article>`;
}
function jumpSheet(i){selectedSheet=i;updateExportControls();const card=$(`#result-sheet-${i}`);card?.scrollIntoView({block:'start',behavior:'instant'});const select=$('#sheet-select');if(select)select.value=String(i);const count=$('#sheet-position');if(count)count.textContent=`${i+1} / ${result.bins.length}`;}
function remnantSummary(){const reusable=result.remnants.filter(r=>r.reusable);if(!reusable.length)return '';const largest=[...reusable].sort((a,b)=>b.w*b.h-a.w*a.h)[0];return `<div class="remnant-summary"><div><strong>재사용 가능한 잔재 ${reusable.length}개 · ${area(result.reusableArea)}</strong><small>가장 큰 잔재 ${dim(largest.w)} × ${dim(largest.h)} ${unit()} · 최소 폭 ${dim(result.settings.minRemnant??100)} ${unit()} 기준</small></div><button class="button" id="reuse-remnants">잔재로 다음 작업</button></div>`;}
function remnantTable(){return `<div class="summary-content"><h3>실제 절단 후 남는 직사각형 잔재</h3><p class="section-note">폭과 길이가 모두 ${dim(result.settings.minRemnant??100)} ${unit()} 이상인 잔재를 재사용 가능으로 표시합니다. 같은 치수·두께·재질·제조사·LOT·결 방향의 잔재는 수량을 합산합니다. 원판 번호를 누르면 해당 위치를 확인합니다. 톱날로 사라진 영역은 잔재에 포함하지 않습니다.</p><div class="table-scroll"><table class="remnant-table"><thead><tr><th>치수 (${unit()})</th><th>두께·재질·제조사·LOT / 결</th><th>수량</th><th>총면적</th><th>판정</th><th>출처 원판</th></tr></thead><tbody>${groupRemnants(result.remnants).sort((a,b)=>b.w*b.h-a.w*a.h).map(r=>`<tr><td>${dim(r.w)} × ${dim(r.h)}</td><td>${esc(groupLabel(r))} / ${grainLabel(r.grain)}</td><td>${r.qty}개</td><td>${area(r.area)}</td><td><span class="remnant-tag ${r.reusable?'':'scrap-tag'}">${r.reusable?'재사용 가능':'자투리'}</span></td><td>${r.sources.map(s=>`<button class="text-button" data-remnant-sheet="${s.sheet}" data-remnant-index="${s.index}" aria-label="원판 ${s.sheet+1}의 잔재 ${s.index+1} 위치 보기">${s.sheet+1}</button>`).join(' ')}</td></tr>`).join('')}</tbody></table></div>${remnantSummary()}</div>`;}
function reuseRemnants(){
  if(dirty){notify('입력값이 변경되었습니다. 먼저 다시 계산하세요.',true);return;}
  const reusable=result.remnants.filter(r=>r.reusable);if(!reusable.length)return;
  if(!confirm('현재 프로젝트를 보관함에 저장하고, 사용한 원판을 재고에서 차감한 뒤 잔재를 포함한 다음 작업을 시작할까요?'))return;
  let stocks;try{stocks=carryRemnantStock(resultProject.stocks,result.bins,reusable,row);}catch(e){notify(e.message,true);return;}
  const snapshot={...structuredClone(resultProject),savedAt:new Date().toISOString()};
  try{const items=library().filter(p=>p.id!==snapshot.id);localStorage.setItem(libraryKey,JSON.stringify([snapshot,...items].slice(0,30)));}catch{notify('현재 프로젝트를 보관하지 못했습니다. 먼저 파일로 저장하세요.',true);return;}
  const next={version:1,id:crypto.randomUUID(),name:resultProject.name+' · 잔재 재사용',unit:project.unit,settings:{...resultProject.settings},parts:[],stocks};replaceProject(next,'사용 원판을 차감하고 잔재와 미사용 원판을 다음 작업으로 가져왔습니다.');inputTab='stocks';renderEditor();
}
function sheetNavigation(){return `<div class="board-navigation"><div class="sheet-title">원판으로 이동 <select id="sheet-select" aria-label="원판 선택">${result.groups.filter(g=>g.sheets.length).map(g=>`<optgroup label="${esc(groupLabel(g))}">${g.sheets.map(i=>`<option value="${i}" ${i===selectedSheet?'selected':''}>${esc(result.bins[i].stock.label)}</option>`).join('')}</optgroup>`).join('')}</select><span id="sheet-position">${selectedSheet+1} / ${result.bins.length}</span></div><div class="sheet-nav-buttons"><button class="button" id="prev-sheet" aria-label="이전 원판">${icon('left')}</button><button class="button" id="next-sheet" aria-label="다음 원판">${icon('right')}</button></div></div>`;}
function boardSVG(bin,options={}){
  const sheetIndex=options.sheetIndex??result?.bins.indexOf(bin)??0;
  if(view.rotated&&!options.print&&!options.physical)bin=rotateBinForView(bin);
  const W=900,H=590,pad=52,scale=Math.min((W-pad*2)/bin.stock.w,(H-pad*2)/bin.stock.h),w=bin.stock.w*scale,h=bin.stock.h*scale,x=(W-w)/2,y=(H-h)/2;
  const labels=options.labels??view.labels,cuts=options.cuts??view.cuts;
  const prefix='sheet'+sheetIndex+(options.print?'print':'view');
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" data-sheet-x="${x}" data-sheet-y="${y}" data-sheet-w="${w}" data-sheet-h="${h}" aria-label="${esc(bin.stock.label)} 절단 배치도" style="font-family:'Segoe UI','Malgun Gothic',sans-serif"><defs><pattern id="${prefix}-waste" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#f0f2eb"/><path d="M0 0v7" stroke="#d6dccd" stroke-width="1"/></pattern><pattern id="${prefix}-grain" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 3h9" stroke="#476540" stroke-opacity=".1" stroke-width=".6"/></pattern></defs><rect width="900" height="590" fill="#fafbf7"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${prefix}-waste)" stroke="#9da98e" stroke-width="1.5"/>`;
  if(result.settings.trim>0){const t=result.settings.trim*scale;svg+=`<rect x="${x+t}" y="${y+t}" width="${Math.max(0,w-2*t)}" height="${Math.max(0,h-2*t)}" fill="none" stroke="#b1bba4" stroke-dasharray="3 3" stroke-width=".8"/>`;}
  for(const [i,r] of bin.free.entries()){
    const rx=x+r.x*scale,ry=y+r.y*scale,rw=r.w*scale,rh=r.h*scale;
    svg+=`<g class="remnant-shape" data-region="${i}" data-rx="${rx}" data-ry="${ry}" data-rw="${rw}" data-rh="${rh}" data-mm-w="${r.w}" data-mm-h="${r.h}" tabindex="0" role="button" aria-label="남는 영역 ${dim(r.w)} × ${dim(r.h)} ${unit()}"><title>남는 영역 ${dim(r.w)} × ${dim(r.h)} ${unit()}</title><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="transparent"/></g>`;
  }
  for(const p of bin.parts){
    const px=x+p.x*scale,py=y+p.y*scale,pw=p.w*scale,ph=p.h*scale;
    svg+=`<g class="part-shape ${selectedSheet===sheetIndex&&selectedPart===p.instance?'selected':''}" data-part="${esc(p.instance)}" data-rx="${px}" data-ry="${py}" data-rw="${pw}" data-rh="${ph}" data-mm-w="${p.w}" data-mm-h="${p.h}" tabindex="0" role="button" aria-label="${esc(p.label)} ${dim(p.originalW)} × ${dim(p.originalH)} ${unit()}"><title>${esc(p.label)} | ${dim(p.originalW)} × ${dim(p.originalH)} ${unit()} | X ${dim(p.x)}, Y ${dim(p.y)}${p.rotated?' | 90° 회전':''}</title><rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color(p)}" stroke="#fafbf7" stroke-width="1.4"/>`;
    if(result.settings.grain&&p.grain!=='none')svg+=`<path d="${((p.displayGrain??(p.rotated?(p.grain==='x'?'y':'x'):p.grain))==='x')?`M${px+pw*.25} ${py+ph*.5}h${pw*.5}`:`M${px+pw*.5} ${py+ph*.25}v${ph*.5}`}" stroke="#54734c" stroke-opacity=".18" stroke-width="2" stroke-dasharray="5 3"/>`;
    let edges=p.edges||{};
    if(p.rotated&&!p.edgesInDisplayCoordinates)edges={top:edges.left,right:edges.top,bottom:edges.right,left:edges.bottom};
    for(const [k,d]of Object.entries({top:`M${px+1} ${py+1}h${Math.max(0,pw-2)}`,bottom:`M${px+1} ${py+ph-1}h${Math.max(0,pw-2)}`,left:`M${px+1} ${py+1}v${Math.max(0,ph-2)}`,right:`M${px+pw-1} ${py+1}v${Math.max(0,ph-2)}`}))if(edges[k])svg+=`<path d="${d}" stroke="#6f8757" stroke-width="2.6"/>`;
    if(labels&&pw>30&&ph>18){
      const fs=Math.min(14,ph/3.8,pw/6.5),name=String(p.label||'부재'),max=Math.max(2,Math.floor(pw/(fs*.9))),short=name.length>max?name.slice(0,max-1)+'…':name;
      svg+=`<text x="${px+pw/2}" y="${py+ph/2-(ph>40?4:0)}" text-anchor="middle" dominant-baseline="central" fill="#4b6146" font-size="${fs}" font-weight="600" pointer-events="none">${esc(short)}</text>`;
      if(ph>40&&pw>65)svg+=`<text x="${px+pw/2}" y="${py+ph/2+fs+1}" text-anchor="middle" fill="#718366" font-size="${fs*.78}" pointer-events="none">${dim(p.originalW)} × ${dim(p.originalH)}${p.rotated?' ↻':''}</text>`;
    }
    svg+='</g>';
  }
  if(cuts)bin.cuts.forEach((c,i)=>{const highlight=options.cut===i,cx=x+c.x*scale,cy=y+c.y*scale;svg+=`<path d="M${cx} ${cy}${c.axis==='x'?`v${c.length*scale}`:`h${c.length*scale}`}" stroke="${highlight?'#ca683e':'#819373'}" stroke-width="${highlight?3:1}" stroke-dasharray="${highlight?'7 3':'4 3'}" pointer-events="none"/>${highlight?`<circle cx="${cx}" cy="${cy}" r="9" fill="#ca683e"/><text x="${cx}" y="${cy+3}" text-anchor="middle" font-size="10" fill="white">${i+1}</text>`:''}`;});
  svg+=`<g class="stock-dimensions" fill="#849277" stroke="#bdc7b2" stroke-width=".8"><path d="M${x} ${y-18}h${w}M${x} ${y-23}v10M${x+w} ${y-23}v10M${x+w+18} ${y}v${h}M${x+w+13} ${y}h10M${x+w+13} ${y+h}h10"/><text x="${x+w/2}" y="${y-27}" font-size="12" stroke="none" text-anchor="middle">${dim(bin.stock.w)} ${unit()}</text><text transform="translate(${x+w+33},${y+h/2}) rotate(90)" font-size="12" stroke="none" text-anchor="middle">${dim(bin.stock.h)} ${unit()}</text></g></svg>`;
  return svg;
}
function unplacedHTML(group=null){const missing=result.unplaced.filter(p=>group===null||materialKey(p)===group);if(!missing.length)return '';const grouped=new Map();for(const p of missing){const item=grouped.get(p.id)||{p,qty:0};item.qty++;grouped.set(p.id,item);}return `<div class="unplaced-list"><strong>미배치 부재 ${missing.length}개</strong><ul>${[...grouped.values()].map(({p,qty})=>`<li>${esc(p.label)} · ${dim(p.originalW)} × ${dim(p.originalH)} ${unit()} · ${qty}개 · ${esc(groupLabel(p,true))}</li>`).join('')}</ul><p>치수·톱날 간격·재질·결 방향 또는 재고 부족으로 배치되지 않았습니다. 탐색 방식상 가능한 배치를 찾지 못한 경우도 포함합니다.</p></div>`;}
function edgeTotal(){const totals=new Map();for(const bin of result.bins)for(const p of bin.parts){const e=p.edges||{},length=((e.top?1:0)+(e.bottom?1:0))*p.originalW+((e.left?1:0)+(e.right?1:0))*p.originalH;if(length){const key=groupLabel(bin.stock);totals.set(key,(totals.get(key)||0)+length);}}return [...totals];}
function renderSummary(){
  const r=result;
  const groupTable=`<h3>그룹별 배치 결과</h3><div class="table-scroll"><table><thead><tr><th>두께·재질·제조사·LOT</th><th>원판</th><th>배치 / 미배치 포함</th><th>미배치</th></tr></thead><tbody>${r.groups.map(g=>`<tr><td>${esc(groupLabel(g))}</td><td>${g.sheets.length}장</td><td>${g.placed} / ${g.total}</td><td>${g.unplaced}개</td></tr>`).join('')}</tbody></table></div>`;
  $('#result-body').innerHTML=`<div class="summary-content"><div class="detail-list"><div class="detail-stat">배치한 부재 면적<strong>${area(r.usedArea)}</strong></div><div class="detail-stat">사용한 원판 면적<strong>${area(r.stockArea)}</strong></div><div class="detail-stat">톱날 소모 면적<strong>${area(r.cutLength*r.settings.kerf)}</strong></div><div class="detail-stat">톱날 / 가장자리 여유<strong>${dim(r.settings.kerf)} / ${dim(r.settings.trim)} ${unit()}</strong></div></div>${groupTable}<h3>원판별 결과</h3><div class="table-scroll"><table><thead><tr><th>원판</th><th>두께·재질·제조사·LOT</th><th>부재</th><th>이용률</th><th>절단</th><th>길이</th></tr></thead><tbody>${r.bins.map((b,i)=>{const a=b.parts.reduce((n,p)=>n+p.w*p.h,0);return `<tr><td>${i+1}. ${esc(b.stock.label)}</td><td>${esc(groupLabel(b.stock))}</td><td>${b.parts.length}개</td><td>${n(a/(b.stock.w*b.stock.h)*100,1)}%</td><td>${b.cuts.length}회</td><td>${n(b.cuts.reduce((n,c)=>n+c.length,0)/1000,2)}m</td></tr>`;}).join('')}</tbody></table></div><h3>남은 원판 재고</h3><div class="table-scroll"><table><thead><tr><th>원판</th><th>치수 (${unit()})</th><th>사용 / 보유</th><th>남은 수량</th></tr></thead><tbody>${resultProject.stocks.filter(s=>s.enabled!==false).map(s=>{const used=r.bins.filter(b=>b.stock.id===s.id).length;return `<tr><td>${esc(s.label)}<br><small>${esc(groupLabel(s))}</small></td><td>${dim(s.w)} × ${dim(s.h)}</td><td>${used} / ${s.qty}</td><td>${s.qty-used}장</td></tr>`;}).join('')}</tbody></table></div><h3>엣지밴딩 필요 길이</h3>${edgeTotal().length?`<table><thead><tr><th>재질</th><th>길이 (여분 제외)</th></tr></thead><tbody>${edgeTotal().map(([m,l])=>`<tr><td>${esc(m||'재질 미지정')}</td><td>${n(l/1000,3)} m</td></tr>`).join('')}</tbody></table>`:'<p class="section-note">밴딩이 지정된 부재가 없습니다. 부재의 상세 설정(···)에서 지정하세요.</p>'}${unplacedHTML()}<p class="section-note">${r.iterations}회 결정적 휴리스틱 탐색 · 원판의 가장자리 여유와 톱날 소모량은 낭비 면적에 포함됩니다. 정재단 절단은 횟수·길이에서 제외됩니다. 이용률은 배치한 부재 면적 ÷ 사용한 전체 원판 면적입니다.</p><button class="button" id="export-report">${icon('download')} 결과 CSV 내보내기</button></div>`;
}
function renderAll(){renderEditor();renderSettings();renderResults();}
function setBusy(busy){document.body.classList.toggle('busy',busy);$('#optimize').disabled=busy;$('#optimize-label').textContent=busy?'더 나은 배치를 찾고 있어요':'최적 배치 계산';$('#cancel').hidden=!busy;$('#progress').hidden=!busy;if(busy)$('#progress>div').style.width='0%';}
function cancelCalculation(show=true){if(worker){worker.terminate();worker=null;}setBusy(false);if(show)notify('계산을 취소했습니다.');}
function calculate(){
  const errors=validateProject(project);if(errors.length){notify(errors.slice(0,8).join('\n'),true);return;}
  cancelCalculation(false);setBusy(true);const snapshot=structuredClone(project);
  try{
    worker=new Worker(new URL('./worker.js?v=28666b9e0a48',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.type==='progress'){$('#progress>div').style.width=data.percent+'%';return;}
      if(data.type==='done'){result=data.result;resultProject=snapshot;dirty=false;selectedSheet=0;selectedPart=null;selectedCut=null;cancelCalculation(false);renderResults();persist();notify(result.unplaced.length?`${result.placed}개 배치 · ${result.unplaced.length}개 미배치`:`${result.total}개 부재를 ${result.bins.length}장에 배치했습니다.`);}
      if(data.type==='error'){cancelCalculation(false);notify(data.message,true);}
    };
    worker.onerror=()=>{cancelCalculation(false);notify('계산을 실행하지 못했습니다. 페이지를 새로고침한 뒤 다시 계산하세요.',true);};
    worker.postMessage(snapshot);
  }catch(e){cancelCalculation(false);notify('계산 작업을 시작하지 못했습니다. HTTP(S) 웹주소에서 실행하세요.',true);}
}
function download(content,name,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const fileName=()=>String(project.name||'Cutting').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80);
function library(){try{return JSON.parse(localStorage.getItem(libraryKey)||'[]').filter(p=>p?.version===1).slice(0,30);}catch{return [];}}
function saveSnapshot(downloadFile=true){const errors=validateProject(project);if(errors.length){notify('저장하기 전에 입력값을 확인하세요.\n'+errors.slice(0,4).join('\n'),true);return;}const snapshot={...structuredClone(project),savedAt:new Date().toISOString()};try{const items=library().filter(p=>p.id!==project.id);items.unshift(snapshot);localStorage.setItem(libraryKey,JSON.stringify(items.slice(0,30)));}catch{notify('브라우저 보관함 저장에 실패했습니다. 파일로 백업합니다.',true);}if(downloadFile)download(JSON.stringify(snapshot,null,2),fileName()+'.cutting.json');persist();notify('프로젝트를 저장했습니다. JSON 파일로 다른 브라우저에서도 불러올 수 있습니다.');}
function replaceProject(p,message){cancelCalculation(false);project=upgradeProject(p);project.unit=FACTORS[p.unit]?p.unit:'mm';project.name=String(p.name||'가져온 프로젝트').slice(0,100);project.settings={...settings(),...p.settings,material:true};result=null;resultProject=null;dirty=false;selectedSheet=0;selectedPart=null;expanded.clear();persist();renderAll();if(message)notify(message);}
function openModal(title,html){$('#modal-title').textContent=title;$('#modal-content').innerHTML=html;hydrate($('#modal'));if(!$('#modal').open)$('#modal').showModal();}
function showHelp(){openModal('Cutting 사용 안내',`<div class="help-grid"><div class="help-step"><strong>01. 부재 입력</strong><p>완성할 부재의 가로·세로·수량을 입력합니다. 두께·재질은 필수입니다. 제조사·LOT은 선택 입력합니다. 입력한 항목만 원판과 일치해야 하고, 미입력 항목은 무관합니다. 표를 좌우로 이동해 두께·재질·제조사·LOT을 입력합니다. ···에서 결·밴딩·회전을 설정합니다.</p></div><div class="help-step"><strong>02. 원판과 조건</strong><p>보유 원판의 치수와 실제 수량을 입력합니다. 두께·재질은 일치해야 합니다. 부재에서 지정한 제조사·LOT만 일치 여부를 확인하며, 비워 둔 항목은 제한하지 않습니다. 결과는 실제 사용 원판의 제조사·LOT별로 표시합니다. 앞뒤 공백만 제거하며 대소문자는 구분합니다.</p></div><div class="help-step"><strong>03. 최적 배치 계산</strong><p>톱날 두께와 가장자리 여유를 설정하고 계산합니다. 결 방향 미지정은 자유 방향으로 취급합니다. 원판의 외곽 결 방향은 회전하지 않습니다.</p></div><div class="help-step"><strong>04. 제작과 보관</strong><p>절단 순서와 미배치 부재를 확인합니다. 결과 상단 오른쪽에서 SVG·PNG로 선택 원판을 저장합니다. PDF에서는 선택 원판 또는 전체 원판의 배치도와 절단표를 저장합니다.</p></div></div><p>단위를 바꾸면 실제 크기는 유지됩니다. 예: 1,000 mm → 100 cm. CSV 가져오기는 현재 표시 단위로 해석합니다. 엣지밴딩은 표시와 길이 계산용이며 완성 치수를 차감하지 않습니다.</p><p>계산은 브라우저 내부에서 실행됩니다. 작업은 현재 브라우저에 자동 저장되며, 프로젝트 저장 버튼으로 보관함과 JSON 파일에 백업할 수 있습니다. 다른 기기와 자동 동기화되지는 않습니다.</p><p>여러 정렬·절단 후보를 비교하는 길로틴 휴리스틱입니다. 최적해를 수학적으로 보장하지 않으며, 원본 서비스와 배치 결과가 다를 수 있습니다. 가장자리 여유는 네 면에서 사용하지 않는 폭으로, 정재단 절단은 별도로 수행합니다.</p><div class="help-links"><a href="https://github.com/GNh0/Cutting/blob/main/docs/analysis.md" target="_blank" rel="noopener noreferrer">원본 분석·구현 범위 ↗</a><a href="https://github.com/GNh0/Cutting" target="_blank" rel="noopener noreferrer">소스 코드 ↗</a></div>`);}
function showLibrary(){const items=library();openModal('저장된 프로젝트',`<p>현재 브라우저에 저장된 프로젝트입니다. 최대 30개를 보관합니다.</p>${items.map(p=>`<div class="library-item"><div class="library-info"><strong>${esc(p.name)}</strong><small>${p.parts.length}종 부재 · ${p.savedAt?esc(new Date(p.savedAt).toLocaleString('ko-KR')):''}</small></div><button class="button" data-load-snapshot="${esc(p.id)}">불러오기</button><button class="button quiet compact" data-delete-snapshot="${esc(p.id)}" aria-label="${esc(p.name)} 보관함에서 삭제">${icon('trash')}</button></div>`).join('')||'<p>아직 저장한 프로젝트가 없습니다. 프로젝트 저장 버튼을 눌러 보관하세요.</p>'}<div class="modal-actions"><button class="button" id="library-import">${icon('upload')} 파일에서 불러오기</button></div>`);}
let csvPreview=null;
function showImport(){csvPreview=null;openModal('CSV / 엑셀 데이터 가져오기',`<p>CSV 파일을 선택하거나 엑셀에서 복사한 셀을 붙여넣으세요.<br>열: 가로, 세로, 수량, 이름, 재질, 결, 회전, 사용, 상, 하, 좌, 우, 두께, 제조사, LOT<br>계산에는 두께·재질 입력이 필요합니다. 두께는 현재 표시 단위로 읽습니다. 기존 파일에 두께가 없으면 가져온 뒤 입력하세요. 제조사·LOT은 생략할 수 있습니다. 헤더 사용을 권장합니다.</p><div class="modal-select"><label>가져올 대상 <select id="import-target"><option value="parts" ${inputTab==='parts'?'selected':''}>절단 부재</option><option value="stocks" ${inputTab==='stocks'?'selected':''}>보유 원판</option></select></label><span>입력 단위: ${unit()}</span></div><textarea id="csv-text" aria-label="CSV 또는 엑셀 데이터" placeholder="가로,세로,수량,이름,두께,재질,제조사,LOT&#10;600,300,4,선반,18,합판,A사,L01"></textarea><div id="csv-error" class="modal-error"></div><div id="csv-preview"></div><div class="modal-actions"><button class="text-button" id="choose-csv">${icon('upload')} 파일 선택</button><button class="button" id="preview-csv">미리 보기</button><button class="button primary" id="apply-csv">기존 행에 추가</button></div>`);}
function parseImport(){const target=$('#import-target').value,rows=importRows($('#csv-text').value,f());const composed={...project,[target]:[...project[target],...rows]};const errors=validateProject(composed,{allowIncomplete:true}).filter(e=>e.startsWith(target==='parts'?'부재':'원판')||e.includes('전체 부재'));if(errors.length)throw new Error(errors.join('\n'));csvPreview={target,rows};return rows;}
function previewImport(){try{const rows=parseImport();$('#csv-error').textContent='';$('#csv-preview').innerHTML=`<div class="import-preview"><table><thead><tr><th>이름</th><th>가로</th><th>세로</th><th>수량</th><th>두께·재질·제조사·LOT</th></tr></thead><tbody>${rows.slice(0,15).map(r=>`<tr><td>${esc(r.label)}</td><td>${dim(r.w)}</td><td>${dim(r.h)}</td><td>${r.qty}</td><td>${esc(groupLabel(r,$('#import-target').value==='parts'))}</td></tr>`).join('')}</tbody></table></div><p class="section-note">전체 ${rows.length}행${rows.length>15?' 중 처음 15행 미리 보기':''}</p>`;}catch(e){$('#csv-error').textContent=e.message;$('#csv-preview').innerHTML='';csvPreview=null;}}
async function exportPNG(){
  if(!result?.bins.length)return;
  const bin=result.bins[selectedSheet],source=boardSVG(bin,{labels:true}),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
  try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=Math.round(2400*590/900);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error();download(blob,`${fileName()}_원판${selectedSheet+1}.png`,'image/png');notify('현재 원판 배치도를 PNG로 저장했습니다.');}catch{notify('이미지를 저장하지 못했습니다. SVG 저장을 사용해 주세요.',true);}finally{URL.revokeObjectURL(url);}
}
function printResult(sheetIndex=null){if(!result?.bins.length)return;const entries=[...result.bins.entries()].filter(([i])=>sheetIndex===null||i===sheetIndex);const title=esc(resultProject.name),stamp=new Date().toLocaleString('ko-KR');$('#print-area').innerHTML=entries.map(([i,b])=>`<article class="print-sheet"><h1>${title}</h1><p>${esc(b.stock.label)} · ${esc(groupLabel(b.stock))} · ${dim(b.stock.w)} × ${dim(b.stock.h)} ${unit()} · ${stamp}</p>${boardSVG(b,{labels:true,cuts:false,print:true})}<div class="print-summary">부재 ${b.parts.length}개 · 이용률 ${n(b.parts.reduce((n,p)=>n+p.w*p.h,0)/(b.stock.w*b.stock.h)*100,1)}% · 절단 ${b.cuts.length}회 · 톱날 ${dim(result.settings.kerf)} ${unit()} · 가장자리 ${dim(result.settings.trim)} ${unit()}</div><div class="print-cuts"><h2>${esc(b.stock.label)} 절단 순서</h2><p>왼쪽 위 기준 좌표. 톱날은 선의 오른쪽 / 아래쪽 소모. 가장자리 정재단은 별도.</p><table><thead><tr><th>#</th><th>방향</th><th>X (${unit()})</th><th>Y (${unit()})</th><th>길이 (${unit()})</th><th>관련 부재</th></tr></thead><tbody>${b.cuts.map((c,j)=>`<tr><td>${j+1}</td><td>${c.axis==='x'?'세로':'가로'}</td><td>${dim(c.x)}</td><td>${dim(c.y)}</td><td>${dim(c.length)}</td><td>${esc(cutLabel(b,c))}</td></tr>`).join('')}</tbody></table></div></article>`).join('')+(sheetIndex===null?`<div>${unplacedHTML()}</div>`:'');window.print();}
function showPDFOptions(){
  if(!result?.bins.length)return;
  openModal('PDF 저장',`<p class="section-note">배치도와 절단 순서를 함께 저장합니다. 저장할 범위를 선택하세요.</p><div class="pdf-options"><button class="button primary" id="pdf-current">선택 원판 · ${esc(result.bins[selectedSheet].stock.label)}</button><button class="button" id="pdf-all">전체 원판 · ${result.bins.length}장</button></div><p class="section-note">브라우저 인쇄 창의 대상을 ‘PDF로 저장’으로 선택하면 PDF 파일로 보관할 수 있습니다.</p>`);
}
function reportCSV(){const lines=[['원판','부재','두께(mm)','재질','제조사','LOT','가로(mm)','세로(mm)','X(mm)','Y(mm)','회전','배치 상태']];for(const [i,b]of result.bins.entries())for(const p of b.parts)lines.push([i+1,p.label,p.thickness,p.material,p.manufacturer,p.lot,p.originalW,p.originalH,p.x,p.y,p.rotated?'90°':'0°','배치']);for(const p of result.unplaced)lines.push(['',p.label,p.thickness,p.material,p.manufacturer,p.lot,p.originalW,p.originalH,'','','','미배치']);const safe=v=>'"'+(/^[=+@\-\t\r]/.test(String(v))?"'":'')+String(v).replaceAll('"','""')+'"';download('\uFEFF'+lines.map(r=>r.map(safe).join(',')).join('\r\n'),fileName()+'_결과.csv','text/csv;charset=utf-8');}

$('#input-table').addEventListener('input',e=>{const tr=e.target.closest('[data-row]');if(!tr)return;const r=project[inputTab].find(r=>r.id===tr.dataset.row);if(!r)return;const field=e.target.dataset.field,edge=e.target.dataset.edge;if(edge)r.edges={...r.edges,[edge]:e.target.checked};else if(field){r[field]=e.target.type==='checkbox'?e.target.checked:['w','h','thickness'].includes(field)?(e.target.value===''&&field==='thickness'?null:Number(e.target.value)*f()):field==='qty'?Number(e.target.value):e.target.value;}markDirty();tr.classList.toggle('row-disabled',r.enabled===false);updateEditorTotals();});
let regrouping=false;
$('#input-table').addEventListener('focusout',e=>{
  if(regrouping||!['thickness','material','manufacturer','lot'].includes(e.target.dataset.field)||$('#input-table').contains(e.relatedTarget))return;
  regrouping=true;renderEditor();regrouping=false;
});
$('#input-table').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const id=b.closest('[data-row]').dataset.row;if(b.dataset.action==='delete'){project[inputTab]=project[inputTab].filter(r=>r.id!==id);expanded.delete(id);markDirty();}else{expanded.has(id)?expanded.delete(id):expanded.add(id);}renderEditor();});
$$('[data-input-tab]').forEach(b=>b.addEventListener('click',()=>{inputTab=b.dataset.inputTab;renderEditor();}));
$$('[data-result-tab]').forEach(b=>b.addEventListener('click',()=>{resultTab=b.dataset.resultTab;renderResults();}));
$('#add-row').addEventListener('click',()=>{if(project[inputTab].length>=1000){notify('최대 1,000행까지 추가할 수 있습니다.',true);return;}const added=inputTab==='parts'?row('부재 '+(project.parts.length+1),600,300,1,{thickness:project.stocks.find(s=>s.enabled!==false)?.thickness??null,material:project.stocks.find(s=>s.enabled!==false)?.material??''}):row('원판 '+(project.stocks.length+1),2440,1220,1);project[inputTab].push(added);markDirty();renderEditor();const input=$(`#input-table [data-row="${added.id}"] [data-field="label"]`);input?.focus({preventScroll:true});input?.scrollIntoView({block:'nearest',inline:'nearest'});});
$('#project-name').addEventListener('change',e=>{project.name=e.target.value.trim()||'새 프로젝트';e.target.value=project.name;persist();});
$('#unit').addEventListener('change',e=>{project.unit=e.target.value;persist();renderEditor();renderSettings();renderResults();});
for(const k of ['kerf','trim','minRemnant','rotate','grain','single','quality','priority'])$('#'+k).addEventListener('input',e=>{project.settings[k]=e.target.type==='checkbox'?e.target.checked:['kerf','trim','minRemnant'].includes(k)?Number(e.target.value)*f():e.target.value;markDirty();});
$('#optimize').addEventListener('click',calculate);$('#cancel').addEventListener('click',()=>cancelCalculation());
$('#save-project').addEventListener('click',()=>saveSnapshot());$('#load-project').addEventListener('click',showLibrary);$('#library-button').addEventListener('click',showLibrary);
$('#workspace-button').addEventListener('click',()=>{if($('#modal').open)$('#modal').close();window.scrollTo({top:0,behavior:'smooth'});});
$('#help-button').addEventListener('click',showHelp);$('#top-help').addEventListener('click',showHelp);
$('#new-project').addEventListener('click',()=>{if(confirm('새 프로젝트를 시작할까요? 필요한 작업은 먼저 프로젝트 저장을 눌러 보관하세요.'))replaceProject(emptyProject(),'새 프로젝트를 시작했습니다.');});
function loadDemo(){if(confirm('현재 입력 대신 책장 제작 예제를 불러올까요?')){replaceProject(demo(),'예제 데이터를 불러왔습니다.');calculate();}}
$('#demo-button').addEventListener('click',loadDemo);$('#close-modal').addEventListener('click',()=>$('#modal').close());$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
$('#import-csv').addEventListener('click',showImport);$('#export-csv').addEventListener('click',()=>download(csv(project[inputTab],f()),fileName()+(inputTab==='parts'?'_부재':'_원판')+'.csv','text/csv;charset=utf-8'));
$('#project-file').addEventListener('change',async e=>{const file=e.target.files[0];try{if(!file)return;if(file.size>2*1024*1024)throw new Error('프로젝트 파일은 2 MB 이하이어야 합니다.');const p=readProject(await file.text());if(confirm('현재 입력을 파일의 프로젝트로 바꿀까요?')){replaceProject(p,'프로젝트를 불러왔습니다.');$('#modal').close();}}catch(e){notify(e.message||'파일을 읽지 못했습니다.',true);}finally{e.target.value='';}});
$('#csv-file').addEventListener('change',async e=>{const file=e.target.files[0];try{if(!file)return;if(file.size>2*1024*1024)throw new Error('CSV 파일은 2 MB 이하이어야 합니다.');$('#csv-text').value=await file.text();previewImport();}catch(e){notify(e.message,true);}finally{e.target.value='';}});
$('#modal-content').addEventListener('click',e=>{
  const load=e.target.closest('[data-load-snapshot]'),del=e.target.closest('[data-delete-snapshot]');
  if(load){const p=library().find(p=>p.id===load.dataset.loadSnapshot);if(p&&confirm('현재 입력을 저장된 프로젝트로 바꿀까요?')){try{replaceProject(readProject(JSON.stringify(p)),'프로젝트를 불러왔습니다.');$('#modal').close();}catch(e){notify(e.message,true);}}return;}
  if(del){if(confirm('이 프로젝트를 브라우저 보관함에서 삭제할까요? 다운로드한 파일은 유지됩니다.')){try{localStorage.setItem(libraryKey,JSON.stringify(library().filter(p=>p.id!==del.dataset.deleteSnapshot)));showLibrary();}catch{notify('보관함을 변경하지 못했습니다.',true);}}return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='pdf-current'||b.id==='pdf-all'){$('#modal').close();printResult(b.id==='pdf-current'?selectedSheet:null);return;}
  if(b.id==='library-import')$('#project-file').click();
  if(b.id==='choose-csv')$('#csv-file').click();
  if(b.id==='preview-csv')previewImport();
  if(b.id==='apply-csv'){try{parseImport();const {target,rows}=csvPreview;project[target].push(...rows);inputTab=target;markDirty();renderEditor();$('#modal').close();notify(`${rows.length}행을 추가했습니다.`);}catch(e){$('#csv-error').textContent=e.message;}}
});
$('#result-body').addEventListener('change',e=>{
  if(e.target.id==='sheet-select')jumpSheet(Number(e.target.value));
  if(e.target.id==='view-labels'){view.labels=e.target.checked;renderResults();}
  if(e.target.id==='view-cuts'){view.cuts=e.target.checked;renderResults();}
});
$('#result-body').addEventListener('input',e=>{if(e.target.id==='zoom'){view.zoom=Number(e.target.value);$$('.drawing-content').forEach(el=>el.style.width=view.zoom+'%');$('#zoom-value').textContent=view.zoom+'%';}});
$('#result-body').addEventListener('click',e=>{
  const remnant=e.target.closest('[data-remnant-sheet]');if(remnant){selectedSheet=Number(remnant.dataset.remnantSheet);resultTab='layout';renderResults();jumpSheet(selectedSheet);const r=$(`#result-sheet-${selectedSheet}`)?.querySelector(`[data-region="${remnant.dataset.remnantIndex}"]`);if(r)showHover(r);return;}
  const card=e.target.closest('[data-sheet]');if(card){selectedSheet=Number(card.dataset.sheet);updateExportControls();}
  const part=e.target.closest('[data-part]');if(part){selectedPart=part.dataset.part;$$('.part-shape.selected').forEach(x=>x.classList.remove('selected'));part.classList.add('selected');const p=result.bins[selectedSheet].parts.find(p=>p.instance===selectedPart),panel=card.querySelector('[data-part-info]');if(p){panel.hidden=false;panel.innerHTML=`<strong>${esc(p.label)}</strong><span>${dim(p.originalW)} × ${dim(p.originalH)} ${unit()} · X ${dim(p.x)} · Y ${dim(p.y)}${p.rotated?' · 90° 회전':''}</span><button class="button quiet" data-clear-part>닫기</button>`;}return;}
  const cut=e.target.closest('[data-cut]');if(cut){selectedCut=Number(cut.dataset.cut);$$('.cut-list tr.highlight').forEach(x=>x.classList.remove('highlight'));cut.classList.add('highlight');card.querySelector('.drawing-content').innerHTML=boardSVG(result.bins[selectedSheet],{cuts:true,cut:selectedCut,physical:true,sheetIndex:selectedSheet});return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='empty-demo'){loadDemo();return;}
  if(b.id==='prev-sheet'||b.id==='next-sheet')jumpSheet(Math.min(Math.max(0,selectedSheet+(b.id==='prev-sheet'?-1:1)),result.bins.length-1));
  if(b.dataset.export==='svg')download(boardSVG(result.bins[selectedSheet],{labels:true,sheetIndex:selectedSheet}),`${fileName()}_원판${selectedSheet+1}.svg`,'image/svg+xml');
  if(b.dataset.export==='png')exportPNG();
  if(b.hasAttribute('data-clear-part')){selectedPart=null;$$('.part-shape.selected').forEach(x=>x.classList.remove('selected'));card.querySelector('[data-part-info]').hidden=true;}
  if(b.id==='export-svg')download(boardSVG(result.bins[selectedSheet],{labels:true}),`${fileName()}_원판${selectedSheet+1}.svg`,'image/svg+xml');
  if(b.id==='export-png')exportPNG();
  if(b.id==='export-pdf')showPDFOptions();
  if(b.id==='export-report')reportCSV();
  if(b.id==='reuse-remnants')reuseRemnants();
  if(b.id==='rotate-view'){view.rotated=!view.rotated;renderResults();}
  if(b.id==='pan-view'){view.pan=!view.pan;renderResults();}
});
$('#result-body').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-part],[data-cut]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
function clearHover(svg){svg?.querySelector('.hover-dimensions')?.remove();svg?.classList.remove('has-hover');svg?.querySelectorAll('.shape-hover').forEach(g=>g.classList.remove('shape-hover'));}
function showHover(target){
  const svg=target.closest('svg');if(!svg)return;clearHover(svg);target.classList.add('shape-hover');svg.classList.add('has-hover');
  const d=target.dataset,s=svg.dataset,r={x:Number(d.rx),y:Number(d.ry),w:Number(d.rw),h:Number(d.rh)};
  const g=dimensionGeometry({x:Number(s.sheetX),y:Number(s.sheetY),w:Number(s.sheetW),h:Number(s.sheetH)},r),a=g.horizontal,b=g.vertical;
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','g');overlay.setAttribute('class','hover-dimensions');overlay.setAttribute('pointer-events','none');overlay.setAttribute('aria-label',`${d.region!==undefined?'남는 영역':'부재'} 가로 ${dim(Number(d.mmW))}, 세로 ${dim(Number(d.mmH))} ${unit()}`);
  overlay.innerHTML=`<g stroke="#df725e" stroke-width="1.2" fill="none"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/><path d="M${a.x1} ${a.y}H${a.x2}M${a.x1} ${a.y-5}v10M${a.x2} ${a.y-5}v10M${b.x} ${b.y1}V${b.y2}M${b.x-5} ${b.y1}h10M${b.x-5} ${b.y2}h10"/></g><g fill="#cf604b" font-size="12"><text x="${a.labelX}" y="${a.labelY}" text-anchor="middle">${dim(Number(d.mmW))} ${unit()}</text><text transform="translate(${b.labelX},${b.labelY}) rotate(90)" text-anchor="middle">${dim(Number(d.mmH))} ${unit()}</text></g>`;
  svg.append(overlay);
}
$('#result-body').addEventListener('pointerover',e=>{const t=e.target.closest('.part-shape,.remnant-shape');if(t&&!t.contains(e.relatedTarget))showHover(t);});
$('#result-body').addEventListener('pointerout',e=>{const t=e.target.closest('.part-shape,.remnant-shape');if(t&&!t.contains(e.relatedTarget))clearHover(t.closest('svg'));});
$('#result-body').addEventListener('focusin',e=>{const t=e.target.closest('.part-shape,.remnant-shape');if(t)showHover(t);});
$('#result-body').addEventListener('focusout',e=>{const t=e.target.closest('.part-shape,.remnant-shape');if(t)clearHover(t.closest('svg'));});
$('#print-result').addEventListener('click',showPDFOptions);
$('#toolbar-svg').addEventListener('click',()=>{if(result?.bins.length)download(boardSVG(result.bins[selectedSheet],{labels:true,sheetIndex:selectedSheet}),`${fileName()}_원판${selectedSheet+1}.svg`,'image/svg+xml');});
$('#toolbar-png').addEventListener('click',exportPNG);
let drag=null;
$('#result-body').addEventListener('pointerdown',e=>{const viewport=e.target.closest('.drawing-viewport');if(!view.pan||!viewport||e.button!==0)return;drag={viewport,pointer:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);e.preventDefault();});
$('#result-body').addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;drag.viewport.scrollLeft=drag.left+drag.x-e.clientX;drag.viewport.scrollTop=drag.top+drag.y-e.clientY;});
function finishDrag(){if(drag){if(drag.viewport.hasPointerCapture(drag.pointer))drag.viewport.releasePointerCapture(drag.pointer);drag=null;}}
$('#result-body').addEventListener('pointerup',finishDrag);$('#result-body').addEventListener('pointercancel',finishDrag);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(!worker)calculate();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveSnapshot();}});
window.addEventListener('pagehide',()=>{cancelCalculation(false);clearTimeout(toastTimer);});
hydrate();renderAll();persist();
