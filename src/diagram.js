export function dimensionGeometry(sheet,region) {
  return {
    horizontal:{x1:region.x,x2:region.x+region.w,y:sheet.y+sheet.h+23,labelX:region.x+region.w/2,labelY:sheet.y+sheet.h+39},
    vertical:{y1:region.y,y2:region.y+region.h,x:sheet.x+sheet.w+23,labelX:sheet.x+sheet.w+39,labelY:region.y+region.h/2}
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
