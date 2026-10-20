import {Worker} from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const count=Number(process.argv[2]||50000),split=process.argv[3]||'train';
if(!Number.isInteger(count)||count<1||count>1000000||!['train','holdout','acceptance'].includes(split))throw new Error('Usage: node tools/benchmark.mjs [1..1000000] [train|holdout|acceptance]');
const threads=Math.min(4,Math.max(1,os.availableParallelism()-1),count),start=performance.now(),workers=[],states=new Map();
const source=await fs.readFile(new URL('../src/optimizer.js',import.meta.url));const engineSha256=createHash('sha256').update(source).digest('hex');
await fs.mkdir('research/benchmarks',{recursive:true});const snapshot=path.resolve(`research/benchmarks/engine-${engineSha256}.mjs`);let snapshotSource=source.toString();
for(const name of ['materials','cut-plan']){const dependency=await fs.readFile(new URL(`../src/${name}.js`,import.meta.url)),hash=createHash('sha256').update(dependency).digest('hex'),filename=`${name}-${hash}.mjs`;await fs.writeFile(path.join(path.dirname(snapshot),filename),dependency);snapshotSource=snapshotSource.replace(`'./${name}.js'`,`'./${filename}'`);}
await fs.writeFile(snapshot,snapshotSource);
const engineURL=pathToFileURL(snapshot).href;
console.log(JSON.stringify({type:'start',pid:process.pid,count,split,threads,profiles:4,packingCandidates:count*240,engineSha256}));
let timer;
try{
  const results=await new Promise((resolve,reject)=>{
    let finished=0;
    for(let i=0;i<threads;i++){
      const worker=new Worker(new URL('./benchmark-worker.mjs',import.meta.url),{workerData:{start:Math.floor(count*i/threads),end:Math.floor(count*(i+1)/threads),split,engineURL}});
      workers.push(worker);states.set(i,{completed:0,candidates:0});
      worker.on('message',message=>{states.set(i,message);if(message.type==='done'&&++finished===threads)resolve([...states.values()]);});
      worker.on('error',reject);worker.on('exit',code=>{if(code!==0)reject(new Error(`Worker ${i} exited ${code}`));});
    }
    timer=setInterval(()=>console.log(JSON.stringify({type:'progress',completed:[...states.values()].reduce((n,s)=>n+s.completed,0),candidates:[...states.values()].reduce((n,s)=>n+s.candidates,0),seconds:Math.round((performance.now()-start)/1000)})),15000);
  });
  const stats={};
  for(const result of results)for(const [name,s]of Object.entries(result.stats)){
    stats[name]??={};for(const [k,v]of Object.entries(s)){if(k==='byFamily'){stats[name][k]??={};for(const [f,c]of Object.entries(v)){stats[name][k][f]??={win:0,tie:0,loss:0};for(const [field,value]of Object.entries(c))stats[name][k][f][field]+=value;}}else stats[name][k]=(stats[name][k]||0)+v;}
  }
  const timingSummary={};for(const name of Object.keys(stats)){const samples=results.flatMap(r=>r.timings?.[name]||[]).sort((a,b)=>a-b);if(samples.length)timingSummary[name]={medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1),hybridTimingIsSumOfComponentTimes:name==='hybrid240'};}
  const output={generatedScenarios:count,uniquePhysicalScenarios:new Set(results.flatMap(r=>r.fingerprints||[])).size,split,threads,engineSha256,algorithmRuns:count*4,verifiedPhysicalResults:count*4,packingCandidates:results.reduce((n,r)=>n+r.candidates,0),wallSeconds:(performance.now()-start)/1000,stats,timingSummary,disagreements:results.flatMap(r=>r.disagreements)};
  await fs.mkdir('research/benchmarks',{recursive:true});await fs.writeFile(`research/benchmarks/${split}-${count}.json`,JSON.stringify(output,null,2));
  console.log(JSON.stringify({type:'done',...output,disagreements:undefined}));
}finally{clearInterval(timer);const exits=await Promise.all(workers.map(w=>w.terminate()));console.log(JSON.stringify({type:'workers-disposed',count:workers.length,exitCodes:exits}));}
