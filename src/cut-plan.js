// Rebuild a guillotine tree for fixed part positions; never join cuts across detached sheets.
const EPS=1e-7;
const near=(a,b)=>Math.abs(a-b)<EPS;
const reusable=(r,min)=>Math.min(r.w,r.h)>=min-EPS?r.w*r.h:0;
// A child cut only becomes available after its parent separates that workpiece.
// Among available workpieces keep the saw direction, then move left-to-right/top-to-bottom.
function orderedCuts(tree){
  const ready=tree?[tree]:[],cuts=[];let previous=null;
  while(ready.length){
    const sameDirection=c=>previous&&c.axis===previous.axis;
    const sameBand=c=>sameDirection(c)&&near(c[c.axis==='x'?'y':'x'],previous[c.axis==='x'?'y':'x'])&&near(c.length,previous.length);
    ready.sort((a,b)=>Number(sameDirection(b.cut))-Number(sameDirection(a.cut))||Number(sameBand(b.cut))-Number(sameBand(a.cut))||a.cut.axis.localeCompare(b.cut.axis)||a.cut[a.cut.axis==='x'?'y':'x']-b.cut[b.cut.axis==='x'?'y':'x']||a.cut[a.cut.axis]-b.cut[b.cut.axis]);
    const node=ready.shift();cuts.push(node.cut);previous=node.cut;
    if(node.first)ready.push(node.first);if(node.second)ready.push(node.second);
  }
  return cuts;
}
export function orderCutPlan(bin,settings){
  const t=settings.trim,fragments=[{x:t,y:t,w:bin.stock.w-2*t,h:bin.stock.h-2*t,parent:null,side:null}];let root=null;
  for(const cut of bin.cuts){
    const i=fragments.findIndex(f=>cut.axis==='x'?near(f.y,cut.y)&&near(f.h,cut.length)&&cut.x>f.x+EPS&&cut.x+cut.kerf<=f.x+f.w+EPS:near(f.x,cut.x)&&near(f.w,cut.length)&&cut.y>f.y+EPS&&cut.y+cut.kerf<=f.y+f.h+EPS);
    // Preserve an unfamiliar plan rather than fabricate dependencies.
    if(i<0)return bin;
    const f=fragments.splice(i,1)[0],node={cut,first:null,second:null};if(f.parent)f.parent[f.side]=node;else root=node;
    const axis=cut.axis,size=axis==='x'?'w':'h';
    fragments.push({...f,[size]:cut[axis]-f[axis],parent:node,side:'first'},{...f,[axis]:cut[axis]+cut.kerf,[size]:Math.max(0,f[axis]+f[size]-cut[axis]-cut.kerf),parent:node,side:'second'});
  }
  return {...bin,cuts:orderedCuts(root)};
}
export function sharedCutPlan(bin,settings,{maxStates=6000,onSearch=()=>{}}={}){
  if(bin.parts.length<2||bin.parts.length>48)return null;
  const k=settings.kerf,min=settings.minRemnant??100,memo=new Map();let states=0,candidatesExamined=0,capped=false;
  const empty={count:0,length:0,joins:0,longStrokes:0,area:0,largest:0,free:[],cuts:[],tree:null};
  const leaf=r=>({...empty,area:reusable(r,min),largest:reusable(r,min),free:[r]});
  const rank=p=>[p.count,-(p.area+.1*p.largest),p.length,-p.joins,-p.longStrokes];
  const better=(a,b)=>{if(!b)return true;const aa=rank(a),bb=rank(b);for(let i=0;i<aa.length;i++)if(!near(aa[i],bb[i]))return aa[i]<bb[i];
    // Equal-quality trees should not start in the middle merely because the search tried it first.
    for(let i=0;i<a.cuts.length;i++){const x=a.cuts[i],y=b.cuts[i];if(x.axis!==y.axis)return x.axis<y.axis;if(!near(x[x.axis],y[y.axis]))return x[x.axis]<y[y.axis];}return false;};
  function solve(r,ids){
    if(!ids.length)return leaf(r);
    if(ids.length===1){const p=bin.parts[ids[0]];if(near(r.x,p.x)&&near(r.y,p.y)&&near(r.w,p.w)&&near(r.h,p.h))return empty;}
    const key=JSON.stringify([r.x,r.y,r.w,r.h]);if(memo.has(key))return memo.get(key);if(states>=maxStates){capped=true;return null;}states++;
    const candidates=[];
    for(const axis of ['x','y']){
      const size=axis==='x'?'w':'h',other=axis==='x'?'h':'w';
      const positions=[...new Set(ids.flatMap(i=>{const p=bin.parts[i];return [p[axis]+p[size],p[axis]-k];}))].sort((a,b)=>a-b);
      for(const pos of positions){
        if(pos<=r[axis]+EPS||pos+k>r[axis]+r[size]+EPS)continue;
        const first=[],second=[];let clear=true;
        for(const i of ids){const p=bin.parts[i];if(p[axis]+p[size]<=pos+EPS)first.push(i);else if(p[axis]>=pos+k-EPS)second.push(i);else{clear=false;break;}}
        if(!clear)continue;
        candidates.push({axis,size,other,pos,first,second,balance:Math.min(first.length,second.length)});
      }
    }
    candidates.sort((a,b)=>b.balance-a.balance||a.axis.localeCompare(b.axis)||a.pos-b.pos);
    let best=null;
    for(const c of candidates){
      candidatesExamined++;
      const a={...r,[c.size]:c.pos-r[c.axis]},b={...r,[c.axis]:c.pos+k,[c.size]:Math.max(0,r[c.axis]+r[c.size]-c.pos-k)};
      const one=solve(a,c.first);if(!one)continue;
      const two=b[c.size]>EPS?solve(b,c.second):empty;if(!two)continue;
      const partInstances=ids.filter(i=>{const p=bin.parts[i];return near(p[c.axis]+p[c.size],c.pos)||near(p[c.axis],c.pos+k);}).map(i=>bin.parts[i].instance);
      const cut={axis:c.axis,x:c.axis==='x'?c.pos:r.x,y:c.axis==='y'?c.pos:r.y,length:r[c.other],kerf:k,partInstance:partInstances.length===1?partInstances[0]:null,partInstances};
      const covered=bin.cuts.filter(old=>old.axis===cut.axis&&near(old[cut.axis],cut[cut.axis])&&(cut.axis==='x'?old.y>=cut.y-EPS&&old.y+old.length<=cut.y+cut.length+EPS:old.x>=cut.x-EPS&&old.x+old.length<=cut.x+cut.length+EPS)).length;
      const p={count:1+one.count+two.count,length:cut.length+one.length+two.length,joins:Math.max(0,covered-1)+one.joins+two.joins,longStrokes:cut.length**2+one.longStrokes+two.longStrokes,area:one.area+two.area,largest:Math.max(one.largest,two.largest),free:[...one.free,...two.free],cuts:[cut,...one.cuts,...two.cuts],tree:{cut,first:one.tree,second:two.tree}};
      if(better(p,best))best=p;
    }
    memo.set(key,best);return best;
  }
  const t=settings.trim,r=solve({x:t,y:t,w:bin.stock.w-2*t,h:bin.stock.h-2*t},bin.parts.map((_,i)=>i));
  onSearch({states,candidatesExamined,capped});
  if(!r)return null;
  const oldArea=bin.free.reduce((n,f)=>n+reusable(f,min),0),oldLargest=Math.max(0,...bin.free.map(f=>reusable(f,min))),oldLength=bin.cuts.reduce((n,c)=>n+c.length,0);
  // Keep the chosen residual quality in area/remnant modes; cut-priority explicitly trades it.
  const residualOK=settings.priority==='cuts'||(settings.priority==='remnant'?(r.largest>oldLargest+EPS||near(r.largest,oldLargest)&&r.area>=oldArea-EPS):r.area+.1*r.largest>=oldArea+.1*oldLargest-EPS);
  const oldLongStrokes=bin.cuts.reduce((n,c)=>n+c.length**2,0);
  if(!residualOK||r.count>bin.cuts.length||r.count===bin.cuts.length&&(r.length>oldLength+EPS||near(r.length,oldLength)&&r.joins===0&&r.longStrokes<oldLongStrokes-EPS))return null;
  const cuts=orderedCuts(r.tree);
  return {...bin,free:r.free,cuts,cutPlan:{originalCount:bin.cuts.length,count:r.count,states,commonCuts:cuts.filter(c=>c.partInstances.length>1).length}};
}
