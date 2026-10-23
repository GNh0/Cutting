import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeVersion} from '../src/calculation-versions.js';
import {compareMaterialQuality} from '../src/calculation-comparison.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {randomScenario} from '../tools/random-scenarios.mjs';
import {referenceCases} from './reference-cases.mjs';
const solve=(p,id='combined-v3',progress)=>optimizeVersion({...p,settings:{...p.settings,calculationVersion:id}},progress);

test('combined v3 actually merges physical plans from different engines across independent inventory',()=>{
  const p=randomScenario(26000003),before=structuredClone(p),progress=[],r=solve(p,'combined-v3',v=>progress.push(v));
  const legacy=solve(p,'cutting-v1'),smart=solve(p,'smart2d-v1');
  auditResult(r,p);
  assert.deepEqual(p,before);
  assert.equal(r.algorithm,'combined');assert.equal(r.calculationVersion.id,'combined-v3');
  assert.deepEqual(new Set(r.blendSelections.map(g=>g.source)),new Set(['cutting-v1','smart2d-v1']));
  for(const g of r.blendSelections){
    const source=g.source==='cutting-v1'?legacy:smart;
    assert.deepEqual(r.bins.filter(b=>b.stock.material===g.material),source.bins.filter(b=>b.stock.material===g.material));
  }
  assert.equal(r.iterations,legacy.iterations+smart.iterations+r.blendSelections.reduce((n,g)=>n+g.decisionTree.budget,0));
  assert.ok(progress.every((v,i)=>v>=0&&v<=100&&(i===0||v>=progress[i-1])));assert.equal(progress.at(-1),100);
  assert.deepEqual(solve(p),r);
});

test('combined area priority never worsens either complete baseline material rank',()=>{
  let treeUsed=false;
  for(let i=0;i<20;i++){
    const p=randomScenario(26000000+i);p.settings.quality='quick';const r=solve(p);
    auditResult(r,p);
    for(const v of ['cutting-v1','smart2d-v1'])assert.ok(compareMaterialQuality(r,solve(p,v))<=0,`${p.id}/${v}`);
    for(const b of r.bins)for(const part of b.parts)if(!p.settings.rotate||part.rotate===false)assert.equal(part.rotated,false);
    treeUsed ||= r.blendSelections.some(g=>g.source==='tree-guided');
  }
  assert.equal(treeUsed,true,'Additional decision-tree search must be able to contribute an actual plan');
});

test('combined plans preserve shared inventory, single-sheet constraints, disabled rows and shortages',()=>{
  const row=(id,extra={})=>({id,label:id,w:100,h:100,qty:1,thickness:18,material:'A',manufacturer:'',lot:'',grain:'none',rotate:true,edges:{},enabled:true,...extra});
  const p={version:1,parts:[row('general'),row('specific',{manufacturer:'M',lot:'L'}),row('missing',{material:'B'}),row('off',{enabled:false,qty:10})],stocks:[row('s1',{manufacturer:'M',lot:'L'}),row('s2',{manufacturer:'N',lot:'N'}),row('off-stock',{enabled:false,qty:10})],settings:{kerf:0,trim:0,rotate:true,grain:true,material:true,single:false,priority:'area',quality:'quick',minRemnant:10}};
  const r=solve(p);auditResult(r,p);assert.equal(r.placed,2);assert.equal(r.unplaced[0].id,'missing');assert.equal(r.blendSelections.length,1);
  p.parts=[row('part',{qty:3})];p.stocks=[row('s1',{qty:3}),row('s2',{qty:3})];p.settings.single=true;
  const single=solve(p);auditResult(single,p);assert.equal(single.placed,1);
});

test('combined keeps cut and large-remnant priorities and the reference geometry contracts',()=>{
  for(const reference of referenceCases)for(const priority of ['area','cuts','remnant']){
    const p={...reference,settings:{...reference.settings,priority,quality:'quick'}},r=solve(p);auditResult(r,p);
    for(const selection of r.blendSelections)assert.equal(selection.criterion,priority==='area'?'fulfillment-utilization-loss':priority);
  }
});
