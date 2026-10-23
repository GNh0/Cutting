import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeNativeFree} from '../src/smart2d-merge.js';

const plan=(heightA=100,heightB=100)=>({stock:{w:210,h:200},parts:[],
  free:[{x:0,y:200-heightA,w:100,h:heightA},{x:110,y:200-heightB,w:100,h:heightB}],
  cuts:[{axis:'x',x:100,y:100,length:100,kerf:10}],
  nativeCuts:[{x1:110,y1:0,x2:110,y2:200,nativeFlag:false}]});
const shape=r=>[r.x,r.y,r.w,r.h];

test('native bottom-edge merge joins unexecuted planning regions and requires fresh physical cuts',()=>{
  const input=plan(),before=structuredClone(input),result=mergeNativeFree(input,{kerf:10});
  assert.deepEqual(input,before);
  assert.deepEqual(result.free.map(shape),[[0,100,210,100]]);
  assert.equal(result.nativeMerge.changes.length,1);
  assert.equal(result.requiresCutRebuild,true);
  assert.equal(result.free[0].nativeMergedX,true);
  assert.deepEqual(result.cuts,input.cuts,'Old physical cuts remain until the caller successfully rebuilds them');
  const oldFree=input.free.reduce((n,r)=>n+r.w*r.h,0),newFree=result.free.reduce((n,r)=>n+r.w*r.h,0);
  assert.equal(newFree-oldFree,1000,'The reclaimed kerf makes this a planning operation, not joining detached offcuts');
});

test('right-edge merging applies the transposed native boundary predicate',()=>{
  const original=plan(),input={...original,stock:{w:200,h:210},free:original.free.map(r=>({x:r.y,y:r.x,w:r.h,h:r.w})),
    nativeCuts:original.nativeCuts.map(c=>({x1:c.y1,y1:c.x1,x2:c.y2,y2:c.x2,nativeFlag:c.nativeFlag}))};
  const result=mergeNativeFree(input,{kerf:10});
  assert.deepEqual(result.free.map(shape),[[100,0,100,210]]);
  assert.equal(result.free[0].nativeMergedY,true);
  assert.equal(result.nativeMerge.changes[0].axis,'y');
});

test('trim adapts the usable native bounds and restores absolute free, line and evidence coordinates',()=>{
  const local=plan(74,100),trim=5;
  const input={...local,stock:{w:220,h:210},free:local.free.map(r=>({...r,x:r.x+trim,y:r.y+trim})),
    nativeCuts:local.nativeCuts.map(c=>({...c,x1:c.x1+trim,y1:c.y1+trim,x2:c.x2+trim,y2:c.y2+trim}))};
  const before=structuredClone(input),result=mergeNativeFree(input,{kerf:10,trim},{force:true});
  assert.deepEqual(input,before);
  assert.deepEqual(result.free.map(shape).sort((a,b)=>a[1]-b[1]),[[115,105,100,16],[5,131,210,74]]);
  assert.deepEqual(shape(result.nativeMerge.changes[0].first),[5,131,100,74]);
  assert.deepEqual(shape(result.nativeMerge.changes[0].second),[115,105,100,100]);
  assert.deepEqual(shape(result.nativeMerge.changes[0].merged),[5,131,210,74]);
  assert.ok(result.nativeCuts.some(c=>c.x1===115&&c.y1===131&&c.x2===215&&c.y2===131));
  assert.deepEqual(result.cuts,input.cuts);
});

test('cut provenance and native boundary flags prevent unsupported merges',()=>{
  let input=plan();delete input.nativeCuts;
  let result=mergeNativeFree(input,{kerf:10});
  assert.deepEqual(result.free,input.free);assert.equal(result.nativeMerge.missingNativeCuts,true);
  input=plan();input.nativeCuts=[];
  assert.equal(mergeNativeFree(input,{kerf:10}).nativeMerge.changes.length,0);
  input=plan();input.nativeCuts[0].nativeFlag=true;
  assert.equal(mergeNativeFree(input,{kerf:10}).nativeMerge.changes.length,0);
  input=plan();input.free[0].nativeMergedY=true;
  assert.equal(mergeNativeFree(input,{kerf:10}).nativeMerge.changes.length,0);
});

test('the 75 percent ratio gate, force flag and remaining-part minimum are distinct constraints',()=>{
  const input=plan(74,100);
  assert.equal(mergeNativeFree(input,{kerf:10}).nativeMerge.changes.length,0);
  const forced=mergeNativeFree(input,{kerf:10},{force:true});
  assert.equal(forced.nativeMerge.changes.length,1);
  assert.deepEqual(forced.free.map(shape).sort((a,b)=>a[1]-b[1]),[[110,100,100,16],[0,126,210,74]]);
  assert.equal(mergeNativeFree(input,{kerf:10},{force:true,minH:80}).nativeMerge.changes.length,0);
  assert.equal(mergeNativeFree(plan(75,100),{kerf:10}).nativeMerge.changes.length,1);
});
