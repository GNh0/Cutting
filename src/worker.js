import { optimize } from './optimizer.js?v=0335af4f5072';
self.onmessage=({data})=>{
  try { const result=optimize(data,percent=>self.postMessage({type:'progress',percent})); self.postMessage({type:'done',result}); }
  catch(e) { self.postMessage({type:'error',message:e.message}); }
};
