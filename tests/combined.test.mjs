import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeVersion} from '../src/calculation-versions.js';
import {materialMetrics} from '../src/calculation-comparison.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {randomScenario} from '../tools/random-scenarios.mjs';
import {referenceCases} from './reference-cases.mjs';
const solve=(p,id='combined-v3',progress)=>optimizeVersion({...p,settings:{...p.settings,calculationVersion:id}},progress);

test('the saved third-version ID routes to independent placement search and preserves all inputs',()=>{
  const p=randomScenario(26000000);p.settings.quality='quick';
  const before=structuredClone(p),progress=[],r=solve(p,'combined-v3',v=>progress.push(v));
  auditResult(r,p);assert.deepEqual(p,before);
  assert.equal(r.algorithm,'decision-tree');assert.equal(r.calculationVersion.id,'combined-v3');
  assert.equal(r.placementTree.independent,true);assert.equal(r.blendSelections,undefined);
  assert.ok(r.treeSearches.length>0);assert.ok(r.treeSearches.every(s=>s.independent));
  assert.equal(r.iterations,r.treeSearches.reduce((n,s)=>n+s.examined,0));
  assert.ok(progress.every((v,i)=>v>=0&&v<=100&&(i===0||v>=progress[i-1])));assert.equal(progress.at(-1),100);
  assert.deepEqual(solve(p),r);
});

test('independent third-version plans preserve shared inventory, single-sheet constraints, disabled rows and shortages',()=>{
  const row=(id,extra={})=>({id,label:id,w:100,h:100,qty:1,thickness:18,material:'A',manufacturer:'',lot:'',grain:'none',rotate:true,edges:{},enabled:true,...extra});
  const p={version:1,parts:[row('general'),row('specific',{manufacturer:'M',lot:'L'}),row('missing',{material:'B'}),row('off',{enabled:false,qty:10})],stocks:[row('s1',{manufacturer:'M',lot:'L'}),row('s2',{manufacturer:'N',lot:'N'}),row('off-stock',{enabled:false,qty:10})],settings:{kerf:0,trim:0,rotate:true,grain:true,material:true,single:false,priority:'area',quality:'quick',minRemnant:10}};
  const r=solve(p);auditResult(r,p);assert.equal(r.placed,2);assert.equal(r.unplaced[0].id,'missing');assert.equal(r.treeSearches.length,1);
  p.parts=[row('part',{qty:3})];p.stocks=[row('s1',{qty:3}),row('s2',{qty:3})];p.settings.single=true;
  const single=solve(p);auditResult(single,p);assert.equal(single.placed,1);
});

test('independent third-version geometry and material-loss metrics stay physical at every priority',()=>{
  for(const reference of referenceCases)for(const priority of ['area','cuts','remnant']){
    const p={...reference,settings:{...reference.settings,priority,quality:'quick'}},r=solve(p);auditResult(r,p);
    const m=materialMetrics(r);assert.ok(Math.abs(m.nonReusableLoss-m.trimLoss-m.kerfLoss-m.smallScrap)<1e-5);
    assert.equal(r.placed+r.unplaced.length,r.total);
  }
});
