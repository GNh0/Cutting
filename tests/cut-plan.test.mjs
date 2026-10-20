import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedCutPlan,orderCutPlan} from '../src/cut-plan.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {optimize,optimizeCutPlans} from '../src/optimizer.js';
import {referenceCases} from './reference-cases.mjs';
// Reproduce the screenshot's five 320-wide columns and the side/back column.
function screenshotBin(){
  const stock={id:'s',label:'원판',w:2440,h:1220,qty:1,thickness:18,material:'합판',manufacturer:'',lot:'',grain:'none',enabled:true},parts=[],cuts=[],free=[];
  const add=(label,w,h,x,y)=>{const i=parts.length,p={...stock,id:'p'+i,label,qty:1,w,h,x,y,originalW:w,originalH:h,instance:'p'+i+':1'};parts.push(p);return p.instance;};
  for(let i=0;i<5;i++){const x=i*323,one=add('상·하판',320,600,x,0),two=add('상·하판',320,600,x,603);cuts.push({axis:'x',x:x+320,y:0,length:1220,kerf:3,partInstance:one},{axis:'y',x,y:600,length:320,kerf:3,partInstance:one},{axis:'y',x,y:1203,length:320,kerf:3,partInstance:two});free.push({x,y:1206,w:320,h:14});}
  for(const [w,h,y,label]of [[800,300,0,'측판'],[800,300,303,'측판'],[764,564,606,'뒷판']]){const id=add(label,w,h,1615,y);cuts.push({axis:'y',x:1615,y:y+h,length:825,kerf:3,partInstance:id},{axis:'x',x:1615+w,y,length:h,kerf:3,partInstance:id});free.push({x:1615+w+3,y,w:825-w-3,h});}
  free.push({x:1615,y:1173,w:825,h:47});return {stock,parts,cuts,free};
}
test('five aligned short cuts become one common cut without moving or cutting any part',()=>{
  const bin=screenshotBin(),settings={kerf:3,trim:0,minRemnant:100,priority:'area',grain:false},project={parts:bin.parts,stocks:[bin.stock],settings};
  const usedArea=bin.parts.reduce((n,p)=>n+p.w*p.h,0),original={bins:[bin],unplaced:[],usedArea};auditResult(original,project);
  const after=sharedCutPlan(bin,settings);assert.ok(after);auditResult({...original,bins:[after]},project);assert.deepEqual(after.parts,bin.parts);assert.ok(after.cuts.length<bin.cuts.length);
  const common=after.cuts.filter(c=>c.axis==='y'&&c.y===600&&c.length>=1612);assert.equal(common.length,1);assert.equal(after.cuts.filter(c=>c.axis==='y'&&c.y===600&&c.length===320).length,0);
});
test('reconstructed cuts remain physical for the exact 19-part user input',()=>{
  const p=structuredClone(referenceCases[5]);p.parts[2].qty=10;const r=optimize(p);for(const bin of r.bins){const before=structuredClone(bin),after=sharedCutPlan(bin,p.settings);assert.deepEqual(bin,before);if(after){assert.ok(after.cuts.length<=bin.cuts.length);auditResult({...r,bins:r.bins.map(b=>b===bin?after:b)},p);}}
});
test('bounded search safely retains the original plan when no full alternative is found',()=>{
  const bin=screenshotBin();assert.equal(sharedCutPlan(bin,{kerf:3,trim:0,minRemnant:100,priority:'area'},{maxStates:0}),null);
});
test('layout selection completes before cut optimization, which preserves all positions and stock',()=>{
  const p=structuredClone(referenceCases[5]);p.parts[2].qty=10;
  const layout=optimize(p,()=>{},{refineCuts:false}),saved=structuredClone(layout),cutPlan=optimizeCutPlans(layout,p.settings),production=optimize(p);
  assert.deepEqual(layout,saved);assert.deepEqual(cutPlan.bins.map(b=>b.parts),layout.bins.map(b=>b.parts));assert.deepEqual(cutPlan.bins.map(b=>b.stock),layout.bins.map(b=>b.stock));assert.deepEqual(cutPlan.unplaced,layout.unplaced);assert.ok(cutPlan.cutCount<=layout.cutCount);assert.deepEqual(production.bins,cutPlan.bins);auditResult(production,p);
});
test('equal-cost plans prefer long common cuts over separate short cuts for the five-panel layout',()=>{
  const p=structuredClone(referenceCases[5]);p.parts=p.parts.filter(x=>x.id==='top_bottom');p.parts[0].qty=5;
  const bin={stock:p.stocks[0],parts:[],cuts:[],free:[]};
  for(const [col,rows]of [[0,3],[1,2]]){
    const x=col*603;bin.cuts.push({axis:'x',x:x+600,y:0,length:1220,kerf:3});
    for(let row=0;row<rows;row++){const y=row*323,part={...p.parts[0],qty:1,instance:`p:${col}-${row}`,x,y,w:600,h:320,originalW:600,originalH:320};bin.parts.push(part);bin.cuts.push({axis:'y',x,y:y+320,length:600,kerf:3,partInstance:part.instance});}
    bin.free.push({x,y:rows*323,w:600,h:1220-rows*323});
  }
  bin.free.push({x:1206,y:0,w:1234,h:1220});
  const after=sharedCutPlan(bin,p.settings,{maxStates:512});assert.ok(after);assert.equal(after.cuts.length,7);assert.ok(after.cuts.some(c=>c.axis==='y'&&c.y===320&&c.length>=1203));assert.equal(after.cuts.reduce((n,c)=>n+c.length,0),bin.cuts.reduce((n,c)=>n+c.length,0));
  auditResult({bins:[after],unplaced:[],usedArea:5*600*320},{parts:bin.parts,stocks:[{...bin.stock,qty:1}],settings:p.settings});
});

test('the screenshot input cuts each released band in coordinate order instead of jumping back from the middle',()=>{
  const p=structuredClone(referenceCases[5]);p.parts[2].qty=10;
  p.parts.forEach((row,i)=>row.id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
  const result=optimize(p);auditResult(result,p);
  const first=result.bins[0],upper=first.cuts.filter(c=>c.axis==='x'&&c.y===0&&c.length===564);
  assert.deepEqual(upper.map(c=>c.x),[764,1067,1370,1673,1976,2059,2142]);
  const indices=upper.map(c=>first.cuts.indexOf(c));assert.ok(indices.every((x,i)=>!i||x===indices[i-1]+1));
});

test('ordering keeps parent-before-child dependencies and all physical cuts even without tree reconstruction',()=>{
  const bin=screenshotBin(),settings={kerf:3,trim:0,minRemnant:100,priority:'area',grain:false},saved=structuredClone(bin);
  const result=orderCutPlan(bin,settings);assert.deepEqual(bin,saved);
  assert.deepEqual(result.cuts.map(c=>JSON.stringify(c)).sort(),bin.cuts.map(c=>JSON.stringify(c)).sort());
  auditResult({bins:[result],unplaced:[],usedArea:bin.parts.reduce((n,p)=>n+p.w*p.h,0)},{parts:bin.parts,stocks:[bin.stock],settings});
  assert.deepEqual(result.cuts.slice(0,5).map(c=>[c.axis,c.x]),[['x',320],['x',643],['x',966],['x',1289],['x',1612]]);
});
