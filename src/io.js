import { validateProject, LIMIT } from './optimizer.js?v=0335af4f5072';
import {upgradeProject} from './materials.js?v=0335af4f5072';
export function parseDelimited(text) {
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/)[0];
  const delimiter=first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':',';
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(s=>s.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다.');
  row.push(cell); if(row.some(s=>s.trim()))rows.push(row);
  return rows;
}
const aliases={w:['가로','길이','length','width','w'],h:['세로','폭','height','h'],qty:['수량','qty','quantity','count'],label:['이름','라벨','label','name'],material:['재질','material'],thickness:['두께','두께(mm)','thickness'],manufacturer:['제조사','manufacturer','maker'],lot:['lot','로트','lot번호'],grain:['결','결 방향','grain','orientation'],rotate:['회전','rotate'],enabled:['사용','enabled'],top:['상','top band'],bottom:['하','bottom band'],left:['좌','left band'],right:['우','right band']};
export function importRows(text,unitFactor=1) {
  const parsed=parseDelimited(text); if(!parsed.length) throw new Error('가져올 데이터가 없습니다.');
  const header=parsed[0].map(s=>s.trim().toLowerCase());
  const hasHeader=header.some(s=>aliases.w.includes(s));
  const columns=hasHeader?Object.fromEntries(Object.entries(aliases).map(([k,values])=>[k,header.findIndex(s=>values.includes(s))])):{w:0,h:1,qty:2,label:3,material:4,grain:5};
  // Original CLO uses Length=height and Width=width; preserve its named CSV convention.
  if(hasHeader&&header.includes('length')&&header.includes('width')) {columns.w=header.indexOf('length');columns.h=header.indexOf('width');}
  if(columns.w<0||columns.h<0) throw new Error('가로와 세로 열이 필요합니다.');
  const data=parsed.slice(hasHeader?1:0); if(data.length>LIMIT)throw new Error(`최대 ${LIMIT}행까지 가져올 수 있습니다.`);
  return data.map((cells,i)=>{
    const get=k=>columns[k]>=0?(cells[columns[k]]||'').trim():'';
    const num=k=>Number(get(k));
    const grain=get('grain').toLowerCase();
    const w=num('w')*unitFactor,h=num('h')*unitFactor,qty=get('qty')?num('qty'):1,thickness=get('thickness')?num('thickness')*unitFactor:null;
    if(thickness!==null&&(!Number.isFinite(thickness)||thickness<=0||thickness>1000000))throw new Error(`${i+1}행: 두께가 올바르지 않습니다.`);
    if(![w,h].every(n=>Number.isFinite(n)&&n>0&&n<=1000000))throw new Error(`${i+1}행: 가로·세로는 0 초과, 1,000,000 mm 이하의 숫자이어야 합니다.`);
    if(!Number.isInteger(qty)||qty<1||qty>LIMIT)throw new Error(`${i+1}행: 수량은 1~${LIMIT}의 정수이어야 합니다.`);
    return {id:crypto.randomUUID(),w,h,qty,label:get('label')||`부재 ${i+1}`,material:get('material'),thickness,manufacturer:get('manufacturer'),lot:get('lot'),grain:['x','가로','horizontal','1'].includes(grain)?'x':['y','세로','vertical','2'].includes(grain)?'y':'none',rotate:!['false','0','아니오'].includes(get('rotate').toLowerCase()),enabled:!['false','0','아니오'].includes(get('enabled').toLowerCase()),edges:Object.fromEntries(['top','bottom','left','right'].map(k=>[k,Boolean(get(k))&&!['false','0'].includes(get(k))]))};
  });
}
export function csv(rows,factor=1) {
  const safe=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[['가로','세로','수량','이름','재질','결','회전','사용','상','하','좌','우','두께','제조사','LOT'],...rows.map(r=>[r.w/factor,r.h/factor,r.qty,r.label,r.material,r.grain,r.rotate!==false,r.enabled!==false,...['top','bottom','left','right'].map(k=>r.edges?.[k]?'1':''),r.thickness==null?'':r.thickness/factor,r.manufacturer??'',r.lot??''])].map(r=>r.map(safe).join(',')).join('\r\n');
}
export function readProject(text) {
  const p=upgradeProject(JSON.parse(text));
  if(p.version!==1)throw new Error('지원하지 않는 프로젝트 버전입니다.');
  const errors=validateProject(p,{allowIncomplete:true});if(errors.length)throw new Error(errors.join('\n'));
  return p;
}
