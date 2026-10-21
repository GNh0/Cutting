import { optimize } from './optimizer.js?v=28666b9e0a48';
self.onmessage=({data})=>{
  try { const result=optimize(data,percent=>self.postMessage({type:'progress',percent})); self.postMessage({type:'done',result}); }
  catch(e) { self.postMessage({type:'error',message:e.message}); }
};
