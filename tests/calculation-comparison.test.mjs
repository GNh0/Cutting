import test from 'node:test';
import assert from 'node:assert/strict';
import {compareResultQuality,resultQualityRank} from '../src/calculation-comparison.js';

const result=extra=>({unplaced:[],stockArea:1000000,cutCount:10,cutLength:4000,reusableArea:200000,largestRemnant:100000,...extra});

test('unplaced count and then unplaced area precede all optimization priorities',()=>{
  for(const priority of ['area','cuts','remnant']){
    assert.equal(compareResultQuality(result({cutCount:1000}),result({unplaced:[{w:1,h:1}],stockArea:1,cutCount:0}),priority),-1);
    assert.equal(compareResultQuality(result({unplaced:[{w:10,h:10}]}),result({unplaced:[{w:20,h:10}]}),priority),-1);
  }
});

test('area priority prefers stock area then reusable area plus one tenth largest remnant',()=>{
  assert.equal(compareResultQuality(result({stockArea:900000,cutCount:99,reusableArea:0,largestRemnant:0}),result()),-1);
  assert.equal(compareResultQuality(result({reusableArea:190000,largestRemnant:300000}),result()),-1);
  assert.equal(compareResultQuality(result({cutCount:9}),result()),-1);
  assert.equal(compareResultQuality(result({cutLength:3999}),result()),-1);
});

test('cuts priority prefers cut count before stock area',()=>{
  const fewerCuts=result({cutCount:9,stockArea:2000000}),smallerStock=result({stockArea:900000});
  assert.equal(compareResultQuality(fewerCuts,smallerStock,'cuts'),-1);
  assert.equal(compareResultQuality(fewerCuts,smallerStock,'area'),1);
});

test('remnant priority prefers largest remnant then total reusable area after stock area',()=>{
  assert.equal(compareResultQuality(result({largestRemnant:150000,reusableArea:150000}),result({largestRemnant:100000,reusableArea:400000}),'remnant'),-1);
  assert.equal(compareResultQuality(result({reusableArea:210000}),result(),'remnant'),-1);
  assert.equal(compareResultQuality(result({stockArea:2000000,largestRemnant:900000}),result(),'remnant'),1);
});

test('equal objective ranks tie independently of runtime, sheet count and version metadata',()=>{
  const a=result({elapsedMs:1,bins:[{}],calculationVersion:{id:'cutting-v1'}}),b=result({elapsedMs:999,bins:[{},{}],calculationVersion:{id:'smart2d-v1'}});
  const before=structuredClone([a,b]);
  for(const priority of ['area','cuts','remnant'])assert.equal(compareResultQuality(a,b,priority),0);
  assert.deepEqual([a,b],before);
  assert.equal(compareResultQuality(result({cutLength:4000+1e-8}),result()),0);
});

test('rank is an independent value array and inverse comparisons reverse the decision',()=>{
  const a=result({cutCount:9}),b=result();
  const rank=resultQualityRank(a,'cuts');rank[0]=999;
  assert.equal(resultQualityRank(a,'cuts')[0],0);
  assert.equal(compareResultQuality(a,b,'cuts'),-compareResultQuality(b,a,'cuts'));
});
