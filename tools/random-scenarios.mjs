// Each seed generates a new physical input before either engine runs.
export function randomScenario(seed){
  let state=Math.imul(seed+1,2654435761)>>>0;
  const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const int=(a,b)=>a+Math.floor(rnd()*(b-a+1)),pick=a=>a[int(0,a.length-1)],decimal=(a,b)=>int(a*10,b*10)/10;
  const groups=int(2,4),parts=[],stocks=[];
  const settings={kerf:decimal(.5,6),trim:decimal(0,15),minRemnant:decimal(40,220),rotate:rnd()<.88,grain:rnd()<.85,material:true,single:rnd()<.08,quality:'thorough',priority:'area'};
  const stress=rnd()<.12,shortage=rnd()<.22;
  const make=(id,identity,extra)=>({id,label:id,enabled:true,rotate:true,grain:'none',edges:{},...identity,...extra});
  for(let g=0;g<groups;g++){
    const identity={thickness:decimal(6,30),material:`${pick(['합판','MDF','집성목','파티클보드'])}-${g}`,manufacturer:`제조사-${int(1,9)}`,lot:`LOT-${int(1,9999)}`};
    const groupStocks=[];
    for(let j=0,n=int(2,5);j<n;j++){
      const stock=make(`s${g}-${j}`,identity,{w:decimal(850,3200),h:decimal(600,2100),qty:int(1,5),grain:pick(['none','none','x','y']),lot:j%2?`LOT-${int(1,9999)}`:identity.lot});
      stocks.push(stock);groupStocks.push(stock);
    }
    let demand=0;
    for(let j=0,n=int(6,12);j<n;j++){
      const reference=pick(groupStocks),part=make(`p${g}-${j}`,identity,{w:Math.round(reference.w*decimal(.1,.7)*10)/10,h:Math.round(reference.h*decimal(.1,.7)*10)/10,qty:stress?int(5,16):int(1,6),grain:pick(['none','x','y']),rotate:rnd()<.78,lot:reference.lot});
      if(rnd()<.4)part.lot='';
      if(rnd()<.2){part.manufacturer='';part.lot='';}
      parts.push(part);demand+=part.w*part.h*part.qty;
    }
    // Supply and intended shortages depend only on generated demand and RNG.
    const supply=groupStocks.reduce((n,s)=>n+s.w*s.h*s.qty,0);
    const factor=demand/supply*(shortage?decimal(.55,.9):decimal(1.7,2.5));
    for(const s of groupStocks)s.qty=Math.max(1,Math.ceil(s.qty*factor));
  }
  return {version:1,id:`random-${seed}`,name:`무작위 복합 작업 ${seed}`,unit:'mm',parts,stocks,settings,benchmarkDesign:{seed,stress,shortage}};
}
