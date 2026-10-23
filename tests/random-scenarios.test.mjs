import test from 'node:test';
import assert from 'node:assert/strict';
import {randomScenario} from '../tools/random-scenarios.mjs';
import {physicalSignature} from '../tools/complex-scenarios.mjs';
import {validateProject} from '../src/optimizer.js';

test('backtest seed replays the exact input without using optimizer output',()=>{
  assert.deepEqual(randomScenario(26000000),randomScenario(26000000));
  assert.notEqual(physicalSignature(randomScenario(26000000)),physicalSignature(randomScenario(26000001)));
});

test('1000 seeded inputs are physically unique valid jobs at one fixed quality',()=>{
  const inputs=Array.from({length:1000},(_,i)=>randomScenario(26000000+i));
  assert.equal(new Set(inputs.map(physicalSignature)).size,1000);
  for(const p of inputs){assert.deepEqual(validateProject(p),[]);assert.equal(p.settings.quality,'thorough');assert.equal(p.settings.priority,'area');}
  for(const k of ['w','h','qty','thickness']){
    assert.ok(new Set(inputs.flatMap(p=>p.parts.map(r=>r[k]))).size>5,k);
    assert.ok(new Set(inputs.flatMap(p=>p.stocks.map(r=>r[k]))).size>5,k);
  }
  for(const k of ['kerf','trim','minRemnant'])assert.ok(new Set(inputs.map(p=>p.settings[k])).size>20,k);
  for(const k of ['rotate','grain','single'])assert.equal(new Set(inputs.map(p=>p.settings[k])).size,2,k);
  for(const k of ['stress','shortage']){assert.ok(inputs.some(p=>p.benchmarkDesign[k]));assert.ok(inputs.some(p=>!p.benchmarkDesign[k]));}
  assert.equal(new Set(inputs.map(p=>p.parts.length)).size>10,true);
});
