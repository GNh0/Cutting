import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize} from '../src/optimizer.js';
import {materialKey,materialGroups} from '../src/materials.js';
import {scenario} from '../tools/benchmark-scenarios.mjs';
import {auditResult} from '../tools/benchmark-audit.mjs';
test('cut-count and largest-remnant modes keep constraints and compare with the corresponding baseline',()=>{for(const priority of ['cuts','remnant'])for(let i=0;i<30;i++){
  const p=scenario(2000000+i,'acceptance');p.settings.priority=priority;p.settings.quality='balanced';
  for(const g of materialGroups(p.parts)){const scoped={...p,parts:g.rows.map(x=>x.row),stocks:p.stocks.filter(s=>materialKey(s)===g.key)};
  const r=optimize(scoped,()=>{},{refineCuts:false}),b=optimize(scoped,()=>{},{family:'current',refineCuts:false,budget:24,rankMode:'largest'});auditResult(r,scoped);
  const rank=r=>[r.unplaced.length,r.unplaced.reduce((n,p)=>n+p.w*p.h,0),...(priority==='cuts'?[r.cutCount,r.stockArea,-(r.reusableArea+.1*r.largestRemnant)]:[r.stockArea,-r.largestRemnant,-r.reusableArea]),r.cutLength];
  const x=rank(r),y=rank(b);let comparison=0;for(let j=0;j<x.length;j++)if(Math.abs(x[j]-y[j])>1e-6){comparison=x[j]<y[j]?-1:1;break;}assert.ok(comparison<=0);
}}});
