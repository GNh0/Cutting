import {optimize} from './optimizer.js?v=7bcc27a0c011';

export const CALCULATION_VERSIONS=Object.freeze([
  Object.freeze({id:'cutting-v1',name:'Cutting v1',description:'기존 Cutting 배치·절단 탐색을 그대로 사용합니다.',experimental:false}),
  Object.freeze({id:'smart2d-v1',name:'Smart2D 배치 v2 (실험)',description:'설치본에서 확인한 면적 정렬·반복 배치·분할·잔재 병합 기준을 적용합니다. 원본 전체와의 동일 재현은 아직 검증되지 않았습니다.',experimental:true}),
  Object.freeze({id:'combined-v3',name:'조화식 v3',description:'1·2번을 같은 입력으로 계산하고 재고를 공유하는 그룹별로 완성 배치를 선택합니다. 자재 우선은 부재 충족도 → 이용률 → 폐기 로스 순으로 비교합니다.',experimental:false})
]);

export function resolveCalculationVersion(id){
  if(id===undefined)return CALCULATION_VERSIONS[0];
  const version=CALCULATION_VERSIONS.find(v=>v.id===id);
  if(!version)throw new Error(`지원하지 않는 계산식 버전입니다: ${String(id)}. 최적화 설정에서 사용할 계산식 버전을 선택하세요.`);
  return version;
}

export function optimizeVersion(project,onProgress){
  const version=resolveCalculationVersion(project.settings?.calculationVersion);
  const result=version.id==='cutting-v1'?optimize(project,onProgress):optimize(project,onProgress,{family:version.id==='combined-v3'?'combined':'smart2d'});
  return {...result,calculationVersion:{...version}};
}
