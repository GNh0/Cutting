// Merge adjacent free rectangles using planning-cut boundary predicates.
// This edits an unexecuted layout plan only.
// A successful merge requires a fresh physical cut-tree reconstruction before use.
const EPS=1e-7;
const eq=(a,b)=>Math.abs(a-b)<EPS;
const right=r=>r.x+r.w,bottom=r=>r.y+r.h;
const transpose=r=>({...r,x:r.y,y:r.x,w:r.h,h:r.w});
const transposeLine=c=>({...c,x1:c.y1,y1:c.x1,x2:c.y2,y2:c.x2});

// The source compares endpoints, including the far edge of reserved kerf.
// Physical cut starts in bin.cuts are intentionally not substituted here.
function compatibleBottomBoundary(a,b,lines,W,H,k){
  let first=false,last=false,bridge=false,firstStart=0,lastStart=-1;
  for(const c of lines){
    if(c.nativeFlag)return false; // native cut byte +0x30
    const firstBoundary=eq(c.y2,H)&&((!eq(a.x,0)&&eq(c.x2,a.x))||(eq(a.x,0)&&eq(c.x2,b.x)));
    if(firstBoundary){first=true;if(firstStart===0||c.y1<firstStart)firstStart=c.y1;}
    const lastBoundary=eq(c.y2,H)&&(eq(c.x2,right(b)+k)||(eq(right(b),W)&&eq(c.x2,b.x)));
    if(lastBoundary){last=true;if(lastStart===-1||c.y1<lastStart)lastStart=c.y1;}
    if(eq(a.y,c.y1)&&eq(b.y,c.y1)&&eq(c.x2,W)&&c.x1<=a.x+EPS)bridge=true;
  }
  return first&&last&&(eq(firstStart,lastStart)||bridge);
}

function appendLine(lines,x1,y1,x2,y2){lines.push({x1,y1,x2,y2,nativeFlag:false});}

export function mergeNativeFree(bin,settings,{force=false,minW=0,minH=0}={}){
  const result={...bin,free:bin.free.map(r=>({...r})),cuts:bin.cuts.map(c=>({...c})),
    nativeCuts:Array.isArray(bin.nativeCuts)?bin.nativeCuts.map(c=>({...c})):undefined};
  const changes=[];
  result.nativeMerge={...(bin.nativeMerge||{}),changes,missingNativeCuts:!result.nativeCuts};
  // A physical cut list has different endpoints and includes internal part cuts.
  // Without the planning list the boundary predicate cannot be applied.
  if(!result.nativeCuts)return result;
  // Native C is based on the usable rectangle. Cutting stores absolute stock
  // coordinates, so adapt both rectangles and endpoint evidence together.
  const trim=settings.trim??0;
  result.free=result.free.map(r=>({...r,x:r.x-trim,y:r.y-trim}));
  result.nativeCuts=result.nativeCuts.map(c=>({...c,x1:c.x1-trim,y1:c.y1-trim,x2:c.x2-trim,y2:c.y2-trim}));
  const k=settings.kerf,W=bin.stock.w-2*trim,H=bin.stock.h-2*trim;
  function mergeAxis(axis,minimum){
    const transposed=axis==='y',view=r=>transposed?transpose(r):r;
    const spanW=transposed?H:W,spanH=transposed?W:H;
    const oppositeFlag=transposed?'nativeMergedX':'nativeMergedY';
    let i=0;
    while(i<result.free.length){
      const originalA=result.free[i],a=view(originalA);
      if(a.h+EPS<minimum||originalA[oppositeFlag]||!eq(bottom(a),spanH)){i++;continue;}
      let changed=false;
      for(let j=0;j<result.free.length;j++){
        if(i===j)continue;
        const originalB=result.free[j],b=view(originalB);
        if(b.h+EPS<minimum||originalB[oppositeFlag]||!eq(bottom(b),spanH)||!eq(right(a)+k,b.x))continue;
        const lines=transposed?result.nativeCuts.map(transposeLine):result.nativeCuts;
        if(!compatibleBottomBoundary(a,b,lines,spanW,spanH,k))continue;
        const ratio=Math.floor(Math.min(a.h,b.h)*100/Math.max(a.h,b.h));
        if(!force&&(ratio<75||ratio>100))continue;
        const merged={x:a.x,y:Math.max(a.y,b.y),w:a.w+b.w+k,h:Math.min(a.h,b.h)};
        if(merged.w<=k+EPS||merged.h<=k+EPS||right(merged)>spanW+EPS||bottom(merged)>spanH+EPS)continue;
        const mapped=transposed?transpose(merged):merged;
        const next={...mapped,nativeMergedX:!transposed,nativeMergedY:transposed};
        result.free.push(next);
        const oldA={...originalA},oldB={...originalB};
        if(eq(a.h,b.h)){
          result.free=result.free.filter(r=>r!==originalA&&r!==originalB);
        }else{
          const larger=a.h>b.h?originalA:originalB;
          const smaller=a.h>b.h?originalB:originalA;
          const remainder=Math.abs(a.h-b.h)-k;
          result.free=result.free.filter(r=>r!==smaller&&(r!==larger||remainder>EPS));
          if(remainder>EPS){
            if(transposed)larger.w=remainder;else larger.h=remainder;
            // Preserve the endpoint order. In the right-edge A-wide
            // branch the first line reaches B.bottom.
            if(!transposed){
              appendLine(result.nativeCuts,larger.x,bottom(larger)+k,right(larger),bottom(larger)+k);
              appendLine(result.nativeCuts,larger.x,larger.y,larger.x,bottom(larger)+k);
            }else{
              const endY=a.h>b.h?bottom(oldB):bottom(larger);
              appendLine(result.nativeCuts,right(larger)+k,larger.y,right(larger)+k,endY);
              const lineY=a.h>b.h?bottom(larger):larger.y;
              appendLine(result.nativeCuts,larger.x,lineY,right(larger)+k,lineY);
            }
          }
        }
        changes.push({axis,first:oldA,second:oldB,merged:{...next},ratio});
        changed=true;i=0;break;
      }
      if(!changed)i++;
    }
  }
  // Run bottom-edge merging before right-edge merging.
  mergeAxis('x',minH);mergeAxis('y',minW);
  if(changes.length)result.requiresCutRebuild=true;
  const absolute=r=>({...r,x:r.x+trim,y:r.y+trim});
  result.free=result.free.map(absolute);
  result.nativeCuts=result.nativeCuts.map(c=>({...c,x1:c.x1+trim,y1:c.y1+trim,x2:c.x2+trim,y2:c.y2+trim}));
  for(const change of changes){change.first=absolute(change.first);change.second=absolute(change.second);change.merged=absolute(change.merged);}
  return result;
}
