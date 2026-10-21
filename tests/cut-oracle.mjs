// Unbounded, test-only enumeration for the six-part counterexample.
// No route heuristic, beam width or production scheduler is used.
export function minimumCutOracle(bin,kerf){
  const memo=new Map(),near=(a,b)=>Math.abs(a-b)<1e-7;
  function enumerate(rect,parts){
    if(!parts.length||parts.length===1&&['x','y','w','h'].every(k=>near(rect[k],parts[0][k])))return [{count:0,length:0,tree:null}];
    const key=JSON.stringify(rect);if(memo.has(key))return memo.get(key);
    let plans=[],count=Infinity;
    for(const axis of ['x','y']){
      const size=axis==='x'?'w':'h',other=axis==='x'?'h':'w';
      for(const at of new Set(parts.flatMap(p=>[p[axis]+p[size],p[axis]-kerf]))){
        if(at<=rect[axis]+1e-7||at+kerf>rect[axis]+rect[size]+1e-7)continue;
        const left=parts.filter(p=>p[axis]+p[size]<=at+1e-7),right=parts.filter(p=>p[axis]>=at+kerf-1e-7);
        if(left.length+right.length!==parts.length)continue;
        const a=enumerate({...rect,[size]:at-rect[axis]},left),b=enumerate({...rect,[axis]:at+kerf,[size]:Math.max(0,rect[axis]+rect[size]-at-kerf)},right);
        for(const one of a)for(const two of b){
          const n=1+one.count+two.count,l=rect[other]+one.length+two.length;
          if(n>count)continue;
          if(n<count){plans=[];count=n;}
          plans.push({count:n,length:l,tree:{cut:{axis,x:axis==='x'?at:rect.x,y:axis==='y'?at:rect.y,length:rect[other],kerf},first:one.tree,second:two.tree}});
        }
      }
    }memo.set(key,plans);return plans;
  }
  const minimumCountTrees=enumerate({x:0,y:0,w:bin.stock.w,h:bin.stock.h},bin.parts),trees=minimumCountTrees;
  let best={distance:Infinity,totalDistance:Infinity,turns:Infinity},orders=0;
  function walk(ready,at,axis,distance,turns,cutLength){
    if(!ready.length){orders++;const totalDistance=distance+cutLength;if(totalDistance<best.totalDistance-1e-7||near(totalDistance,best.totalDistance)&&turns<best.turns)best={distance,totalDistance,cutLength,turns};return;}
    for(const item of ready){const c=item.cut,next=ready.filter(n=>n!==item);if(item.first)next.push(item.first);if(item.second)next.push(item.second);
      walk(next,c.axis==='x'?{x:c.x,y:c.y+c.length}:{x:c.x+c.length,y:c.y},c.axis,distance+Math.hypot(c.x-at.x,c.y-at.y),turns+Number(Boolean(axis&&axis!==c.axis)),cutLength+c.length);
    }
  }
  for(const {tree}of trees)walk([tree],{x:0,y:0},null,0,0,0);
  return {count:trees[0].count,minimumCountTrees:minimumCountTrees.length,trees:trees.length,orders,...best};
}
