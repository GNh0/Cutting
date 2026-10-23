import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const r=JSON.parse(await fs.readFile('docs/version-benchmark.json','utf8'));
const inputs=JSON.parse(await fs.readFile('docs/version-benchmark-inputs.json','utf8'));
assert.equal(inputs.length,r.scenarioCount);
const s=r.samePartFulfillment,c=r.bothComplete,a=s.totals['cutting-v1'],b=s.totals['smart2d-v1'];
assert.equal(r.uniquePhysicalInputs,r.scenarioCount);
assert.equal(r.optimizerRuns,r.scenarioCount*2);
assert.equal(s.cases+r.incomparableCases,r.scenarioCount);
for(const group of [s,c])for(const key of ['utilization','lossRate','discardArea','joint'])assert.equal(Object.values(group[key]).reduce((n,v)=>n+v,0),group.cases);
const n=v=>v.toLocaleString('en-US'),f=(v,d=3)=>v.toFixed(d),area=v=>f(v/1e6);
const counts=group=>[
  ['이용률 높음',group.utilization['cutting-v1'],group.utilization['smart2d-v1'],group.utilization.tie],
  ['폐기 로스율 낮음',group.lossRate['cutting-v1'],group.lossRate['smart2d-v1'],group.lossRate.tie],
  ['폐기 로스 면적 작음',group.discardArea['cutting-v1'],group.discardArea['smart2d-v1'],group.discardArea.tie]
];
const material=[['부재 면적 합계 (㎡)',area(a.usedArea),area(b.usedArea)],['사용 원판 면적 합계 (㎡)',area(a.stockArea),area(b.stockArea)],['자재 이용률 (%)',f(a.utilizationPercent),f(b.utilizationPercent)],['재사용 잔재 합계 (㎡)',area(a.reusableArea),area(b.reusableArea)],['폐기 로스 합계 (㎡)',area(a.nonReusableLoss),area(b.nonReusableLoss)],['폐기 로스율 (%)',f(a.lossPercent),f(b.lossPercent)]];
const mdTable=(headers,rows)=>`| ${headers.join(' | ')} |\n| ${headers.map(()=> '---').join(' | ')} |\n${rows.map(row=>`| ${row.join(' | ')} |`).join('\n')}`;
const method=`서로 다른 무작위 복합 입력 **${n(r.scenarioCount)}개**를 만들고, 각 입력을 두 계산 버전에 그대로 넣었다. **정밀(thorough)·자재 우선(area)** 설정을 고정했다. 입력당 1회씩 비교하여 총 ${n(r.comparisons)}쌍, 엔진 실행 ${n(r.optimizerRuns)}회이다. 탐색 수준을 바꿔 같은 입력을 독립 횟수로 더하지 않았으며, 실행 시간은 측정하거나 승패에 사용하지 않았다.`;
const fairness=`두 엔진의 **부재 종류별 배치 수량까지 같은 ${n(s.cases)}개**에서 이용률과 로스율을 각각 센다. 나머지 ${n(r.incomparableCases)}개는 생산한 부재 구성이 달라 자재 지표 승패에서 분리했다. 같은 수량·면적만으로 동일 생산이라고 간주하지 않는다.`;
const joint=`이용률·로스율에서 상대보다 나쁘지 않고 하나 이상 우세한 경우: 기존 ${n(s.joint['cutting-v1'])}개, 분석 버전 ${n(s.joint['smart2d-v1'])}개. 두 지표 모두 동률 ${n(s.joint.tie)}개, 두 지표의 우세 엔진이 서로 엇갈린 경우 ${n(s.joint.tradeoff)}개이다. 엇갈린 작업에 임의의 종합 승자를 붙이지 않았다.`;
const complete=`양쪽 모두 주문 부재를 전량 배치한 작업은 ${n(r.completion.bothComplete)}개, 기존만 전량 배치 ${n(r.completion.onlyCuttingComplete)}개, 분석 버전만 전량 배치 ${n(r.completion.onlySmart2dComplete)}개, 양쪽 모두 일부 미배치 ${n(r.completion.neitherComplete)}개이다.`;
const placement={cutting:0,smart:0,tie:0};
for(const row of r.rows){const a=row.results['cutting-v1'].unplaced,b=row.results['smart2d-v1'].unplaced;placement[a<b?'cutting':b<a?'smart':'tie']++;}
const production=`전체 ${n(r.scenarioCount)}개 중 배치 수량이 더 많은 쪽은 기존 ${placement.cutting}개·분석 버전 ${placement.smart}개·수량 동률 ${placement.tie}개였다. 수량만 같아도 부재 종류가 다르면 자재 효율의 동일 생산 비교에 넣지 않았다.`;
const definitions=[
  '자재 이용률 = 배치 부재 면적 ÷ 실제 사용 원판 면적 × 100. 높을수록 좋다.',
  '재사용 잔재 = 가로·세로가 모두 해당 작업의 최소 잔재 폭 이상인 조각.',
  '폐기 로스 = 사용 원판 면적 − 배치 부재 면적 − 재사용 잔재 면적. 재사용 잔재를 폐기 로스로 세지 않는다.',
  '폐기 로스율 = 폐기 로스 ÷ 실제 사용 원판 면적 × 100. 낮을수록 좋다.',
  '폐기 로스 = 트림 소모 + 톱날 소모 + 재사용 불가 작은 잔재. 모든 실행에서 면적 보존과 이 합계를 검사했다.',
  '비율 차이가 0.0000001%p 이하이면 동률로 처리한다.'
];
const range=values=>`${n(Math.min(...values))}~${n(Math.max(...values))}`;
const partRows=inputs.flatMap(p=>p.parts),stockRows=inputs.flatMap(p=>p.stocks);
const coverage=`작업별 부재 ${range(inputs.map(p=>p.parts.length))}종·수량 ${range(inputs.map(p=>p.parts.reduce((n,r)=>n+r.qty,0)))}개, 원판 ${range(inputs.map(p=>p.stocks.length))}종이다. 부재 치수 ${range(partRows.map(r=>r.w))} × ${range(partRows.map(r=>r.h))} mm, 원판 치수 ${range(stockRows.map(r=>r.w))} × ${range(stockRows.map(r=>r.h))} mm, 두께 ${range(stockRows.map(r=>r.thickness))} mm를 생성했다. 재질·제조사·LOT과 지정/미지정 요청, 결·회전 제한, 수량과 재고 구성을 매번 생성했다. 톱날 ${range(inputs.map(p=>p.settings.kerf))} mm, 트림 ${range(inputs.map(p=>p.settings.trim))} mm, 최소 잔재 폭 ${range(inputs.map(p=>p.settings.minRemnant))} mm이다. 대량 수량 조건 ${inputs.filter(p=>p.benchmarkDesign.stress).length}개, 재고 부족 유도 조건 ${inputs.filter(p=>p.benchmarkDesign.shortage).length}개를 포함하며 원판 한 장 제한·결 적용·전체 회전 설정도 섞었다. 이 범위와 비율은 공개한 ${n(r.scenarioCount)}개 seed 집합의 실제 값이다.`;
// The published standard report uses the fixed, validated 1000-case corpus.
assert.equal(r.scenarioCount,1000,'Use the standard 1000-case corpus for this report');
const limitation='비교 대상은 Cutting의 기존 cutting-v1과 독립 실험 엔진 smart2d-v1이다. 원본 Smart2DCutting EXE와 직접 비교한 결과가 아니다. 이 합성 입력 분포에서의 결과이며 모든 실제 작업의 우열이나 수학적 최적해를 증명하지 않는다. 기본 계산식은 기존 v1로 유지한다.';
const countHeaders=['판정 기준','기존 Cutting v1 우세','Smart2D 분석 v1 우세','동률'];
const md=`# 독립 입력 1,000개 계산 버전 백테스트\n\n2026-10-23. ${method}\n\n## 같은 생산 결과의 이용률·로스율 우세 횟수\n\n${fairness}\n\n${mdTable(countHeaders,counts(s))}\n\n${joint}\n\n## 전량 배치 작업만 따로 비교\n\n${complete}\n\n아래 표의 분모는 양쪽 모두 전량 배치한 **${n(c.cases)}개**다.\n\n${mdTable(countHeaders,counts(c))}\n\n## 같은 생산 결과의 합산 자재 지표\n\n${mdTable(['자재 지표','기존 Cutting v1','Smart2D 분석 v1'],material)}\n\n면적은 동일 부재를 배치한 ${n(s.cases)}개 작업의 합계다. 비율은 총 부재/로스 면적을 총 사용 원판 면적으로 나눈 값이며, 개별 실행 비율의 단순 평균이 아니다. **우세 횟수는 앞 표에서 작업별로 따로 센다.**\n\n## 매번 새로 생성한 입력\n\n${coverage}\n\n## 판정 수식과 검증\n\n${definitions.map(x=>'- '+x).join('\n')}\n\n${n(r.optimizerRuns)}회 모두 물리 절단 재생, 부재 중복·누락, 재고·재질·결·회전 제한 및 로스 합계 검사를 통과했다. 입력 변경 여부와 부재 종류별 생산량도 확인했다. 실패 작업을 제외해 승률을 높이지 않았다.\n\n${limitation}\n\n## 재현과 전체 자료\n\n\`\`\`powershell\nnpm run benchmark:versions\n\`\`\`\n\nseed ${r.seedRange[0]}..${r.seedRange[1]}. [페이지에서 결과 보기](version-comparison.html), [입력 1,000개 전체](version-benchmark-inputs.json), [작업별 지표·판정·소스 해시](version-benchmark.json), [분석 근거](smart2d-analysis.md).\n`;
await fs.writeFile('docs/version-comparison.md',md.replace(complete,complete+' '+production));
const escape=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const htmlTable=(headers,rows)=>`<div class="table"><table><thead><tr>${headers.map(x=>`<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${escape(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const plain=s=>escape(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>1,000개 독립 입력 백테스트 | Cutting</title><style>body{margin:0;background:#101418;color:#e5e9ed;font:16px/1.8 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:36px 24px 64px}h1{font-size:30px;line-height:1.4}h2{font-size:21px;margin-top:42px}p{color:#c7d0d8}a{color:#6ccebc}strong{color:#fff}.eyebrow{color:#6ccebc}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:15px;white-space:nowrap}td,th{padding:13px 16px;border-bottom:1px solid #34404a;text-align:right}td:first-child,th:first-child{text-align:left}th{background:#202930;color:#fff}.note{border-left:3px solid #6ccebc;padding:8px 18px;background:#172127}li{margin:8px 0}.links{display:flex;gap:20px;flex-wrap:wrap}footer{margin-top:48px;color:#9daab5}@media(max-width:600px){main{padding:24px 16px}h1{font-size:25px}td,th{padding:10px}}</style><main><div class="eyebrow">CUTTING · 2026-10-23</div><h1>독립 입력 1,000개 계산 버전 백테스트</h1><p>${plain(method)}</p><h2>같은 생산 결과의 이용률·로스율 우세 횟수</h2><p>${plain(fairness)}</p>${htmlTable(countHeaders,counts(s))}<p class="note">${plain(joint)}</p><h2>전량 배치 작업만 따로 비교</h2><p>${escape(complete)}</p><p>아래 표의 분모는 양쪽 모두 전량 배치한 <strong>${n(c.cases)}개</strong>입니다.</p>${htmlTable(countHeaders,counts(c))}<h2>같은 생산 결과의 합산 자재 지표</h2>${htmlTable(['자재 지표','기존 Cutting v1','Smart2D 분석 v1'],material)}<p>${n(s.cases)}개 작업의 면적 합계입니다. 비율은 합산 면적을 나눠 계산합니다. 개별 실행 비율의 단순 평균이 아니며, 우세 횟수는 위에서 작업별로 따로 셉니다.</p><h2>매번 새로 생성한 입력</h2><p>${escape(coverage)}</p><h2>판정 수식과 검증</h2><ul>${definitions.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><p>${n(r.optimizerRuns)}회 모두 물리 절단·재고·재질·결·회전 제한·로스 합계 검사를 통과했습니다. 실패 작업을 제외해 승률을 높이지 않았습니다.</p><p class="note">${escape(limitation)}</p><h2>재현과 전체 자료</h2><p><code>npm run benchmark:versions</code><br>seed ${r.seedRange[0]}..${r.seedRange[1]}</p><div class="links"><a href="../">Cutting에서 계산하기</a><a href="version-benchmark-inputs.json" download>입력 1,000개 다운로드</a><a href="version-benchmark.json" download>전체 지표·소스 해시 다운로드</a><a href="https://github.com/GNh0/Cutting/blob/main/docs/smart2d-analysis.md">REA·Ghidra 분석 근거</a></div><footer>기존 Cutting v1 / Smart2D 분석 v1 (실험)</footer></main></html>`;
await fs.writeFile('docs/version-comparison.html',html.replace(escape(complete),escape(complete+' '+production)));
console.log(JSON.stringify({generated:['docs/version-comparison.md','docs/version-comparison.html'],cases:r.scenarioCount,comparable:s.cases}));
