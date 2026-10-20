import {parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
const {optimize}=await import(workerData.engineURL||new URL('../src/optimizer.js',import.meta.url));
import {scenario,compare,families} from './benchmark-scenarios.mjs';
import {auditResult} from './benchmark-audit.mjs';
import {createHash} from 'node:crypto';
const profiles=[{name:'baseline48',family:'current',budget:48,rankMode:'largest'},{name:'balanced48',family:'current',budget:48},{name:'guided48',family:'guided',budget:48},{name:'portfolio96',family:'portfolio',budget:96}];
const stats=Object.fromEntries(profiles.map(p=>[p.name,{runs:0,ms:0,unplaced:0,stockArea:0,reusableArea:0,largestRemnant:0,cuts:0,cutLength:0,win:0,tie:0,loss:0,primaryWin:0,primaryLoss:0,byFamily:Object.fromEntries(families.map(f=>[f,{win:0,tie:0,loss:0}]))}]));
stats.hybrid240=structuredClone(stats.baseline48);
const disagreements=[];let completed=0,candidates=0;
const fingerprints=new Set();
const timings=Object.fromEntries([...profiles.map(p=>p.name),'hybrid240'].map(name=>[name,[]]));
for(let index=workerData.start;index<workerData.end;index++){
  const project=scenario(index,workerData.split);let baseline=null;const outcomes=[];
  fingerprints.add(createHash('sha256').update(JSON.stringify({parts:project.parts.map(p=>[p.w,p.h,p.qty,p.material,p.grain,p.rotate]),stocks:project.stocks.map(p=>[p.w,p.h,p.qty,p.material,p.grain]),settings:project.settings})).digest('hex'));
  for(const profile of profiles){
    const start=performance.now(),r=optimize(project,()=>{},profile),ms=performance.now()-start;
    auditResult(r,project);outcomes.push({name:profile.name,r,ms});
    timings[profile.name].push(ms);
    const st=stats[profile.name];st.runs++;st.ms+=ms;st.unplaced+=r.unplaced.length;st.stockArea+=r.stockArea;st.reusableArea+=r.reusableArea;st.largestRemnant+=r.largestRemnant;st.cuts+=r.cutCount;st.cutLength+=r.cutLength;
    if(!baseline)baseline=r;
    const c=compare(r,baseline),key=c<0?'win':c>0?'loss':'tie';st[key]++;st.byFamily[project.family][key]++;
    const primary=comparePrimary(r,baseline);
    if(primary<0)st.primaryWin++;if(primary>0)st.primaryLoss++;
    if(profile.name!=='baseline48'&&c!==0&&disagreements.length<24)disagreements.push({index,split:workerData.split,family:project.family,profile:profile.name,relation:key,baseline:{unplaced:baseline.unplaced.length,stockArea:baseline.stockArea,largest:baseline.largestRemnant,cuts:baseline.cutCount},candidate:{unplaced:r.unplaced.length,stockArea:r.stockArea,largest:r.largestRemnant,cuts:r.cutCount}});
    candidates+=profile.budget;
  }
  const retained=outcomes,chosen=retained.reduce((a,b)=>compare(a.r,b.r)<=0?a:b),r=chosen.r,st=stats.hybrid240;
  const c=compare(r,baseline),key=c<0?'win':c>0?'loss':'tie';st.runs++;st.ms+=retained.reduce((n,o)=>n+o.ms,0);st.unplaced+=r.unplaced.length;st.stockArea+=r.stockArea;st.reusableArea+=r.reusableArea;st.largestRemnant+=r.largestRemnant;st.cuts+=r.cutCount;st.cutLength+=r.cutLength;st[key]++;st.byFamily[project.family][key]++;
  timings.hybrid240.push(retained.reduce((n,o)=>n+o.ms,0));
  const primary=comparePrimary(r,baseline);if(primary<0)st.primaryWin++;if(primary>0)st.primaryLoss++;
  completed++;
  if(completed%250===0)parentPort.postMessage({type:'progress',completed,candidates});
}
parentPort.postMessage({type:'done',stats,disagreements,completed,candidates,timings,fingerprints:[...fingerprints]});
parentPort.close();
function comparePrimary(a,b){const rank=r=>[r.unplaced.length,r.unplaced.reduce((n,p)=>n+p.w*p.h,0),r.stockArea],x=rank(a),y=rank(b);for(let i=0;i<3;i++)if(Math.abs(x[i]-y[i])>1e-6)return x[i]<y[i]?-1:1;return 0;}
