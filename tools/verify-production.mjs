import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {optimize} from '../src/optimizer.js';
import {scenario} from './benchmark-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';
const durations=[];let boards=0,refinedBoards=0,cutsSaved=0;
for(let i=0;i<1000;i++){
  const project=scenario(5000000+i,'acceptance'),start=performance.now(),actual=optimize(project);durations.push(performance.now()-start);auditResult(actual,project);
  boards+=actual.bins.length;for(const b of actual.bins)if(b.cutPlan){refinedBoards++;cutsSaved+=b.cutPlan.originalCount-b.cuts.length;}
}
durations.sort((a,b)=>a-b);const sourceHashes={};for(const file of ['src/optimizer.js','src/materials.js','src/cut-plan.js','src/cut-order.js'])sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const result={scenarioCount:1000,newScenarioIndexRange:[5000000,5000999],allPhysicalAuditsPassed:true,strictMaterialGroups:true,sourceHashes,boards,refinedBoards,cutsSaved,actualHybridTiming:{meanMs:durations.reduce((a,b)=>a+b,0)/durations.length,medianMs:durations[500],p95Ms:durations[950],maxMs:durations.at(-1)}};
await fs.writeFile('docs/production-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
