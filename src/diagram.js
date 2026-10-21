export function dimensionGeometry(sheet,region,{pointer,bounds={x:sheet.x-64,y:sheet.y-64,w:sheet.w+128,h:sheet.h+128},horizontalLabelWidth=60,verticalLabelWidth=60,previous={}}={}) {
  const clamp=(n,min,max)=>min<=max?Math.max(min,Math.min(n,max)):(min+max)/2,pad=8,fontHalf=7;
  const right=bounds.x+bounds.w,bottom=bounds.y+bounds.h;
  function choose(candidates,halfW,halfH,prior){
    const score=c=>{
      const overflow=Math.max(0,bounds.x+pad+halfW-c.labelX)+Math.max(0,c.labelX+halfW+pad-right)+Math.max(0,bounds.y+pad+halfH-c.labelY)+Math.max(0,c.labelY+halfH+pad-bottom);
      const cursor=pointer?Math.max(0,80-Math.hypot(c.labelX-pointer.x,c.labelY-pointer.y))/80*.45:0;
      return (overflow>0?1000+overflow:0)+c.distance+cursor-(prior===c.side?0.07:0);
    };
    const selected=candidates.reduce((a,b)=>score(b)<score(a)?b:a);
    return {...selected,labelX:clamp(selected.labelX,bounds.x+pad+halfW,right-pad-halfW),labelY:clamp(selected.labelY,bounds.y+pad+halfH,bottom-pad-halfH)};
  }
  // Keep annotations outside the stock whenever visible; choose the closest edge.
  const h=choose([
    {side:'bottom',y:sheet.y+sheet.h+23,labelX:region.x+region.w/2,labelY:sheet.y+sheet.h+39,distance:Math.max(0,sheet.y+sheet.h-region.y-region.h)/sheet.h},
    {side:'top',y:sheet.y-23,labelX:region.x+region.w/2,labelY:sheet.y-39,distance:Math.max(0,region.y-sheet.y)/sheet.h}
  ],horizontalLabelWidth/2,fontHalf,previous.horizontal);
  const v=choose([
    {side:'right',x:sheet.x+sheet.w+23,labelX:sheet.x+sheet.w+39,labelY:region.y+region.h/2,distance:Math.max(0,sheet.x+sheet.w-region.x-region.w)/sheet.w},
    {side:'left',x:sheet.x-23,labelX:sheet.x-39,labelY:region.y+region.h/2,distance:Math.max(0,region.x-sheet.x)/sheet.w}
  ],fontHalf,verticalLabelWidth/2,previous.vertical);
  // A zoomed or scrolled board can hide both outer edges. Keep labels and rails
  // inside the visible area in that case, without changing the measured endpoints.
  h.y=clamp(h.y,bounds.y+pad+(h.side==='top'?fontHalf+16:0),bottom-pad-(h.side==='bottom'?fontHalf+16:0));
  h.labelY=h.y+(h.side==='top'?-16:16);
  v.x=clamp(v.x,bounds.x+pad+(v.side==='left'?fontHalf+16:0),right-pad-(v.side==='right'?fontHalf+16:0));
  v.labelX=v.x+(v.side==='left'?-16:16);
  return {
    horizontal:{side:h.side,x1:region.x,x2:region.x+region.w,y:h.y,labelX:h.labelX,labelY:h.labelY},
    vertical:{side:v.side,y1:region.y,y2:region.y+region.h,x:v.x,labelX:v.labelX,labelY:v.labelY,rotation:v.side==='left'?-90:90}
  };
}
export function rotateBinForView(bin){
  const mapRect=r=>({...r,x:r.y,y:bin.stock.w-r.x-r.w,w:r.h,h:r.w});
  const flip=g=>g==='x'?'y':g==='y'?'x':'none';
  return {...bin,stock:{...bin.stock,w:bin.stock.h,h:bin.stock.w,grain:flip(bin.stock.grain)},free:bin.free.map(mapRect),parts:bin.parts.map(p=>{
    let e=p.edges||{};if(p.rotated)e={top:e.left,right:e.top,bottom:e.right,left:e.bottom};
    const grain=p.rotated?flip(p.grain):p.grain;
    return {...mapRect(p),edges:{top:e.right,right:e.bottom,bottom:e.left,left:e.top},edgesInDisplayCoordinates:true,displayGrain:flip(grain)};
  }),cuts:bin.cuts.map(c=>c.axis==='x'?{...c,axis:'y',x:c.y,y:bin.stock.w-c.x-c.kerf/2}:{...c,axis:'x',x:c.y+c.kerf/2,y:bin.stock.w-c.x-c.length})};
}
