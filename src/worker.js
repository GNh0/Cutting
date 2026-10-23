import {optimizeVersion} from './calculation-versions.js?v=264c921d27a9';
self.onmessage=({data})=>{
  try { const result=optimizeVersion(data,percent=>self.postMessage({type:'progress',percent})); self.postMessage({type:'done',result}); }
  catch(e) { self.postMessage({type:'error',message:e.message}); }
};
