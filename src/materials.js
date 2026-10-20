export const materialInfo=r=>({thickness:r.thickness??null,material:(r.material??'').trim(),manufacturer:(r.manufacturer??'').trim(),lot:(r.lot??'').trim()});
export const materialKey=r=>{const g=materialInfo(r);return JSON.stringify([g.thickness,g.material,g.manufacturer,g.lot]);};
export function materialLabel(r,formatThickness=v=>`${v} mm`){const g=materialInfo(r);return `${g.thickness>0?formatThickness(g.thickness):'두께 미입력'} · ${g.material||'재질 미입력'} · 제조사 ${g.manufacturer||'미입력'} · LOT ${g.lot||'미입력'}`;}
export function materialGroups(rows){const groups=new Map();rows.forEach((r,index)=>{const key=materialKey(r);if(!groups.has(key))groups.set(key,{key,...materialInfo(r),rows:[]});groups.get(key).rows.push({row:r,index});});return [...groups.values()];}
// Missing legacy fields stay incomplete for editing, never infer a stock identity.
export function upgradeProject(p){return {...p,settings:{...p.settings,material:true},parts:p.parts.map(r=>({...r,thickness:r.thickness??null,manufacturer:r.manufacturer??'',lot:r.lot??''})),stocks:p.stocks.map(r=>({...r,thickness:r.thickness??null,manufacturer:r.manufacturer??'',lot:r.lot??''}))};}
