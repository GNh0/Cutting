// Independent action tree. Neither Cutting v1 nor the Smart2D packer is called.
import {materialMatches,materialKey,materialInfo} from './materials.js?v=45e601b7291f';
import {sharedCutPlan,orderCutPlan} from './cut-plan.js?v=45e601b7291f';
import {compareMaterialQuality,compareResultQuality} from './calculation-comparison.js?v=45e601b7291f';

const EPS=1e-7,QUEUE_LIMIT=384,ACTION_LIMIT=24,CONSTRAINT_LIMIT=16;
const positive=r=>r.w>EPS&&r.h>EPS;
const sameRect=(a,b)=>['x','y','w','h'].every(k=>Math.abs(a[k]-b[k])<EPS);

function rotations(part,stock,settings){
  return [false,...(settings.rotate&&part.rotate!==false?[true]:[])].filter(rotated=>{
    if(!settings.grain||part.grain==='none'||stock.grain==='none')return true;
    return (rotated?(part.grain==='x'?'y':'x'):part.grain)===stock.grain;
  }).map(rotated=>({rotated,w:rotated?part.h:part.w,h:rotated?part.w:part.h}));
}

function separate(rect,size,kerf,vertical){
  const dw=rect.w-size.w,dh=rect.h-size.h;
  // This engine requires a complete saw width inside each non-exact gap.
  // Smart2D's terminal partial-kerf rule is deliberately not used here.
  if(dw<-EPS||dh<-EPS||dw>EPS&&dw<kerf-EPS||dh>EPS&&dh<kerf-EPS)return null;
  const right=Math.max(0,dw-kerf),bottom=Math.max(0,dh-kerf),free=[],cuts=[];
  if(vertical){
    if(dw>EPS)cuts.push({axis:'x',x:rect.x+size.w,y:rect.y,length:rect.h,kerf});
    if(dh>EPS)cuts.push({axis:'y',x:rect.x,y:rect.y+size.h,length:size.w,kerf});
    free.push({x:rect.x+size.w+kerf,y:rect.y,w:right,h:rect.h},{x:rect.x,y:rect.y+size.h+kerf,w:size.w,h:bottom});
  }else{
    if(dh>EPS)cuts.push({axis:'y',x:rect.x,y:rect.y+size.h,length:rect.w,kerf});
    if(dw>EPS)cuts.push({axis:'x',x:rect.x+size.w,y:rect.y,length:size.h,kerf});
    free.push({x:rect.x,y:rect.y+size.h+kerf,w:rect.w,h:bottom},{x:rect.x+size.w+kerf,y:rect.y,w:right,h:size.h});
  }
  return {free:free.filter(positive),cuts};
}

function lex(a,b){
  for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>EPS)return a[i]-b[i];
  return 0;
}

function token(action,stocks){
  return {partId:action.partId,binIndex:action.fresh?null:action.binIndex,
    stockId:action.fresh?stocks[action.stockIndex].id:null,rect:{...action.rect},
    rotated:action.rotated,vertical:action.vertical};
}

function tokenMatches(action,value,stocks){
  return action.partId===value.partId&&action.rotated===value.rotated&&action.vertical===value.vertical&&
    sameRect(action.rect,value.rect)&&(action.fresh?value.binIndex===null&&stocks[action.stockIndex].id===value.stockId:
      action.binIndex===value.binIndex&&value.stockId===null);
}

function regionCapacity(rect,sizes,kerf){
  const along=(length,size)=>{
    let n=Math.max(0,Math.floor((length+kerf+EPS)/(size+kerf)));
    const gap=length-(n*size+Math.max(0,n-1)*kerf);
    if(n&&gap>EPS&&gap<kerf-EPS)n--;
    return n;
  };
  return Math.max(0,...sizes.map(size=>along(rect.w,size.w)*along(rect.h,size.h)));
}

function enumerate(state,rows,stocks,settings,compatibility,policy=0){
  const all=[],minimum=settings.minRemnant??100;
  const add=(group,stockIndex,rect,rectIndex,binIndex,fresh)=>{
    for(const size of compatibility[group][stockIndex]){
      if(size.w>rect.w+EPS||size.h>rect.h+EPS)continue;
      const both=rect.w-size.w>EPS&&rect.h-size.h>EPS;
      for(const vertical of both?[true,false]:[true]){
        const split=separate(rect,size,settings.kerf,vertical);if(!split)continue;
        const reusable=split.free.filter(r=>Math.min(r.w,r.h)>=minimum-EPS);
        const loss=split.cuts.reduce((n,c)=>n+c.length*c.kerf,0)+split.free.filter(r=>Math.min(r.w,r.h)<minimum-EPS).reduce((n,r)=>n+r.w*r.h,0);
        // These ranks only propose the next action. Complete plans are compared
        // using the requested objective after physical cut refinement.
        const rank=[Number(fresh),rect.w*rect.h-size.w*size.h,loss,
          -Math.max(0,...reusable.map(r=>r.w*r.h)),-size.w*size.h,
          group,stockIndex,binIndex??-1,rectIndex,Number(size.rotated),Number(!vertical)];
        all.push({group,partId:rows[group].id,stockIndex,rect,rectIndex,binIndex,fresh,...size,vertical,split,rank});
      }
    }
  };
  for(let group=0;group<rows.length;group++){
    if(state.counts[group]<1)continue;
    for(let binIndex=0;binIndex<state.bins.length;binIndex++){
      const bin=state.bins[binIndex];
      if(!compatibility[group][bin.stockIndex].length)continue;
      for(let rectIndex=0;rectIndex<bin.free.length;rectIndex++)add(group,bin.stockIndex,bin.free[rectIndex],rectIndex,binIndex,false);
    }
    for(let stockIndex=0;stockIndex<stocks.length;stockIndex++){
      if(state.stockCounts[stockIndex]<1||!compatibility[group][stockIndex].length)continue;
      if(settings.single&&state.bins.some(bin=>materialKey(bin.stock)===materialKey(stocks[stockIndex])))continue;
      const stock=stocks[stockIndex],trim=settings.trim;
      const rect={x:trim,y:trim,w:stock.w-2*trim,h:stock.h-2*trim};
      if(positive(rect))add(group,stockIndex,rect,0,null,true);
    }
  }
  if(policy){
    // Uniform rectangular grids provide heuristic capacity estimates, not
    // proven bounds: mixing rotations may fit more pieces. These estimates
    // only rank scarce LOT/material and dimensional opportunities, never prune.
    const regions=new Map(),capacity=rows.map(()=>0),targets=rows.map(()=>0);
    for(const action of all){
      const key=action.fresh?'new:'+action.stockIndex:'bin:'+action.binIndex+':'+action.rectIndex;
      if(!regions.has(key))regions.set(key,{rect:action.rect,stockIndex:action.stockIndex,
        copies:action.fresh?state.stockCounts[action.stockIndex]:1,actions:[]});
      regions.get(key).actions.push(action);
    }
    for(const region of regions.values()){
      region.capacity=rows.map((row,g)=>state.counts[g]?regionCapacity(region.rect,compatibility[g][region.stockIndex],settings.kerf):0);
      region.capacity.forEach((n,g)=>{capacity[g]+=n*region.copies;if(n)targets[g]+=region.copies;});
    }
    for(const region of regions.values()){
      const threatened=rows.map((row,g)=>g).filter(g=>state.counts[g]&&region.capacity[g]&&capacity[g]-region.capacity[g]<state.counts[g]);
      threatened.sort((a,b)=>state.counts[b]/Math.max(1,capacity[b])-state.counts[a]/Math.max(1,capacity[a])||a-b);
      const relevant=threatened.slice(0,CONSTRAINT_LIMIT);
      for(const action of region.actions){
        let lost=0;
        for(const g of relevant){
          const placed=Number(g===action.group),remaining=state.counts[g]-placed;
          const after=capacity[g]-region.capacity[g]+action.split.free.reduce((n,r)=>n+regionCapacity(r,compatibility[g][region.stockIndex],settings.kerf),0);
          lost+=Math.max(0,Math.min(state.counts[g],capacity[g])-placed-Math.min(remaining,after));
        }
        const g=action.group,area=action.w*action.h,pressure=state.counts[g]/Math.max(1,capacity[g]);
        const tail=action.rank.slice(1);
        action.rank=policy===1?[lost,-pressure,targets[g],Number(action.fresh),-area,...tail]:
          [lost,Number(action.fresh),area,-state.counts[g],targets[g],...tail];
      }
    }
  }
  all.sort((a,b)=>lex(a.rank,b.rank));
  // Give each part type a representative before adding orientation/topology
  // alternatives. Repeated rotations cannot monopolize all branch slots.
  const limited=[],chosen=new Set(),parts=new Set(),targets=new Set();
  const take=action=>{if(!chosen.has(action)&&limited.length<ACTION_LIMIT){chosen.add(action);limited.push(action);}};
  for(const action of all)if(!parts.has(action.group)){parts.add(action.group);take(action);}
  for(const action of all){const key=action.fresh?'new:'+action.stockIndex:'bin:'+action.binIndex;if(!targets.has(key)){targets.add(key);take(action);}}
  for(const action of all)take(action);
  return {actions:limited,truncated:all.length>limited.length};
}

function apply(state,action,rows,stocks){
  let binIndex=action.binIndex;
  if(action.fresh){
    state.stockCounts[action.stockIndex]--;
    binIndex=state.bins.length;
    state.bins.push({stock:stocks[action.stockIndex],stockIndex:action.stockIndex,free:[{...action.rect}],parts:[],cuts:[]});
    state.stockArea+=stocks[action.stockIndex].w*stocks[action.stockIndex].h;
  }
  const bin=state.bins[binIndex],source=rows[action.group];
  const instance=`${source.id}:${source.qty-state.counts[action.group]+1}`;
  state.counts[action.group]--;
  bin.free.splice(action.rectIndex,1,...action.split.free);
  bin.parts.push({...source,instance,originalW:source.w,originalH:source.h,
    x:action.rect.x,y:action.rect.y,w:action.w,h:action.h,rotated:action.rotated});
  bin.cuts.push(...action.split.cuts.map(cut=>({...cut,partInstance:instance})));
}

function summarize(state,rows,settings,refineCuts){
  const bins=refineCuts?state.bins.map(bin=>sharedCutPlan(bin,settings,{maxStates:512})||orderCutPlan(bin,settings)):state.bins;
  const unplaced=rows.flatMap((row,i)=>Array.from({length:state.counts[i]},(_,j)=>({...row,
    instance:`${row.id}:${row.qty-state.counts[i]+j+1}`,originalW:row.w,originalH:row.h})));
  const remnants=bins.flatMap((bin,sheet)=>bin.free.map((r,index)=>({...r,sheet,index,...materialInfo(bin.stock),grain:bin.stock.grain,
    reusable:Math.min(r.w,r.h)>=(settings.minRemnant??100)-EPS})));
  const usedArea=bins.reduce((sum,bin)=>sum+bin.parts.reduce((n,p)=>n+p.w*p.h,0),0),stockArea=state.stockArea;
  const reusable=remnants.filter(r=>r.reusable);
  const display=new Map(),get=(row,requestOnly=false)=>{
    const key=materialKey(row);
    if(!display.has(key))display.set(key,{key,...materialInfo(row),sheets:[],placed:0,total:0,unplaced:0,stockArea:0,usedArea:0,requestOnly});
    return display.get(key);
  };
  bins.forEach((bin,i)=>{const g=get(bin.stock);g.requestOnly=false;g.sheets.push(i);g.placed+=bin.parts.length;g.total+=bin.parts.length;
    g.stockArea+=bin.stock.w*bin.stock.h;g.usedArea+=bin.parts.reduce((n,p)=>n+p.w*p.h,0);});
  unplaced.forEach(p=>{const g=get(p,true);g.unplaced++;g.total++;});
  return {bins,unplaced,remnants,groups:[...display.values()],usedArea,stockArea,wasteArea:stockArea-usedArea,
    cutCount:bins.reduce((n,b)=>n+b.cuts.length,0),cutLength:bins.reduce((n,b)=>n+b.cuts.reduce((a,c)=>a+c.length,0),0),
    reusableArea:reusable.reduce((n,r)=>n+r.w*r.h,0),largestRemnant:Math.max(0,...reusable.map(r=>r.w*r.h)),
    placed:bins.reduce((n,b)=>n+b.parts.length,0),total:rows.reduce((n,r)=>n+r.qty,0),settings:{...settings,material:true}};
}

export function searchPlacementTree(project,onProgress=()=>{},{budget=12,refineCuts=true}={}){
  if(!Number.isInteger(budget)||budget<1)throw new Error('배치 결정트리의 탐색 경로 수는 양의 정수여야 합니다.');
  const snapshot=structuredClone(project),settings=snapshot.settings;
  const rows=snapshot.parts.filter(row=>row.enabled!==false),stocks=snapshot.stocks.filter(row=>row.enabled!==false);
  const compatibility=rows.map(row=>stocks.map(stock=>materialMatches(row,stock)?rotations(row,stock,settings):[]));
  // Every budget follows the same sequence: three independent completion
  // policies, then physical alternatives to their actual placement prefixes.
  const seeds=[{prefix:[],policy:0},{prefix:[],policy:1},{prefix:[],policy:2}],queue=[];
  const seen=new Set(seeds.map(job=>JSON.stringify([job.policy,job.prefix])));
  let best=null,selectedPath=[],selectedPolicy=0,examined=0,maxDepth=0,pruned=0,capped=false,seedsExamined=0;
  const compare=(a,b)=>settings.priority==='area'?compareMaterialQuality(a,b):compareResultQuality(a,b,settings.priority);
  onProgress(0);
  while((seeds.length||queue.length)&&examined<budget){
    const fromSeed=seeds.length>0,{prefix,policy}=fromSeed?seeds.shift():queue.shift();
    const state={counts:rows.map(row=>row.qty),stockCounts:stocks.map(row=>row.qty),bins:[],stockArea:0};
    const path=[],branches=[];
    let abandoned=false;
    while(true){
      // Stock area cannot decrease along a branch. Cut count is deliberately
      // not used here because later cut-tree reconstruction can reduce it.
      if(best&&!best.unplaced.length&&settings.priority!=='cuts'&&state.stockArea>best.stockArea+EPS){pruned++;abandoned=true;break;}
      const {actions,truncated}=enumerate(state,rows,stocks,settings,compatibility,policy);
      capped||=truncated;
      if(!actions.length)break;
      const action=path.length<prefix.length?actions.find(a=>tokenMatches(a,prefix[path.length],stocks)):actions[0];
      if(!action){abandoned=true;break;}
      branches.push(actions.map(a=>token(a,stocks)));
      path.push(token(action,stocks));
      apply(state,action,rows,stocks);
    }
    if(abandoned)continue;
    const result=summarize(state,rows,settings,refineCuts);
    examined++;
    if(fromSeed)seedsExamined++;
    maxDepth=Math.max(maxDepth,path.length);
    const improved=!best||compare(result,best)<0;
    if(improved){best=result;selectedPath=path;selectedPolicy=policy;}
    const pending=[],missing=new Set(result.unplaced.map(part=>part.id));
    for(let step=prefix.length;step<branches.length;step++){
      for(const alternative of branches[step]){
        if(JSON.stringify(alternative)===JSON.stringify(path[step]))continue;
        const next=[...path.slice(0,step),alternative],key=JSON.stringify([policy,next]);
        if(seen.has(key))continue;
        if(pending.length>=QUEUE_LIMIT){capped=true;break;}
        seen.add(key);pending.push({prefix:next,policy,missing:missing.has(alternative.partId)});
      }
      if(pending.length>=QUEUE_LIMIT)break;
    }
    // A better complete plan immediately earns deeper branches. Its children
    // replace the oldest queued alternatives rather than being blocked by the
    // first completion's breadth. Unfulfilled part types get the first probe.
    pending.sort((a,b)=>Number(b.missing)-Number(a.missing));
    if(improved){queue.unshift(...pending);if(queue.length>QUEUE_LIMIT){queue.length=QUEUE_LIMIT;capped=true;}}
    else for(const job of pending){if(queue.length>=QUEUE_LIMIT){capped=true;break;}queue.push(job);}
    onProgress(Math.round(examined/budget*100));
  }
  capped||=queue.length>0||seeds.length>0;
  onProgress(100);
  return {...best,iterations:examined,algorithm:'decision-tree',placementTree:{examined,maxDepth,selectedPath,capped,pruned,
    independent:true,queueLimit:QUEUE_LIMIT,alternativesPerStep:ACTION_LIMIT,constraintCandidates:CONSTRAINT_LIMIT,
    seedsExamined,selectedPolicy:['space-first','constrained-large','count-small'][selectedPolicy]}};
}
