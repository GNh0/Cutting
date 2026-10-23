import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {optimizeVersion} from '../src/calculation-versions.js';
import {complexScenario,physicalSignature} from './complex-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';
import {compareResultQuality,resultQualityRank} from '../src/calculation-comparison.js';

// Reproducible, same-input comparisons of the two registered calculation versions.
// Timings include both layout search and the returned physical cutting plan.
const count=Number(process.argv[2]||36),base=23000000;
if(!Number.isInteger(count)||count<3||count>1000)throw new Error('Scenario count must be 3..1000');
const rows=[],start=performance.now(),versions=['cutting-v1','smart2d-v1'];
const qualities=['quick','balanced','thorough'],sourceHashes={};
for(const file of ['src/optimizer.js','src/calculation-versions.js','src/calculation-comparison.js','src/cut-plan.js','src/cut-order.js','src/materials.js','tools/complex-scenarios.mjs','tools/version-benchmark.mjs'])sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const compare=(a,b,s)=>{const decision=compareResultQuality(a,b,s.priority),x=resultQualityRank(a,s.priority),y=resultQualityRank(b,s.priority);return {winner:decision<0?versions[0]:decision>0?versions[1]:'tie',decisiveIndex:decision?x.findIndex((v,i)=>Math.abs(v-y[i])>1e-7):null};};
const metric=(r,ms)=>({placed:r.placed,unplaced:r.unplaced.length,unplacedArea:r.unplaced.reduce((n,p)=>n+p.w*p.h,0),sheets:r.bins.length,stockArea:r.stockArea,usedArea:r.usedArea,cutCount:r.cutCount,cutLength:r.cutLength,reusableArea:r.reusableArea,largestRemnant:r.largestRemnant,iterations:r.iterations,ms});
const inputs=[];
for(let i=0;i<count;i++){
  const p=complexScenario(base+i,{largeQuantities:i>=count-6});
  p.settings.priority=['area','cuts','remnant'][i%3];
  // Introduce overlapping LOT requirements sharing the same finite inventory.
  p.parts.forEach((part,j)=>{if(j%5===0)part.lot='';if(j%11===0){part.manufacturer='';part.lot='';}if(j%17===0)part.enabled=false;});
  // Keep enabled high-quantity jobs at the original 1000-part limit.
  const signature=physicalSignature(p);inputs.push({id:p.id,signature,parts:p.parts,stocks:p.stocks,settings:p.settings});
  const quantity=p.parts.filter(x=>x.enabled!==false).reduce((n,x)=>n+x.qty,0);
  for(const quality of qualities){
    const job={...p,settings:{...p.settings,quality}},results={};
    // Alternate order across scenarios to reduce systematic warm-up/order bias.
    for(const version of (i%2?[...versions].reverse():versions)){
      const input=structuredClone({...job,settings:{...job.settings,calculationVersion:version}}),before=JSON.stringify(input),t=performance.now();
      const result=optimizeVersion(input),ms=performance.now()-t;
      auditResult(result,input);
      if(JSON.stringify(input)!==before)throw new Error('Optimizer changed its input');
      results[version]={result,metrics:metric(result,ms)};
    }
    const decision=compare(results[versions[0]].result,results[versions[1]].result,job.settings);
    rows.push({id:p.id,quality,priority:job.settings.priority,signature,partTypes:p.parts.length,quantity,stockTypes:p.stocks.length,kerf:job.settings.kerf,trim:job.settings.trim,grain:job.settings.grain,rotate:job.settings.rotate,single:job.settings.single,...decision,results:Object.fromEntries(versions.map(v=>[v,results[v].metrics]))});
    console.log(JSON.stringify({scenario:i+1,quality,winner:decision.winner,seconds:(performance.now()-start)/1000}));
  }
  console.log(JSON.stringify({completed:i+1,total:count,comparisons:rows.length,seconds:(performance.now()-start)/1000}));
}
const summarize=list=>({comparisons:list.length,wins:Object.fromEntries([...versions,'tie'].map(v=>[v,list.filter(r=>r.winner===v).length])),totals:Object.fromEntries(versions.map(v=>[v,Object.fromEntries(['placed','unplaced','sheets','stockArea','cutCount','cutLength','reusableArea','largestRemnant','ms'].map(k=>[k,list.reduce((n,r)=>n+r.results[v][k],0)]))]))});
const report={date:'2026-10-23',scope:'Independent Cutting calculation versions; not a direct run of the original Smart2DCutting program',scenarioCount:count,uniquePhysicalInputs:new Set(inputs.map(p=>p.signature)).size,comparisons:rows.length,optimizerRuns:rows.length*2,allPhysicalAuditsPassed:true,sourceHashes,comparisonRule:'Unplaced quantity, unplaced area, configured priority objective, then cut length. Sheet count and runtime are display metrics, not primary ranking.',timingLimit:'Elapsed times measured sequentially with alternating version order; other system activity may affect timings.',wallSeconds:(performance.now()-start)/1000,summary:summarize(rows),byQuality:Object.fromEntries(qualities.map(q=>[q,summarize(rows.filter(r=>r.quality===q))])),byPriority:Object.fromEntries(['area','cuts','remnant'].map(q=>[q,summarize(rows.filter(r=>r.priority===q))])),rows};
await fs.writeFile('docs/version-benchmark.json',JSON.stringify(report,null,2));
await fs.writeFile('docs/version-benchmark-inputs.json',JSON.stringify(inputs,null,2));
console.log(JSON.stringify({type:'complete',summary:report.summary,byQuality:report.byQuality,byPriority:report.byPriority,wallSeconds:report.wallSeconds}));
