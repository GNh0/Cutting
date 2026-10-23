import {optimize} from './optimizer.js?v=264c921d27a9';

export const CALCULATION_VERSIONS=Object.freeze([
  Object.freeze({id:'cutting-v1',name:'Cutting v1',description:'기존 Cutting 배치·절단 탐색을 그대로 사용합니다.',experimental:false}),
  Object.freeze({id:'smart2d-v1',name:'Smart2D 분석 v1 (실험)',description:'Smart2DCutting의 공개 방향·수준 계약을 참고한 독립 휴리스틱입니다. 원본 내부 계산식 복구나 결과 일치를 뜻하지 않습니다.',experimental:true})
]);

export function resolveCalculationVersion(id){
  if(id===undefined)return CALCULATION_VERSIONS[0];
  const version=CALCULATION_VERSIONS.find(v=>v.id===id);
  if(!version)throw new Error(`지원하지 않는 계산식 버전입니다: ${String(id)}. 최적화 설정에서 사용할 계산식 버전을 선택하세요.`);
  return version;
}

export function optimizeVersion(project,onProgress){
  const version=resolveCalculationVersion(project.settings?.calculationVersion);
  const result=version.id==='cutting-v1'?optimize(project,onProgress):optimize(project,onProgress,{family:'smart2d'});
  return {...result,calculationVersion:{...version}};
}
