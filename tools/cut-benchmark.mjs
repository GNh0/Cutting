import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {optimize} from '../src/optimizer.js';
import {sharedCutPlan} from '../src/cut-plan.js';
import {scenario} from './benchmark-scenarios.mjs';
import {complexScenario,physicalSignature} from './complex-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';

if(isMainThread){
  const count=Number(process.argv[2]||100000),maxStates=Number(process.argv[3]||512),threads=Math.min(12,count,Math.max(1,os.availableParallelism()-4)),workers=[],states=new Map(),start=performance.now();
  if(!Number.isInteger(count)||count<1||count>1000000||!Number.isInteger(maxStates)||maxStates<1||maxStates>6000)throw new Error('count 1..1000000, maxStates 1..6000');
  const complex=process.argv[4]==='complex',base=complex?(count>=100000?8000000:7000000):(count>=1000000?6000000:count>=100000?4000000:3000000);
  const prior=new Set();if(complex)for(const [start,n,split] of [[0,100000,'acceptance'],[0,50000,'train'],[0,20000,'holdout'],[3000000,1000,'acceptance'],[4000000,100000,'acceptance'],[5000000,1000,'acceptance'],[6000000,110000,'acceptance']])for(let i=0;i<n;i++)prior.add(physicalSignature(scenario(start+i,split)));
  if(complex&&count>=100000)for(let i=0;i<1000;i++){prior.add(physicalSignature(complexScenario(7000000+i)));prior.add(physicalSignature(complexScenario(7000000+i,{largeQuantities:false})));}
  const hashes={};for(const file of ['src/optimizer.js','src/materials.js','src/cut-plan.js','tools/complex-scenarios.mjs'])hashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
  console.log(JSON.stringify({type:'start',count,maxStates,threads,hashes,complex,priorConditions:prior.size,preparationSeconds:(performance.now()-start)/1000}));let timer;
  try{
    const results=await new Promise((resolve,reject)=>{let done=0;for(let i=0;i<threads;i++){
      const w=new Worker(new URL(import.meta.url),{workerData:{start:Math.floor(count*i/threads),end:Math.floor(count*(i+1)/threads),maxStates,base,complex}});workers.push(w);
      w.on('message',m=>{states.set(i,m);if(m.type==='done'&&++done===threads)resolve([...states.values()]);});w.on('error',reject);w.on('exit',code=>{if(code!==0)reject(new Error(`Worker exited ${code}`));});
    }timer=setInterval(()=>console.log(JSON.stringify({type:'progress',completed:[...states.values()].reduce((n,x)=>n+x.completed,0),seconds:Math.round((performance.now()-start)/1000)})),15000);});
    const totals={};for(const r of results)for(const [k,v]of Object.entries(r.totals))totals[k]=(totals[k]||0)+v;
    const unique=new Set();let overlaps=0;for(const r of results)for(const key of r.fingerprints||[]){if(prior.has(key)||unique.has(key))overlaps++;unique.add(key);}if(overlaps)throw new Error(`Physical duplicate/overlap conditions: ${overlaps}`);
    const complexity=complex?{minTypes:Math.min(...results.map(r=>r.minTypes)),maxTypes:Math.max(...results.map(r=>r.maxTypes)),minPieces:Math.min(...results.map(r=>r.minPieces)),maxPieces:Math.max(...results.map(r=>r.maxPieces)),minStockTypes:9,materialGroups:[3,4],grainAlwaysEnabled:true}:null;
    const report={uniquePhysicalScenarios:complex?unique.size:null,overlapsWithPriorAndWithinRun:complex?overlaps:null,priorConditionsCompared:prior.size,complexity,scenarios:count,scenarioIndices:[base,base+count-1],split:complex?'complex-acceptance':'acceptance',threads,maxStates,hashes,wallSeconds:(performance.now()-start)/1000,...totals,examples:results.flatMap(r=>r.examples),scope:'Fixed-layout guillotine reconstruction, preserving original reusable residual score. Cut candidates are partial separator choices, not independent scenarios.'};
    await fs.writeFile(complex?`docs/cut-plan-complex-${count}.json`:count>=1000000?'docs/cut-plan-benchmark-1000000.json':count>=100000?'docs/cut-plan-benchmark.json':`docs/cut-plan-pilot-${count}-${maxStates}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({type:'done',...report,examples:undefined}));
  }finally{clearInterval(timer);console.log(JSON.stringify({type:'workers-disposed',exitCodes:await Promise.all(workers.map(w=>w.terminate()))}));}
}else{
  const totals={boards:0,improvedBoards:0,originalCuts:0,newCuts:0,originalCutLength:0,newCutLength:0,statesVisited:0,separatorCandidates:0,cappedBoards:0,physicalAudits:0,completedResults:0},examples=[],fingerprints=[];let completed=0,minTypes=Infinity,maxTypes=0,minPieces=Infinity,maxPieces=0;
  for(let i=workerData.start;i<workerData.end;i++){
    const p=workerData.complex?complexScenario(workerData.base+i):scenario(workerData.base+i,'acceptance');if(workerData.complex){fingerprints.push(physicalSignature(p));minTypes=Math.min(minTypes,p.parts.length);maxTypes=Math.max(maxTypes,p.parts.length);const qty=p.parts.reduce((n,x)=>n+x.qty,0);minPieces=Math.min(minPieces,qty);maxPieces=Math.max(maxPieces,qty);}
    const r=optimize(p,()=>{},{family:'current',budget:12,refineCuts:false});auditResult(r,p);totals.physicalAudits++;
    const bins=r.bins.map(bin=>{totals.boards++;totals.originalCuts+=bin.cuts.length;totals.originalCutLength+=bin.cuts.reduce((n,c)=>n+c.length,0);const plan=sharedCutPlan(bin,p.settings,{maxStates:workerData.maxStates,onSearch:s=>{totals.statesVisited+=s.states;totals.separatorCandidates+=s.candidatesExamined;totals.cappedBoards+=Number(s.capped);}});if(plan){totals.improvedBoards++;if(examples.length<5)examples.push({index:workerData.base+i,parts:bin.parts.length,before:bin.cuts.length,after:plan.cuts.length});}const result=plan||bin;totals.newCuts+=result.cuts.length;totals.newCutLength+=result.cuts.reduce((n,c)=>n+c.length,0);return result;});
    auditResult({...r,bins},p);totals.physicalAudits++;totals.completedResults+=2;completed++;
    if(completed%100===0)parentPort.postMessage({type:'progress',completed});
  }
  parentPort.postMessage({type:'done',completed,totals,examples,fingerprints,minTypes,maxTypes,minPieces,maxPieces});parentPort.close();
}
