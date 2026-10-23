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
