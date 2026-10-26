import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {once} from 'node:events';
import {optimizeVersion} from '../src/calculation-versions.js';
import {validateProject} from '../src/optimizer.js';
import {randomScenario} from './random-scenarios.mjs';
import {physicalSignature} from './complex-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';
import {materialMetrics,compareMaterialQuality} from '../src/calculation-comparison.js';

const versions=['cutting-v1','smart2d-v1'],epsilon=1e-7;
const includeCombined=isMainThread?process.argv.includes('--combined'):workerData.includeCombined;
const runVersions=includeCombined?[...versions,'combined-v3']:versions;
const hash=body=>createHash('sha256').update(body).digest('hex');
const require=(condition,message)=>{if(!condition)throw new Error(message);};
const fulfillment=result=>{
  const counts=new Map();for(const p of result.unplaced)counts.set(p.id,(counts.get(p.id)||0)+1);
  return JSON.stringify([...counts].sort((a,b)=>a[0].localeCompare(b[0])));
};

function evaluate(input){
  const errors=validateProject(input);require(!errors.length,errors.join('; '));
  const results={},missing={},blendSources=[],fullResults={};
  for(const version of runVersions){
    const job=structuredClone(input);job.settings.calculationVersion=version;
    const before=JSON.stringify(job),result=optimizeVersion(job);
    auditResult(result,job);require(JSON.stringify(job)===before,'Optimizer changed input');
    for(const bin of result.bins)for(const part of bin.parts){
      const original=input.parts.find(p=>p.id===part.id);
      require(!part.rotated||(input.settings.rotate&&original.rotate!==false),'Forbidden rotation');
    }
    const m=materialMetrics(result);
    require(Math.abs(m.nonReusableLoss-m.trimLoss-m.kerfLoss-m.smallScrap)<Math.max(.0001,m.stockArea*1e-12),'Loss conservation failed');
    results[version]=m;missing[version]=fulfillment(result);fullResults[version]=result;
    if(version==='combined-v3'){
      blendSources.push(...new Set(result.blendSelections.map(selection=>selection.selectedVersion)));
      for(const baseline of versions)require(compareMaterialQuality(result,fullResults[baseline])<=0,`Combined material objective regressed against ${baseline}`);
    }
  }
  const comparable=missing[versions[0]]===missing[versions[1]]&&results[versions[0]].stockArea>0&&results[versions[1]].stockArea>0;
  return {id:input.id,seed:input.benchmarkDesign.seed,signature:physicalSignature(input),inputSha256:hash(JSON.stringify(input)),partTypes:input.parts.length,quantity:input.parts.reduce((n,p)=>n+p.qty,0),stockTypes:input.stocks.length,comparable,unplacedByPart:missing,results,...(includeCombined?{blendSources}:{})};
}

// Count independent material criteria; expose conflicts instead of hiding them
// behind a combined score. No timing is collected.
function winner(a,b,higher){return Math.abs(a-b)<=epsilon?'tie':(higher?a>b:a<b)?versions[0]:versions[1];}
function summarize(rows){
  const counts=key=>Object.fromEntries([...versions,'tie'].map(v=>[v,rows.filter(r=>r[key]===v).length]));
  const totals=Object.fromEntries(versions.map(v=>{
    const keys=['placed','unplaced','unplacedArea','sheets','stockArea','usedArea','reusableArea','nonReusableLoss','trimLoss','kerfLoss','smallScrap'];
    const m=Object.fromEntries(keys.map(k=>[k,rows.reduce((n,r)=>n+r.results[v][k],0)]));
    return [v,{...m,utilizationPercent:m.stockArea?100*m.usedArea/m.stockArea:0,lossPercent:m.stockArea?100*m.nonReusableLoss/m.stockArea:0,reusablePercent:m.stockArea?100*m.reusableArea/m.stockArea:0}];
  }));
  return {cases:rows.length,utilization:counts('utilizationWinner'),lossRate:counts('lossRateWinner'),discardArea:counts('discardAreaWinner'),joint:Object.fromEntries(['cutting-v1','smart2d-v1','tie','tradeoff'].map(k=>[k,rows.filter(r=>r.joint===k).length])),totals};
}

if(!isMainThread){
  parentPort.on('message',input=>{try{parentPort.postMessage({row:evaluate(input)});}catch(error){parentPort.postMessage({error:error.stack});}});
}else{
  const count=Number(process.argv[2]||1000),concurrency=Number(process.argv[3]||3),output=process.argv[4]||'research/backtests/paired',checkpoint=process.argv[5]?.startsWith('--')?undefined:process.argv[5];
  require(Number.isInteger(count)&&count>=1&&count<=1000,'Count must be 1..1000');
  require(Number.isInteger(concurrency)&&concurrency>=1&&concurrency<=4,'Workers must be 1..4');
  const baseArgument=process.argv.find(arg=>arg.startsWith('--seed-base='));
  const base=baseArgument?Number(baseArgument.slice('--seed-base='.length)):26000000;
  require(Number.isSafeInteger(base)&&base>=0&&base+count<=2147483647,'Seed base must be a nonnegative safe integer within the supported range');
  const inputs=Array.from({length:count},(_,i)=>randomScenario(base+i)),sourceHashes={};
  require(new Set(inputs.map(physicalSignature)).size===count,'Duplicate physical input');
  for(const file of ['src/optimizer.js','src/smart2d-placement.js','src/smart2d-merge.js','src/calculation-versions.js','src/calculation-comparison.js','src/cut-plan.js','src/cut-order.js','src/materials.js','tools/complex-scenarios.mjs','tools/random-scenarios.mjs','tools/benchmark-audit.mjs','tools/version-benchmark.mjs'])sourceHashes[file]=hash(await fs.readFile(file));
  const header={type:'checkpoint',count,base,versions:runVersions,sourceHashes,inputHash:hash(JSON.stringify(inputs))},rows=[];
  if(checkpoint){
    try{
      const saved=(await fs.readFile(checkpoint,'utf8')).trim().split('\n').map(JSON.parse);
      require(JSON.stringify(saved.shift())===JSON.stringify(header),'Checkpoint belongs to different source/inputs');
      for(const row of saved){const input=inputs[row.seed-base];require(input&&row.inputSha256===hash(JSON.stringify(input)),'Checkpoint input mismatch');rows.push(row);}
      require(new Set(rows.map(r=>r.id)).size===rows.length,'Duplicate checkpoint result');
    }catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(checkpoint,JSON.stringify(header)+'\n');}
  }
  const completed=new Set(rows.map(r=>r.id)),pending=inputs.filter(p=>!completed.has(p.id)),workers=[];
  let cursor=0,writes=Promise.resolve();
  console.log(JSON.stringify({type:'start',independentInputs:count,quality:'thorough',engineRuns:count*runVersions.length,resumed:rows.length,workers:concurrency}));
  try{
    await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},async()=>{
      const worker=new Worker(new URL(import.meta.url),{workerData:{includeCombined}});workers.push(worker);
      while(cursor<pending.length){
        const input=pending[cursor++],reply=once(worker,'message');worker.postMessage(input);
        const [message]=await reply;if(message.error)throw new Error(`${input.id}: ${message.error}`);
        const row=message.row;require(row.id===input.id&&row.inputSha256===hash(JSON.stringify(input)),'Mismatched worker result');rows.push(row);
        if(checkpoint){writes=writes.then(()=>fs.appendFile(checkpoint,JSON.stringify(row)+'\n'));await writes;}
        if(rows.length%20===0||rows.length===count)console.log(JSON.stringify({type:'progress',completed:rows.length,total:count}));
      }
    }));
  }finally{
    await Promise.all(workers.map(w=>w.terminate()));await writes;
    console.log(JSON.stringify({type:'cleanup',workersStopped:workers.length}));
  }
  require(rows.length===count,'Incomplete benchmark');rows.sort((a,b)=>a.seed-b.seed);
  for(const row of rows){
    if(!row.comparable)continue;
    const [a,b]=versions.map(v=>row.results[v]);
    row.utilizationWinner=winner(a.utilizationPercent,b.utilizationPercent,true);
    row.lossRateWinner=winner(a.lossPercent,b.lossPercent,false);
    row.discardAreaWinner=winner(a.nonReusableLoss,b.nonReusableLoss,false);
    row.joint=row.utilizationWinner==='tie'?row.lossRateWinner:row.lossRateWinner==='tie'?row.utilizationWinner:row.utilizationWinner===row.lossRateWinner?row.utilizationWinner:'tradeoff';
  }
  const comparable=rows.filter(r=>r.comparable),complete=rows.filter(r=>versions.every(v=>r.results[v].unplaced===0));
  const completion=Object.fromEntries(['bothComplete','onlyCuttingComplete','onlySmart2dComplete','neitherComplete'].map(key=>[key,rows.filter(r=>{const a=r.results[versions[0]].unplaced===0,b=r.results[versions[1]].unplaced===0;return key==='bothComplete'?a&&b:key==='onlyCuttingComplete'?a&&!b:key==='onlySmart2dComplete'?!a&&b:!a&&!b;}).length]));
  const combined=includeCombined?Object.fromEntries(versions.map(v=>{
    const eligible=rows.filter(r=>r.unplacedByPart[v]===r.unplacedByPart['combined-v3']&&r.results[v].stockArea>0&&r.results['combined-v3'].stockArea>0);
    const counts=(field,higher)=>{const out={[v]:0,'combined-v3':0,tie:0};for(const r of eligible){const a=r.results[v][field],b=r.results['combined-v3'][field];out[Math.abs(a-b)<=epsilon?'tie':(higher?a>b:a<b)?v:'combined-v3']++;}return out;};
    return [v,{samePartFulfillmentCases:eligible.length,differentFulfillmentCases:count-eligible.length,utilization:counts('utilizationPercent',true),lossRate:counts('lossPercent',false)}];
  })):undefined;
  const report={date:'2026-10-23',scope:'Cutting calculation versions',versions:runVersions,scenarioCount:count,uniquePhysicalInputs:count,comparisons:count,optimizerRuns:count*runVersions.length,quality:'thorough',priority:'area',seedRange:[base,base+count-1],allPhysicalAuditsPassed:true,allMaterialLossAuditsPassed:true,sourceHashes,inputsSha256:header.inputHash,comparisonRule:'Count higher part-area/used-stock-area utilization and lower nonreusable-loss/used-stock-area loss rate independently. Compare material only for identical per-part fulfillment; record opposing winners as tradeoff. Percentage tolerance 1e-7 percentage points. No timing is measured.',lossDefinition:'Used stock - placed parts - reusable remnants = trim + kerf + small unusable remnants. Reusable requires both dimensions >= per-case minRemnant.',completion,incomparableCases:count-comparable.length,samePartFulfillment:summarize(comparable),bothComplete:summarize(complete),...(includeCombined?{combined}:{}),rows};
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'version-benchmark.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(output,'version-benchmark-inputs.json'),JSON.stringify(inputs));
  console.log(JSON.stringify({type:'complete',completion,incomparableCases:report.incomparableCases,samePartFulfillment:report.samePartFulfillment,bothComplete:report.bothComplete,...(includeCombined?{combined}:{})}));
}
