// Rebuild a guillotine tree for fixed part positions; never join cuts across detached sheets.
import {scheduleCutTree,cutMotion} from './cut-order.js?v=61e5157091d1';
const EPS=1e-7;
const near=(a,b)=>Math.abs(a-b)<EPS;
const reusable=(r,min)=>Math.min(r.w,r.h)>=min-EPS?r.w*r.h:0;
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
  const route=scheduleCutTree(root,{x:t,y:t});
  return {...bin,cuts:route.cuts,cutMotion:{before:cutMotion(bin.cuts,{x:t,y:t}),after:cutMotion(route.cuts,{x:t,y:t}),exactOrder:route.exact}};
}
export function sharedCutPlan(bin,settings,{maxStates=6000,onSearch=()=>{}}={}){
  if(bin.parts.length<2||bin.parts.length>48)return null;
  const k=settings.kerf,min=settings.minRemnant??100,memo=new Map();let states=0,candidatesExamined=0,capped=false,alternativesTruncated=false;
  const alternativeLimit=bin.parts.length<=6?24:0;
  const empty={count:0,length:0,joins:0,longStrokes:0,area:0,largest:0,free:[],cuts:[],tree:null};
  const leaf=r=>({...empty,area:reusable(r,min),largest:reusable(r,min),free:[r]});
  const rank=p=>[p.count,-(p.area+.1*p.largest)];
  const route=p=>p.route??(p.route=scheduleCutTree(p.tree,p.origin));
  const better=(a,b)=>{if(!b)return true;const aa=rank(a),bb=rank(b);for(let i=0;i<aa.length;i++)if(!near(aa[i],bb[i]))return aa[i]<bb[i];
    const ar=route(a),br=route(b),ad=ar.distance+a.length,bd=br.distance+b.length;
    if(!near(ad,bd))return ad<bd;if(ar.turns!==br.turns)return ar.turns<br.turns;
    if(a.joins!==b.joins)return a.joins>b.joins;if(!near(a.longStrokes,b.longStrokes))return a.longStrokes>b.longStrokes;
    return false;};
  // Keep the previous additive tree strategy as a candidate at every rectangle.
  // A local route improvement alone need not produce the best route at its parent.
  const legacyBetter=(a,b)=>{if(!b)return true;const aa=[...rank(a),a.length,-a.joins,-a.longStrokes],bb=[...rank(b),b.length,-b.joins,-b.longStrokes];for(let i=0;i<aa.length;i++)if(!near(aa[i],bb[i]))return aa[i]<bb[i];
    for(let i=0;i<a.cuts.length;i++){const x=a.cuts[i],y=b.cuts[i];if(x.axis!==y.axis)return x.axis<y.axis;if(!near(x[x.axis],y[y.axis]))return x[x.axis]<y[y.axis];}return false;};
  const pair=p=>({best:p,baseline:p,choices:[p]});
  function solve(r,ids){
    if(!ids.length)return pair(leaf(r));
    if(ids.length===1){const p=bin.parts[ids[0]];if(near(r.x,p.x)&&near(r.y,p.y)&&near(r.w,p.w)&&near(r.h,p.h))return pair(empty);}
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
    let best=null,baseline=null,alternatives=[];
    for(const c of candidates){
      candidatesExamined++;
      const a={...r,[c.size]:c.pos-r[c.axis]},b={...r,[c.axis]:c.pos+k,[c.size]:Math.max(0,r[c.axis]+r[c.size]-c.pos-k)};
      const left=solve(a,c.first);if(!left)continue;
      const right=b[c.size]>EPS?solve(b,c.second):pair(empty);if(!right)continue;
      const partInstances=ids.filter(i=>{const p=bin.parts[i];return near(p[c.axis]+p[c.size],c.pos)||near(p[c.axis],c.pos+k);}).map(i=>bin.parts[i].instance);
      const cut={axis:c.axis,x:c.axis==='x'?c.pos:r.x,y:c.axis==='y'?c.pos:r.y,length:r[c.other],kerf:k,partInstance:partInstances.length===1?partInstances[0]:null,partInstances};
      const covered=bin.cuts.filter(old=>old.axis===cut.axis&&near(old[cut.axis],cut[cut.axis])&&(cut.axis==='x'?old.y>=cut.y-EPS&&old.y+old.length<=cut.y+cut.length+EPS:old.x>=cut.x-EPS&&old.x+old.length<=cut.x+cut.length+EPS)).length;
      for(const one of left.choices)for(const two of right.choices){
        const p={count:1+one.count+two.count,length:cut.length+one.length+two.length,joins:Math.max(0,covered-1)+one.joins+two.joins,longStrokes:cut.length**2+one.longStrokes+two.longStrokes,area:one.area+two.area,largest:Math.max(one.largest,two.largest),free:[...one.free,...two.free],cuts:[cut,...one.cuts,...two.cuts],tree:{cut,first:one.tree,second:two.tree},origin:{x:r.x,y:r.y}};
        if(one===left.baseline&&two===right.baseline&&legacyBetter(p,baseline))baseline=p;
        if(alternativeLimit){
          const score=rank(p),current=alternatives.length?rank(alternatives[0]):null;let cmp=current?0:-1;
          if(current)for(let i=0;i<score.length;i++)if(!near(score[i],current[i])){cmp=score[i]<current[i]?-1:1;break;}
          if(cmp<0)alternatives=[p];else if(cmp===0){if(alternatives.length<alternativeLimit)alternatives.push(p);else alternativesTruncated=true;}
        }
        if(better(p,best))best=p;
      }
    }
    const result=best?{best,baseline,choices:[...new Set([baseline,best,...alternatives])]}:null;memo.set(key,result);return result;
  }
  const t=settings.trim,r=solve({x:t,y:t,w:bin.stock.w-2*t,h:bin.stock.h-2*t},bin.parts.map((_,i)=>i))?.best;
  onSearch({states,candidatesExamined,capped,alternativesTruncated});
  if(!r)return null;
  const oldArea=bin.free.reduce((n,f)=>n+reusable(f,min),0),oldLargest=Math.max(0,...bin.free.map(f=>reusable(f,min)));
  // Keep the chosen residual quality in area/remnant modes; cut-priority explicitly trades it.
  const residualOK=settings.priority==='cuts'||(settings.priority==='remnant'?(r.largest>oldLargest+EPS||near(r.largest,oldLargest)&&r.area>=oldArea-EPS):r.area+.1*r.largest>=oldArea+.1*oldLargest-EPS);
  if(!residualOK||r.count>bin.cuts.length)return null;
  const planned=route(r),cuts=planned.cuts;
  // On equivalent geometry costs, retain the original tree if its ordered route is better.
  if(r.count===bin.cuts.length&&near(r.area,oldArea)&&near(r.largest,oldLargest)){
    const original=orderCutPlan(bin,settings).cutMotion?.after;
    const totalDistance=planned.distance+r.length;
    if(original&&(original.totalDistance<totalDistance-EPS||near(original.totalDistance,totalDistance)&&original.turns<planned.turns))return null;
  }
  return {...bin,free:r.free,cuts,cutMotion:{before:cutMotion(bin.cuts,{x:t,y:t}),after:cutMotion(cuts,{x:t,y:t}),exactOrder:planned.exact},cutPlan:{originalCount:bin.cuts.length,count:r.count,states,commonCuts:cuts.filter(c=>c.partInstances.length>1).length}};
}
