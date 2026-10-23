import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize} from '../src/optimizer.js';
import {CALCULATION_VERSIONS,resolveCalculationVersion,optimizeVersion} from '../src/calculation-versions.js';
import {readProject} from '../src/io.js';

const row=(id,w,h,qty=1)=>({id,label:id,w,h,qty,thickness:18,material:'합판',manufacturer:'',lot:'',enabled:true,grain:'none',rotate:true,edges:{}});
const project=calculationVersion=>({version:1,name:'계산식 비교',unit:'mm',parts:[row('side',61,40,2),row('shelf',30,20,3)],stocks:[row('stock',150,100,2)],settings:{kerf:3,trim:2,rotate:true,grain:false,single:false,material:true,priority:'area',quality:'quick',minRemnant:10,...(calculationVersion===undefined?{}:{calculationVersion})}});
const withoutVersion=r=>{const {calculationVersion,...physical}=r;return physical;};

test('a missing calculation version preserves the existing optimizer output exactly',()=>{
  const p=project(),before=structuredClone(p),progress=[];
  const actual=optimizeVersion(p,v=>progress.push(v));
  assert.equal(actual.calculationVersion.id,'cutting-v1');
  assert.deepEqual(withoutVersion(actual),optimize(p));
  assert.deepEqual(p,before);
  assert.equal(progress.at(-1),100);
});

test('explicit Cutting v1 calls the unchanged optimizer',()=>{
  const p=project('cutting-v1');
  assert.deepEqual(withoutVersion(optimizeVersion(p)),optimize(p));
  assert.equal(resolveCalculationVersion().id,'cutting-v1');
});

test('Smart2D selects its separate optimizer family and retains a result version snapshot',()=>{
  const p=project('smart2d-v1'),progress=[];
  const actual=optimizeVersion(p,v=>progress.push(v));
  assert.equal(actual.algorithm,'smart2d');
  assert.deepEqual(withoutVersion(actual),optimize(p,undefined,{family:'smart2d'}));
  assert.equal(actual.calculationVersion.id,'smart2d-v1');
  assert.equal(actual.calculationVersion.experimental,true);
  assert.equal(progress.at(-1),100);
  p.settings.calculationVersion='cutting-v1';
  assert.equal(actual.calculationVersion.id,'smart2d-v1');
  actual.calculationVersion.name='changed result';
  assert.notEqual(resolveCalculationVersion('smart2d-v1').name,'changed result');
});

test('unknown explicit versions fail before any calculation rather than falling back',()=>{
  for(const id of ['future-v9','',null,0,{}]){
    const p=project(id),progress=[];
    assert.throws(()=>resolveCalculationVersion(id),/지원하지 않는 계산식 버전/);
    assert.throws(()=>optimizeVersion(p,v=>progress.push(v)),/지원하지 않는 계산식 버전/);
    assert.deepEqual(progress,[]);
    assert.throws(()=>readProject(JSON.stringify(p)),/지원하지 않는 계산식 버전/);
  }
});

test('project JSON retains the selected version and legacy imports remain legacy',()=>{
  for(const version of CALCULATION_VERSIONS){
    const imported=readProject(JSON.stringify(project(version.id)));
    assert.equal(imported.settings.calculationVersion,version.id);
  }
  const legacy=readProject(JSON.stringify(project()));
  assert.equal(legacy.settings.calculationVersion,undefined);
  assert.equal(resolveCalculationVersion(legacy.settings.calculationVersion).id,'cutting-v1');
});

test('worker calculates the selected version and reports unsupported versions',async()=>{
  const messages=[];
  globalThis.self={postMessage:message=>messages.push(message)};
  try{
    await import('../src/worker.js');
    self.onmessage({data:project('smart2d-v1')});
    const completed=messages.find(m=>m.type==='done');
    assert.equal(completed.result.calculationVersion.id,'smart2d-v1');
    assert.equal(completed.result.algorithm,'smart2d');
    messages.length=0;
    self.onmessage({data:project('combined-v3')});
    assert.equal(messages.find(m=>m.type==='done').result.calculationVersion.id,'combined-v3');
    assert.equal(messages.find(m=>m.type==='done').result.algorithm,'decision-tree');
    messages.length=0;
    self.onmessage({data:project('future-v9')});
    assert.equal(messages.length,1);
    assert.equal(messages[0].type,'error');
    assert.match(messages[0].message,/지원하지 않는 계산식 버전/);
  }finally{delete globalThis.self;}
});
