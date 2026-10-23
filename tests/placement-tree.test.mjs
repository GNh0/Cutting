import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPlacementTree} from '../src/placement-tree.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {compareMaterialQuality,materialMetrics} from '../src/calculation-comparison.js';

const row=(id,w,h,qty=1,extra={})=>({id,label:id,w,h,qty,thickness:18,material:'A',manufacturer:'',lot:'',enabled:true,grain:'none',rotate:true,edges:{},...extra});
const project=(parts,stocks,extra={})=>({version:1,unit:'mm',parts,stocks,settings:{kerf:0,trim:0,rotate:false,grain:false,single:false,material:true,priority:'area',quality:'quick',minRemnant:1,...extra}});
function solve(p,options={budget:12},progress=()=>{}){
  const before=structuredClone(p),result=searchPlacementTree(p,progress,options);
  assert.deepEqual(p,before);
  auditResult(result,p);
  for(const bin of result.bins)assert.notEqual(bin.stock.enabled,false);
  assert.equal(result.placed+result.unplaced.length,result.total);
  return result;
}

test('the independent placement tree returns a physical plan and explicit search provenance',()=>{
  const p=project([row('side',61,40,2),row('shelf',30,20,3)],[row('sheet',150,100,2)],{kerf:3,trim:2});
  const r=solve(p);
  assert.equal(r.algorithm,'decision-tree');
  assert.equal(r.placementTree.independent,true);
  assert.equal(r.iterations,r.placementTree.examined);
  assert.ok(r.placementTree.examined>0&&r.placementTree.examined<=12);
  for(const key of ['blendSelection','blendSelections','selectedFamily','baselines'])assert.equal(key in r,false);
  assert.ok(r.bins.length>0);
});

test('bounded search is deterministic, reports monotonic progress and preserves its selected placement prefix',()=>{
  const p=project([row('a',60,40,2),row('b',35,55,2),row('c',25,20,3)],[row('sheet',150,100,2)],{kerf:2});
  const progress=[],a=solve(p,{budget:12},n=>progress.push(n)),b=solve(p,{budget:12});
  assert.deepEqual(a,b);
  assert.equal(progress.at(-1),100);
  assert.ok(progress.every((n,i)=>Number.isFinite(n)&&n>=0&&n<=100&&(i===0||n>=progress[i-1])));
  assert.ok(a.placementTree.examined<=12);
  for(const token of a.placementTree.selectedPath){
    assert.ok(a.bins.some(bin=>bin.parts.some(part=>part.id===token.partId&&part.x===token.rect.x&&part.y===token.rect.y&&part.rotated===token.rotated)),
      'Selected placement decisions must correspond to rectangles in the returned plan');
  }
});

test('increasing the complete-path budget retains feasible prior results',()=>{
  const p=project([row('a',60,40,2),row('b',35,55,2),row('c',25,20,3)],[row('sheet',150,100,2)],{kerf:2});
  let previous=null;
  for(const budget of [1,12,48]){
    const r=solve(p,{budget,refineCuts:false});
    assert.ok(r.placementTree.examined<=budget);
    if(previous)assert.ok(compareMaterialQuality(r,previous)<=0);
    previous=r;
  }
});

test('branching on an actual first placement escapes a greedy dead end and improves fulfillment and material loss',()=>{
  // A 15-by-5 part cannot fit the thin fragments left by the initial largest
  // piece path. Starting with another physical placement preserves space for it.
  const p=project([row('p0',9,8),row('p1',15,5),row('p2',11,13),row('p3',11,15),row('p4',10,14)],
    [row('sheet',24,20,2)],{minRemnant:3});
  const greedy=solve(p,{budget:1,refineCuts:false}),branched=solve(p,{budget:24,refineCuts:false});
  assert.equal(greedy.placed,4);assert.equal(branched.placed,5);
  assert.equal(greedy.unplaced[0].id,'p1');assert.equal(branched.unplaced.length,0);
  assert.equal(greedy.stockArea,branched.stockArea);
  assert.ok(compareMaterialQuality(branched,greedy)<0);
  const before=materialMetrics(greedy),after=materialMetrics(branched);
  assert.ok(after.utilizationPercent>before.utilizationPercent);
  assert.ok(after.nonReusableLoss<before.nonReusableLoss);
  assert.notEqual(greedy.placementTree.selectedPath[0].partId,branched.placementTree.selectedPath[0].partId);
  const geometry=r=>r.bins.map(bin=>bin.parts.map(part=>[part.id,part.x,part.y,part.w,part.h]));
  assert.notDeepEqual(geometry(branched),geometry(greedy));
  assert.ok(branched.placementTree.examined<=24);
});

test('shared LOT inventory, disabled rows and unavailable materials remain hard constraints',()=>{
  const p=project([row('general',100,100),row('specific',100,100,1,{manufacturer:'M',lot:'L'}),row('missing',100,100,1,{material:'B'}),row('disabled',100,100,9,{enabled:false})],
    [row('reserved',100,100,1,{manufacturer:'M',lot:'L'}),row('other',100,100,1,{manufacturer:'N',lot:'N'}),row('off-stock',100,100,9,{enabled:false})]);
  const r=solve(p,{budget:24});
  assert.equal(r.total,3);assert.equal(r.placed,2);assert.equal(r.unplaced.length,1);assert.equal(r.unplaced[0].id,'missing');
  assert.equal(r.bins.find(b=>b.parts.some(part=>part.id==='specific')).stock.id,'reserved');
  const limited=project([row('part',100,100,3)],[row('stock',100,100,3)],{single:true});
  assert.equal(solve(limited).placed,1);
});

test('rotation, grain, trim and exact zero-kerf boundaries apply to real placements',()=>{
  let p=project([row('part',90,60)],[row('sheet',60,90)]);
  assert.equal(solve(p).placed,0);
  p.settings.rotate=true;assert.equal(solve(p).placed,1);
  p.parts[0].rotate=false;assert.equal(solve(p).placed,0);
  p.parts[0].rotate=true;p.parts[0].grain='x';p.stocks[0].grain='x';p.settings.grain=true;
  assert.equal(solve(p).placed,0);
  p.stocks[0].grain='y';assert.equal(solve(p).placed,1);
  p=project([row('exact',90,70)],[row('sheet',100,80)],{trim:5});
  const exact=solve(p);assert.equal(exact.placed,1);assert.equal(exact.cutCount,0);
  p=project([row('square',50,50,4)],[row('sheet',100,100)]);
  const grid=solve(p);assert.equal(grid.placed,4);assert.equal(grid.bins.length,1);
});

test('uniform-grid estimates do not reject a feasible mixed-rotation packing',()=>{
  // A uniform 6x4 grid fits only two in 10x10. Two normal pieces beside one
  // rotated piece fit three, so a grid estimate must not be a hard bound.
  const p=project([row('part',6,4,3)],[row('sheet',10,10)],{rotate:true});
  const result=solve(p,{budget:24});
  assert.equal(result.placed,3);
  assert.equal(result.bins.length,1);
  assert.equal(new Set(result.bins[0].parts.map(part=>part.rotated)).size,2);
});
