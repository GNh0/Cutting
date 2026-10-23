// Port of the captured Smart2DCutting strip evaluators 00594cc8/005952f4
// and their two split topologies 0057daf4/0057df6c. See docs for evidence
// boundaries: wrapper search and native postprocessing are separate steps.
import {materialMatches} from './materials.js?v=7bcc27a0c011';
import {mergeNativeFree} from './smart2d-merge.js?v=7bcc27a0c011';
import {sharedCutPlan} from './cut-plan.js?v=7bcc27a0c011';

const EPS=1e-7;
const fits=(a,b)=>a<=b+EPS;
const usable=r=>r.w>EPS&&r.h>EPS;

// 004c3de4 scans active positive-quantity parts of the current material.
// 0058810c sets max(2, ceil(longest usable sheet side / maximum input width));
// an individually rotatable row contributes its longer original side.
export function nativeLargePieceFactor(parts,stock,settings){
  let maximum=0;
  for(const part of parts)if(part.enabled!==false&&(part.qty??1)>0){
    const w=part.originalW??part.w,h=part.originalH??part.h;
    maximum=Math.max(maximum,part.rotate===false?w:Math.max(w,h));
  }
  if(maximum<=0)return 2;
  return Math.max(2,Math.ceil(Math.max(stock.w-2*settings.trim,stock.h-2*settings.trim)/maximum-EPS));
}

function orientations(piece,stock,settings){
  const allowed=rotated=>{
    if(rotated&&(!settings.rotate||piece.rotate===false))return false;
    if(!settings.grain||piece.grain==='none'||stock.grain==='none')return true;
    return (rotated?(piece.grain==='x'?'y':'x'):piece.grain)===stock.grain;
  };
  // The native evaluator visits the rotated candidate before the normal one.
  return [true,false].filter(allowed).map(rotated=>({rotated,w:rotated?piece.h:piece.w,h:rotated?piece.w:piece.h}));
}

function groupPieces(pieces,stock){
  const groups=[],byId=new Map();
  for(const piece of pieces){
    if(piece.enabled===false||!materialMatches(piece,stock))continue;
    let group=byId.get(piece.id);
    if(!group){group={piece,instances:[],used:0};byId.set(piece.id,group);groups.push(group);}
    group.instances.push(piece);
  }
  // 0043ed38 inserts before the first existing area <= the new original area.
  // Thus native order is descending original area, with reverse row order ties.
  return groups.map((group,index)=>({...group,index})).sort((a,b)=>
    (b.piece.originalW??b.piece.w)*(b.piece.originalH??b.piece.h)-
    (a.piece.originalW??a.piece.w)*(a.piece.originalH??a.piece.h)||b.index-a.index);
}

// Each fit picks one part type, repeated n times along one axis. A different
// type can be placed in the remaining rectangles on subsequent iterations.
function stripOption(rect,group,orientation,settings,axis,options){
  const k=settings.kerf,L=axis==='x'?rect.w:rect.h,cross=axis==='x'?rect.h:rect.w;
  const along=axis==='x'?orientation.w:orientation.h,across=axis==='x'?orientation.h:orientation.w;
  let count=Math.min(group.instances.length-group.used,Math.floor((L+k+EPS)/(along+k)));
  let consumed=count*(along+k);
  if(consumed>=L-EPS)consumed-=k;
  const edgeMargin=options.edgeMargin??0;
  if(options.smartTrim&&consumed>0&&edgeMargin>0&&L-consumed>EPS&&L-consumed<edgeMargin){count--;consumed-=along+k;}
  if(count<1||!fits(across,cross)||consumed<=(options.minimumConsumed??0))return null;
  return {group,...orientation,count,consumed,score:consumed*100/L,axis};
}

function fitStrip(rect,groups,stock,settings,axis,options){
  const k=settings.kerf,L=axis==='x'?rect.w:rect.h,cross=axis==='x'?rect.h:rect.w;
  let best=null,bestConsumed=options.minimumConsumed??0;
  const score=()=>bestConsumed*100/L;
  for(const group of groups){
    const qty=group.instances.length-group.used;
    if(qty<1)continue;
    const orientationsForPart=orientations(group.piece,stock,settings);
    for(const rotated of [true,false]){
      const orientation=orientationsForPart.find(o=>o.rotated===rotated);
      if(orientation){
        const along=axis==='x'?orientation.w:orientation.h,across=axis==='x'?orientation.h:orientation.w;
        const candidate=stripOption(rect,group,orientation,settings,axis,options);
        if(candidate&&candidate.consumed>bestConsumed){
          bestConsumed=candidate.consumed;
          best=candidate;
          // The native level-3 cutoff uses the input-dependent factor
          // recovered through 004c3de4 / 0058810c.
          const factor=options.largePieceFactor;
          if(options.level===3&&Number.isFinite(factor)&&factor>0&&
            (along>=Math.trunc((L-k)/factor)||across>=Math.trunc((cross-k)/factor)))return best;
        }
      }
      // In native code the mid-iteration threshold check is enabled by the
      // global rotation flag, even if this part cannot itself rotate.
      if((!rotated||settings.rotate)&&options.threshold<score())return best;
    }
  }
  return best;
}

function addCut(bin,fragment,axis,position,nominalKerf,instances){
  const end=axis==='x'?fragment.x+fragment.w:fragment.y+fragment.h;
  const remainder=end-position;
  if(remainder<=EPS)return 0;
  // The original permits the final saw stroke to consume a remainder thinner
  // than its nominal kerf. Store its actual in-material width for replay.
  const kerf=Math.min(nominalKerf,remainder);
  bin.cuts.push({axis,x:axis==='x'?position:fragment.x,y:axis==='y'?position:fragment.y,
    length:axis==='x'?fragment.h:fragment.w,kerf,nominalKerf,
    partInstance:instances.length===1?instances[0]:null,partInstances:[...instances]});
  return kerf;
}

function placeStrip(bin,rect,fit,settings){
  const k=settings.kerf,placed=[];
  let usedWidth=(fit.axis==='x'?fit.count:1)*(fit.w+k);
  let usedHeight=(fit.axis==='y'?fit.count:1)*(fit.h+k);
  if(usedWidth>rect.w+EPS)usedWidth-=k;
  if(usedHeight>rect.h+EPS)usedHeight-=k;
  const nativeCut=(x1,y1,x2,y2)=>bin.nativeCuts.push({x1,y1,x2,y2,nativeFlag:false});
  for(let i=0;i<fit.count;i++){
    const piece=fit.group.instances[fit.group.used++];
    placed.push({...piece,originalW:piece.originalW??piece.w,originalH:piece.originalH??piece.h,
      x:rect.x+(fit.axis==='x'?i*(fit.w+k):0),y:rect.y+(fit.axis==='y'?i*(fit.h+k):0),
      w:fit.w,h:fit.h,rotated:fit.rotated});
  }
  const ids=placed.map(p=>p.instance),remainders=[];
  if(fit.axis==='x'){
    // 0057df6c: separate the full-width bottom region, then the repeated row.
    const bottomKerf=addCut(bin,rect,'y',rect.y+fit.h,k,ids);
    const bottom={x:rect.x,y:rect.y+fit.h+bottomKerf,w:rect.w,h:Math.max(0,rect.h-fit.h-bottomKerf),nativeMergedX:rect.nativeMergedX,nativeMergedY:rect.nativeMergedY};
    if(usable(bottom)){remainders.push(bottom);nativeCut(rect.x,rect.y+usedHeight,rect.x+rect.w,rect.y+usedHeight);}
    let row={x:rect.x,y:rect.y,w:rect.w,h:fit.h};
    for(const part of placed){
      const actual=addCut(bin,row,'x',part.x+part.w,k,[part.instance]);
      row={x:part.x+part.w+actual,y:row.y,w:Math.max(0,rect.x+rect.w-part.x-part.w-actual),h:row.h};
    }
    if(usable(row)){remainders.push(row);nativeCut(rect.x+usedWidth,rect.y,rect.x+usedWidth,rect.y+usedHeight);}
  }else{
    // 0057daf4: separate the full-height right region, then the repeated column.
    const rightKerf=addCut(bin,rect,'x',rect.x+fit.w,k,ids);
    const right={x:rect.x+fit.w+rightKerf,y:rect.y,w:Math.max(0,rect.w-fit.w-rightKerf),h:rect.h,nativeMergedX:rect.nativeMergedX,nativeMergedY:rect.nativeMergedY};
    if(usable(right)){remainders.push(right);nativeCut(rect.x+usedWidth,rect.y,rect.x+usedWidth,rect.y+rect.h);}
    let column={x:rect.x,y:rect.y,w:fit.w,h:rect.h};
    for(const part of placed){
      const actual=addCut(bin,column,'y',part.y+part.h,k,[part.instance]);
      column={x:column.x,y:part.y+part.h+actual,w:column.w,h:Math.max(0,rect.y+rect.h-part.y-part.h-actual)};
    }
    if(usable(column)){remainders.push(column);nativeCut(rect.x,rect.y+usedHeight,rect.x+usedWidth,rect.y+usedHeight);}
  }
  bin.parts.push(...placed);
  return remainders;
}

function rebuildPhysical(bin,settings,cache){
  // Many native threshold/prefix trials finish at the same coordinates. Reuse
  // that physical proof within this calculation, with every relevant input in
  // the key; never share a cache across projects or retain caller-owned plans.
  const key=cache?JSON.stringify([bin.stock.w,bin.stock.h,settings.trim,settings.kerf,settings.minRemnant,settings.priority,
    bin.parts.map(p=>[p.instance,p.x,p.y,p.w,p.h]).sort((a,b)=>a[0].localeCompare(b[0])),
    bin.cuts.map(c=>[c.axis,c.x,c.y,c.length,c.kerf,c.partInstance,c.partInstances])]):null;
  if(cache?.has(key)){const plan=cache.get(key);return plan?{...bin,...structuredClone(plan)}:null;}
  const rebuilt=sharedCutPlan(bin,settings,{rebuild:true,edgeKerf:true,maxStates:6000});
  if(cache){
    if(cache.size>=256)cache.delete(cache.keys().next().value);
    cache.set(key,rebuilt?structuredClone({cuts:rebuilt.cuts,free:rebuilt.free,cutMotion:rebuilt.cutMotion,cutPlan:rebuilt.cutPlan}):null);
  }
  return rebuilt;
}

export function packNativeSheet(pieces,stock,settings,options={}){
  const direction=options.direction??'auto';
  if(!['auto','x','y'].includes(direction))throw new Error('지원하지 않는 Smart2D 배치 방향입니다.');
  const freeOrder=options.freeOrder??'append';
  if(!['append','insert'].includes(freeOrder))throw new Error('지원하지 않는 Smart2D 잔재 순서입니다.');
  const profile={...options,level:options.level??1,threshold:options.threshold??100,largePieceFactor:options.largePieceFactor??nativeLargePieceFactor(pieces,stock,settings)};
  const groups=groupPieces(pieces,stock),trim=settings.trim??0;
  const initial={x:trim,y:trim,w:stock.w-2*trim,h:stock.h-2*trim};
  let bin={stock,free:stock.enabled!==false&&usable(initial)?[initial]:[],parts:[],cuts:[],nativeCuts:[],decisions:[],limitations:[
    '복구한 반복 배치·분할과 잔재 합치기를 사용합니다. 잔재를 합친 배치는 절단 계획 재구성에 성공한 경우에만 반환합니다.',
    '길이는 mm로 계산합니다. 원본 정수 정밀도 변환은 별도 확인이 필요합니다.',
    '원본 부재 정렬과 입력 치수에 따른 큰 부재 조기 종료 계수를 적용합니다.'
  ]};
  let fallback=null,fallbackUsed=null,forcedMergeAttempted=false,mergeCount=0;
  const applyMerges=force=>{
    if(options.merge===false)return false;
    let minW=Infinity,minH=Infinity;
    for(const group of groups)if(group.used<group.instances.length)for(const orientation of orientations(group.piece,stock,settings)){
      minW=Math.min(minW,orientation.w);minH=Math.min(minH,orientation.h);
    }
    const merged=mergeNativeFree(bin,settings,{force,minW:Number.isFinite(minW)?minW:-1,minH:Number.isFinite(minH)?minH:-1});
    if(!merged.nativeMerge.changes.length)return false;
    if(!fallback){fallback=structuredClone(bin);fallbackUsed=groups.map(g=>g.used);}
    mergeCount+=merged.nativeMerge.changes.length;
    bin=merged;
    return true;
  };
  while(true){
    // All three source wrappers attempt bottom-edge then right-edge merges
    // before evaluating the current free list.
    applyMerges(false);
    let selected=null;
    const allOptions=[],requested=options.choices?.[bin.decisions.length];
    for(let i=0;i<bin.free.length;i++){
      const rect=bin.free[i],x=fitStrip(rect,groups,stock,settings,'x',profile),y=fitStrip(rect,groups,stock,settings,'y',profile);
      const available={x,y},axes=['x','y'].filter(axis=>available[axis]);
      if(!axes.length)continue;
      // Native wrapper: equal direction scores select 0057daf4 (Y strip).
      const preferred=!x?'y':!y?'x':x.score>y.score?'x':'y';
      const axis=typeof requested==='string'?requested:(direction==='auto'?preferred:direction);
      if(!available[axis])continue;
      const candidate={i,rect,fit:available[axis],axes,preferred,score:Math.max(x?.score??-1,y?.score??-1),scores:{x:x?.score??-1,y:y?.score??-1}};
      if(!selected||candidate.score>selected.score)selected=candidate;
    }
    if(options.collectOptions||requested&&typeof requested==='object'){
      const i=requested?.rect?bin.free.findIndex(rect=>['x','y','w','h'].every(key=>Math.abs(rect[key]-requested.rect[key])<=EPS)):selected?.i;
      if(i!==undefined&&i>=0){
        const rect=bin.free[i];
        for(const axis of ['x','y'])for(const group of groups)for(const orientation of orientations(group.piece,stock,settings)){
          const fit=stripOption(rect,group,orientation,settings,axis,profile);
          if(fit)allOptions.push({i,rect,fit});
        }
      }
    }
    if(requested&&typeof requested==='object'){
      const match=allOptions.find(candidate=>candidate.fit.axis===requested.axis&&
        (requested.partId===undefined||candidate.fit.group.piece.id===requested.partId)&&
        (requested.rotated===undefined||candidate.fit.rotated===requested.rotated)&&
        (!requested.rect||['x','y','w','h'].every(key=>Math.abs(candidate.rect[key]-requested.rect[key])<=EPS)));
      if(!match){bin.rejectedChoice={step:bin.decisions.length,choice:structuredClone(requested)};break;}
      const axes=['x','y'].filter(axis=>allOptions.some(candidate=>candidate.i===match.i&&candidate.fit.axis===axis));
      selected={...match,axes,preferred:selected?.preferred??match.fit.axis,scores:selected?.scores??{},score:match.fit.score};
    }
    if(!selected){
      if(!forcedMergeAttempted){forcedMergeAttempted=true;if(applyMerges(true))continue;}
      break;
    }
    const {i,rect,fit,axes,preferred,scores}=selected;
    bin.free.splice(i,1);
    const remainders=placeStrip(bin,rect,fit,settings);
    // Native layout+0x7c selects append or insertion at the removed index.
    // Two inserts at that same index reverse the two new remainder entries.
    if(freeOrder==='insert')bin.free.splice(i,0,...[...remainders].reverse());
    else bin.free.push(...remainders);
    forcedMergeAttempted=false;
    bin.decisions.push({axis:fit.axis,axes,optionCount:axes.length,preferredAxis:preferred,
      rect:{...rect},partId:fit.group.piece.id,count:fit.count,rotated:fit.rotated,score:fit.score,scores,
      ...(options.collectOptions?{options:allOptions.map(candidate=>({axis:candidate.fit.axis,partId:candidate.fit.group.piece.id,
        rotated:candidate.fit.rotated,rect:{...candidate.rect},count:candidate.fit.count,score:candidate.fit.score}))}:{})});
  }
  if(bin.requiresCutRebuild){
    const rebuilt=bin.parts.length>(fallback?.parts.length??0)?rebuildPhysical(bin,settings,options.rebuildCache):null;
    if(rebuilt)bin={...rebuilt,requiresCutRebuild:false,nativeRebuild:{success:true,mergeCount}};
    else if(fallback){
      const attemptedParts=bin.parts.length;
      bin=fallback;
      groups.forEach((group,i)=>{group.used=fallbackUsed[i];});
      bin.nativeMergeRejected={reason:'물리 절단 재구성에 성공한 추가 배치를 얻지 못했습니다.',attemptedParts,retainedParts:bin.parts.length,mergeCount};
    }
  }
  return bin;
}

function nativeCompletionBetter(a,b){
  const used=bin=>bin.parts.reduce((sum,p)=>sum+p.w*p.h,0);
  const largest=bin=>Math.max(0,...bin.free.map(r=>r.w*r.h));
  // 0057a9c0/0057b494 compare complete trials by utilization first, then
  // largest residual rectangle. With equal fixed stock, used area is the
  // utilization numerator. An exact tie keeps the first (Y) completion.
  return used(a)>used(b)||used(a)===used(b)&&largest(a)>=largest(b);
}

export function searchNativeSheet(pieces,stock,settings,options={}){
  const level=options.level??1,prefix=[...(options.choices??[])];
  let result=packNativeSheet(pieces,stock,settings,{...options,choices:prefix}),trials=1,capped=false;
  const maxTrials=options.maxTrials??Infinity;
  if(level>1&&(options.direction??'auto')==='auto'){
    // The higher-level native wrappers replay a chosen direction prefix,
    // finish a Y trial and an X trial for the next undecided step, retain one
    // bit, restore quantities/layout and repeat. This port delegates each
    // complete replay to the immutable one-sheet kernel.
    while(prefix.length<result.decisions.length){
      const decision=result.decisions[prefix.length];
      if(decision.axes.length<2){prefix.push(decision.axis);continue;}
      if(trials+2>maxTrials){capped=true;break;}
      const y=packNativeSheet(pieces,stock,settings,{...options,choices:[...prefix,'y']});
      const x=packNativeSheet(pieces,stock,settings,{...options,choices:[...prefix,'x']});
      trials+=2;
      const chooseY=nativeCompletionBetter(y,x);
      prefix.push(chooseY?'y':'x');
      result=chooseY?y:x;
    }
  }
  result.nativeSearch={rule:level>1?'native-prefix-completion':'native-greedy',level,trials,prefix:prefix.slice(0,result.decisions.length),capped};
  if(level>1)result.limitations.push('이식한 상위 탐색은 두 완성 배치의 이용률·최대 잔재 비교 규칙입니다. 원본의 전체 회전 재시도 상태와 동일함을 뜻하지 않습니다.');
  return result;
}
