import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeVersion} from '../src/calculation-versions.js';
import {materialMetrics,compareMaterialQuality,compareResultQuality} from '../src/calculation-comparison.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {randomScenario} from '../tools/random-scenarios.mjs';
import {referenceCases} from './reference-cases.mjs';
const solve=(p,id='combined-v3',progress)=>optimizeVersion({...p,settings:{...p.settings,calculationVersion:id}},progress);

test('the saved third-version ID combines exact v1/v2 pipelines and preserves inputs and progress',()=>{
  const p=randomScenario(26000000);p.settings.quality='quick';
  const before=structuredClone(p),progress=[],r=solve(p,'combined-v3',v=>progress.push(v));
  auditResult(r,p);assert.deepEqual(p,before);
  assert.equal(r.algorithm,'combined');assert.equal(r.calculationVersion.id,'combined-v3');
  assert.equal(r.placementTree,undefined);assert.equal(r.treeSearches,undefined);
  assert.deepEqual(r.combination.versions,['cutting-v1','smart2d-v1']);
  const a=solve(p,'cutting-v1'),b=solve(p,'smart2d-v1');
  assert.equal(r.iterations,a.iterations+b.iterations);
  assert.ok(r.blendSelections.length>0);
  for(const selection of r.blendSelections){
    assert.ok(r.combination.versions.includes(selection.selectedVersion));
    assert.deepEqual(selection.candidates.map(c=>c.version),r.combination.versions);
  }
  assert.ok(progress.every((v,i)=>v>=0&&v<=100&&(i===0||v>=progress[i-1])));assert.equal(progress.at(-1),100);
  assert.deepEqual(solve(p),r);
});

test('combined plans preserve shared inventory, single-sheet constraints, disabled rows and shortages',()=>{
  const row=(id,extra={})=>({id,label:id,w:100,h:100,qty:1,thickness:18,material:'A',manufacturer:'',lot:'',grain:'none',rotate:true,edges:{},enabled:true,...extra});
  const p={version:1,parts:[row('general'),row('specific',{manufacturer:'M',lot:'L'}),row('missing',{material:'B'}),row('off',{enabled:false,qty:10})],stocks:[row('s1',{manufacturer:'M',lot:'L'}),row('s2',{manufacturer:'N',lot:'N'}),row('off-stock',{enabled:false,qty:10})],settings:{kerf:0,trim:0,rotate:true,grain:true,material:true,single:false,priority:'area',quality:'quick',minRemnant:10}};
  const r=solve(p);auditResult(r,p);assert.equal(r.placed,2);assert.equal(r.unplaced[0].id,'missing');assert.equal(r.blendSelections.length,2);
  p.parts=[row('part',{qty:3})];p.stocks=[row('s1',{qty:3}),row('s2',{qty:3})];p.settings.single=true;
  const single=solve(p);auditResult(single,p);assert.equal(single.placed,1);
});

test('combined geometry and loss stay physical and the selected objective never worsens either complete baseline',()=>{
  for(const reference of referenceCases)for(const priority of ['area','cuts','remnant']){
    const p={...reference,settings:{...reference.settings,priority,quality:'quick'}},r=solve(p);auditResult(r,p);
    const m=materialMetrics(r);assert.ok(Math.abs(m.nonReusableLoss-m.trimLoss-m.kerfLoss-m.smallScrap)<1e-5);
    assert.equal(r.placed+r.unplaced.length,r.total);
    const compare=priority==='area'?compareMaterialQuality:(a,b)=>compareResultQuality(a,b,priority);
    for(const id of ['cutting-v1','smart2d-v1'])assert.ok(compare(r,solve(p,id))<=0,`${reference.id}: ${priority} regressed against ${id}`);
  }
});

test('independent inventory groups can select different engines and preserve their complete physical plans',()=>{
  const shelf=referenceCases.find(p=>p.id==='06_mixed_bookshelf');
  const panels=referenceCases.find(p=>p.id==='05_materials');
  const identify=(rows,prefix,material)=>rows.map(row=>({...row,id:prefix+row.id,material}));
  const p={...shelf,parts:[...identify(panels.parts.slice(0,1),'panels-','Panels'),...identify(shelf.parts,'shelf-','Shelf')],
    stocks:[...identify(panels.stocks.slice(0,1),'panels-','Panels'),...identify(shelf.stocks,'shelf-','Shelf')],
    settings:{...shelf.settings,quality:'quick',minRemnant:100}};
  const first=solve(p,'cutting-v1'),second=solve(p,'smart2d-v1'),combined=solve(p);
  auditResult(combined,p);
  assert.equal(combined.placed,13);
  assert.equal(combined.unplaced.length,0);
  assert.deepEqual(new Set(combined.blendSelections.map(s=>s.selectedVersion)),new Set(['cutting-v1','smart2d-v1']));
  assert.ok(compareMaterialQuality(combined,first)<0);
  assert.ok(compareMaterialQuality(combined,second)<0);
  for(const bin of combined.bins){
    const source=bin.stock.material==='Panels'?first:second;
    assert.deepEqual(bin,source.bins.find(b=>b.stock.id===bin.stock.id),
      'Selected parts, coordinates, cuts and free rectangles must remain the complete source plan');
  }
});
