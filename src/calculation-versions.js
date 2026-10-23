import {optimize} from './optimizer.js?v=45e601b7291f';

export const CALCULATION_VERSIONS=Object.freeze([
  Object.freeze({id:'cutting-v1',name:'Cutting v1',description:'기존 Cutting 배치·절단 탐색을 그대로 사용합니다.',experimental:false}),
  Object.freeze({id:'smart2d-v1',name:'Smart2D 배치 v2 (실험)',description:'설치본에서 확인한 면적 정렬·반복 배치·분할·잔재 병합 기준을 적용합니다. 원본 전체와의 동일 재현은 아직 검증되지 않았습니다.',experimental:true}),
  Object.freeze({id:'combined-v3',name:'결정트리 v3',description:'부재·배치 위치·회전·분할 방향을 직접 분기하는 독립 배치 탐색입니다. 자재 우선은 부재 충족도 → 이용률 → 폐기 로스 순으로 비교합니다.',experimental:false})
]);

export function resolveCalculationVersion(id){
  if(id===undefined)return CALCULATION_VERSIONS[0];
  const version=CALCULATION_VERSIONS.find(v=>v.id===id);
  if(!version)throw new Error(`지원하지 않는 계산식 버전입니다: ${String(id)}. 최적화 설정에서 사용할 계산식 버전을 선택하세요.`);
  return version;
}

export function optimizeVersion(project,onProgress){
  const version=resolveCalculationVersion(project.settings?.calculationVersion);
  const result=version.id==='cutting-v1'?optimize(project,onProgress):optimize(project,onProgress,{family:version.id==='combined-v3'?'tree':'smart2d'});
  return {...result,calculationVersion:{...version}};
}
