// Travel uses the original sheet coordinates and the displayed -> / down strokes.
// It does not estimate time spent moving or rotating detached workpieces.
const EPS=1e-7;
// Cut counts are fixed here. Minimize approach distance, then direction changes.
const compare=(a,b)=>(Math.abs(a.distance-b.distance)>EPS?a.distance-b.distance:0)||a.turns-b.turns;
const end=c=>c.axis==='x'?{x:c.x,y:c.y+c.length}:{x:c.x+c.length,y:c.y};
export function cutMotion(cuts,origin={x:0,y:0}){
  let at=origin,axis=null,turns=0,distance=0,cutLength=0;
  for(const c of cuts){if(axis&&axis!==c.axis)turns++;distance+=Math.hypot(c.x-at.x,c.y-at.y);cutLength+=c.length;at=end(c);axis=c.axis;}
  return {turns,distance,cutLength,totalDistance:distance+cutLength};
}
function flatten(tree,parent=-1,nodes=[]){if(!tree)return nodes;const i=nodes.length;nodes.push({cut:tree.cut,parent,children:[]});for(const child of [tree.first,tree.second])if(child){nodes[i].children.push(nodes.length);flatten(child,i,nodes);}return nodes;}
function legacyOrder(tree){
  const ready=tree?[tree]:[],cuts=[];let previous=null;
  while(ready.length){
    const sameDirection=c=>previous&&c.axis===previous.axis;
    const sameBand=c=>sameDirection(c)&&Math.abs(c[c.axis==='x'?'y':'x']-previous[c.axis==='x'?'y':'x'])<EPS&&Math.abs(c.length-previous.length)<EPS;
    ready.sort((a,b)=>Number(sameDirection(b.cut))-Number(sameDirection(a.cut))||Number(sameBand(b.cut))-Number(sameBand(a.cut))||a.cut.axis.localeCompare(b.cut.axis)||a.cut[a.cut.axis==='x'?'y':'x']-b.cut[b.cut.axis==='x'?'y':'x']||a.cut[a.cut.axis]-b.cut[b.cut.axis]);
    const node=ready.shift();cuts.push(node.cut);previous=node.cut;if(node.first)ready.push(node.first);if(node.second)ready.push(node.second);
  }return cuts;
}
export function scheduleCutTree(tree,origin={x:0,y:0},{maxStates=20000,beamWidth=24}={}){
  const nodes=flatten(tree),baseline=legacyOrder(tree),n=nodes.length;
  if(!n)return {cuts:[],...cutMotion([],origin),exact:true,states:0};
  const add=(last,i)=>{const c=nodes[i].cut,previous=last<0?null:nodes[last].cut,at=previous?end(previous):origin;return {turns:Number(Boolean(previous&&previous.axis!==c.axis)),distance:Math.hypot(c.x-at.x,c.y-at.y)};};
  if(n<=12){
    const memo=new Map(),full=(1<<n)-1;let capped=false;
    function solve(mask,last){
      if(mask===full)return {turns:0,distance:0,path:[]};const key=mask+':'+last;if(memo.has(key))return memo.get(key);
      if(memo.size>=maxStates){capped=true;return null;}
      let best=null;memo.set(key,null);
      for(let i=0;i<n;i++){const bit=1<<i,p=nodes[i].parent;if(mask&bit||p>=0&&!(mask&(1<<p)))continue;
        const tail=solve(mask|bit,i);if(!tail)continue;const step=add(last,i),candidate={turns:step.turns+tail.turns,distance:step.distance+tail.distance,path:[i,...tail.path]};if(!best||compare(candidate,best)<0)best=candidate;
      }memo.set(key,best);return best;
    }
    const best=solve(0,-1);if(best&&!capped)return {cuts:best.path.map(i=>nodes[i].cut),turns:best.turns,distance:best.distance,exact:true,states:memo.size};
  }
  // Retain the previous schedule so a bounded search cannot worsen its objective.
  let best={cuts:baseline,...cutMotion(baseline,origin),exact:false},states=0;
  let beam=[{path:[],ready:[0],last:-1,turns:0,distance:0}];
  const width=n<=80?beamWidth:1;
  for(let depth=0;depth<n;depth++){
    const next=[];
    for(const state of beam)for(const i of state.ready){const step=add(state.last,i);next.push({path:[...state.path,i],ready:[...state.ready.filter(j=>j!==i),...nodes[i].children],last:i,turns:state.turns+step.turns,distance:state.distance+step.distance});states++;}
    next.sort(compare);const seen=new Set();beam=[];
    for(const state of next){const key=state.last+':'+[...state.ready].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);beam.push(state);if(beam.length>=width)break;}
  }
  for(const state of beam)if(compare(state,best)<0)best={cuts:state.path.map(i=>nodes[i].cut),turns:state.turns,distance:state.distance,exact:false};
  return {...best,states};
}
