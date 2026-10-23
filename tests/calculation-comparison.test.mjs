import test from 'node:test';
import assert from 'node:assert/strict';
import {compareResultQuality,resultQualityRank,compareMaterialQuality,materialMetrics} from '../src/calculation-comparison.js';

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

const material=extra=>({placed:2,unplaced:[],stockArea:10000,usedArea:6000,reusableArea:3000,largestRemnant:3000,bins:[{stock:{w:100,h:100}}],remnants:[],settings:{trim:0,kerf:0},cutLength:0,iterations:1,...extra});

test('material comparison prefers fulfilling the requested parts before apparently higher yield',()=>{
  assert.equal(compareMaterialQuality(material(),material({placed:1,unplaced:[{w:10,h:10}],stockArea:100,usedArea:100,reusableArea:0,largestRemnant:0})),-1);
});

test('same placed area prefers better utilization then lower non-reusable loss',()=>{
  assert.equal(compareMaterialQuality(material({stockArea:9000,reusableArea:1000}),material()),-1);
  assert.equal(compareMaterialQuality(material({reusableArea:3500,largestRemnant:1000}),material()),-1);
  assert.equal(compareMaterialQuality(material({largestRemnant:3000}),material({largestRemnant:1500})),-1);
});

test('material ties ignore execution time, cut count and cut length',()=>{
  const a=material({ms:1,cutCount:3,cutLength:100}),b=material({ms:999,cutCount:100,cutLength:99999});
  assert.equal(compareMaterialQuality(a,b),0);
  assert.equal(compareMaterialQuality(b,a),0);
});

test('loss accounts for trim, kerf and small scraps without charging reusable remnants as waste',()=>{
  const r=material({usedArea:3600,reusableArea:4320,largestRemnant:4320,settings:{trim:5,kerf:2},cutLength:90,remnants:[{w:48,h:90,reusable:true}]});
  const m=materialMetrics(r);
  assert.equal(m.utilizationPercent,36);
  assert.equal(m.nonReusableLoss,2080);
  assert.equal(m.trimLoss,1900);assert.equal(m.kerfLoss,180);assert.equal(m.smallScrap,0);
  assert.equal(m.nonReusableLoss,m.trimLoss+m.kerfLoss+m.smallScrap);
  r.reusableArea=0;r.largestRemnant=0;r.remnants[0].reusable=false;
  const scrap=materialMetrics(r);assert.equal(scrap.nonReusableLoss,6400);assert.equal(scrap.smallScrap,4320);
  assert.equal(scrap.nonReusableLoss,scrap.trimLoss+scrap.kerfLoss+scrap.smallScrap);
});

test('no used sheets yields finite zero percentages',()=>{
  const m=materialMetrics(material({stockArea:0,usedArea:0,reusableArea:0,largestRemnant:0,bins:[]}));
  for(const k of ['utilizationPercent','reusablePercent','recoverablePercent','lossPercent'])assert.equal(m[k],0);
});
