import {optimize} from './optimizer.js?v=810122f1dba4';

export const CALCULATION_VERSIONS=Object.freeze([
  Object.freeze({id:'cutting-v1',name:'Cutting v1',description:'기존 Cutting 배치·절단 탐색을 그대로 사용합니다.',experimental:false}),
  Object.freeze({id:'smart2d-v1',name:'Smart2D 분석 v1 (실험)',description:'Smart2DCutting의 공개 방향·수준 계약을 참고한 독립 휴리스틱입니다. 원본 내부 계산식 복구나 결과 일치를 뜻하지 않습니다.',experimental:true}),
  Object.freeze({id:'combined-v3',name:'조화식 v3',description:'기존·분석 엔진과 입력 특성에 따라 결정트리로 분기하는 추가 탐색을 조합합니다. 자재 우선은 부재 충족도 → 이용률 → 폐기 로스 순으로 선택합니다.',experimental:false})
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
