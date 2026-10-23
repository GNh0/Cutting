const EPS=1e-7;

// Same lexicographic criteria as optimizer.js better(). Sheet count and run
// time are reporting metrics and do not override the selected priority.
export function resultQualityRank(result,priority='area'){
  const residual=priority==='remnant'?[-result.largestRemnant,-result.reusableArea]:[-(result.reusableArea+.1*result.largestRemnant)];
  return [result.unplaced.length,result.unplaced.reduce((n,p)=>n+p.w*p.h,0),...(priority==='cuts'?[result.cutCount,result.stockArea,...residual]:[result.stockArea,...residual,result.cutCount]),result.cutLength];
}

export function compareResultQuality(a,b,priority='area'){
  const aa=resultQualityRank(a,priority),bb=resultQualityRank(b,priority);
  for(let i=0;i<aa.length;i++)if(Math.abs(aa[i]-bb[i])>EPS)return aa[i]<bb[i]?-1:1;
  return 0;
}

// Material-only acceptance criteria. Runtime and number of cuts are excluded.
// Unplaced parts precede yield so omitting requested parts cannot improve rank.
export function materialMetrics(result){
  const stockArea=result.stockArea,usedArea=result.usedArea,reusableArea=result.reusableArea;
  const nonReusableLoss=Math.max(0,stockArea-usedArea-reusableArea);
  const percent=area=>stockArea?area/stockArea*100:0;
  const trim=result.settings?.trim??0;
  const trimLoss=result.bins.reduce((n,b)=>n+b.stock.w*b.stock.h-(b.stock.w-2*trim)*(b.stock.h-2*trim),0);
  const kerfLoss=result.cutLength*(result.settings?.kerf??0);
  const smallScrap=result.remnants.filter(r=>!r.reusable).reduce((n,r)=>n+r.w*r.h,0);
  return {placed:result.placed,unplaced:result.unplaced.length,unplacedArea:result.unplaced.reduce((n,p)=>n+p.w*p.h,0),sheets:result.bins.length,stockArea,usedArea,utilizationPercent:percent(usedArea),reusableArea,reusablePercent:percent(reusableArea),largestRemnant:result.largestRemnant,nonReusableLoss,lossPercent:percent(nonReusableLoss),recoverablePercent:percent(usedArea+reusableArea),trimLoss,kerfLoss,smallScrap,iterations:result.iterations};
}

export function materialQualityRank(result){
  const m=materialMetrics(result);
  return [m.unplaced,m.unplacedArea,m.stockArea,m.nonReusableLoss,-m.largestRemnant];
}

export function compareMaterialQuality(a,b){
  const aa=materialQualityRank(a),bb=materialQualityRank(b);
  for(let i=0;i<aa.length;i++)if(Math.abs(aa[i]-bb[i])>EPS)return aa[i]<bb[i]?-1:1;
  return 0;
}
