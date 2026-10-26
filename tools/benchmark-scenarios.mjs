const BASE={kerf:3,trim:0,rotate:true,material:false,grain:false,single:false,quality:'thorough',priority:'area',minRemnant:100};
export const families=['exact-grid','repeated-strip','mixed-cabinet','mixed-stock','limited-stock','grain-material','decimal-kerf','long-thin'];
export function scenario(index,split='train'){
  let seed=((index+1)*2654435761+(split==='acceptance'?355190465:split==='holdout'?97173211:127807))>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const int=(a,b)=>a+Math.floor(random()*(b-a+1));
  const make=(id,w,h,qty,extra={})=>({id,label:id,w,h,qty,thickness:18,manufacturer:'',lot:'',material:'A',grain:'none',rotate:true,enabled:true,edges:{},...extra});
  const family=index%families.length;let parts=[],stocks=[],settings={...BASE};
  const kerfs=[0,1,2,3,4,5];settings.kerf=kerfs[int(0,kerfs.length-1)];
  if(family===0){const w=int(4,16)*25,h=int(3,14)*25,cols=int(2,5),rows=int(2,5);parts=[make('p0',w,h,int(2,rows*cols*2))];stocks=[make('s0',w*cols+settings.kerf*(cols-1),h*rows+settings.kerf*(rows-1),3)];}
  if(family===1){const common=int(2,9)*80;parts=Array.from({length:int(4,9)},(_,i)=>make('p'+i,common,int(1,12)*70,int(1,4)));parts.push(make('extra',int(3,9)*100,int(1,4)*100,int(1,3)));stocks=[make('s0',[2440,2800,3050][int(0,2)],[1220,1525,1830][int(0,2)],5)];}
  if(family===2){parts=Array.from({length:int(4,10)},(_,i)=>make('p'+i,int(2,16)*80,int(1,8)*70,int(1,4)));stocks=[make('s0',[2440,2800,3050][int(0,2)],[1220,1525][int(0,1)],8)];}
  if(family===3){parts=Array.from({length:int(4,8)},(_,i)=>make('p'+i,int(1,9)*100,int(1,7)*100,int(1,3)));stocks=[make('s0',2440,1220,int(1,4)),make('s1',1220,610,int(1,4)),make('s2',int(6,14)*100,int(4,10)*100,int(1,3))];}
  if(family===4){parts=Array.from({length:int(4,9)},(_,i)=>make('p'+i,int(2,13)*100,int(1,8)*80,int(1,4)));stocks=[make('s0',2440,1220,int(1,2))];settings.single=random()<.25;}
  if(family===5){parts=Array.from({length:int(4,9)},(_,i)=>make('p'+i,int(1,12)*100,int(1,7)*80,int(1,3),{material:random()<.5?'A':'B',grain:['none','x','y'][int(0,2)],rotate:random()>.12}));stocks=[make('sA',2440,1220,int(1,3),{grain:'x'}),make('sB',2440,1220,int(1,3),{material:'B',grain:random()<.5?'x':'y'})];settings.material=true;settings.grain=true;}
  if(family===6){settings.kerf=[.5,1.5,2.4,3.2][int(0,3)];settings.trim=[0,2.5,5][int(0,2)];parts=Array.from({length:int(3,8)},(_,i)=>make('p'+i,int(10,100)*5.25,int(10,80)*4.75,int(1,3)));stocks=[make('s0',1220.5,810.25,int(2,5))];}
  if(family===7){parts=Array.from({length:int(3,9)},(_,i)=>make('p'+i,int(5,24)*100,int(1,8)*15,int(1,4)));stocks=[make('s0',2440,1220,int(2,5))];}
  return {version:1,id:`${split}-${index}`,name:`${families[family]}-${index}`,unit:'mm',family:families[family],parts,stocks,settings};
}
export function objective(r){return [r.unplaced.length,r.unplaced.reduce((n,p)=>n+p.w*p.h,0),r.stockArea,-(r.reusableArea+.1*r.largestRemnant),r.cutCount,r.cutLength];}
export function compare(a,b){const x=objective(a),y=objective(b);for(let i=0;i<x.length;i++)if(Math.abs(x[i]-y[i])>1e-6)return x[i]<y[i]?-1:1;return 0;}
