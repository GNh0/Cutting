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
test('each identity field strictly restricts allocation, including optional blanks and case',()=>{
  for(const extra of [{thickness:17},{material:'MDF'},{manufacturer:'B사'},{manufacturer:''},{lot:'L02'},{lot:''},{lot:'l01'}]){
    const p=project([row('p')],[row('s',{w:1200,h:1000,...extra})]);const r=optimize(p);assert.equal(r.placed,0,JSON.stringify(extra));assert.equal(r.unplaced.length,1);assert.equal(r.groups[0].sheets.length,0);
  }
  const p=project([row('p',{manufacturer:'',lot:''})],[row('s',{manufacturer:'',lot:''})]);assert.equal(optimize(p).placed,1);
  p.stocks[0].lot='L01';assert.equal(optimize(p).placed,0);
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
