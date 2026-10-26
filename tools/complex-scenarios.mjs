import {createHash} from 'node:crypto';
export function complexScenario(index,{largeQuantities=true}={}){
  let seed=Math.imul(index+1,2654435761)>>>0;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},int=(a,b)=>a+Math.floor(rnd()*(b-a+1));
  const groups=[{thickness:18,material:'합판',manufacturer:'A사',lot:'L01'},{thickness:18,material:'합판',manufacturer:'A사',lot:'L02'},{thickness:12,material:'MDF',manufacturer:'',lot:''}];
  if(index%2)groups.push({thickness:24,material:'집성목',manufacturer:'B사',lot:index%3?'B01':''});
  const parts=[],stocks=[];const make=(id,g,extra)=>({id,label:id,qty:1,grain:'none',rotate:true,enabled:true,edges:{},...g,...extra});
  groups.forEach((g,j)=>{
    const types=int(8,12);
    for(let i=0;i<types;i++)parts.push(make(`p${j}-${i}`,g,{w:int(80,1100)+int(0,9)/10,h:int(70,780)+int(0,9)/10,qty:int(1,4),grain:['none','x','y'][int(0,2)],rotate:rnd()>.18}));
    for(let i=0;i<3;i++)stocks.push(make(`s${j}-${i}`,g,{w:int(1000,3000)+int(0,9)/10,h:int(800,1850)+int(0,9)/10,qty:j===2?1:int(1,4),grain:i===0?'none':['x','y'][int(0,1)]}));
  });
  if(largeQuantities&&index%10<3){const target=index%10===0?1000:int(250,850),weights=parts.map(()=>rnd()+.1),total=weights.reduce((n,w)=>n+w,0);let assigned=0;parts.forEach((p,i)=>{p.qty=1+Math.floor((target-parts.length)*weights[i]/total);assigned+=p.qty;});for(let i=0;assigned<target;i++,assigned++)parts[i%parts.length].qty++;if(index%4!==0)stocks.forEach(s=>s.qty=int(5,15));}
  return {version:1,id:`complex-${index}`,name:'복합 재고 검증',unit:'mm',parts,stocks,settings:{kerf:[.8,1.5,2.4,3,3.2,4.5,5][int(0,6)],trim:[0,2.5,5,10][int(0,3)],rotate:rnd()>.15,material:true,grain:true,single:index%13===0,quality:'balanced',priority:['area','area','cuts','remnant'][index%4],minRemnant:[60,80,100,150][int(0,3)]}};
}
export function physicalSignature(p){
  const rows=list=>{const sums=new Map();for(const r of list){if(r.enabled===false)continue;const key=JSON.stringify([r.w,r.h,r.thickness??18,r.material.trim(),r.manufacturer?.trim()||'',r.lot?.trim()||'',r.grain,r.rotate!==false]);sums.set(key,(sums.get(key)||0)+r.qty);}return [...sums].sort((a,b)=>a[0].localeCompare(b[0]));};
  const s=p.settings,body={parts:rows(p.parts),stocks:rows(p.stocks),settings:{kerf:s.kerf,trim:s.trim,rotate:s.rotate,grain:s.grain,single:s.single,priority:s.priority,minRemnant:s.minRemnant??100}};
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
