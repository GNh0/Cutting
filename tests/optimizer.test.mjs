import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize,validateProject} from '../src/optimizer.js';
import {referenceCases} from './reference-cases.mjs';
const part=(id,w,h,qty=1,extra={})=>({id,w,h,qty,label:id,thickness:18,manufacturer:'',lot:'',material:'A',enabled:true,grain:'none',rotate:true,edges:{},...extra});
const project=(parts,stocks,settings={})=>({version:1,parts,stocks,settings:{kerf:3,trim:0,rotate:true,material:true,grain:false,single:false,quality:'balanced',priority:'area',...settings}});
const near=(a,b)=>Math.abs(a-b)<1e-6;

// Replay every cut against the current physical fragments, independently of the packer's free-list.
function verify(result,p) {
  const used=new Map(),instances=new Set();
  for(const b of result.bins){
    used.set(b.stock.id,(used.get(b.stock.id)||0)+1);
    let fragments=[{x:p.settings.trim,y:p.settings.trim,w:b.stock.w-2*p.settings.trim,h:b.stock.h-2*p.settings.trim}];
    for(const c of b.cuts){
      const i=fragments.findIndex(f=>c.axis==='x'?near(f.y,c.y)&&near(f.h,c.length)&&c.x>f.x&&c.x+c.kerf<=f.x+f.w+1e-6:near(f.x,c.x)&&near(f.w,c.length)&&c.y>f.y&&c.y+c.kerf<=f.y+f.h+1e-6);
      assert.ok(i>=0,`Cut must span one existing fragment: ${JSON.stringify(c)}`);
      const f=fragments.splice(i,1)[0];
      if(c.axis==='x')fragments.push({x:f.x,y:f.y,w:c.x-f.x,h:f.h},{x:c.x+c.kerf,y:f.y,w:f.x+f.w-c.x-c.kerf,h:f.h});
      else fragments.push({x:f.x,y:f.y,w:f.w,h:c.y-f.y},{x:f.x,y:c.y+c.kerf,w:f.w,h:f.y+f.h-c.y-c.kerf});
      fragments=fragments.filter(f=>f.w>1e-7&&f.h>1e-7);
    }
    for(const a of b.parts){
      assert.ok(!instances.has(a.instance));instances.add(a.instance);
      assert.ok(a.x>=p.settings.trim-1e-7&&a.y>=p.settings.trim-1e-7);
      assert.ok(a.x+a.w<=b.stock.w-p.settings.trim+1e-7&&a.y+a.h<=b.stock.h-p.settings.trim+1e-7);
      assert.ok(fragments.some(f=>near(f.x,a.x)&&near(f.y,a.y)&&near(f.w,a.w)&&near(f.h,a.h)),`Part must be an independently cuttable final fragment: ${a.label}`);
      if(p.settings.material)assert.equal(a.material.trim(),b.stock.material.trim());
      if(p.settings.grain&&a.grain!=='none'&&b.stock.grain!=='none')assert.equal(a.rotated?(a.grain==='x'?'y':'x'):a.grain,b.stock.grain);
      for(const other of b.parts)if(other.instance!==a.instance)assert.ok(a.x+a.w<=other.x+1e-7||other.x+other.w<=a.x+1e-7||a.y+a.h<=other.y+1e-7||other.y+other.h<=a.y+1e-7,'No part overlaps');
    }
    const leafArea=fragments.reduce((n,f)=>n+f.w*f.h,0),sawArea=b.cuts.reduce((n,c)=>n+c.length*c.kerf,0);
    assert.ok(near(leafArea+sawArea,(b.stock.w-2*p.settings.trim)*(b.stock.h-2*p.settings.trim)),'Cut replay must conserve area');
  }
  for(const s of p.stocks)assert.ok((used.get(s.id)||0)<=s.qty,'Inventory cannot be exceeded');
  for(const a of result.unplaced){assert.ok(!instances.has(a.instance));instances.add(a.instance);}
  assert.equal(instances.size,p.parts.filter(r=>r.enabled!==false).reduce((n,r)=>n+r.qty,0));
  assert.equal(result.placed+result.unplaced.length,result.total);
  assert.ok(result.wasteArea>=-1e-7);
  return result;
}
function solve(p){return verify(optimize(p),p);}
test('exact fit needs no kerf at the sheet boundary and no cut',()=>{const r=solve(project([part('p',100,80)],[part('s',100,80)]));assert.equal(r.placed,1);assert.equal(r.cutCount,0);});
test('kerf gap is honoured, with exact consumed remainder allowed',()=>{let r=solve(project([part('p',50,100,2)],[part('s',103,100)]));assert.equal(r.placed,2);assert.equal(r.cutCount,1);r=solve(project([part('p',50,100,2)],[part('s',102,100)]));assert.equal(r.placed,1);assert.equal(r.unplaced.length,1);});
test('rotation can be disabled globally and on an individual part',()=>{const p=project([part('p',90,60)],[part('s',60,90)]);assert.equal(solve(p).placed,1);p.settings.rotate=false;assert.equal(solve(p).placed,0);p.settings.rotate=true;p.parts[0].rotate=false;assert.equal(solve(p).placed,0);});
test('square parts still rotate when grain alignment requires it',()=>{const p=project([part('p',100,100,1,{grain:'y'})],[part('s',100,100,1,{grain:'x'})],{grain:true});const r=solve(p);assert.equal(r.placed,1);assert.equal(r.bins[0].parts[0].rotated,true);});
test('grain restricts placement but unspecified grain is free',()=>{const p=project([part('p',90,60,1,{grain:'x'})],[part('s',60,90,1,{grain:'x'})],{grain:true});assert.equal(solve(p).placed,0);p.stocks[0].grain='none';assert.equal(solve(p).placed,1);});
test('material matching is mandatory even when a legacy setting is false',()=>{const p=project([part('p',50,50,1,{material:'B'})],[part('s',100,100)]);assert.equal(solve(p).placed,0);p.settings.material=false;assert.equal(solve(p).placed,0);});
test('stock quantity and one-sheet option are enforced',()=>{const p=project([part('p',100,100,3)],[part('s',100,100,2)]);assert.equal(solve(p).placed,2);p.settings.single=true;assert.equal(solve(p).placed,1);});
test('trim removes all four edges and exact usable fits need no cuts',()=>{const p=project([part('p',90,70)],[part('s',100,80)],{trim:5});const r=solve(p);assert.equal(r.placed,1);assert.equal(r.cutCount,0);assert.equal(r.wasteArea,1700);p.parts[0].w=91;assert.equal(solve(p).placed,0);});
test('disabled rows are skipped, disabled stocks are unavailable',()=>{const p=project([part('p',10,10),part('off',1000,1000,5,{enabled:false})],[part('s',30,30),part('offstock',100,100,1,{enabled:false})]);const r=solve(p);assert.equal(r.total,1);assert.equal(r.bins.length,1);});
test('zero kerf, decimal lengths, and very thin parts preserve geometry',()=>solve(project([part('a',20.25,30.75,5),part('b',1.125,20,6)],[part('s',100.5,80.5,2)],{kerf:0,trim:.125})));
test('mixed stock sizes choose a sufficient smaller sheet',()=>{const r=solve(project([part('p',90,60)],[part('large',300,200),part('small',100,80)]));assert.equal(r.bins[0].stock.id,'small');});
test('global stock-area comparison can prefer one large sheet over several small ones',()=>{const p=project([part('large',900,600,2),part('small',400,300,4)],[part('large_stock',1220,2440,2),part('small_stock',1000,600,2)],{quality:'thorough'});const r=solve(p);assert.equal(r.bins.length,1);assert.equal(r.bins[0].stock.id,'large_stock');});
test('mixed bookshelf preserves large reusable offcuts and reproduces the reference cut metrics',()=>{const p=referenceCases[5],r=solve(p);assert.equal(r.cutCount,14);assert.equal(r.cutLength,10494);assert.equal(r.largestRemnant,1034*653);assert.equal(r.reusableArea,1034*653+295*564);assert.deepEqual(r.remnants.map(x=>[x.w,x.h].sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0]),[[7,600],[47,800],[295,564],[653,1034]]);});
test('invalid dimensions, quantities and oversized jobs fail before allocation',()=>{for(const value of [0,-1,NaN,Infinity,1000001])assert.ok(validateProject(project([part('p',value,10)],[part('s',100,100)])).length);for(const qty of [0,-2,.5,1001])assert.throws(()=>optimize(project([part('p',10,10,qty)],[part('s',100,100)])));assert.throws(()=>optimize(project([part('a',1,1,600),part('b',1,1,600)],[part('s',100,100)])));});
test('output is reproducible and includes progress up to 100 percent',()=>{const p=project([part('a',33,40,5),part('b',25,22,3)],[part('s',150,100,2)]);const progress=[];const a=optimize(p,v=>progress.push(v));assert.deepEqual(a,optimize(p));assert.equal(progress.at(-1),100);});
test('100 seeded mixed jobs produce feasible physical cut sequences',()=>{let seed=4181;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};for(let i=0;i<100;i++){const parts=Array.from({length:8},(_,j)=>part('p'+j,10+Math.floor(rnd()*180),10+Math.floor(rnd()*120),1+Math.floor(rnd()*3),{material:rnd()>.65?'B':'A',grain:['none','x','y'][Math.floor(rnd()*3)]}));solve(project(parts,[part('sA',300,240,3,{grain:'x'}),part('sB',350,250,2,{material:'B',grain:'y'})],{kerf:i%4,trim:i%7,grain:i%2===0,quality:'quick',priority:i%3?'area':'cuts'}));}});
test('maximum allowed 1000-part job stays complete and within inventory',()=>{const p=project([part('p',10,10,1000)],[part('s',250,250,4)],{kerf:1,quality:'quick'});assert.equal(solve(p).placed,1000);});
