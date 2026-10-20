import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRemnants,carryRemnantStock} from '../src/remnants.js';

const remnant=(extra={})=>({w:500,h:300,material:'합판',grain:'x',reusable:true,sheet:0,index:0,...extra});
const stock=(extra={})=>({id:'stock',label:'보유 잔재',w:500,h:300,material:'합판',grain:'x',enabled:true,qty:3,...extra});
const createRow=(label,w,h,qty,extra)=>({id:crypto.randomUUID(),label,w,h,qty,enabled:true,...extra});

test('equal remnants accumulate quantity and area while keeping each source',()=>{
  const input=[remnant(),remnant({sheet:2,index:1,material:' 합판 '})],before=structuredClone(input);
  const [g]=groupRemnants(input);assert.equal(g.qty,2);assert.equal(g.area,300000);assert.deepEqual(g.sources,[{sheet:0,index:0},{sheet:2,index:1}]);assert.deepEqual(input,before);
});
test('material, grain, physical orientation, exact size and reuse status stay separate',()=>{
  const input=[remnant(),remnant({material:'MDF'}),remnant({grain:'y'}),remnant({w:300,h:500}),remnant({w:500.001}),remnant({reusable:false})];assert.equal(groupRemnants(input).length,6);
});
test('carry subtracts consumed sheets and adds reusable quantities to matching inventory',()=>{
  const stocks=[stock(),stock({id:'mdf',material:'MDF',qty:1}),stock({id:'disabled',enabled:false})],before=structuredClone(stocks);
  const next=carryRemnantStock(stocks,[{stock:stocks[0]}],[remnant(),remnant({sheet:1}),remnant({reusable:false}),remnant({grain:'y'})],createRow);
  assert.equal(next.find(r=>r.id==='stock').qty,4);assert.equal(next.find(r=>r.id==='mdf').qty,1);assert.equal(next.find(r=>r.grain==='y').qty,1);assert.equal(next.length,3);assert.deepEqual(stocks,before);
});
test('carry splits quantities at the input limit without losing stock',()=>{
  const next=carryRemnantStock([stock({qty:999})],[],Array.from({length:1003},(_,sheet)=>remnant({sheet})),createRow);
  assert.deepEqual(next.map(r=>r.qty),[1000,1000,2]);assert.equal(next.reduce((a,r)=>a+r.qty,0),2002);
});
