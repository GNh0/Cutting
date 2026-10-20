import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {optimize} from '../src/optimizer.js';
import {scenario} from './benchmark-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';
const benchmark=JSON.parse(await fs.readFile('research/benchmarks/acceptance-100000.json','utf8'));
const reference=await import(pathToFileURL(path.resolve(`research/benchmarks/engine-${benchmark.engineSha256}.mjs`)));
const durations=[];
for(let i=0;i<1000;i++){
  const project=scenario(1000000+i,'acceptance'),start=performance.now(),actual=optimize(project);durations.push(performance.now()-start);
  const expected=reference.optimizeHybrid(project,()=>{},48);
  assert.deepEqual(actual,expected);auditResult(actual,project);
}
durations.sort((a,b)=>a-b);
const source=await fs.readFile('src/optimizer.js');
const result={scenarioCount:1000,newScenarioIndexRange:[1000000,1000999],allMatchedFrozenHybrid:true,allPhysicalAuditsPassed:true,referenceEngineSha256:benchmark.engineSha256,productionEngineSha256:createHash('sha256').update(source).digest('hex'),actualHybridTiming:{meanMs:durations.reduce((a,b)=>a+b,0)/durations.length,medianMs:durations[500],p95Ms:durations[950],maxMs:durations.at(-1)}};
await fs.writeFile('docs/production-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
