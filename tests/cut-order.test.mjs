import test from 'node:test';
import assert from 'node:assert/strict';
import {cutMotion,scheduleCutTree} from '../src/cut-order.js';

const node=(axis,x,y,length,first=null,second=null)=>({cut:{axis,x,y,length,kerf:3},first,second});
function smallTree(){
  return node('x',40,0,100,
    node('y',0,35,40,node('x',17,0,35),node('x',25,38,62)),
    node('y',43,60,57,node('x',70,0,60),node('x',80,63,37)));
}
// Enumerate every legal order independently, measuring coordinates directly.
function exhaustive(tree,origin){
  let best={distance:Infinity,turns:Infinity},orders=0;
  function visit(ready,at,axis,distance,turns){
    if(!ready.length){orders++;if(distance<best.distance-1e-7||Math.abs(distance-best.distance)<1e-7&&turns<best.turns)best={distance,turns};return;}
    for(const item of ready){const c=item.cut,remaining=ready.filter(n=>n!==item);if(item.first)remaining.push(item.first);if(item.second)remaining.push(item.second);
      visit(remaining,c.axis==='x'?{x:c.x,y:c.y+c.length}:{x:c.x+c.length,y:c.y},c.axis,distance+Math.sqrt((c.x-at.x)**2+(c.y-at.y)**2),turns+Number(Boolean(axis&&axis!==c.axis)));
    }
  }visit([tree],origin,null,0,0);return {...best,orders};
}
test('small schedules match all legal permutations, including a nonzero origin',()=>{
  for(const origin of [{x:0,y:0},{x:5,y:7}]){
    const tree=smallTree(),saved=structuredClone(tree),expected=exhaustive(tree,origin),actual=scheduleCutTree(tree,origin);
    assert.equal(expected.orders,80);assert.equal(actual.exact,true);assert.ok(Math.abs(actual.distance-expected.distance)<1e-7);assert.equal(actual.turns,expected.turns);assert.deepEqual(tree,saved);
  }
});
test('motion distinguishes approach, cutting and total travel and counts direction changes',()=>{
  assert.deepEqual(cutMotion([{axis:'x',x:3,y:4,length:10},{axis:'y',x:3,y:14,length:7}]),{distance:5,turns:1,cutLength:17,totalDistance:22});
  assert.deepEqual(scheduleCutTree(null).cuts,[]);
});
test('exhausted state budgets and large plans retain valid parent-first schedules',()=>{
  const tree=smallTree(),fallback=scheduleCutTree(tree,{x:0,y:0},{maxStates:0});assert.equal(fallback.exact,false);
  const seen=new Set();for(const c of fallback.cuts){const find=(n,parent=null)=>{if(n.cut===c)return parent;return n.first&&find(n.first,n)||n.second&&find(n.second,n);};const parent=find(tree);assert.ok(!parent||seen.has(parent.cut));seen.add(c);}
  assert.equal(seen.size,7);
  let large=null;for(let i=100;i>=0;i--)large=node('x',i*10,0,100,large);
  const result=scheduleCutTree(large);assert.equal(result.cuts.length,101);assert.equal(result.exact,false);assert.deepEqual(result.cuts.map(c=>c.x),Array.from({length:101},(_,i)=>i*10));
});
