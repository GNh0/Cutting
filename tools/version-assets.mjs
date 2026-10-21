import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['index.html','styles.css',...(await fs.readdir('src')).filter(f=>f.endsWith('.js')).sort().map(f=>'src/'+f)];
// Ignore the previous release key when calculating the next graph-wide key.
const normalize=s=>s.replace(/\r\n/g,'\n').replace(/(\.\/(?:[\w-]+\/)*[\w-]+\.(?:js|css))\?v=[\w-]+/g,'$1');
const sources=new Map(),hash=createHash('sha256');
for(const file of files){const source=normalize(await fs.readFile(file,'utf8'));sources.set(file,source);hash.update(file+'\0'+source+'\0');}
const revision=hash.digest('hex').slice(0,12),changed=[];
for(const [file,source]of sources){
  const next=file==='index.html'?source.replace(/((?:src|href)="\.\/(?:src\/app\.js|styles\.css))"/g,`$1?v=${revision}"`):file.endsWith('.js')?source.replace(/(['"])(\.\/[\w-]+\.js)\1/g,`$1$2?v=${revision}$1`):source;
  if(next!==await fs.readFile(file,'utf8')){changed.push(file);if(!process.argv.includes('--check'))await fs.writeFile(file,next);}
}
if(process.argv.includes('--check')&&changed.length)throw new Error('Asset versions are stale. Run npm run version-assets: '+changed.join(', '));
console.log(JSON.stringify({revision,changed:process.argv.includes('--check')?[]:changed}));
