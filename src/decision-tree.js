// A deterministic rule tree guides an additional physical packing search.
// Thresholds are explicit engineering rules, not a trained statistical model.
const leaf=(id,family,rankMode)=>Object.freeze({id,family,rankMode});
const branch=(feature,threshold,yes,no)=>Object.freeze({feature,threshold,yes,no});
export const SEARCH_TREE=branch('narrowShare',.3,
  leaf('narrow-parts','current','largest'),
  branch('constrainedShare',.5,
    leaf('constrained-parts','guided','largest'),
    branch('repeatedEdgeShare',.35,
      leaf('shared-edges','portfolio','largest'),
      branch('stockSizeCount',3,
        leaf('mixed-stock','guided','largest'),
        leaf('general','guided','balanced')))));

export function selectSearchProfile(project,baseBudget){
  const parts=project.parts.filter(p=>p.enabled!==false),stocks=project.stocks.filter(s=>s.enabled!==false);
  const total=parts.reduce((n,p)=>n+p.qty,0),edges=new Map();
  for(const p of parts)for(const edge of new Set([p.w,p.h]))edges.set(edge,(edges.get(edge)||0)+1);
  const share=predicate=>total?parts.reduce((n,p)=>n+(predicate(p)?p.qty:0),0)/total:0;
  const features={
    narrowShare:share(p=>Math.min(p.w,p.h)/Math.max(p.w,p.h)<=.22),
    constrainedShare:share(p=>!project.settings.rotate||p.rotate===false||(project.settings.grain&&p.grain!=='none'&&stocks.some(s=>s.grain!=='none'))),
    repeatedEdgeShare:parts.length?parts.filter(p=>edges.get(p.w)>1||edges.get(p.h)>1).length/parts.length:0,
    stockSizeCount:new Set(stocks.map(s=>JSON.stringify([s.w,s.h]))).size
  };
  const path=[];let node=SEARCH_TREE;
  while(node.feature){const value=features[node.feature],yes=value>=node.threshold;path.push({feature:node.feature,value,threshold:node.threshold,branch:yes?'yes':'no'});node=yes?node.yes:node.no;}
  return {...node,budget:baseBudget*2,features,path};
}
