import test from 'node:test';
import assert from 'node:assert/strict';
import {packNativeSheet,searchNativeSheet,nativeLargePieceFactor} from '../src/smart2d-placement.js';
import {optimizeVersion} from '../src/calculation-versions.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
import {materialMetrics} from '../src/calculation-comparison.js';

const row=(id,w,h,qty=1,extra={})=>({id,label:id,w,h,qty,thickness:18,material:'A',manufacturer:'',lot:'',enabled:true,grain:'none',rotate:true,edges:{},...extra});
const settings=extra=>({kerf:10,trim:0,rotate:false,grain:false,single:false,material:true,priority:'area',quality:'thorough',minRemnant:100,...extra});
const expand=rows=>rows.flatMap(p=>Array.from({length:p.qty},(_,i)=>({...p,qty:1,instance:`${p.id}:${i+1}`,originalW:p.w,originalH:p.h})));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

function solve(rows,stock,s=settings(),options={}){
  const pieces=expand(rows),before=structuredClone({pieces,stock,s,options});
  const bin=packNativeSheet(pieces,stock,s,options);
  assert.deepEqual({pieces,stock,s,options},before,'Native packing must not mutate caller inputs');
  const placed=new Set(bin.parts.map(p=>p.instance));
  const result={bins:bin.parts.length?[bin]:[],unplaced:pieces.filter(p=>!placed.has(p.instance)),usedArea:bin.parts.reduce((n,p)=>n+p.w*p.h,0)};
  auditResult(result,{parts:rows,stocks:[stock],settings:s});
  for(const p of bin.parts){
    assert.ok(p.x>=s.trim-1e-7&&p.y>=s.trim-1e-7);
    assert.ok(p.x+p.w<=stock.w-s.trim+1e-7&&p.y+p.h<=stock.h-s.trim+1e-7);
    if(!s.rotate||p.rotate===false)assert.equal(p.rotated,false);
  }
  if(bin.parts.length){
    const free=bin.free.reduce((n,r)=>n+r.w*r.h,0),saw=bin.cuts.reduce((n,c)=>n+c.length*c.kerf,0);
    near(result.usedArea+free+saw,(stock.w-2*s.trim)*(stock.h-2*s.trim));
    assert.ok(bin.cuts.every(c=>c.kerf>=0&&c.kerf<=s.kerf));
  }
  return bin;
}

test('a twelve-part strip consumes only the four millimetres of terminal material with a ten millimetre saw',()=>{
  const bin=solve([row('strip',1168,120,12)],row('sheet',1168,1554),settings(),{direction:'y'});
  assert.equal(bin.parts.length,12);
  assert.deepEqual(bin.parts.map(p=>[p.x,p.y,p.w,p.h]),Array.from({length:12},(_,i)=>[0,130*i,1168,120]));
  const terminal=bin.cuts.filter(c=>c.kerf<10);
  assert.equal(terminal.length,1);
  assert.deepEqual([terminal[0].axis,terminal[0].x,terminal[0].y,terminal[0].length,terminal[0].kerf,terminal[0].nominalKerf],['y',0,1550,1168,4,10]);
  assert.equal(bin.free.length,0,'Terminal material cannot also be reported as reusable free space');
  near(bin.cuts.reduce((n,c)=>n+c.length*c.kerf,0),133152);
  const usedArea=12*1168*120;
  const metrics=materialMetrics({bins:[bin],unplaced:[],placed:12,stockArea:1168*1554,usedArea,reusableArea:0,largestRemnant:0,remnants:[],settings:settings(),cutLength:bin.cuts.reduce((n,c)=>n+c.length,0)});
  near(metrics.kerfLoss,133152);
  near(metrics.nonReusableLoss,metrics.kerfLoss+metrics.trimLoss+metrics.smallScrap);
});

test('terminal kerf clipping is symmetric for a horizontal strip and exact edge fits need no extra cut',()=>{
  let bin=solve([row('strip',120,1168,12)],row('sheet',1554,1168),settings(),{direction:'x'});
  assert.equal(bin.parts.length,12);
  const terminal=bin.cuts.find(c=>c.kerf<10);
  assert.ok(terminal);
  assert.deepEqual([terminal.axis,terminal.x,terminal.y,terminal.length,terminal.kerf],['x',1550,0,1168,4]);
  bin=solve([row('exact',100,80)],row('sheet',100,80));
  assert.equal(bin.parts.length,1);assert.equal(bin.cuts.length,0);assert.equal(bin.free.length,0);
});

test('the original-orientation screenshot parts can all be cut on one 2500 by 2000 sheet',()=>{
  // This is the 24-part output shown for the original first sheet, not a claim
  // that the screenshot contains the complete original job or identical coordinates.
  const rows=[row('p1',1168,120,15),row('p2',874,436,2),row('p3',592,540,2),row('p4',550,550,2),row('p5',550,152,2),row('p6',120,1168)];
  const stock=row('sheet',2500,2000);
  const project={version:1,unit:'mm',parts:rows,stocks:[stock],settings:settings({calculationVersion:'smart2d-v1'})};
  const before=structuredClone(project),result=optimizeVersion(project);
  assert.deepEqual(project,before);
  auditResult(result,project);
  assert.equal(result.placed,24);
  assert.equal(result.unplaced.length,0);
  assert.equal(result.bins.length,1);
  assert.equal(result.calculationVersion.id,'smart2d-v1');
  const best=result.bins[0];
  assert.equal(best.parts.length,24);
  assert.deepEqual(Object.fromEntries(rows.map(p=>[p.id,best.parts.filter(q=>q.id===p.id).length])),{p1:15,p2:2,p3:2,p4:2,p5:2,p6:1});
  near(best.parts.reduce((n,p)=>n+p.w*p.h,0),4416248);
});

test('equal fitting candidates retain the native reverse-row area tie order rather than identifier order',()=>{
  for(const direction of ['x','y']){
    // The loader orders by descending area and reverses equal-area
    // rows; strict evaluator ties must preserve that prepared group order.
    const bin=solve([row('a-first',50,50),row('z-last',50,50)],row('sheet',100,100),settings({kerf:0}),{direction});
    assert.equal(bin.parts.length,2);
    assert.equal(bin.parts[0].id,'z-last');
  }
});

test('rotated-first tie handling still obeys global, individual and grain restrictions',()=>{
  let bin=solve([row('square',50,50)],row('sheet',50,50),settings({rotate:true}),{direction:'x'});
  assert.equal(bin.parts.length,1);assert.equal(bin.parts[0].rotated,true);
  const stock=row('sheet',60,90),rows=[row('part',90,60)];
  assert.equal(solve(rows,stock).parts.length,0);
  bin=solve(rows,stock,settings({rotate:true}));
  assert.equal(bin.parts.length,1);assert.equal(bin.parts[0].rotated,true);
  assert.equal(solve([row('part',90,60,1,{rotate:false})],stock,settings({rotate:true})).parts.length,0);
  assert.equal(solve([row('part',90,60,1,{grain:'x'})],{...stock,grain:'x'},settings({rotate:true,grain:true})).parts.length,0);
  bin=solve([row('part',90,60,1,{grain:'x'})],{...stock,grain:'y'},settings({rotate:true,grain:true}));
  assert.equal(bin.parts.length,1);assert.equal(bin.parts[0].rotated,true);
});

test('finite expanded quantities and material requirements remain independent of caller-owned inventory',()=>{
  const rows=[row('general',100,100,2),row('specific',100,100,1,{manufacturer:'M',lot:'L'}),row('wrong-material',100,100,1,{material:'B'})];
  const stock=row('sheet',400,100,7,{manufacturer:'M',lot:'L'}),s=settings({kerf:0});
  const a=solve(rows,stock,s),b=solve(rows,stock,s);
  assert.equal(a.parts.length,3);
  assert.deepEqual(a,b);
  assert.equal(a.parts.filter(p=>p.id==='general').length,2);
  assert.equal(a.parts.filter(p=>p.id==='specific').length,1);
  assert.equal(a.parts.filter(p=>p.id==='wrong-material').length,0);
  assert.equal(stock.qty,7);
});


test('native large-part cutoff uses the longest permitted input dimension and rounds the sheet ratio upward',()=>{
  const sheet=row('sheet',1000,600),s=settings();
  assert.equal(nativeLargePieceFactor([row('p',300,100)],sheet,s),4);
  assert.equal(nativeLargePieceFactor([row('p',300,100)],sheet,{...s,trim:50}),3);
  assert.equal(nativeLargePieceFactor([row('p',100,300)],sheet,s),4);
  assert.equal(nativeLargePieceFactor([row('p',100,300,1,{rotate:false})],sheet,s),10);
  assert.equal(nativeLargePieceFactor([row('p',900,100)],sheet,s),2);
  assert.equal(nativeLargePieceFactor([row('off',1000,1000,1,{enabled:false}),row('p',300,100)],sheet,s),4);
});

test('native diagnostic prefix records only decisions retained in the returned physical layout',()=>{
  const bin=searchNativeSheet(expand([row('exact',50,50)]),row('sheet',50,50),settings(),{choices:['x','y','x'],level:1});
  assert.equal(bin.parts.length,1);
  assert.deepEqual(bin.nativeSearch.prefix,['x']);
  assert.equal(bin.nativeSearch.prefix.length,bin.decisions.length);
});
