# 원본 분석과 구현 범위

분석 대상: https://www.cutlistoptimizer.com/ 공개 웹 화면과 같은 도메인의 공개 JavaScript. 원본 UI에 테스트용 치수를 직접 입력한 비교 기록은 [comparison.md](comparison.md)에 별도 보관합니다.

## REA 사용

공식 출처: https://github.com/morluto/rea

실제로 실행한 명령:

```powershell
npm.cmd exec --yes --package=rea-agents@6.7.0 -- rea analyze-javascript-application research/public-js --format json > research/rea-analysis.json
```

1차 공개 파일 8개: `app-controller.min.js`, `cut-list-service.min.js`, `cutlist-configuration.min.js`, `dimension-processor.min.js`, `csv-handler.min.js`, `configuration-properties.min.js`, `panel-list-service.min.js`, `labels-en.js`.

그림·마우스·통계·PDF·이미지·프로젝트·목록 제어 관련 공개 파일 13개를 추가해 총 21개로 분석을 확장했습니다. REA 결과: JavaScript 21개 파싱 완료, 실패 0개, 입력 542,640바이트, AST 93,891개 노드 방문, 애플리케이션 그래프 77노드·79간선. 정확한 Evidence ID와 입력 해시는 [rea-evidence.json](rea-evidence.json)에 기록했습니다. 전체 결과와 내려받은 타사 파일은 `research/`에 로컬로만 보관하며 Git에서 제외합니다.

REA는 이 단계에서 코드를 실행하지 않고 구문을 분석했습니다. 원본에는 난독화된 동적 참조가 있고 semantic coverage는 `partial`, `truncated=true`입니다. 추가로 REA의 semantic trace API를 실행했습니다. `mousemove` 리터럴에서 1개 함수·2개 노드의 정적 연결을 찾았지만, 난독화 때문에 `mouseover`·`mouseout`·`zoom`은 partial로 남았습니다. [추적 결과](rea-feature-traces.json)를 함께 보관합니다. 정적 분석만으로 런타임 동작이나 완전한 소스 복원을 입증하지 않습니다. UI의 실제 입력·계산 결과와 함께 해석합니다.

## 관찰한 계약

- 부재와 원판을 각각 치수·수량 목록으로 관리합니다.
- 공개 서비스 코드에 `panels`, `stockPanels`, `configuration`, `cutThickness`, `considerOrientation`, `isMaterialEnabled`, `hasEdgeBanding`, 작업 제출·조회용 `/tasks` 및 `/tasks/` 계약이 있습니다.
- 기본 설정에 톱날 두께, 라벨, 원판 한 장만 사용, 재질, 엣지밴딩, 결 방향이 있습니다.
- 설정 창에는 단위, 치수 표시 순서, 소수 자릿수, Minimum trim dimension, 같은 배치 묶기 등이 있습니다. 최적화 우선순위·절단 방향 선호는 관찰 당시 Premium 표시였습니다.
- 출력에 원판 배치 그림, 전체/원판별 사용·낭비 면적, 절단 횟수·길이, 부재 수, 잔재 수, 미배치 부재, 절단표가 있습니다.
- 프로젝트/목록 저장, CSV 입출력, PDF/이미지 출력의 공개 UI·스크립트 항목이 있습니다.

원본 웹의 서버 계산 엔진은 공개 클라이언트 파일에 포함되지 않습니다. 서버 내부 알고리즘과 목적함수의 세부 가중치는 확인하지 않았습니다. 원본의 `Minimum trim dimension`을 이 구현의 `가장자리 여유`와 같은 개념으로 단정하지 않았으며, 비교 시 둘 다 0으로 맞춥니다.

## 기능 대응

| 목적 | Cutting 구현 |
| --- | --- |
| 부재·원판 직접 입력 | 한국어 표, 사용 여부·수량·재질·결·밴딩·회전 설정 |
| 절단 배치 최적화 | 브라우저 Web Worker에서 여러 길로틴 배치 후보 비교 |
| 톱날 폭 | 분할 시 명시적 kerf 영역 확보 |
| 재질·결 제약 | 원판과 일치하는 후보만 허용, 회전 시 결 변환 |
| 원판 재고 제한 | 원판 종류별 수량 소모, 초과 사용 금지 |
| 그림 배치도 | 색상·치수·밴딩·절단선, 원판 전환·확대·이동·90도 보기·부재 선택 |
| 마우스 치수선 | 부재·잔재를 가리키면 경계와 외부 가로·세로 치수선 표시, 키보드 포커스 지원 |
| 잔재 재사용 | 직사각형 잔재 목록·최소 폭 판정, 사용 원판 차감 후 다음 작업으로 이어가기 |
| 제작 지시 | 순서대로 재현 가능한 직선 절단 좌표·길이 표 |
| 통계·미배치 | 이용률·낭비·절단·남은 재고·밴딩 길이·미배치 목록 |
| 파일 입출력 | CSV/TSV 붙여넣기, 프로젝트 JSON, 결과 CSV |
| 그림·문서 | 현재 원판 SVG/PNG, 전체 원판·절단표 인쇄/PDF |
| 개인 프로젝트 보관 | 현재 작업 자동 저장, 브라우저 보관함 30개, 파일 백업 |

클라우드 로그인·구독·결제는 구현하지 않습니다. 소수·인치 입력은 십진수 방식이며 분수 inch/feet 형식은 지원하지 않습니다. 임의 형상 네스팅, 엣지밴딩 두께 차감, 절단 방향 강제 설정은 현재 범위에 포함하지 않습니다.

## 자체 검증

Node.js 기본 테스트 러너로 기하학, kerf, 회전, 정사각형 결 회전, 재질, 재고, 가장자리 여유, CSV·프로젝트 입력을 검증합니다. 무작위 100개 작업에서는 결과를 별도 절단 시뮬레이터로 재생하여 각 절단이 기존 조각을 끝까지 통과하고, 마지막 조각이 부재 치수와 일치하며, 면적이 보존되는지 확인합니다. 1,000개 부재 작업도 포함합니다. 브라우저에서 표 입력·설정·결과·파일 저장 동작을 별도 확인합니다.

## 자체 확장: 재고 그룹과 연속 원판 보기

두께·재질은 필수이고 원판과 일치해야 합니다. 부재의 제조사·LOT은 지정한 항목만 원판과 일치해야 하며 미지정 항목은 제한하지 않습니다. 후보 재고를 공유하는 요청은 함께 탐색하여 중복 사용을 막고, 결과는 실제 원판의 제조사·LOT별로 구분합니다. 모든 사용 원판을 그룹별로 이어 표시하고, 각 원판의 정보·배치도·절단 순서를 함께 확인합니다. 잔재 합산·다음 작업 이월·CSV·JSON에도 그룹 정보를 유지합니다. 기존 파일의 누락 두께는 자동 추정하지 않습니다.
