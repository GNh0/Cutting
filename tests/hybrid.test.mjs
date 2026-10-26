import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize,optimizeHybrid} from '../src/optimizer.js';
import {scenario,compare} from '../tools/benchmark-scenarios.mjs';
import {materialKey,materialGroups} from '../src/materials.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
test('hybrid optimizes each group against its profiles and preserves monotonic progress',()=>{for(let i=0;i<40;i++){
  const p=scenario(i,'holdout'),progress=[],whole=optimizeHybrid(p,v=>progress.push(v),12);auditResult(whole,p);
  for(const g of materialGroups(p.parts)){const scoped={...p,parts:g.rows.map(x=>x.row),stocks:p.stocks.filter(s=>materialKey(s)===g.key)};const r=optimize(scoped,()=>{},{family:'hybrid',budget:12,refineCuts:false});const profiles=[optimize(scoped,()=>{},{family:'current',refineCuts:false,budget:12,rankMode:'largest'}),optimize(scoped,()=>{},{family:'current',refineCuts:false,budget:12}),optimize(scoped,()=>{},{family:'portfolio',refineCuts:false,budget:24}),optimize(scoped,()=>{},{family:'guided',refineCuts:false,budget:12})];for(const a of profiles)assert.ok(compare(r,a)<=0);assert.equal(r.iterations,60);}
  assert.equal(progress.at(-1),100);for(let j=1;j<progress.length;j++)assert.ok(progress[j]>=progress[j-1]);
}});
