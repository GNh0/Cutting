import {materialMatches} from '../src/materials.js';
const close=(a,b)=>Math.abs(a-b)<1e-5;
const require=(condition,message)=>{if(!condition)throw new Error(message);};
export function auditResult(result,project){
  const instances=new Set(),stockUse=new Map(),trim=project.settings.trim;
  let used=0;
  for(const bin of result.bins){
    stockUse.set(bin.stock.id,(stockUse.get(bin.stock.id)||0)+1);
    let fragments=[{x:trim,y:trim,w:bin.stock.w-2*trim,h:bin.stock.h-2*trim}];
    for(const c of bin.cuts){
      const i=fragments.findIndex(f=>c.axis==='x'?close(f.y,c.y)&&close(f.h,c.length)&&c.x>f.x&&c.x+c.kerf<=f.x+f.w+1e-5:close(f.x,c.x)&&close(f.w,c.length)&&c.y>f.y&&c.y+c.kerf<=f.y+f.h+1e-5);
      require(i>=0,'Cut does not span one physical fragment');const f=fragments.splice(i,1)[0];
      if(c.axis==='x')fragments.push({x:f.x,y:f.y,w:c.x-f.x,h:f.h},{x:c.x+c.kerf,y:f.y,w:f.x+f.w-c.x-c.kerf,h:f.h});
      else fragments.push({x:f.x,y:f.y,w:f.w,h:c.y-f.y},{x:f.x,y:c.y+c.kerf,w:f.w,h:f.y+f.h-c.y-c.kerf});
      fragments=fragments.filter(r=>r.w>1e-7&&r.h>1e-7);
    }
    const pieceCells=new Set();
    for(const p of bin.parts){
      require(!instances.has(p.instance),'Duplicate part');instances.add(p.instance);used+=p.w*p.h;
      const i=fragments.findIndex(f=>close(f.x,p.x)&&close(f.y,p.y)&&close(f.w,p.w)&&close(f.h,p.h));require(i>=0&&!pieceCells.has(i),'Part is not a unique physical final fragment');pieceCells.add(i);
      require(materialMatches(p,bin.stock),'Material requirement mismatch');
      if(project.settings.grain&&p.grain!=='none'&&bin.stock.grain!=='none')require((p.rotated?(p.grain==='x'?'y':'x'):p.grain)===bin.stock.grain,'Grain mismatch');
    }
    const area=fragments.reduce((n,f)=>n+f.w*f.h,0)+bin.cuts.reduce((n,c)=>n+c.length*c.kerf,0);require(close(area,(bin.stock.w-2*trim)*(bin.stock.h-2*trim)),'Area conservation failed');
  }
  for(const p of result.unplaced){require(!instances.has(p.instance),'Placed/unplaced duplicate');instances.add(p.instance);}
  for(const s of project.stocks)require((stockUse.get(s.id)||0)<=s.qty,'Inventory overrun');
  require(instances.size===project.parts.filter(p=>p.enabled!==false).reduce((n,p)=>n+p.qty,0),'Part count mismatch');
  require(close(used,result.usedArea),'Reported used area mismatch');
}
