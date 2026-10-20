import {referenceCases} from '../tests/reference-cases.mjs';
import {csv} from '../src/io.js';
import {optimize} from '../src/optimizer.js';
import fs from 'node:fs/promises';
await fs.mkdir('research/reference-cases',{recursive:true});
const summary=[];
for(const p of referenceCases){
  await fs.writeFile(`research/reference-cases/${p.id}.json`,JSON.stringify(p,null,2));
  for(const key of ['parts','stocks']){
    const header='Length,Width,Qty,Label,Material,Orientation,Enabled';
    const lines=p[key].map(r=>[r.w,r.h,r.qty,r.label,r.material,r.grain==='x'?'Horizontal':r.grain==='y'?'Vertical':'None','true'].join(','));
    await fs.writeFile(`research/reference-cases/${p.id}-${key}.csv`,'\uFEFF'+[header,...lines].join('\r\n'));
  }
  const r=optimize(p);summary.push({case:p.id,sheets:r.bins.length,placed:r.placed,unplaced:r.unplaced.length,usedArea:r.usedArea,stockArea:r.stockArea,usage:r.stockArea?r.usedArea/r.stockArea*100:0,cuts:r.cutCount,cutLength:r.cutLength});
}
await fs.writeFile('research/reference-cases/ours.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
