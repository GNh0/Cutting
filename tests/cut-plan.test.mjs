import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedCutPlan,orderCutPlan} from '../src/cut-plan.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {optimize,optimizeCutPlans} from '../src/optimizer.js';
import {referenceCases} from './reference-cases.mjs';
import {screenshotBin,user1610Project,oldBrowserCuts} from './cut-fixtures.mjs';
import {cutMotion} from '../src/cut-order.js';
import {minimumCutOracle} from './cut-oracle.mjs';
test('five aligned short cuts become one common cut without moving or cutting any part',()=>{
  const bin=screenshotBin(),settings={kerf:3,trim:0,minRemnant:100,priority:'area',grain:false},project={parts:bin.parts,stocks:[bin.stock],settings};
  const usedArea=bin.parts.reduce((n,p)=>n+p.w*p.h,0),original={bins:[bin],unplaced:[],usedArea};auditResult(original,project);
  const after=sharedCutPlan(bin,settings);assert.ok(after);auditResult({...original,bins:[after]},project);assert.deepEqual(after.parts,bin.parts);assert.ok(after.cuts.length<bin.cuts.length);
  const common=after.cuts.filter(c=>c.axis==='y'&&[600,1203].includes(c.y)&&c.length>=1612);assert.ok(common.length>=1);assert.equal(after.cuts.filter(c=>c.axis==='y'&&c.y===common[0].y&&c.length===320).length,0);
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

test('the 19-part screenshot retains all upper-band boundaries when routes are reordered',()=>{
  const p=structuredClone(referenceCases[5]);p.parts[2].qty=10;
  p.parts.forEach((row,i)=>row.id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
  const result=optimize(p);auditResult(result,p);
  const first=result.bins[0],upper=first.cuts.filter(c=>c.axis==='x'&&c.y===0&&c.length===564);
  assert.deepEqual(upper.map(c=>c.x).sort((a,b)=>a-b),[764,1067,1370,1673,1976,2059,2142]);
  assert.ok(first.cutMotion.after.distance>0);
});

test('ordering keeps parent-before-child dependencies and all physical cuts even without tree reconstruction',()=>{
  const bin=screenshotBin(),settings={kerf:3,trim:0,minRemnant:100,priority:'area',grain:false},saved=structuredClone(bin);
  const result=orderCutPlan(bin,settings);assert.deepEqual(bin,saved);
  assert.deepEqual(result.cuts.map(c=>JSON.stringify(c)).sort(),bin.cuts.map(c=>JSON.stringify(c)).sort());
  auditResult({bins:[result],unplaced:[],usedArea:bin.parts.reduce((n,p)=>n+p.w*p.h,0)},{parts:bin.parts,stocks:[bin.stock],settings});
  assert.ok(result.cutMotion.after.distance<=cutMotion(bin.cuts).distance+1e-7);
});

test('the actual 1610x610 Chrome case matches all minimum-cut trees and every legal order',()=>{
  const p=user1610Project(),layout=optimize(p,()=>{},{refineCuts:false}),bin=layout.bins[0];
  // Historical alternatives carry their recorded cuts, not the modern plan's remnants.
  assert.equal(bin.parts.length,6);auditResult({...layout,bins:[{...bin,free:undefined,cuts:oldBrowserCuts}]},p);
  let search;const after=sharedCutPlan(bin,p.settings,{maxStates:1000000,onSearch:s=>search=s});
  assert.equal(search.capped,false);assert.equal(search.alternativesTruncated,false);assert.equal(after.cuts.length,8);assert.deepEqual(after.parts,bin.parts);auditResult({...layout,bins:[after]},p);
  const oracle=minimumCutOracle(bin,3);assert.equal(oracle.count,8);assert.equal(oracle.minimumCountTrees,19);assert.equal(oracle.trees,19);assert.equal(oracle.orders,659);
  assert.ok(Math.abs(after.cutMotion.after.totalDistance-oracle.totalDistance)<1e-7);assert.equal(after.cutMotion.after.turns,oracle.turns);
  assert.ok(after.cutMotion.after.distance<cutMotion(oldBrowserCuts).distance);
  // A slightly longer stroke is worthwhile here: counts stay at eight, and
  // cutting + approach travel both together improve over the old eight-cut plan.
  assert.ok(after.cutMotion.after.cutLength>cutMotion(oldBrowserCuts).cutLength);
  assert.ok(after.cutMotion.after.totalDistance<cutMotion(oldBrowserCuts).totalDistance);
  // Joining rows 7/8 is possible before splitting their shared middle boundary,
  // but the two resulting fragments then require separate x=966 strokes: still 8.
  const joined=[['x',163,0,610],['y',0,564,163],['x',1533,0,610],['y',166,300,1367],['x',966,0,300],['x',80,0,564],['y',166,603,1367],['x',966,303,300]].map(([axis,x,y,length])=>({axis,x,y,length,kerf:3}));
  auditResult({...layout,bins:[{...bin,free:undefined,cuts:joined}]},p);assert.ok(cutMotion(joined).distance>after.cutMotion.after.distance);
  // Simply deleting row 8 and extending row 7 after x=966 is physically impossible.
  const impossible=oldBrowserCuts.slice(0,7).map(c=>({...c}));impossible[6].length=1367;
  assert.throws(()=>auditResult({...layout,bins:[{...bin,free:undefined,cuts:impossible}]},p),/physical fragment/);
});
