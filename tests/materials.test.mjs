import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize,validateProject} from '../src/optimizer.js';
import {materialKey,upgradeProject} from '../src/materials.js';
import {groupRemnants,carryRemnantStock} from '../src/remnants.js';
import {csv,importRows,readProject} from '../src/io.js';
import {auditResult} from '../tools/benchmark-audit.mjs';
const row=(id,extra={})=>({id,label:id,w:600,h:400,qty:1,thickness:18,material:'합판',manufacturer:'A사',lot:'L01',grain:'none',enabled:true,rotate:true,edges:{},...extra});
const project=(parts,stocks)=>({version:1,unit:'mm',parts,stocks,settings:{kerf:3,trim:0,rotate:true,material:false,grain:false,single:false,priority:'area',quality:'balanced',minRemnant:100}});

test('three LOTs of the same manufacturer each use their own stock and optimize independently',()=>{
  const p=project(['L01','L02','L03'].map((lot,i)=>row('p'+i,{lot,qty:i+1})),['L03','L01','L02'].map((lot,i)=>row('s'+i,{lot,w:1000,h:1000,qty:4})));
  const r=optimize(p);auditResult(r,p);assert.equal(r.placed,6);assert.equal(r.groups.length,3);
  for(const g of r.groups){const separate=optimize({...p,parts:p.parts.filter(x=>materialKey(x)===g.key),stocks:p.stocks.filter(x=>materialKey(x)===g.key)});assert.equal(g.stockArea,separate.stockArea);assert.equal(g.usedArea,separate.usedArea);assert.equal(g.placed,separate.placed);for(const i of g.sheets)assert.equal(materialKey(r.bins[i].stock),g.key);}
  for(const remnant of r.remnants)assert.equal(materialKey(remnant),materialKey(r.bins[remnant.sheet].stock));
});
test('specified part fields strictly restrict allocation, including blank stock fields and case',()=>{
  for(const extra of [{thickness:17},{material:'MDF'},{manufacturer:'B사'},{manufacturer:''},{lot:'L02'},{lot:''},{lot:'l01'}]){
    const p=project([row('p')],[row('s',{w:1200,h:1000,...extra})]);const r=optimize(p);assert.equal(r.placed,0,JSON.stringify(extra));assert.equal(r.unplaced.length,1);assert.equal(r.groups[0].sheets.length,0);
  }
  const p=project([row('p',{manufacturer:'',lot:''})],[row('s',{manufacturer:'',lot:''})]);assert.equal(optimize(p).placed,1);
  p.stocks[0].lot='L01';assert.equal(optimize(p).placed,1);
});

test('omitted manufacturer and LOT on parts independently allow matching stock candidates',()=>{
  for(const [part,stock,placed]of [
    [{manufacturer:'',lot:''},{manufacturer:'B사',lot:'L02'},1],
    [{manufacturer:'A사',lot:''},{manufacturer:'A사',lot:'L02'},1],
    [{manufacturer:'',lot:'L01'},{manufacturer:'B사',lot:'L01'},1],
    [{manufacturer:'A사',lot:''},{manufacturer:'B사',lot:'L02'},0],
    [{manufacturer:'',lot:'L01'},{manufacturer:'B사',lot:'L02'},0],
    [{manufacturer:'  ',lot:'  '},{manufacturer:'B사',lot:'L02'},1],
    [{manufacturer:'',lot:''},{thickness:12},0],
    [{manufacturer:'',lot:''},{material:'MDF'},0]
  ]){const p=project([row('p',part)],[row('s',stock)]),r=optimize(p);auditResult(r,p);assert.equal(r.placed,placed,JSON.stringify([part,stock]));}
});

test('flexible parts share one inventory pool and results show actual stock LOTs',()=>{
  const p=project([row('p',{manufacturer:'',lot:'',qty:3})],[row('s1'),row('s2',{manufacturer:'B사',lot:'L02'})]),r=optimize(p);auditResult(r,p);
  assert.equal(r.placed,2);assert.equal(r.unplaced.length,1);assert.equal(r.bins.length,2);
  assert.deepEqual(r.groups.filter(g=>g.sheets.length).map(g=>[g.manufacturer,g.lot,g.placed]),[['A사','L01',1],['B사','L02',1]]);
  assert.equal(r.groups.find(g=>g.requestOnly).unplaced,1);assert.equal(r.groups.reduce((n,g)=>n+g.total,0),3);
  for(const remnant of r.remnants)assert.equal(materialKey(remnant),materialKey(r.bins[remnant.sheet].stock));
});

test('specified parts keep access to their scarce LOT while flexible parts use other stock',()=>{
  const p=project([row('flexible',{manufacturer:'',lot:'',qty:2}),row('specific')],[row('scarce'),row('other',{manufacturer:'B사',lot:'L02',qty:2})]),r=optimize(p);auditResult(r,p);
  assert.equal(r.placed,3);assert.equal(r.unplaced.length,0);
  assert.equal(r.bins.find(b=>b.parts.some(p=>p.id==='specific')).stock.id,'scarce');
  assert.equal(r.bins.filter(b=>b.stock.id==='other').reduce((n,b)=>n+b.parts.length,0),2);
});

test('flexible parts can fill remaining space beside a LOT-specified part',()=>{
  const p=project([row('flexible',{manufacturer:'',lot:''}),row('specific')],[row('s',{w:1203,h:400})]),r=optimize(p);auditResult(r,p);assert.equal(r.placed,2);assert.equal(r.bins.length,1);assert.equal(r.groups.length,1);assert.equal(r.groups[0].lot,'L01');assert.equal(r.groups[0].placed,2);
});

test('one-sheet limit applies to each actual stock identity when a flexible request spans LOTs',()=>{
  const p=project([row('p',{manufacturer:'',lot:'',qty:4})],[row('s1',{qty:3}),row('s2',{lot:'L02',qty:3})]);p.settings.single=true;const r=optimize(p);auditResult(r,p);assert.equal(r.bins.length,2);assert.equal(r.placed,2);assert.equal(r.unplaced.length,2);
});

test('flexible request chooses the smaller sufficient stock among manufacturers and LOTs',()=>{
  const p=project([row('p',{manufacturer:'',lot:''})],[row('large',{manufacturer:'B사',lot:'L02',w:2440,h:1220}),row('exact')]),r=optimize(p);auditResult(r,p);assert.equal(r.bins.length,1);assert.equal(r.bins[0].stock.id,'exact');assert.equal(r.stockArea,600*400);
});

test('overlapping manufacturer-only and LOT-only demands reserve enough shared inventory',()=>{
  const p=project([row('manufacturer-only',{lot:'',qty:2}),row('lot-only',{manufacturer:'',qty:2})],[row('shared',{qty:2}),row('manufacturer-only-stock',{lot:'L02'}),row('lot-only-stock',{manufacturer:'B사'})]);
  const r=optimize(p);auditResult(r,p);assert.equal(r.placed,4);assert.equal(r.unplaced.length,0);assert.equal(r.bins.length,4);
});
test('surplus stock from a different LOT cannot cover a matching LOT shortage',()=>{
  const p=project([row('p',{qty:3})],[row('same',{qty:1}),row('other',{qty:20,lot:'L02'})]);const r=optimize(p);auditResult(r,p);assert.equal(r.placed,1);assert.equal(r.unplaced.length,2);assert.equal(r.bins.length,1);
});
test('thickness and material are required and trimming only removes surrounding spaces',()=>{
  for(const thickness of [null,0,-1,NaN,Infinity,'18'])assert.throws(()=>optimize(project([row('p',{thickness})],[row('s')])));
  assert.throws(()=>optimize(project([row('p',{material:'  '})],[row('s')])));
  const p=project([row('p',{material:' 合板 ',manufacturer:' A사 ',lot:' L01 '})],[row('s',{material:'合板'})]);assert.equal(optimize(p).placed,1);
});
test('legacy projects remain editable with missing thickness and cannot calculate until completed',()=>{
  const old=project([row('p')],[row('s')]);for(const r of [...old.parts,...old.stocks]){delete r.thickness;delete r.manufacturer;delete r.lot;}
  const loaded=readProject(JSON.stringify(old));assert.equal(loaded.parts[0].thickness,null);assert.ok(validateProject(loaded).some(x=>x.includes('두께')));assert.throws(()=>optimize(loaded));assert.deepEqual(upgradeProject(loaded),loaded);
});
test('CSV round trips all identity fields and thickness uses the display unit',()=>{
  const original=row('p',{thickness:19.05,manufacturer:'A, 제조사',lot:'001'}),[r]=importRows(csv([original],25.4),25.4);
  for(const k of ['thickness','material','manufacturer','lot'])assert.equal(r[k],original[k]);
});
test('same-size remnants never merge across thickness, manufacturer or LOT and carry identity forward',()=>{
  const input=[row('r',{reusable:true,sheet:0,index:0}),row('r2',{reusable:true,sheet:1,index:0,lot:'L02'}),row('r3',{reusable:true,sheet:2,index:0,manufacturer:''}),row('r4',{reusable:true,sheet:3,index:0,thickness:12})];assert.equal(groupRemnants(input).length,4);
  const next=carryRemnantStock([],[],input,(label,w,h,qty,extra)=>row(label,{w,h,qty,...extra}));assert.deepEqual(next.map(materialKey),input.map(materialKey));assert.ok(next.every(x=>x.qty===1));
});
test('single sheet mode applies independently to each material group',()=>{
  const p=project([row('p1',{qty:2}),row('p2',{lot:'L02',qty:2})],[row('s1',{qty:3}),row('s2',{lot:'L02',qty:3})]);p.settings.single=true;const r=optimize(p);auditResult(r,p);assert.equal(r.bins.length,2);assert.equal(r.placed,2);assert.equal(r.unplaced.length,2);
});
