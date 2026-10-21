import {LIMIT} from './optimizer.js?v=0335af4f5072';
import {materialKey,materialInfo} from './materials.js?v=0335af4f5072';

const key=r=>JSON.stringify([r.w,r.h,materialKey(r),r.grain]);

// Keep physical orientation and source locations; display rounding never defines stock identity.
export function groupRemnants(remnants){
  const groups=new Map();
  for(const r of remnants){
    const id=JSON.stringify([key(r),r.reusable]);
    if(!groups.has(id))groups.set(id,{w:r.w,h:r.h,...materialInfo(r),grain:r.grain,reusable:r.reusable,qty:0,area:0,sources:[]});
    const g=groups.get(id);g.qty++;g.area+=r.w*r.h;g.sources.push({sheet:r.sheet,index:r.index});
  }
  return [...groups.values()];
}

export function carryRemnantStock(stocks,bins,remnants,createRow){
  const next=stocks.filter(r=>r.enabled!==false).map(r=>({...structuredClone(r),qty:r.qty-bins.filter(b=>b.stock.id===r.id).length})).filter(r=>r.qty>0);
  for(const [i,g] of groupRemnants(remnants.filter(r=>r.reusable)).entries()){
    let left=g.qty;
    for(const stock of next){
      if(key(stock)!==key(g))continue;
      const add=Math.min(left,LIMIT-stock.qty);stock.qty+=add;left-=add;if(!left)break;
    }
    while(left){const qty=Math.min(left,LIMIT);next.push(createRow(`잔재 ${i+1}`,g.w,g.h,qty,{...materialInfo(g),grain:g.grain}));left-=qty;}
  }
  if(next.length>LIMIT)throw new Error(`다음 작업의 원판은 ${LIMIT}행을 넘을 수 없습니다. 잔재를 나누어 가져오세요.`);
  return next;
}
