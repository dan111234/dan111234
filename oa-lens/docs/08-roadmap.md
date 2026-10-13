# 08. 단계별 구현 계획

각 단계의 **완료 기준**을 모두 통과해야 다음 단계로 넘어간다. 단계가 끝날 때마다 Claude Code는 사용자에게 "어디서 무엇을 확인하면 되는지"를 한국어로 보고한다.
아래 "프롬프트"는 사용자가 Claude Code에 그대로 붙여넣는 문장이다.

> **범위 조정 (2026-10-13, 사용자 결정)**: 다음 화면은 구현하지 않는다 — Offers 섹션(08), Graphs(09), 검색결과 위젯·테이블(13·14), 스토어프런트(15), Lists·History(16), Bulk(17), Sourcing(18), Copy & Export 설정(19), 사이드바 모드(20). 그래서 P3는 지표 줄과 30/90/180 표만, P5는 Notes와 링크만, P7·P8은 하지 않는다.
>
> 진행 상황: P0 완료, P1 완료(verify:fees 21개 중 17개 일치, 4개 원인 설명), P2 구현 완료(Targets·Order Totals를 앞당겨 포함), P3 구현 완료(지표 줄, 30/90/180 표, Keepa 프록시, 토큰 예산). P2·P3 완료 기준 중 사용자 확인 항목이 남아 있다.
>
> Haz·Prep: 새 Refresh Token에 Amazon Fulfillment 역할이 들어가 FBA Inbound v2024-03-20은 열리지만, `getItemEligibilityPreview`(v1)와 `getPrepInstructions`(v0)는 여전히 403이다. 대안(Seller Central 페이지 확인 등)은 별도로 정한다.

| 단계 | 내용 | 결과물 |
|---|---|---|
| P0 | 뼈대와 연결 | 모노레포, Worker 인증·카탈로그, 빈 위젯 |
| P1 | 계산 엔진 | packages/core + 테스트 + 수수료 대조 스크립트 |
| P2 | 메인 위젯 v1 | 헤더 배지, 랭크, 계산기, 상품정보, 오퍼 요약, 수수료 팝업, 핵심 설정 |
| P3 | Keepa | 지표 줄, 30/90/180, 그래프, Offers 섹션 |
| P4 | 계산기 고급 기능 | Targets, Max Cost, Breakeven, Order totals, Fee savings, Peak, 스마트 입력, 설정 구성, 배치 모드 |
| P5 | 저장·내보내기 | Lists, History, Notes, Copy/Export/Google Sheets, 링크 |
| P6 | Variation Viewer | 변형 표, 필터, 자식 ASIN |
| P7 | 검색결과·스토어프런트 | SERP 위젯·표·그래프, 스토어 분석 |
| P8 | Bulk·Sourcing·3P | 벌크 분석, 소싱 3종, 다른 사이트 검색 |
| P9 | 마무리 | 공유 이미지, 도움말, 성능, 오류 처리 |

---

## P0. 뼈대와 연결
**작업**
- pnpm 모노레포(`apps/extension`, `apps/worker`, `packages/core`, `packages/shared`), TypeScript strict, ESLint, Prettier, Vitest
- Worker: Hono, Bearer 키 인증, CORS, LWA 토큰 발급·KV 캐시, `GET /v1/health`, `GET /v1/us/spapi/catalog/{asin}`
- 확장: WXT + Preact + Tailwind(prefix `oal-`), 옵션 페이지(Worker URL, 공유키, 연결 테스트), 상세페이지 content script가 Shadow DOM 컨테이너를 상품명 아래에 삽입하고 ASIN·제목·브랜드·랭크를 표시
- `.gitignore`에 `.dev.vars`, `docs/reference/screenshots/*.png`, `.output`
- README의 설정 절차가 실제로 동작하는지 검증

**완료 기준**
- [ ] `pnpm test`가 통과한다(빈 테스트라도)
- [ ] 옵션 페이지 연결 테스트에 "SP-API OK, 셀러 ID 확인"이 뜬다
- [ ] 아무 amazon.com 상품 페이지를 열면 상품명 아래 박스에 ASIN, 제목, 브랜드, 랭크가 2초 안에 나온다
- [ ] 변형을 바꾸면 박스 내용이 새 ASIN으로 바뀐다

**프롬프트**
> CLAUDE.md와 docs/01, docs/07을 읽고 P0을 진행해줘. Worker 비밀값은 내가 wrangler secret으로 넣을 테니, 필요한 이름 목록과 .dev.vars 예시 파일(값은 비워서)만 만들어줘.

## P1. 계산 엔진
**작업**
- `packages/core/data`: reference JSON을 타입이 붙은 모듈로 감싼다(`"Infinity"`는 숫자 Infinity로 변환)
- `fees/`: sizeTier, dimWeight, outboundWeight, fulfillmentFee(가격대·기간·위험물·의류·overmax·추가 요금), referralFee(규칙 해석·역산·API 견적에서 규칙 추론), closingFee, storageFee, placementFee, lowInventoryFee, shipToFBA, prepChips, mfnShipping(USPS·$/lb·flat)
- `profit/`: net, roi(3방식), margin, breakeven, maxBuy, minSell(가격대 보정 포함), targets, orderTotals
- `keepa/`: 시간 변환, csv 파서, 평균·드롭·OOS, 3% 드롭 방식
- `smartInput/`: 안전한 수식 파서
- Worker `fees/{asin}/tiered`와 `pnpm verify:fees` 스크립트(07 §7)

**완료 기준**
- [ ] 04 §10의 골든 테스트가 전부 통과한다
- [ ] 사용자가 준 ASIN 10~20개로 `pnpm verify:fees`를 돌렸을 때 diff가 0.01을 넘는 행이 없거나, 넘는 행마다 원인(표 오류, 위험물 등)이 설명되어 있다
- [ ] core 테스트 커버리지 90% 이상

**프롬프트**
> docs/04와 docs/reference를 읽고 P1을 진행해줘. 끝나면 내가 확인할 ASIN 목록을 물어보고 verify:fees 결과를 표로 보여줘.

## P2. 메인 위젯 v1
**작업** (02 문서 기준)
- §A 헤더 전체(Melt·IP는 D1 목록 기반)와 판매 제한 툴팁·새로고침
- §B-1 랭크 줄과 Top %
- §C 계산기 전체 행(Targets 제외), 입력 연동(`=`/`≠`), 매입가 저장(D1)
- §D 상품정보 박스(무게·치수 편집 포함), Prep·LTSF·무게 팝업
- §F 오퍼 요약 줄
- §K-1, §K-2 수수료 팝업
- §K-5 설정 팝업 중 FBA, FBM, Sell Price/Buy Cost, ROI-Margin, General 탭
- §H 하단 바의 New/Used 토글
- §L 상태·오류 표시
- Worker `/v1/us/product/{asin}` 묶음 응답, restrictions, eligibility, prep

**완료 기준**
- [ ] 스크린샷 01, 03, 04, 05, 07과 나란히 놓았을 때 배치·라벨·색이 같다(사용자 확인)
- [ ] 같은 상품에서 RevSeller와 OA Lens의 FBA Net이 ±$0.02 안에 든다(같은 설정, 상품 5개, 사용자 확인)
- [ ] 판매 제한 배지가 Seller Central "Add a Product" 결과와 일치한다(상품 5개)
- [ ] 매입가를 넣고 새로고침해도 값이 유지된다

**프롬프트**
> docs/02의 §A~§D, §F, §K-1·2·5, §L과 docs/05, docs/06을 읽고 P2를 진행해줘. docs/reference/screenshots에 있는 화면과 최대한 똑같이 만들어줘. 섹션 하나가 끝날 때마다 확인 방법을 알려줘.

## P3. Keepa
**작업**
- Worker Keepa 프록시, 토큰 상태(`/v1/quota`), KV 캐시
- §B-2 지표 줄, §B-3 30/90/180 표
- §J Graphs 3종(Chart.js), 기간 버튼, 범례 상태 저장, 줌, Breakeven 선
- §G Offers 섹션(필터, 기간, OOS, Suppr, 재고 합계, 오퍼 표, Buy Box Share 차트, Seller Ids, Historical Offers)
- 설정 탭: 30/90/180 Table, Offers Table, Graphs
- 01 §5 토큰 예산 규칙

**완료 기준**
- [ ] 스크린샷 02, 08, 09와 같다
- [ ] 30d Drops·90d Rank·평균가가 keepa.com 상품 페이지 값과 같다(상품 3개)
- [ ] Offers를 펼치지 않으면 offers 토큰을 쓰지 않는다(Worker 로그로 확인)

## P4. 계산기 고급 기능
**작업**: §E Targets, Max Cost(설정 규칙), Breakeven, §K-3 Order Totals, §K-11 Fee Savings, Peak 토글, 스마트 입력, 설정 구성 7개와 Net 옆 빠른 전환, 설정 Export/Import, 핀(자동 펼침), 사이드바·팝아웃·드래그, Display 글자 크기, 설정 탭 Targets·Position·Settings Configs·Display

**완료 기준**
- [ ] Targets 표의 값을 클릭하면 계산기에 들어가고, 그 값으로 계산한 Net/ROI/Margin이 목표와 일치한다
- [ ] 스크린샷 06, 10-*, 20과 같다
- [ ] 설정 구성을 바꾸면 즉시 다시 계산된다

## P5. 저장·내보내기
**작업**: §H 하단 바 나머지(History, Lists, Google, Export, Copy, Sheets Settings, 고정 영역), §I Notes, 03 §E Lists·History 패널, 03 §H Copy & Export 설정 페이지와 필드 전체, Google Sheets용 Apps Script 예시(`tools/apps-script/Code.gs`), §K-6 Links 팝업, §K-7 제목 옆 링크 박스, Custom Links 설정 탭, 헤더 별(리스트 담기)

**완료 기준**
- [ ] 1클릭으로 시트에 한 줄이 추가되고, 열 순서가 export 구성과 같다
- [ ] 히스토리에 30일 이내 본 상품이 나온다
- [ ] 스크린샷 11, 16, 19와 같다

## P6. Variation Viewer
**작업**: 03 §A 전체(필터, 사이즈 필터, 열 선택, Table/Images/Graphs 보기, 행 클릭 이동, Get Low FBA $, 내보내기), Child ASIN 확인

**완료 기준**: 변형 50개 이상인 상품에서 2분 안에 모든 행이 채워지고, 스크린샷 12와 같다

## P7. 검색결과·스토어프런트
**작업**: 03 §B(위젯·표·그래프), 03 §C. 화면에 보이는 카드만 불러오기, 묶음 요청

**완료 기준**: 검색결과 48개 페이지에서 스크롤만으로 위젯이 채워지고 Keepa 토큰이 바닥나지 않는다. 스크린샷 13~15와 같다

## P8. Bulk · Sourcing · 3P
**작업**: 03 §F, §G, §D

**완료 기준**: ASIN 500개 벌크(Restrictions 모드)가 끝까지 처리되고 CSV로 내보내진다. 스크린샷 17, 18과 같다

## P9. 마무리
**작업**: §K-12 공유 이미지, Help 팝업(우리 버전 FAQ), 오류 메시지 다듬기, 성능 측정(첫 표시 시간, 토큰 사용량), Playwright로 상세페이지 스모크 테스트, 버전·변경 로그

---

## 사용자가 미리 준비할 것
- P0 전: README의 비밀값 5개와 공유키, Cloudflare 계정
- P1 전: 수수료 대조용 ASIN 10~20개(사이즈 티어가 섞이게: 작은 표준, 큰 표준, 벌키, 의류, 위험물, $10 미만 상품)
- P2 전: 스크린샷 01~07
- P3 전: Keepa API 구독과 키
- P5 전: Google Sheets 시트 하나(내보내기 대상)
