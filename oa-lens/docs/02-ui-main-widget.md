# 02. 상세페이지 메인 위젯 UI 스펙

RevSeller 메인 위젯을 위에서 아래 순서대로 적었다. 섹션 번호(§A~§L)는 커밋·질문할 때 그대로 쓴다.
표기 규칙: `[입력]` 편집 가능, `(툴팁)` 마우스를 올리면 나오는 설명, `▸` 클릭 동작, `--` 값 없음 표시.
스크린샷(`docs/reference/screenshots/`)이 있으면 픽셀 배치는 스크린샷을 따른다.

## 공통 시각 규칙
- 폰트 크기: 본문 12px 기준, 큰 숫자(Net)는 18~20px 굵게, 라벨은 11px 회색.
- 색: 이익(+)은 초록, 손실(-)은 빨강, Amazon 가격은 주황, 보조 라벨은 회색. 배지는 테두리가 있는 작은 알약 모양(둥근 3px)이다.
  - Sell = 초록, Appr = 주황, Rstr = 빨강, Haz = 빨강 또는 노랑, Rvw = 회색, Tp = 빨강, Melt = 파랑, IP = 빨강.
- 접히는 섹션: 오른쪽에 쉐브론 토글이 있고, 펼친 상태에서만 핀 아이콘이 보인다. 핀을 켜면 다음 상품에서도 자동으로 펼친다(설정 키 `autoKeepaTable`, `autoTargetsTable`, `autoOffersWidget`, `autoNotes`, `autoKeepaGraph`).
- 복사 가능한 값(ASIN, UPC, 브랜드 등): 클릭하면 클립보드에 복사하고, 툴팁이 "Click to Copy"에서 "Copied"로 1.5초 동안 바뀐다.
- 모든 팝업은 버튼 아래 가운데 정렬에 화살표가 붙은 드롭다운이다. 열기 방식은 두 가지로, hover로 열리는 것(지연 200ms)과 click으로 열리는 것이 있고 항목마다 아래에 적었다. X 버튼, Esc, 바깥 클릭으로 닫는다.
- 위젯 폭에 따라 줄임 라벨로 바꾼다(예: "Buy Box" → "BBox" → "Box", "30 Days" → "30d").

---

## §A. 헤더 바
배경은 위에서 아래로 연한 회색 그라데이션이고 위쪽 모서리가 둥글다.

**왼쪽 아이콘 줄** (16px 아이콘, hover 시 회색 배경 + 아래 툴팁)
1. 로고(OA Lens) ▸ 홈페이지 대신 옵션 페이지 열기
2. Settings (톱니) ▸ click → 설정 팝업(§K-5)
3. Camel ▸ 새 탭 `https://camelcamelcamel.com/product/{ASIN}`
4. Keepa ▸ 새 탭 `https://keepa.com/#!product/1-{ASIN}`
5. Calc ▸ 새 탭으로 Amazon Revenue Calculator(Seller Central)를 ASIN 검색 상태로 열기
6. Links ▸ click → Links 팝업(§K-6)
7. Help ▸ click → Help 팝업(FAQ와 버전 정보, 우리 버전으로 새로 작성)
8. Share ▸ click → 이미지 공유 팝업(§K-12, P9 단계)
9. 사용자 지정 헤더 링크(설정 Custom Links에서 "Links in header" 켰을 때 텍스트 버튼으로 나열)

**오른쪽 배지 줄** (왼쪽부터)
1. `Switch SC`: Seller Central 마켓플레이스가 현재 사이트와 다를 때만 표시(툴팁: 판매 제한을 확인하려면 SC 상단 마켓 드롭다운을 바꾸라는 안내)
2. `Melt`: 녹는 상품일 때. hover 툴팁에 Melt 배지와 설명(FBA는 10/16~4/14에만 입고 가능, 4/15~10/15에 창고에 있으면 처분 대상)
3. `Haz`: 위험물 상태. hover 툴팁(§K-9)
   - 빨강 Haz = 위험물
   - 노랑 Haz = 위험물이지만 위험물 승인 없이도 일부 조건(특정 FC 지정 등)으로 FBA 가능할 수 있음
   - 회색 Rvw = 위험물 검토 중
   - 위험물이 아니면 배지를 숨긴다
   - ▸ 클릭하면 Seller Central 위험물 도움말 페이지(`/gp/help/help.html?itemID=201003400`)
4. `Tp`: Transparency 코드가 필요한 ASIN. hover 툴팁 "This ASIN requires transparency codes."
5. `IP`: IP 주의 브랜드 목록에 있을 때. hover 툴팁에 사용자가 적어둔 사유
6. **판매 제한 배지(New 조건)**: `Sell` / `Appr` / `Rstr`
   - ▸ 클릭하면 승인 요청 링크(API가 준 approval 링크, 없으면 Seller Central "Add a Product" 검색)
   - hover 툴팁(§K-8): "Seller Central Links: Add a Product | Selling App"과 상태별 설명(Sell - You can sell / Appr - Request approval to sell / Rstr - Cannot apply to sell). 현재 상태 행을 강조한다.
   - 배지 옆에 새로고침 아이콘(처음엔 숨김, hover 시 표시) ▸ 캐시를 무시하고 다시 확인
7. **판매 제한 배지(Used 조건)**: 위젯이 Used 모드일 때만 New 배지 대신 표시. 툴팁에는 Used 세부 조건별(Like New, Very Good, Good, Acceptable) 상태 행이 있다.
8. 별(☆) ▸ click → "Your lists" 팝업: 리스트 체크박스 목록 + 새 리스트 만들기. 하나라도 담겨 있으면 별을 채워서(★) 표시

## §B. 상단 지표 (Top Widget)
가운데 정렬, 위아래 여백 14px, 아래쪽 구분선.

**B-1. 랭크 줄**
- `#{rank} in {category}` (카테고리명이 길면 말줄임, title 속성으로 전체 표시)
- 랭크가 없으면 `--`. 부모 ASIN 랭크를 불러오는 중이면 "loading parent rank...". 리뷰가 있으면 "(see most recent reviews)" 링크를 붙인다.
- 오른쪽에 회색 알약 `{top%}%`. 툴팁: 현재 랭크 ÷ 카테고리 전체 상품 수 추정치. 판매 속도를 가늠하는 데 쓰인다.

**B-2. 지표 줄** (작은 라벨 위, 굵은 값 아래, 칸 사이 간격 균등)
| 라벨 | 값 | 비고 |
|---|---|---|
| `30d Sales` (페이지에 "N bought in past month"가 있으면 라벨을 그 기간으로) | 예: `1K+` | 페이지 배지 값을 우선, 없으면 Keepa monthlySold |
| `30d Drops` | 숫자 | 랭크 드롭 수(계산 방식은 설정, 04 §7) |
| `90d Rank` | `#45,210` | Keepa 90일 평균 랭크 |
| (세로 구분선) | | |
| `90d 3p` | `$24.10` | 90일 평균 3P New 가격. ▸ 클릭하면 FBA Sell Price에 입력. New 모드에서만 |
| `90d Used` | `$18.00` | Used 모드에서만 |
| `90d Amz` | `$23.99` (주황) | 90일 평균 Amazon 가격. ▸ 클릭하면 Sell Price에 입력. New 모드에서만 |

**B-3. 30/90/180 표** (접힘, 지표 줄 오른쪽 아래 모서리에 걸친 쉐브론 토글)
- 열: `Stats | 30 Days | 90 Days | 180 Days`, 짝수 행에 옅은 배경
- 행(설정에서 표시·순서 변경 가능): Sales, Rank - Drops, Rank - Avg, Out of Stock Rate - Amz, Out of Stock Rate - 3p, Price Avg - FBA, Price Avg - Buy Box, Price Avg - Amz, Price Avg - 3p, Price Avg - Used
- Sales 행은 30일 칸에만 값이 있고 나머지는 `--`. 가격 칸은 클릭하면 Sell Price에 입력.

## §C. 계산기 (Calculator)
2열 표: **FBM | FBA**. 넓은 화면(@xl)에서는 왼쪽 계산기, 오른쪽 상품정보 박스(§D)를 나란히 배치한다.

**C-1. 열 머리 줄**
- 맨 왼쪽: 초록 원 `$` 아이콘. 수수료가 낮아지는 경계에 가까울 때만 표시하고, hover하면 Fee Savings 팝업(§K-11)
- `FBM {오퍼 수}` / `FBA {오퍼 수}`: 클릭하면 아마존 "All Offers" 패널(AOD)을 열고 해당 필터를 적용한다
- FBM 열 숨기기 토글(설정 `hideFBMColumn`). 숨기면 FBA만 넓게 보여준다
- FBA 입고 불가 사유가 있으면 FBA 머리글 옆에 경고 아이콘 + 사유 툴팁

**C-2. 행 구성**
| 행 | FBM 칸 | 가운데 | FBA 칸 |
|---|---|---|---|
| `Sell Price` (아래 작은 글씨 "List price: $X") | `[입력]` $ | `=` / `≠` 링크 아이콘 | `[입력]` $ |
| `Buy Cost` (`#` 버튼) | `[입력]` | `=` / `≠` | `[입력]` |
| `Discounted Cost` (할인이 있을 때만) | 값 | | 값 |
| `Net` (톱니 아이콘) | **큰 숫자** + ▾ | | **큰 숫자** + ▾ |
| `ROI` | % | | % |
| `Margin` | % | | % |
| `Breakeven Price` | $ | | $ |
| `Max Cost` | `Define` 링크 또는 $ | | `Define` 또는 $ |

- **입력칸**: 왼쪽에 $ 표시, 값이 있으면 오른쪽에 X(지우기) 버튼. 숫자 대신 수식(`24.99*0.9`, `30-2.5`)을 넣을 수 있고, Enter나 blur 때 계산한다(설정 "Auto Update/Smart Inputs"가 켜져 있으면 타이핑 중에도 갱신).
- **`=`/`≠` 아이콘**: `=`이면 FBM과 FBA 입력이 연동되어 한쪽을 바꾸면 다른 쪽도 같은 값이 된다. 클릭하면 `≠`로 바뀌고 따로 움직인다. Sell Price와 Buy Cost에 각각 있다.
- **Sell Price 기본값**: 설정 "Default Sell Price"(04 §6). 사용자가 직접 바꾸면 그 상품을 보는 동안 유지한다.
- **Buy Cost 기본값**: 저장된 매입가(D1)가 있으면 그 값. 설정 "Buy Cost - Use List Price"가 켜져 있으면 정가. 소수점 자릿수는 설정값(2~6).
- **`#` 버튼** ▸ click → Order Totals 팝업(§K-3)
- **Net**: 계산식은 04 §3. 값이 0 이상이면 초록, 음수면 빨강. 계산에 필요한 값(가격·무게·치수)이 없으면 `N/A`. ▾를 누르면 FBM/FBA Fees 팝업(§K-1, §K-2). Peak 수수료를 쓰는 중이면 FBA Net 옆에 작게 "Peak"를 표시한다.
- **Net 라벨 옆 톱니** ▸ hover → "Settings configurations" 팝업: 저장된 설정 구성 목록. 클릭하면 그 구성으로 바꾸고 즉시 다시 계산한다.
- **ROI/Margin**: 소수점 자릿수는 설정값(0~2). 설정 "Show ROI and Margin at bottom"이 꺼져 있으면 숨긴다.
- **Breakeven Price**: 순이익이 0이 되는 판매가(04 §5). 클릭하면 Sell Price에 입력.
- **Max Cost**: 설정 Max Buy Cost Rules(Net ≥ / ROI ≥ / Margin ≥)를 모두 만족하는 최대 매입가. 규칙이 없으면 `Define`(▸ 설정의 Sell Price/Buy Cost 탭을 연다). 툴팁에 어떤 규칙이 기준이 되었는지 표시한다(예: "ROI ≥ 30% 기준").

## §D. 상품 정보 박스 (Gray box)
연회색 배경 박스. 왼쪽 라벨은 회색, 값은 검정. 대부분 클릭하면 복사된다.

1. `Parent: {부모 ASIN}`(자식 ASIN일 때만) · `{현재 ASIN}`(툴팁 "Active ASIN") · `{N}d`(툴팁: 아마존에 등록된 지 며칠 됐는지)
2. `Brand: {브랜드}` ▸ click → Brand actions 팝업: Copy Brand Name / Amazon Search this Brand / Keepa Product Finder(브랜드 필터) / Sourcing에서 이 브랜드 보기
3. `Manuf: {제조사}`
4. `ISBN-10`, `ISBN-13`(도서일 때)
5. `UPC: {첫 번째}` + ⊕(전체 펼치기) / ⊖(접기). 여러 개면 펼쳐서 모두 표시. 각각 클릭하면 복사
6. `Model: {모델 번호}`
7. 작은 버튼 줄
   - `Prep` ▸ click → Prep 팝업(§K-10). 툴팁 "Click to check SC"
   - `{사이즈 티어 약어}`(예: `Sm Std`, `Lg Std`, `Sm Bulky`, `Lg Bulky`, `XL`). 툴팁 "Size tier according to FBA guidelines", 클릭하면 아마존 사이즈 티어 도움말. 작은 티어 경계에 가까우면 굵게 표시
   - `LTSF` ▸ hover → 장기 보관 추가 요금(Aged Inventory Surcharge) 팝업(§K-13). 치수가 있을 때만
8. 무게·치수 줄
   - `{Wt 단위}: {무게}` ▸ hover → 무게 팝업(§K-14). 편집 모드에서는 `[입력] Wt`
   - `{치수 무게} D`(치수 무게가 실제 무게보다 크면 표시)
   - `$` 아이콘(치수가 낮은 티어 경계에 가까울 때) ▸ hover → 치수 Fee Savings 팝업
   - `{L} x {W} x {H} in`. 툴팁 "Product Package Dimensions". 편집 모드에서는 입력칸 3개
   - 연필 아이콘(툴팁 "Change Weight or Dimensions for Estimates") ▸ 무게·치수를 편집 모드로 바꾼다. 바꾸면 SP-API 수수료 대신 로컬 수수료표로 계산한다(04 §2-4)
   - 치수가 없으면 "Check fees in Amz Calc" 링크와 함께 정보 아이콘. 툴팁: 무게·치수가 없으면 수수료 추정이 어렵다는 안내
9. Peak 줄: `Non-Peak rate` 또는 `Peak rate` 링크(아마존 수수료 안내 페이지) + 체크박스(설정 `usePeakFees`). 켜면 FBA Net/ROI/Margin을 Peak 수수료로 계산한다.

## §E. Targets (접힘 섹션)
- 머리: 쉐브론 + "Targets" + 핀
- 컨트롤: `FBA | FBM` 라디오, `Margin | ROI` 라디오(설정 `targetsFbaFbm`, `targetsMetric`로 기억)
- 표 3개를 세로로 쌓는다. 각 표의 열은 `{목표} | Min Sell | Max Buy`
  1. Profit 목표: `Breakeven`(=$0), `$1`, `$2`, `$3`, `$4`, `$10` (설정 `profitPriceTargets`)
  2. 선택한 지표(Margin 또는 ROI) 목표: `Breakeven`, `10%` … `50%` (설정 `marginPriceTargets` / `roiPriceTargets`)
- Min Sell = 현재 매입가로 그 목표를 달성하는 최소 판매가. Max Buy = 현재 판매가로 그 목표를 달성하는 최대 매입가(계산은 04 §5)
- 각 값은 버튼이다. ▸ 클릭하면 해당 값을 계산기의 Sell Price 또는 Buy Cost에 넣는다
- 값을 못 구하면 `--`와 툴팁(예: "매입가를 입력하세요")
- ROI 방식이 "allFees"일 때 FBA ROI 기준 Min Sell은 계산하지 않는다(`--`)

## §F. 오퍼 요약 줄
한 줄에 4~5칸이 있다. 각 칸의 라벨은 링크다(▸ 아마존 오퍼 목록 열기).
| 칸 | 값 | 부가 표시 |
|---|---|---|
| `Low FBA` | `$X` | 핀 아이콘 + 숫자: Low FBA 대비 x% 이내 FBA 오퍼 수(설정 `closeFBAPercent` 1~3%). 툴팁 "{n} FBA within 3% of Low FBA" |
| `Low FBM` | `$X` | (배송비 포함 가격) |
| `Buy Box` | `$X` | 트로피 아이콘 + 숫자: 바이박스 자격 오퍼 수. 툴팁 "{n} Eligible for Buy Box" |
| `Amz` | `$X` | Amazon이 팔고 있지 않으면 `--` |
| `CPT` | `$X` | Competitive Price Threshold. 툴팁: 아마존이 Featured Offer 자격을 판단할 때 쓰는 기준 가격 |

## §G. Offers (접힘 섹션)
- 머리: 쉐브론 + "Offers" + 핀. 펼칠 때 Keepa offers를 불러온다
- 필터 줄
  - `All | FBA | FBM` 라디오
  - `Buy box` 라벨 + 차트 아이콘 ▸ hover로 Buy Box Share 차트 미리보기, 클릭하면 고정. 차트는 기간 내 셀러별 바이박스 점유율 도넛 + 범례이고, 데이터가 없으면 "Buy Box data is not available for this timeframe."
  - 기간 `1d | 30d | 90d | 180d` (기본 30d, Used 모드에서는 1d 숨김)
  - `OOS` 체크박스(기본 켬). 툴팁: 지금은 재고가 없지만 기간 중 바이박스를 가져갔던 오퍼도 표시
  - `Suppr {n}%`. 툴팁: 선택 기간 중 바이박스가 표시되지 않은 시간 비율
- 재고 합계 줄: `Stock  Total {n} · FBM {n} · FBA {n} · Amz {n}`
- 오퍼 표(최대 20행, 열 머리 클릭으로 정렬, 설정 Offers Table에서 표시할 열 선택)

  | 열 | 내용 |
  |---|---|
  | Offers | FBA/FBM/AMZ 배지 + 셀러명(링크: 셀러 스토어프런트). 내 오퍼면 강조 |
  | Stock | 재고 수(Keepa). 좁은 화면에서는 "Stk" |
  | Price | 가격(+배송비) |
  | Buy Box | 선택 기간 바이박스 점유율 % |
  | Ship | 발송 예정일(배송일 아님) |
  | Rtg | 셀러 긍정 피드백 % |
  | Rtg Ct | 셀러 평가 수 |
- 하단 줄: `Seller Ids` + 셀렉트(`Finder` → 선택한 셀러의 Keepa Product Finder 열기, 셀러 ID 복사 등), 복사 버튼(표를 TSV로 복사), 내보내기 버튼(CSV), `Historical Offers` 체크박스(Keepa 히스토리 기반으로 지금은 없는 과거 오퍼도 표시), 회색 안내 "First 20 offers shown"

## §H. 하단 아이콘 바
왼쪽부터 순서대로:
1. `New | Used` 토글 스위치(설정 기본값 `defaultCondition`). 바꾸면 오퍼·가격·판매 제한을 해당 조건으로 다시 불러온다. Used 오퍼가 없으면 비활성화
2. 사이드바 모드 버튼
3. 드래그/팝아웃 버튼. 팝아웃 상태에서 hover하면 "Click again to move extension back to embedded position" 툴팁
4. `Bulk Analysis` 링크(새 탭 bulk 페이지)
5. `Sourcing` 링크
6. `History` ▸ Lists·History 패널을 History 탭으로 연다
7. `Lists` ▸ 같은 패널을 Lists 탭으로 연다
8. Google Sheets 아이콘 ▸ hover → Google 팝업: 현재 Copy & Export 구성으로 시트에 한 줄 추가, 결과 메시지 표시
9. Export 아이콘 ▸ hover → CSV 다운로드 팝업
10. Copy 아이콘 ▸ hover → 탭 구분 텍스트로 복사 팝업(구성 선택 가능)
11. `Sheets Settings` ▸ export-settings 페이지 열기
- 처음 쓰는 기능(Bulk, History, Lists, Google) 옆에는 작은 초록 점을 표시하고, 한 번 클릭하면 없앤다
- **Copy/Export 고정 영역**: Google/Copy/Export 팝업 안의 핀을 누르면 하단 바 아래에 탭 3개(Google, Copy, Export)짜리 고정 영역이 생긴다(설정 `autoCopyExportPinned`, `autoCopyExportPinnedType`)

## §I. Notes (접힘 섹션)
- 머리: 쉐브론 + "Notes" + 핀
- 메모 목록: 최신순 카드. 각 카드에 날짜, 메모 텍스트, 수량(Qty), URL(링크), 수정·삭제 버튼
- `+ New note` 버튼 ▸ 폼(메모 textarea, Quantity 숫자, URL) → 저장(D1)
- Copy/Export 필드 중 `exportNotes / exportLastNote / exportQuantity / exportLink`가 여기 값을 쓴다

## §J. Graphs (접힘 섹션)
- 머리: 쉐브론 + "Graphs" + 핀
- 차트 3개를 세로로 쌓는다(Chart.js, x축은 시간)
  1. **main**: 가격(왼쪽 축 $)과 랭크(오른쪽 축). 데이터셋: Amz(주황 면), 3p(New), Used, 3p FBA, 3p FBM, BuyBox(점선), Rank, Monthly Sold, Breakeven FBA(현재 계산된 손익분기 가격의 가로 점선)
  2. **offers**: 오퍼 수(New) 추이
  3. **reviews**: Rating(별점)과 Review Count
- 기간 버튼: Day / Week / Month / 3 Months / Year / All (기본은 설정 `keepaRange`, 기본값 Year)
- 범례 클릭으로 데이터셋을 켜고 끈다. 상태는 설정 `keepaShow*`로 기억한다(기본: Amz·3p·Rank·Offers·Sold 켬)
- 마우스 휠·드래그 줌, 더블클릭으로 초기화
- 툴팁에 날짜와 각 값(가격은 $0.00, 랭크·판매·오퍼는 천 단위 콤마, 별점은 소수 둘째 자리)
- 설정 "Invert Rank Y Axis"가 켜져 있으면 랭크 축을 뒤집는다

## §K. 팝업 목록

**K-1. FBM Fees 팝업**
- 제목 "FBM Fees". 필요한 값이 없으면 "To estimate fees, the extension needs sell price, weight and dimensions."
- 행
  1. `Price ($X) + Your Ship Rev ($Y)` + `[입력]` 총액(메인 FBM Sell Price와 연동)
  2. `Referral Fee ({요율 설명})` 금액
  3. `Ship to Buyer - {방식 설명}`: 방식 라디오 `USPS | Canada Post(숨김) | $/lb | Flat`. USPS면 서비스 `Ground Advantage | Priority | Media Mail`, Zone `4 | 5 | 8`. $/lb면 단가 입력. 마지막에 금액 `[입력]`(직접 덮어쓸 수 있음)
  4. `Other` 체크 + `[입력]`
  5. `Variable Closing Fees` 금액
  6. `Expenses` 합계
  7. `Buy Cost` + `Discount:` 라디오 `0 | 5 | 10 | 15 | 20 | 25` + `[입력] %` → `Discounted Buy Cost` `[입력]`(메인 Buy Cost와 연동)
  8. 상태 메시지 줄(예: 치수 수정으로 로컬 추정 중)
  9. `Buy Cost Sales Tax` 체크(기본 켬) + 금액
  10. `Net` 굵게, `ROI`, `Margin`
- 팝업에서 바꾼 값은 그 상품에만 적용한다(설정은 바뀌지 않음)

**K-2. FBA Fees 팝업**
- 제목 "FBA Fees" + 오른쪽에 두 열 머리 `Non-Peak 01/15 - 10/14`, `Peak 10/15 - 01/14`. 현재 기간 열을 강조한다
- 행(금액은 Non-Peak 열, Peak 열 두 칸)
  1. `Sell Price` `[입력]`(메인과 연동)
  2. `Referral Fee ({요율})`
  3. `Fulfillment Fee`
  4. `Variable Closing Fees`
  5. `Monthly storage` + 개월 셀렉트(1~12) + 계산 설명(예: "Jan-Sep $0.08/mo Oct-Dec $0.24/mo") + 체크
  6. `Inbound Placement Fee` + 지역 셀렉트(West/Central/East) + 입고지 수 셀렉트(1/2/3/5+) + 체크. Extra Large 티어면 N/A
  7. `Low Inventory Fee` + 기간 셀렉트(Select/0-14/14-21/21-28/28+) + "Historical days of supply" + 체크. Extra Large·식품은 N/A
  8. Prep 칩: `Bag 0.70`, `Tape 0.60`, `Label 0.55`, `Bubble 1.04`(누르면 켜짐 체크 아이콘) + 전체 체크
  9. `Other` 체크 + `[입력]`(두 열 연동)
  10. `Ship to FBA` + "Dim Wt {n} lbs"(치수 무게를 쓸 때만, 툴팁 설명) + 체크 + `[입력]` (두 열 연동)
  11. `Expenses` 합계
  12. `Buy Cost` + 할인 라디오 + `Discounted Buy Cost`
  13. 상태 메시지 줄
  14. `Buy Cost Sales Tax` 체크
  15. `Net`, `ROI`, `Margin` (두 열)

**K-3. Order Totals 팝업** (`#` 버튼)
- 제목 "Order totals"
- `Units` `[숫자]`(기본 1), `Total buy cost` `[입력]` → "{$} per unit" 표시(이 값을 메인 Buy Cost에 넣는다)
- 표: 행 `Sales total`, `Net profit` / 열 `FBM`, `FBA` (단위당 값 × Units)
- 안내: "Uses your current calculator fees and settings. Buy Cost in the main calculator updates per unit."

**K-4. Settings configurations 팝업**: §C-2 Net 옆 톱니 참고

**K-5. 설정 팝업**: 큰 모달. 왼쪽 세로 탭, 오른쪽 내용. 상단에 "Current Settings Configuration" 셀렉트 + 삭제 아이콘, Export/Import 버튼과 안내 문구("Settings don't sync across devices..."). 탭 목록과 항목은 `05-settings.md`. 값을 바꾸면 바로 저장하고 "Done" 표시를 잠깐 보여준다.

**K-6. Links 팝업**
- `Reviews`(리뷰가 있을 때): Top Review / Most Recent / Verified Purchase - Recent / 5·4·3·2·1 Star
- `Amazon`: All Offers (new) / All Offers (used) / FBA Offers (new) / FBA Offers (used) / All FBA Offers / All Offers / Main Product Page. 오퍼 링크는 클릭 시 아마존 AOD 패널을 해당 필터로 연다
- `External`: Ebay UPC, Ebay Title first 6 words · all, Google UPC, Google Title first 6 words · all, Amazon UPC, Amazon Title first 6 words · all, Walmart UPC, Walmart Title first 6 words · all
- `Custom`: 사용자 링크 목록. 비어 있으면 "To create a custom link go to Settings"

**K-7. 제목 옆 링크 박스**: 상품명 바로 뒤에 작은 버튼 묶음을 붙인다. 기본값은 `G`(Google 제목 검색), `GS`(Google Shopping), 복사 아이콘(제목 복사), `W`(Walmart), `E`(eBay). 설정 Custom Links에서 편집할 수 있다. URL 토큰은 `TITLE`, `TITLE6`(처음 6단어), `ASIN`, `UPC`, `ISBN10`, `ISBN13`, `MODEL`

**K-8. 판매 제한 툴팁**: §A-6 참고. Used 툴팁은 조건별 행 `{배지} {조건명} {메시지}`

**K-9. Hazmat 툴팁**: 상태 3가지 설명 행. 현재 상태 행을 강조한다

**K-10. Prep 팝업**: 제목 "FBA Prep Requirements". 목록(예: Polybagging, Labeling) 또는 "None Listed". 아래 안내 "We try to show the currently listed requirements for this ASIN, though sometimes requirements are added or changed."

**K-11. Fee Savings 팝업**: 제목 "Close to Limit for {Referral|FBA} Fee Savings". 설명 "가격·무게·치수가 낮은 수수료 경계에 가까울 때 표시합니다". 2열 표 `Current | If < or =`: 기준 값(가격 또는 무게·치수)과 해당 수수료(Referral Fee 또는 Fulfillment Fee)

**K-12. Share 팝업**(P9): 세로/가로 레이아웃, FBA/FBM, 섹션 체크(Image-Title, Velocity, Calculator, Graphs, Targets, Offers)와 세부 필드 → canvas 미리보기 → Copy Image / Download Image

**K-13. LTSF 팝업**: 제목 "FBA Aged Inventory Surcharge - Monthly Estimate"(부제 "*Formerly Called LTSF"). 표 `Days | Monthly Fee`, 첫 행은 `{n} cubic feet`. 구간별(181-210, 211-240, 241-270, 271-300, 301-330, 331-365, 366-455, 456 days or more) 월 금액과 단가($/cubic foot, 366일 이상 구간은 단위당 최소 금액 병기). 값은 `fee-tables-us-2026.json`의 `ltsfTable`. 하단 "*LTSF are in addition to monthly storage fees"

**K-14. 무게 팝업**: Item Weight `{n} lb ({n} lb {n} oz)`, 치수 무게를 쓰면 "D = dimensional weight" 표시와 함께 Dimensional Weight, Ship Weight. 설명 문구: 치수 무게가 쓰였는지 여부

## §L. 상태와 오류 표시
- 처음 불러오는 중: 숫자 칸에 회색 스켈레톤
- Worker 연결 실패: 헤더 아래 빨간 줄 "서버에 연결할 수 없습니다. 옵션에서 Worker URL을 확인하세요" + 재시도 버튼
- SP-API 오류(권한·토큰): "SP-API 인증 오류 - Worker의 refresh token을 확인하세요"
- 특정 칸만 실패: 그 칸만 `--`와 재시도 아이콘
- Keepa 토큰 부족: Keepa 기반 칸에 시계 아이콘과 "토큰 대기"
- `.ca` 등 지원하지 않는 마켓: "Amazon.com만 지원합니다"
