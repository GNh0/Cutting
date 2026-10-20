const row=(id,w,h,qty,extra={})=>({id,w,h,qty,label:id,material:'',grain:'none',enabled:true,rotate:true,edges:{},...extra});
const p=(id,parts,stocks,extra={})=>({id,version:1,name:id,unit:'mm',parts,stocks,settings:{kerf:0,trim:0,rotate:true,material:false,grain:false,single:false,quality:'thorough',priority:'area',...extra}});
export const referenceCases=[
  p('01_exact_grid',[row('square',500,500,4)],[row('stock',1000,1000,4)]),
  p('02_kerf_boundary',[row('square',500,500,4)],[row('stock',1000,1000,4)],{kerf:3}),
  p('03_rotation',[row('panel',900,600,2)],[row('stock',600,900,2)],{kerf:3}),
  p('04_grain_lock',[row('panel',900,600,2,{grain:'x'})],[row('stock',600,900,2,{grain:'x'})],{kerf:3,grain:true}),
  p('05_materials',[row('oak',500,300,2,{material:'Oak'}),row('birch',500,300,2,{material:'Birch'})],[row('oak_stock',1000,600,1,{material:'Oak'}),row('birch_stock',1000,600,1,{material:'Birch'})],{kerf:3,material:true}),
  p('06_mixed_bookshelf',[row('side',800,300,2),row('shelf',564,300,4),row('top_bottom',600,320,2),row('back',764,564,1),row('support',564,80,2)],[row('stock',2440,1220,3)],{kerf:3}),
  p('07_mixed_cabinet',[row('a',1200,400,2),row('b',760,400,4),row('c',800,450,2),row('d',600,300,4)],[row('stock',2440,1220,5)],{kerf:3}),
  p('08_stock_shortage',[row('square',500,500,5)],[row('stock',1000,1000,1)]),
  p('09_different_stock',[row('large',900,600,2),row('small',400,300,4)],[row('large_stock',1220,2440,2),row('small_stock',1000,600,2)],{kerf:3}),
  p('10_decimal',[row('decimal',100.5,50.25,6)],[row('stock',305,155,1)],{kerf:1.5})
];
