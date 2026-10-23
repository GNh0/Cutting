import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSearchProfile} from '../src/decision-tree.js';
const p=()=>({parts:[{w:100,h:90,qty:1,rotate:true,grain:'none'},{w:130,h:110,qty:1,rotate:true,grain:'none'}],stocks:[{w:500,h:400,grain:'none'},{w:500,h:500,grain:'none'}],settings:{rotate:true,grain:false}});

test('decision tree distinguishes strips, constraints, shared edges, mixed stock and general work',()=>{
  const cases=[['general',()=>{}],['narrow-parts',p=>{p.parts[0]={...p.parts[0],w:500,h:50,qty:10};}],['constrained-parts',p=>{p.settings.rotate=false;}],['shared-edges',p=>{p.parts[1].w=100;}],['mixed-stock',p=>{p.stocks.push({w:600,h:400,grain:'none'});}]];
  for(const [expected,change] of cases){const input=p();change(input);const before=structuredClone(input),choice=selectSearchProfile(input,24);assert.equal(choice.id,expected);assert.equal(choice.budget,48);assert.ok(choice.path.length>0&&choice.path.length<=4);assert.deepEqual(input,before);assert.deepEqual(choice,selectSearchProfile(input,24));}
});

test('quantity-weighted restrictions and disabled inventory affect the decision from actual active inputs',()=>{
  const input=p();input.parts[0].qty=10;input.parts[0].grain='x';input.settings.grain=true;input.stocks[0].grain='y';
  assert.equal(selectSearchProfile(input,6).id,'constrained-parts');
  input.parts[0].enabled=false;
  input.stocks.push({w:900,h:50,grain:'x',enabled:false});
  const choice=selectSearchProfile(input,6);assert.equal(choice.id,'general');assert.equal(choice.features.constrainedShare,0);assert.equal(choice.features.stockSizeCount,2);
});
