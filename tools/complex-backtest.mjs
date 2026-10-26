import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs/promises';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {optimize,optimizeCutPlans} from '../src/optimizer.js';
import {materialKey} from '../src/materials.js';
import {scenario} from './benchmark-scenarios.mjs';
import {complexScenario,physicalSignature} from './complex-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';

const rank=(r,s)=>[r.unplaced.length,r.unplaced.reduce((n,p)=>n+p.w*p.h,0),...(s.priority==='cuts'?[r.cutCount,r.stockArea,-(r.reusableArea+.1*r.largestRemnant)]:s.priority==='remnant'?[r.stockArea,-r.largestRemnant,-r.reusableArea]:[r.stockArea,-(r.reusableArea+.1*r.largestRemnant),r.cutCount]),r.cutLength];
const compare=(a,b,s)=>{const x=rank(a,s),y=rank(b,s);for(let i=0;i<x.length;i++)if(Math.abs(x[i]-y[i])>1e-6)return x[i]<y[i]?-1:1;return 0;};
function groupResult(r,g){const bins=g.sheets.map(i=>r.bins[i]),free=r.remnants.filter(x=>materialKey(x)===g.key&&x.reusable);return {unplaced:r.unplaced.filter(x=>materialKey(x)===g.key),stockArea:g.stockArea,cutCount:bins.reduce((n,b)=>n+b.cuts.length,0),cutLength:bins.reduce((n,b)=>n+b.cuts.reduce((n,c)=>n+c.length,0),0),reusableArea:free.reduce((n,x)=>n+x.w*x.h,0),largestRemnant:Math.max(0,...free.map(x=>x.w*x.h))};}

if(isMainThread){
  const count=Number(process.argv[2]||1000000),budget=Number(process.argv[3]||6),statusPath=process.argv[4],base=budget===48?10000000:count>=100000?8000000:7500000;
  if(!Number.isInteger(count)||count<1||count>1000000||![6,24,48].includes(budget))throw new Error('count 1..1000000; budget 6,24,48');
  const threads=Math.min(12,count,Math.max(1,os.availableParallelism()-4)),workers=[],states=new Map(),start=performance.now(),hashes={},prior=new Set();
  for(const file of ['src/optimizer.js','src/materials.js','src/cut-plan.js','src/cut-order.js','tools/complex-scenarios.mjs'])hashes[file]=createHash('sha256').update(await fs.readFile(new URL('../'+file,import.meta.url))).digest('hex');
  for(const [offset,n,split]of [[0,100000,'acceptance'],[0,50000,'train'],[0,20000,'holdout'],[3000000,1000,'acceptance'],[4000000,100000,'acceptance'],[5000000,1000,'acceptance'],[6000000,110000,'acceptance']])for(let i=0;i<n;i++)prior.add(physicalSignature(scenario(offset+i,split)));
  for(let i=0;i<1000;i++){prior.add(physicalSignature(complexScenario(7000000+i)));prior.add(physicalSignature(complexScenario(7000000+i,{largeQuantities:false})));if(count>=100000){prior.add(physicalSignature(complexScenario(7500000+i)));prior.add(physicalSignature(complexScenario(10000000+i)));}}
  let timer;const progress=async(type,extra={})=>{const state={type,pid:process.pid,count,budget,threads,base,completed:[...states.values()].reduce((n,x)=>n+x.completed,0),seconds:(performance.now()-start)/1000,...extra};console.log(JSON.stringify(state));if(statusPath)await fs.writeFile(statusPath,JSON.stringify(state,null,2));};
  await progress('running',{hashes,priorConditionsCompared:prior.size});
  try{
    const results=await new Promise((resolve,reject)=>{let done=0;for(let i=0;i<threads;i++){
      const w=new Worker(new URL(import.meta.url),{workerData:{start:Math.floor(count*i/threads),end:Math.floor(count*(i+1)/threads),base,budget}});workers.push(w);
      w.on('message',m=>{states.set(i,m);if(m.type==='done'&&++done===threads)resolve([...states.values()]);});w.on('error',reject);w.on('exit',code=>{if(code!==0)reject(new Error(`Worker exited ${code}`));});
    }timer=setInterval(()=>progress('running').catch(reject),15000);});
    const unique=new Set();let overlaps=0;const totals={};for(const r of results){for(const key of r.fingerprints){if(unique.has(key)||prior.has(key))overlaps++;unique.add(key);}for(const [key,value]of Object.entries(r.totals))totals[key]=(totals[key]||0)+value;}
    if(overlaps)throw new Error(`Duplicate physical conditions: ${overlaps}`);
    const report={count,uniquePhysicalScenarios:unique.size,overlapsWithPriorAndWithinRun:overlaps,priorConditionsCompared:prior.size,scenarioIndices:[base,base+count-1],phases:['compare layout candidates','freeze selected part positions and stock','rebuild shared guillotine cuts'],layoutCandidatesPerGroup:budget*5,baselineCandidatesPerGroup:budget,threads,hashes,wallSeconds:(performance.now()-start)/1000,complexity:{minTypes:Math.min(...results.map(x=>x.minTypes)),maxTypes:Math.max(...results.map(x=>x.maxTypes)),minPieces:Math.min(...results.map(x=>x.minPieces)),maxPieces:Math.max(...results.map(x=>x.maxPieces)),minStockTypes:9,groups:[3,4],grainEnabled:true},...totals};
    const filename=`docs/complex-backtest-${count}-${budget}.json`;await fs.writeFile(filename,JSON.stringify(report,null,2));await progress('complete',{report:filename,summary:report});
  }catch(e){await progress('failed',{error:e.message});process.exitCode=1;}
  finally{clearInterval(timer);console.log(JSON.stringify({type:'workers-disposed',exitCodes:await Promise.all(workers.map(w=>w.terminate()))}));}
}else{
  const totals={physicalAudits:0,packingCandidates:0,groups:0,layoutGroupWins:0,layoutGroupTies:0,layoutGroupLosses:0,baselineStockArea:0,selectedStockArea:0,baselineUnplaced:0,selectedUnplaced:0,baselineReusableArea:0,selectedReusableArea:0,selectedLargestRemnantSum:0,layoutCuts:0,optimizedCuts:0,layoutCutLength:0,optimizedCutLength:0,largeQuantityCases:0,thousandPartCases:0},fingerprints=[];let completed=0,minTypes=Infinity,maxTypes=0,minPieces=Infinity,maxPieces=0;
  for(let i=workerData.start;i<workerData.end;i++){
    const p=complexScenario(workerData.base+i),parts=p.parts.reduce((n,r)=>n+r.qty,0);fingerprints.push(physicalSignature(p));minTypes=Math.min(minTypes,p.parts.length);maxTypes=Math.max(maxTypes,p.parts.length);minPieces=Math.min(minPieces,parts);maxPieces=Math.max(maxPieces,parts);totals.largeQuantityCases+=Number(parts>=250);totals.thousandPartCases+=Number(parts===1000);
    const baseline=optimize(p,()=>{},{family:'current',budget:workerData.budget,rankMode:'largest',refineCuts:false}),layout=optimize(p,()=>{},{family:'hybrid',budget:workerData.budget,refineCuts:false}),plan=optimizeCutPlans(layout,p.settings);
    for(const r of [baseline,layout,plan]){auditResult(r,p);totals.physicalAudits++;}
    if(plan.bins.some((b,j)=>JSON.stringify(b.parts)!==JSON.stringify(layout.bins[j].parts)||b.stock.id!==layout.bins[j].stock.id))throw new Error('Cut optimization moved a part or changed stock');
    if(plan.cutCount>layout.cutCount)throw new Error('Cut reconstruction increased cut count');
    for(const [j,g]of layout.groups.entries()){totals.groups++;const c=compare(groupResult(layout,g),groupResult(baseline,baseline.groups[j]),p.settings);totals[c<0?'layoutGroupWins':c>0?'layoutGroupLosses':'layoutGroupTies']++;if(c>0)throw new Error('Selected layout lost to retained baseline');}
    totals.packingCandidates+=baseline.iterations+layout.iterations;totals.baselineStockArea+=baseline.stockArea;totals.selectedStockArea+=layout.stockArea;totals.baselineUnplaced+=baseline.unplaced.length;totals.selectedUnplaced+=layout.unplaced.length;totals.baselineReusableArea+=baseline.reusableArea;totals.selectedReusableArea+=layout.reusableArea;totals.selectedLargestRemnantSum+=layout.largestRemnant;totals.layoutCuts+=layout.cutCount;totals.optimizedCuts+=plan.cutCount;totals.layoutCutLength+=layout.cutLength;totals.optimizedCutLength+=plan.cutLength;completed++;
    if(completed%20===0)parentPort.postMessage({type:'running',completed});
  }
  parentPort.postMessage({type:'done',completed,totals,fingerprints,minTypes,maxTypes,minPieces,maxPieces});parentPort.close();
}
