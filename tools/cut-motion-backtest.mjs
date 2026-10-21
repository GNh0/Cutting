import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {optimize,optimizeCutPlans} from '../src/optimizer.js';
import {cutMotion} from '../src/cut-order.js';
import {complexScenario,physicalSignature} from './complex-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';

const baselineCommit='87b5c982ada88935bee91baf95a26ab3809da290',baseIndex=11000000,close=(a,b)=>Math.abs(a-b)<1e-5;
if(isMainThread){
  const count=Number(process.argv[2]||1000);if(!Number.isInteger(count)||count<1||count>5000)throw new Error('Usage: node tools/cut-motion-backtest.mjs [1..5000]');
  const baselineSource=execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'show',`${baselineCommit}:src/cut-plan.js`],{encoding:'utf8'});
  const threads=Math.min(4,count,Math.max(1,os.availableParallelism()-1)),workers=[],progress=new Map(),start=performance.now(),hashes={};let timer;
  for(const file of ['src/optimizer.js','src/materials.js','src/cut-plan.js','src/cut-order.js','tools/cut-motion-backtest.mjs','tools/complex-scenarios.mjs'])hashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
  console.log(JSON.stringify({type:'start',pid:process.pid,count,threads,baselineCommit,baseIndex}));
  try{
    const reports=await new Promise((resolve,reject)=>{let done=0;const reports=[];
      for(let i=0;i<threads;i++){
        const worker=new Worker(new URL(import.meta.url),{workerData:{start:Math.floor(count*i/threads),end:Math.floor(count*(i+1)/threads),baselineSource}});workers.push(worker);
        worker.on('message',m=>{progress.set(i,m.completed);if(m.type==='done'){reports.push(m);if(++done===threads)resolve(reports);}});
        worker.on('error',reject);worker.on('exit',code=>{if(code)reject(new Error(`Worker exited ${code}`));});
      }
      timer=setInterval(()=>console.log(JSON.stringify({type:'progress',completed:[...progress.values()].reduce((a,b)=>a+b,0),seconds:Math.round((performance.now()-start)/1000)})),15000);
    });
    const totals={},signatures=reports.flatMap(r=>r.signatures),unique=new Set(signatures);if(unique.size!==count)throw new Error('Repeated physical scenarios');
    for(const r of reports)for(const [key,value]of Object.entries(r.totals))totals[key]=(totals[key]||0)+value;
    const timings=reports.flatMap(r=>r.timings).sort((a,b)=>a-b),report={count,uniquePhysicalScenarios:unique.size,scenarioIndices:[baseIndex,baseIndex+count-1],baselineCommit,threads,hashes,model:'Frozen layout; minimum cut count and preserved residual quality, then total positive-stroke travel (cut length plus approach distance), then direction changes. No stacking or workpiece handling time.',complexity:{minTypes:Math.min(...reports.map(r=>r.minTypes)),maxTypes:Math.max(...reports.map(r=>r.maxTypes)),minPieces:Math.min(...reports.map(r=>r.minPieces)),maxPieces:Math.max(...reports.map(r=>r.maxPieces)),minStockTypes:9,maxStockTypes:12,partOptionalRequirements:true,grain:true,qualities:['quick','balanced','thorough']},...totals,newCutStageMs:{median:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)],max:timings.at(-1)},counterexamples:reports.flatMap(r=>r.counterexamples).slice(0,12),wallSeconds:(performance.now()-start)/1000};
    await fs.writeFile('docs/cut-motion-backtest.json',JSON.stringify(report,null,2));console.log(JSON.stringify({type:'done',...report}));
    if(totals.comparableMotionLosses)process.exitCode=1;
  }finally{clearInterval(timer);console.log(JSON.stringify({type:'workers-disposed',exitCodes:await Promise.all(workers.map(w=>w.terminate()))}));}
}else{
  const previous=await import('data:text/javascript;base64,'+Buffer.from(workerData.baselineSource).toString('base64'));
  const totals={physicalAudits:0,boards:0,largeQuantityCases:0,thousandPartCases:0,baselineCuts:0,newCuts:0,baselineCutLength:0,newCutLength:0,baselineTravel:0,newTravel:0,baselineApproach:0,newApproach:0,baselineTurns:0,newTurns:0,cutCountWins:0,cutCountTies:0,comparableBoards:0,comparableMotionWins:0,comparableMotionTies:0,comparableMotionLosses:0},signatures=[],timings=[],counterexamples=[];
  let minTypes=Infinity,maxTypes=0,minPieces=Infinity,maxPieces=0,completed=0;
  for(let i=workerData.start;i<workerData.end;i++){
    const index=baseIndex+i,p=complexScenario(index);p.settings.quality=['quick','balanced','thorough'][i%3];
    p.parts.forEach((r,j)=>{if((i+j)%5===0)r.manufacturer='';if((i+j)%7===0)r.lot='';});
    const pieces=p.parts.reduce((n,r)=>n+r.qty,0);minTypes=Math.min(minTypes,p.parts.length);maxTypes=Math.max(maxTypes,p.parts.length);minPieces=Math.min(minPieces,pieces);maxPieces=Math.max(maxPieces,pieces);totals.largeQuantityCases+=Number(pieces>=250);totals.thousandPartCases+=Number(pieces===1000);signatures.push(physicalSignature(p));
    const layout=optimize(p,()=>{},{refineCuts:false}),before={...layout,bins:layout.bins.map(b=>previous.sharedCutPlan(b,p.settings,{maxStates:512})||previous.orderCutPlan(b,p.settings))},start=performance.now(),after=optimizeCutPlans(layout,p.settings);timings.push(performance.now()-start);
    auditResult(layout,p);auditResult(before,p);auditResult(after,p);totals.physicalAudits+=3;
    for(let j=0;j<after.bins.length;j++){
      const old=before.bins[j],next=after.bins[j],origin={x:p.settings.trim,y:p.settings.trim},a=cutMotion(old.cuts,origin),b=cutMotion(next.cuts,origin),length=bin=>bin.cuts.reduce((n,c)=>n+c.length,0),residual=bin=>{const areas=bin.free.filter(r=>Math.min(r.w,r.h)>=p.settings.minRemnant-1e-7).map(r=>r.w*r.h);return [areas.reduce((a,b)=>a+b,0),Math.max(0,...areas)];};
      if(JSON.stringify(next.parts)!==JSON.stringify(layout.bins[j].parts)||JSON.stringify(next.stock)!==JSON.stringify(layout.bins[j].stock))throw new Error('Changed frozen layout');
      if(next.cuts.length>old.cuts.length)throw new Error(`Cut count regression: ${index}, sheet ${j}`);
      totals.boards++;totals.baselineCuts+=old.cuts.length;totals.newCuts+=next.cuts.length;totals.baselineCutLength+=length(old);totals.newCutLength+=length(next);totals.baselineTravel+=a.totalDistance;totals.newTravel+=b.totalDistance;totals.baselineApproach+=a.distance;totals.newApproach+=b.distance;totals.baselineTurns+=a.turns;totals.newTurns+=b.turns;
      if(next.cuts.length<old.cuts.length)totals.cutCountWins++;else totals.cutCountTies++;
      const x=residual(old),y=residual(next);if(next.cuts.length===old.cuts.length&&x.every((v,k)=>close(v,y[k]))){
        totals.comparableBoards++;const key=close(a.totalDistance,b.totalDistance)?'comparableMotionTies':b.totalDistance<a.totalDistance?'comparableMotionWins':'comparableMotionLosses';totals[key]++;
        if(key==='comparableMotionLosses'&&counterexamples.length<4)counterexamples.push({index,sheet:j,before:a,after:b,cuts:next.cuts.length});
      }
    }
    completed++;if(completed%10===0)parentPort.postMessage({type:'progress',completed});
  }
  parentPort.postMessage({type:'done',completed,totals,signatures,timings,minTypes,maxTypes,minPieces,maxPieces,counterexamples});
}
