import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {optimizeVersion} from '../src/calculation-versions.js';
import {complexScenario,physicalSignature} from './complex-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';
import {compareMaterialQuality,materialQualityRank,materialMetrics} from '../src/calculation-comparison.js';

// Same-input material-efficiency comparison. Neither runtime nor cutting speed
// is measured, reported or used to decide the winner.
const count=Number(process.argv[2]||36),base=23000000;
if(!Number.isInteger(count)||count<3||count>1000)throw new Error('Scenario count must be 3..1000');
const rows=[],versions=['cutting-v1','smart2d-v1'],qualities=['quick','balanced','thorough'],sourceHashes={};
for(const file of ['src/optimizer.js','src/calculation-versions.js','src/calculation-comparison.js','src/cut-plan.js','src/cut-order.js','src/materials.js','tools/complex-scenarios.mjs','tools/version-benchmark.mjs'])sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const compare=(a,b)=>{const decision=compareMaterialQuality(a,b),x=materialQualityRank(a),y=materialQualityRank(b);return {winner:decision<0?versions[0]:decision>0?versions[1]:'tie',decisiveIndex:decision?x.findIndex((v,i)=>Math.abs(v-y[i])>1e-7):null};};
const inputs=[];
for(let i=0;i<count;i++){
  const p=complexScenario(base+i,{largeQuantities:i>=count-6});
  p.settings.priority='area';
  p.parts.forEach((part,j)=>{if(j%5===0)part.lot='';if(j%11===0){part.manufacturer='';part.lot='';}if(j%17===0)part.enabled=false;});
  const signature=physicalSignature(p);inputs.push({id:p.id,signature,parts:p.parts,stocks:p.stocks,settings:p.settings});
  const quantity=p.parts.filter(x=>x.enabled!==false).reduce((n,x)=>n+x.qty,0);
  for(const quality of qualities){
    const job={...p,settings:{...p.settings,quality}},results={};
    for(const version of versions){
      const input=structuredClone({...job,settings:{...job.settings,calculationVersion:version}}),before=JSON.stringify(input);
      const result=optimizeVersion(input);
      auditResult(result,input);
      if(JSON.stringify(input)!==before)throw new Error('Optimizer changed its input');
      const metrics=materialMetrics(result),accounted=metrics.trimLoss+metrics.kerfLoss+metrics.smallScrap;
      if(Math.abs(metrics.nonReusableLoss-accounted)>Math.max(.0001,metrics.stockArea*1e-12))throw new Error('Material-loss accounting failed');
      results[version]={result,metrics};
    }
    const decision=compare(results[versions[0]].result,results[versions[1]].result);
    rows.push({id:p.id,quality,priority:'area',signature,partTypes:p.parts.length,quantity,stockTypes:p.stocks.length,kerf:job.settings.kerf,trim:job.settings.trim,minRemnant:job.settings.minRemnant,grain:job.settings.grain,rotate:job.settings.rotate,single:job.settings.single,...decision,results:Object.fromEntries(versions.map(v=>[v,results[v].metrics]))});
    console.log(JSON.stringify({scenario:i+1,total:count,quality,winner:decision.winner}));
  }
}
const metricKeys=['placed','unplaced','unplacedArea','sheets','stockArea','usedArea','reusableArea','largestRemnant','nonReusableLoss','trimLoss','kerfLoss','smallScrap'];
const summarize=list=>({comparisons:list.length,wins:Object.fromEntries([...versions,'tie'].map(v=>[v,list.filter(r=>r.winner===v).length])),totals:Object.fromEntries(versions.map(v=>{const total=Object.fromEntries(metricKeys.map(k=>[k,list.reduce((n,r)=>n+r.results[v][k],0)]));return [v,{...total,utilizationPercent:total.stockArea?total.usedArea/total.stockArea*100:0,recoverablePercent:total.stockArea?(total.usedArea+total.reusableArea)/total.stockArea*100:0,lossPercent:total.stockArea?total.nonReusableLoss/total.stockArea*100:0}];}))});
const equalPlaced=rows.filter(r=>r.results[versions[0]].unplaced===r.results[versions[1]].unplaced&&Math.abs(r.results[versions[0]].unplacedArea-r.results[versions[1]].unplacedArea)<1e-7);
const report={date:'2026-10-23',scope:'Independent Cutting calculation versions; not a direct run of the original Smart2DCutting program',scenarioCount:count,uniquePhysicalInputs:new Set(inputs.map(p=>p.signature)).size,comparisons:rows.length,optimizerRuns:rows.length*2,allPhysicalAuditsPassed:true,allMaterialLossAuditsPassed:true,sourceHashes,comparisonRule:'Unplaced quantity, unplaced area, used stock area (higher material yield for the same placed parts), non-reusable loss, largest reusable remnant. Runtime, cutting speed, cut count and cut length do not break material-quality ties.',lossDefinition:'Stock area - placed part area - reusable remnant area = trim loss + kerf loss + unusable small remnants. Reusable means both sides reach the same per-job minRemnant threshold.',summary:summarize(rows),equalPlacementComparisons:summarize(equalPlaced),byQuality:Object.fromEntries(qualities.map(q=>[q,{...summarize(rows.filter(r=>r.quality===q)),equalPlacement:summarize(equalPlaced.filter(r=>r.quality===q))}])),rows};
await fs.writeFile('docs/version-benchmark.json',JSON.stringify(report,null,2));
await fs.writeFile('docs/version-benchmark-inputs.json',JSON.stringify(inputs,null,2));
console.log(JSON.stringify({type:'complete',summary:report.summary,equalPlacementComparisons:report.equalPlacementComparisons,byQuality:report.byQuality}));
