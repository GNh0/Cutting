import {referenceCases} from './reference-cases.mjs';
// Reproduce the screenshot's five 320-wide columns and the side/back column.
export function screenshotBin(){
  const stock={id:'s',label:'원판',w:2440,h:1220,qty:1,thickness:18,material:'합판',manufacturer:'',lot:'',grain:'none',enabled:true},parts=[],cuts=[],free=[];
  const add=(label,w,h,x,y)=>{const i=parts.length,p={...stock,id:'p'+i,label,qty:1,w,h,x,y,originalW:w,originalH:h,instance:'p'+i+':1'};parts.push(p);return p.instance;};
  for(let i=0;i<5;i++){const x=i*323,one=add('상·하판',320,600,x,0),two=add('상·하판',320,600,x,603);cuts.push({axis:'x',x:x+320,y:0,length:1220,kerf:3,partInstance:one},{axis:'y',x,y:600,length:320,kerf:3,partInstance:one},{axis:'y',x,y:1203,length:320,kerf:3,partInstance:two});free.push({x,y:1206,w:320,h:14});}
  for(const [w,h,y,label]of [[800,300,0,'측판'],[800,300,303,'측판'],[764,564,606,'뒷판']]){const id=add(label,w,h,1615,y);cuts.push({axis:'y',x:1615,y:y+h,length:825,kerf:3,partInstance:id},{axis:'x',x:1615+w,y,length:h,kerf:3,partInstance:id});free.push({x:1615+w+3,y,w:825-w-3,h});}
  free.push({x:1615,y:1173,w:825,h:47});return {stock,parts,cuts,free};
}

export function user1610Project(){
  const p=structuredClone(referenceCases[5]);
  p.parts.forEach((r,i)=>r.id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
  p.stocks[0].enabled=false;
  p.stocks.push({...p.stocks[0],id:'active',label:'원판 2',enabled:true,w:1610,h:610,qty:1,manufacturer:'123123123'});
  p.settings.minRemnant=100;return p;
}
// The eight cuts read from the user's Chrome page before this patch.
export const oldBrowserCuts=[['x',163,0,610],['x',1533,0,610],['y',0,564,163],['y',166,603,1367],['x',80,0,564],['x',966,0,603],['y',166,300,800],['y',969,300,564]].map(([axis,x,y,length])=>({axis,x,y,length,kerf:3}));
