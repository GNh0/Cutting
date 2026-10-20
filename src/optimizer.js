// Independent guillotine packing engine. All lengths are millimetres.
const EPS = 1e-7;
export const LIMIT = 1000;
export function validateProject(project) {
  const errors=[];
  if (!project || !Array.isArray(project.parts) || !Array.isArray(project.stocks) || !project.settings) return ['프로젝트 형식이 올바르지 않습니다.'];
  const s=project.settings;
  if (![s.kerf,s.trim].every(v=>Number.isFinite(v)&&v>=0&&v<=10000)) errors.push('톱날 두께와 가장자리 여유는 0~10,000 mm이어야 합니다.');
  if(!['rotate','material','grain','single'].every(k=>typeof s[k]==='boolean')||!['quick','balanced','thorough'].includes(s.quality)||!['area','cuts','remnant'].includes(s.priority))errors.push('최적화 설정 형식이 올바르지 않습니다.');
  if(s.minRemnant!==undefined&&(!Number.isFinite(s.minRemnant)||s.minRemnant<0||s.minRemnant>1000000))errors.push('재사용 잔재 최소 폭은 0~1,000,000 mm이어야 합니다.');
  let count=0;
  for (const [kind,rows] of [['부재',project.parts],['원판',project.stocks]]) {
    if(rows.length>LIMIT) { errors.push(`${kind} 행은 ${LIMIT}개까지 입력할 수 있습니다.`); continue; }
    const ids=new Set();
    for (const [i,r] of rows.entries()) {
      if(!r||typeof r!=='object'){errors.push(`${kind} ${i+1}행: 데이터 형식이 올바르지 않습니다.`);continue;}
      if(typeof r.id!=='string'||ids.has(r.id)) errors.push(`${kind} ${i+1}행: 고유 ID가 필요합니다.`);
      ids.add(r.id);
      if(![r.w,r.h,r.qty].every(v=>typeof v==='number'&&Number.isFinite(v)))errors.push(`${kind} ${i+1}행: 치수와 수량의 데이터 형식이 올바르지 않습니다.`);
      if(typeof r.material!=='string'||typeof r.label!=='string'||r.label.length>200||r.material.length>200)errors.push(`${kind} ${i+1}행: 이름과 재질은 200자 이하의 텍스트이어야 합니다.`);
      if(!['none','x','y'].includes(r.grain))errors.push(`${kind} ${i+1}행: 결 방향이 올바르지 않습니다.`);
      if(r.enabled===false) continue;
      if (![r.w,r.h].every(v=>Number.isFinite(v)&&v>0&&v<=1000000)) errors.push(`${kind} ${i+1}행: 가로·세로는 0 초과, 1,000,000 mm 이하이어야 합니다.`);
      if (!Number.isInteger(r.qty)||r.qty<1||r.qty>LIMIT) errors.push(`${kind} ${i+1}행: 수량은 1~${LIMIT}의 정수이어야 합니다.`);
      if (kind==='부재') count+=r.qty;
    }
  }
  if(count>LIMIT) errors.push(`전체 부재 수량은 ${LIMIT}개 이하여야 합니다.`);
  if(!project.parts.some(r=>r&&r.enabled!==false)) errors.push('부재를 한 행 이상 입력하세요.');
  if(!project.stocks.some(r=>r&&r.enabled!==false)) errors.push('원판을 한 행 이상 입력하세요.');
  return [...new Set(errors)];
}
function orientations(p,stock,s) {
  return [false,...(s.rotate&&p.rotate!==false?[true]:[])].filter(rot=>{
    if(!s.grain||p.grain==='none'||stock.grain==='none') return true;
    const direction=rot?(p.grain==='x'?'y':'x'):p.grain;
    return direction===stock.grain;
  }).map(rot=>({rot,w:rot?p.h:p.w,h:rot?p.w:p.h}));
}
function split(f,o,k,vertical) {
  const dx=f.w-o.w,dy=f.h-o.h;
  // A full kerf must fit for each separation. Exact edge fits need no cut.
  if(dx < -EPS||dy < -EPS||(dx>EPS&&dx<k-EPS)||(dy>EPS&&dy<k-EPS)) return null;
  const right=Math.max(0,dx-k),bottom=Math.max(0,dy-k),free=[],cuts=[];
  if(vertical) {
    if(dx>EPS) cuts.push({axis:'x',x:f.x+o.w,y:f.y,length:f.h,kerf:k});
    if(dy>EPS) cuts.push({axis:'y',x:f.x,y:f.y+o.h,length:o.w,kerf:k});
    if(right>EPS) free.push({x:f.x+o.w+k,y:f.y,w:right,h:f.h});
    if(bottom>EPS) free.push({x:f.x,y:f.y+o.h+k,w:o.w,h:bottom});
  } else {
    if(dy>EPS) cuts.push({axis:'y',x:f.x,y:f.y+o.h,length:f.w,kerf:k});
    if(dx>EPS) cuts.push({axis:'x',x:f.x+o.w,y:f.y,length:o.h,kerf:k});
    if(bottom>EPS) free.push({x:f.x,y:f.y+o.h+k,w:f.w,h:bottom});
    if(right>EPS) free.push({x:f.x+o.w+k,y:f.y,w:right,h:o.h});
  }
  return {free,cuts};
}
const matches=(p,stock,s)=>!s.material||p.material.trim()===stock.material.trim();
function candidate(p,bin,s,variant,strategy=null,scoringMode=null,collector=null) {
  if(!matches(p,bin.stock,s)) return null;
  let best=null;
  const allOrientations=orientations(p,bin.stock,s);
  const grouped=strategy&&(nearDimension(p.w,strategy.size)||nearDimension(p.h,strategy.size));
  const aligned=grouped?allOrientations.filter(o=>nearDimension(strategy.axis==='x'?o.w:o.h,strategy.size)):[];
  for(let i=0;i<bin.free.length;i++) for(const o of aligned.length?aligned:allOrientations) {
    const f=bin.free[i];
    if(o.w>f.w+EPS||o.h>f.h+EPS) continue;
    const preferred=strategy?(grouped?strategy.axis==='x':strategy.axis!=='x'):null;
    for(const v of preferred===null?[true,false]:[preferred]) {
      const sp=split(f,o,s.kerf,v); if(!sp) continue;
      const waste=f.w*f.h-o.w*o.h;
      const mode=scoringMode??variant%3;
      const score=mode===0?waste:mode===1?Math.min(f.w-o.w,f.h-o.h)*100000+Math.max(f.w-o.w,f.h-o.h):mode===2?sp.cuts.reduce((n,c)=>n+c.length,0)*100+waste/10000:mode===3?-Math.max(0,...sp.free.map(r=>r.w*r.h))+sp.cuts.reduce((n,c)=>n+c.length,0)*.001:-sp.free.reduce((n,r)=>n+Math.pow(r.w*r.h,1.5),0)/1000000;
      const fragmentation=sp.free.reduce((n,r)=>n+Math.min(r.w,r.h),0);
      const rank=score-fragmentation*0.00001;
      if(collector)collector.push({i,o,sp,f,rank});
      if(!best||rank<best.rank) best={i,o,sp,f,rank};
    }
  }
  return best;
}
const nearDimension=(a,b)=>Math.abs(a-b)<EPS;
function run(pieces,stocks,s,variant,strategy=null,scoringMode=null) {
  const bins=[],unplaced=[],remaining=stocks.map(r=>r.qty);
  for(const p of pieces) {
    let chosen=null;
    for(const bin of bins) {
      const c=candidate(p,bin,s,variant,strategy,scoringMode);
      if(c&&(!chosen||c.rank<chosen.c.rank)) chosen={bin,c};
    }
    if(!chosen&&(!s.single||bins.length===0)) {
      for(let i=0;i<stocks.length;i++) {
        const stock=stocks[i]; if(remaining[i]<=0) continue;
        const w=stock.w-2*s.trim,h=stock.h-2*s.trim;
        if(w<=0||h<=0) continue;
        const bin={stock,stockIndex:i,free:[{x:s.trim,y:s.trim,w,h}],parts:[],cuts:[]};
        const c=candidate(p,bin,s,variant,strategy,scoringMode);
        const area=stock.w*stock.h,previous=chosen?chosen.bin.stock.w*chosen.bin.stock.h:0;
        const preferLarge=Math.floor(variant/3)%2===1;
        if(c&&(!chosen||(preferLarge?area>previous:area<previous)||(area===previous&&c.rank<chosen.c.rank))) chosen={bin,c,fresh:true};
      }
    }
    if(!chosen) {unplaced.push(p);continue;}
    const {bin,c}=chosen;
    if(chosen.fresh) {remaining[bin.stockIndex]--; bins.push(bin);}
    bin.free.splice(c.i,1,...c.sp.free);
    bin.parts.push({...p,x:c.f.x,y:c.f.y,w:c.o.w,h:c.o.h,rotated:c.o.rot});
    bin.cuts.push(...c.sp.cuts.map(cut=>({...cut,partInstance:p.instance})));
  }
  const usedArea=bins.reduce((n,b)=>n+b.parts.reduce((a,p)=>a+p.w*p.h,0),0);
  const stockArea=bins.reduce((n,b)=>n+b.stock.w*b.stock.h,0);
  const cutLength=bins.reduce((n,b)=>n+b.cuts.reduce((a,c)=>a+c.length,0),0);
  const cutCount=bins.reduce((n,b)=>n+b.cuts.length,0);
  const minRemnant=s.minRemnant??100;
  const remnants=bins.flatMap((b,i)=>b.free.map((r,j)=>({...r,sheet:i,index:j,material:b.stock.material,grain:b.stock.grain,reusable:Math.min(r.w,r.h)>=minRemnant-EPS})));
  const reusable=remnants.filter(r=>r.reusable),reusableArea=reusable.reduce((n,r)=>n+r.w*r.h,0),largestRemnant=Math.max(0,...reusable.map(r=>r.w*r.h));
  return {bins,unplaced,usedArea,stockArea,wasteArea:stockArea-usedArea,cutLength,cutCount,remnants,reusableArea,largestRemnant,placed:pieces.length-unplaced.length,total:pieces.length};
}
function better(a,b,priority,rankMode='balanced') {
  if(!b) return true;
  if(priority==='remnant')rankMode='largest';
  const residual=r=>rankMode==='largest'?[-r.largestRemnant,-r.reusableArea]:[-(r.reusableArea+.1*r.largestRemnant)];
  const rank=r=>[r.unplaced.length,r.unplaced.reduce((n,p)=>n+p.w*p.h,0),...(priority==='cuts'?[r.cutCount,r.stockArea,...residual(r)]:[r.stockArea,...residual(r),r.cutCount]),r.cutLength];
  const aa=rank(a),bb=rank(b);
  for(let i=0;i<aa.length;i++) if(Math.abs(aa[i]-bb[i])>EPS) return aa[i]<bb[i];
  return false;
}
export function optimizeHybrid(project,onProgress=()=>{},baseBudget=48){
  const profiles=[{family:'current',budget:baseBudget,rankMode:'largest'},{family:'current',budget:baseBudget},{family:'portfolio',budget:baseBudget*2},{family:'guided',budget:baseBudget}];
  const total=baseBudget*5;let done=0,best=null,selectedFamily=null;
  for(const profile of profiles){
    const candidate=optimize(project,percent=>onProgress(Math.round((done+profile.budget*percent/100)/total*100)),profile);
    if(better(candidate,best,project.settings.priority)){best=candidate;selectedFamily=profile.family;}
    done+=profile.budget;
  }
  return {...best,iterations:total,algorithm:'hybrid',selectedFamily};
}
export function optimize(project,onProgress=()=>{},options={}) {
  const errors=validateProject(project); if(errors.length) throw new Error(errors.join('\n'));
  if((options.family||'hybrid')==='hybrid')return optimizeHybrid(project,onProgress,options.budget??(project.settings.quality==='quick'?6:project.settings.quality==='thorough'?48:24));
  const pieces=project.parts.filter(r=>r.enabled!==false).flatMap(p=>Array.from({length:p.qty},(_,i)=>({...p,instance:`${p.id}:${i+1}`,originalW:p.w,originalH:p.h})));
  const stocks=project.stocks.filter(r=>r.enabled!==false),s=project.settings;
  const iterations=options.budget??(s.quality==='quick'?6:s.quality==='thorough'?48:24);
  const family=options.family||'current';
  const frequency=new Map();
  for(const p of pieces)for(const size of new Set([p.w,p.h]))frequency.set(size,(frequency.get(size)||0)+1);
  const stripSizes=[...frequency].sort((a,b)=>b[1]-a[1]||b[0]-a[0]).map(([size])=>size).slice(0,12);
  const generalCount=Math.floor(iterations/2);
  let best=null;
  for(let v=0;v<iterations;v++) {
    const isCurrent=family==='current';
    const cycle=Math.floor(v/4),slot=v%4;
    const mode=isCurrent?Math.floor(v/3)%4:Math.floor(cycle/2)%8;
    const strategy=family==='greedy'?null:isCurrent?(v>=generalCount?{size:stripSizes[Math.floor((v-generalCount)/2)%stripSizes.length],axis:(v-generalCount)%2?'y':'x'}:null):slot>=2?{size:stripSizes[cycle%stripSizes.length],axis:slot===2?'x':'y'}:null;
    const scoringMode=isCurrent||family==='greedy'?null:family==='guided'?Math.floor(cycle/4)%5:strategy?Math.floor(cycle/stripSizes.length)%3:slot;
    const sorted=[...pieces].sort((a,b)=>{
      if(strategy){const group=p=>nearDimension(p.w,strategy.size)||nearDimension(p.h,strategy.size);const ga=group(a),gb=group(b);if(ga!==gb)return gb?1:-1;if(ga&&gb)return Math.max(b.w,b.h)-Math.max(a.w,a.h)||b.w*b.h-a.w*a.h;return Math.max(b.w,b.h)-Math.max(a.w,a.h)||b.w*b.h-a.w*a.h;}
      const key=p=>mode===0?p.w*p.h:mode===1?Math.max(p.w,p.h):mode===2?Math.min(p.w,p.h):mode===3?p.w+p.h:mode===4?p.w:mode===5?p.h:mode===6?Math.abs(p.w-p.h):p.w*p.h/Math.max(p.w,p.h)**.5;
      // Deterministic perturbations explore orderings without losing reproducibility.
      const noise=p=>isCurrent?(v<12?1:1+0.35*Math.sin((p.originalW*7+p.originalH*13+p.id.length*31)*(v+1))):(v<48?1:1+0.35*Math.sin((p.originalW*7+p.originalH*13+p.id.length*31)*(v+1)));
      return key(b)*noise(b)-key(a)*noise(a)||a.instance.localeCompare(b.instance);
    });
    const result=run(sorted,stocks,s,v,strategy,scoringMode);
    if(better(result,best,s.priority,options.rankMode||'balanced')) best=result;
    onProgress(Math.round((v+1)/iterations*100),result,{variant:v,strategy});
  }
  return {...best,iterations,settings:{...s}};
}
