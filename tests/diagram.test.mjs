import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionGeometry,rotateBinForView} from '../src/diagram.js';
test('part and remnant dimensions use the nearest outside stock edges',()=>{
  const sheet={x:50,y:80,w:700,h:350},g=dimensionGeometry(sheet,{x:100,y:180,w:160,h:90});
  assert.deepEqual(g.horizontal,{side:'top',x1:100,x2:260,y:57,labelX:180,labelY:41});
  assert.deepEqual(g.vertical,{side:'left',y1:180,y2:270,x:27,labelX:11,labelY:225,rotation:-90});
  for(const [x,y,horizontal,vertical]of [[60,90,'top','left'],[660,90,'top','right'],[60,370,'bottom','left'],[660,370,'bottom','right']]){
    const region={x,y,w:80,h:40},result=dimensionGeometry(sheet,region);
    assert.equal(result.horizontal.side,horizontal);assert.equal(result.vertical.side,vertical);
    assert.equal(result.horizontal.x2-result.horizontal.x1,80);assert.equal(result.vertical.y2-result.vertical.y1,40);
  }
});
test('the cursor selects the other side of a large part without changing its dimensions',()=>{
  const sheet={x:50,y:80,w:700,h:350};
  assert.equal(dimensionGeometry(sheet,sheet,{pointer:{x:400,y:80}}).horizontal.side,'bottom');
  assert.equal(dimensionGeometry(sheet,sheet,{pointer:{x:400,y:430}}).horizontal.side,'top');
  assert.equal(dimensionGeometry(sheet,sheet,{pointer:{x:50,y:255}}).vertical.side,'right');
  assert.equal(dimensionGeometry(sheet,sheet,{pointer:{x:750,y:255}}).vertical.side,'left');
});
test('zoomed and scrolled views keep labels visible and retain the physical endpoints',()=>{
  const bounds={x:100,y:150,w:400,h:200},region={x:120,y:160,w:120,h:80};
  const g=dimensionGeometry({x:50,y:80,w:700,h:350},region,{bounds});
  assert.ok(g.horizontal.labelX-30>=bounds.x+8);assert.ok(g.horizontal.labelX+30<=bounds.x+bounds.w-8);
  assert.ok(g.horizontal.labelY-7>=bounds.y+8);assert.ok(g.horizontal.labelY+7<=bounds.y+bounds.h-8);
  assert.ok(g.vertical.labelX-7>=bounds.x+8);assert.ok(g.vertical.labelX+7<=bounds.x+bounds.w-8);
  assert.ok(g.vertical.labelY-30>=bounds.y+8);assert.ok(g.vertical.labelY+30<=bounds.y+bounds.h-8);
  assert.deepEqual([g.horizontal.x1,g.horizontal.x2,g.vertical.y1,g.vertical.y2],[120,240,160,240]);
});
test('a previous side is retained around equal scores to avoid pointer jitter',()=>{
  const sheet={x:50,y:80,w:700,h:350},g=dimensionGeometry(sheet,sheet,{pointer:{x:400,y:255},previous:{horizontal:'top',vertical:'left'}});
  assert.equal(g.horizontal.side,'top');assert.equal(g.vertical.side,'left');
});
test('portrait view transforms stock, part, remnant and banding together without changing physical input',()=>{const bin={stock:{w:2440,h:1220,grain:'x'},parts:[{x:0,y:0,w:764,h:564,grain:'x',rotated:false,edges:{top:true},instance:'a'}],free:[{x:1406,y:567,w:1034,h:653}],cuts:[]};const view=rotateBinForView(bin);assert.equal(view.stock.w,1220);assert.equal(view.stock.h,2440);assert.deepEqual([view.parts[0].x,view.parts[0].y,view.parts[0].w,view.parts[0].h],[0,1676,564,764]);assert.equal(view.parts[0].edges.left,true);assert.deepEqual([view.free[0].x,view.free[0].y,view.free[0].w,view.free[0].h],[567,0,653,1034]);assert.equal(bin.stock.w,2440);});
