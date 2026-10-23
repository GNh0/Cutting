import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize,optimizeCutPlans} from '../src/optimizer.js';
import {materialKey} from '../src/materials.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {referenceCases} from './reference-cases.mjs';

const row=(id,w,h,qty=1,extra={})=>({id,label:id,w,h,qty,thickness:18,material:'A',manufacturer:'',lot:'',enabled:true,grain:'none',rotate:true,edges:{},...extra});
const project=(parts,stocks,extra={})=>({version:1,parts,stocks,settings:{kerf:3,trim:0,rotate:true,material:true,grain:false,single:false,quality:'quick',priority:'area',minRemnant:20,...extra}});
function solve(p,progress=()=>{}){
  const r=optimize(p,progress,{family:'smart2d'});
  auditResult(r,p);
  const single=new Map();
  for(const b of r.bins){
    const key=materialKey(b.stock);single.set(key,(single.get(key)||0)+1);
    assert.notEqual(b.stock.enabled,false);
    for(const part of b.parts){
      if(!p.settings.rotate||part.rotate===false)assert.equal(part.rotated,false);
      assert.ok(part.x>=p.settings.trim-1e-7&&part.y>=p.settings.trim-1e-7);
      assert.ok(part.x+part.w<=b.stock.w-p.settings.trim+1e-7&&part.y+part.h<=b.stock.h-p.settings.trim+1e-7);
    }
  }
  if(p.settings.single)for(const count of single.values())assert.ok(count<=1);
  assert.equal(r.placed+r.unplaced.length,r.total);
  return r;
}
const rank=(r,priority)=>{
  const residual=priority==='remnant'?[-r.largestRemnant,-r.reusableArea]:[-(r.reusableArea+.1*r.largestRemnant)];
  return [r.unplaced.length,r.unplaced.reduce((n,p)=>n+p.w*p.h,0),...(priority==='cuts'?[r.cutCount,r.stockArea,...residual]:[r.stockArea,...residual,r.cutCount]),r.cutLength];
};
const noWorse=(a,b,priority)=>{
  const aa=rank(a,priority),bb=rank(b,priority);
  for(let i=0;i<aa.length;i++)if(Math.abs(aa[i]-bb[i])>1e-7)return aa[i]<bb[i];
  return true;
};

test('Smart2D portfolio replays physical cuts for every reference case',()=>{
  for(const reference of referenceCases){
    const p={...reference,settings:{...reference.settings,quality:'quick'}};
    const r=solve(p);
    assert.equal(r.algorithm,'smart2d');
    for(const search of r.searchProfiles){assert.equal(search.candidates,9);assert.deepEqual(search.directions,['x','y','auto']);assert.deepEqual(search.levels,[1,2,3]);}
  }
});

test('Smart2D is deterministic and exposes the selected profile and complete progress',()=>{
  const p={...referenceCases[5],settings:{...referenceCases[5].settings,quality:'balanced'}},before=structuredClone(p),progress=[];
  const a=solve(p,v=>progress.push(v));
  assert.deepEqual(a,solve(p));
  assert.deepEqual(p,before);
  assert.equal(progress.at(-1),100);
  assert.ok(progress.every((v,i)=>v>=0&&v<=100&&(i===0||v>=progress[i-1])));
  assert.equal(a.iterations,36);
  const search=a.searchProfiles[0];
  assert.equal(search.variantsPerProfile,4);
  assert.equal(search.cutRefinement,'quality-checkpoints');
  assert.deepEqual(search.refinementCheckpoints,[9,36]);
  assert.ok(search.directions.includes(search.selectedProfile.direction));
  assert.ok(search.levels.includes(search.selectedProfile.level));
  assert.ok(search.selectedProfile.variant>=0&&search.selectedProfile.variant<4);
});

test('higher quality retains all lower candidate profiles and never worsens returned objective',()=>{
  for(const priority of ['area','cuts','remnant'])for(const reference of [referenceCases[5],referenceCases[6],referenceCases[8],referenceCases[9]]){
    let previous=null;
    for(const [quality,candidates]of [['quick',9],['balanced',36],['thorough',144]]){
      const p={...reference,settings:{...reference.settings,quality,priority}},r=solve(p);
      assert.equal(r.iterations,candidates);
      assert.equal(r.searchProfiles[0].candidates,candidates);
      assert.deepEqual(r.searchProfiles[0].refinementCheckpoints,[9,36,144].filter(n=>n<=candidates));
      if(previous)assert.ok(noWorse(r,previous,priority),`${reference.id}: ${quality}/${priority} worsened`);
      previous=r;
    }
  }
});

test('checkpoint refinement leaves the raw layout unchanged and can be disabled',()=>{
  const p={...referenceCases[5],settings:{...referenceCases[5].settings,quality:'balanced'}};
  const raw=optimize(p,undefined,{family:'smart2d',partition:false,refineCuts:false}),before=structuredClone(raw);
  assert.equal(raw.smart2dSearch.cutRefinement,'none');
  assert.deepEqual(raw.smart2dSearch.refinementCheckpoints,[]);
  const refined=optimizeCutPlans(raw,p.settings);
  assert.deepEqual(raw,before);
  auditResult(refined,p);
});

test('Smart2D preserves rotation, kerf-edge fits, trim, grain, disabled rows and shortages',()=>{
  let p=project([row('part',90,60)],[row('stock',60,90)]),r=solve(p);
  assert.equal(r.placed,1);assert.equal(r.bins[0].parts[0].rotated,true);
  p.settings.rotate=false;assert.equal(solve(p).placed,0);
  p.settings.rotate=true;p.parts[0].rotate=false;assert.equal(solve(p).placed,0);
  p=project([row('part',50,100,2)],[row('stock',103,100)]);assert.equal(solve(p).placed,2);
  p.stocks[0].w=102;assert.equal(solve(p).placed,1);
  p=project([row('exact',90,70)],[row('stock',100,80)],{trim:5});r=solve(p);assert.equal(r.placed,1);assert.equal(r.cutCount,0);
  p.parts[0].w=91;assert.equal(solve(p).placed,0);
  p=project([row('grain',60,90,1,{grain:'x'})],[row('stock',90,60,1,{grain:'x'})],{grain:true});assert.equal(solve(p).placed,0);
  p.stocks[0].grain='none';assert.equal(solve(p).placed,1);
  p=project([row('on',25,25,2),row('off',1000,1000,10,{enabled:false})],[row('stock',25,25),row('off-stock',100,100,4,{enabled:false})]);r=solve(p);assert.equal(r.total,2);assert.equal(r.placed,1);
});

test('overlapping material requirements share inventory and single-sheet limits remain enforced',()=>{
  const p=project([row('general',100,100,1),row('specific',100,100,1,{manufacturer:'M',lot:'L'}),row('missing',100,100,1,{material:'B'})],[row('specific-stock',100,100,1,{manufacturer:'M',lot:'L'}),row('other-stock',100,100,1,{manufacturer:'N',lot:'N'})]);
  const r=solve(p);assert.equal(r.placed,2);assert.equal(r.unplaced[0].id,'missing');
  assert.equal(r.searchProfiles.length,1);assert.equal(r.iterations,9);
  const limited=project([row('part',100,100,3)],[row('s1',100,100,2),row('s2',100,100,2)],{single:true});
  assert.equal(solve(limited).placed,1);
});

test('40 seeded mixed jobs preserve physical, material, inventory and grain contracts',()=>{
  let seed=93071;
  const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<40;i++){
    const parts=Array.from({length:7},(_,j)=>row(`p${j}`,10+Math.floor(rnd()*140),10+Math.floor(rnd()*100),1+Math.floor(rnd()*3),{material:rnd()<.3?'B':'A',manufacturer:rnd()<.25?'M':'',lot:rnd()<.15?'L':'',grain:['none','x','y'][Math.floor(rnd()*3)],rotate:rnd()>.2}));
    const stocks=[row('a1',300,220,2,{manufacturer:'M',lot:'L',grain:'x'}),row('a2',250,200,2,{manufacturer:'N',lot:'N',grain:'y'}),row('b',300,220,2,{material:'B',manufacturer:'M',lot:'L',grain:'none'})];
    solve(project(parts,stocks,{kerf:i%4,trim:i%5,rotate:i%3!==0,grain:i%2===0,single:i%7===0,priority:['area','cuts','remnant'][i%3]}));
  }
});

test('separate Smart2D search changes an established physical layout instead of relabeling legacy',()=>{
  const p={...referenceCases[9],settings:{...referenceCases[9].settings,quality:'quick'}};
  const legacy=optimize(p),smart=solve(p);
  auditResult(legacy,p);
  assert.equal(smart.placed,legacy.placed);
  assert.equal(smart.stockArea,legacy.stockArea);
  assert.equal(legacy.cutCount,9);assert.equal(smart.cutCount,8);
  assert.notDeepEqual(smart.bins.map(b=>b.parts),legacy.bins.map(b=>b.parts));
});
