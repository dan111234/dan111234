# 04. 계산 스펙

모든 함수는 `packages/core`의 순수 함수로 만든다. 금액은 달러(number)로 다루고, **화면에 보여줄 때만** 반올림한다. 단, 아래에 "round2"라고 적힌 곳은 계산 중간에도 소수 둘째 자리로 반올림한다(아마존 청구 방식과 맞추기 위함).
수수료 수치는 `docs/reference/fee-tables-us-2026.json`을 쓴다. JSON 안의 문자열 `"Infinity"`는 상한 없음, 빈 문자열 `""`은 해당 없음을 뜻한다.

## §1. 기호
| 기호 | 의미 |
|---|---|
| P | 판매가 (FBM은 배송비 수입 포함 총액, §4) |
| C | 매입가 |
| d | 할인율(팝업의 Discount 0~25% 또는 직접 입력) |
| C' | 할인 후 매입가 = C × (1 − d) |
| t | 매입가 판매세율(설정 `salesTax` %). 팝업에서 끄면 0 |
| Tax | round2(C' × t) |
| Other | 기타 비용(설정 `fbaOther`/`mfnOther`, 체크가 꺼져 있으면 0) |

## §2. FBA 수수료
### §2-1. 사이즈 티어
1. 치수 [L, W, H]를 내림차순으로 정렬해 longest, median, shortest로 둔다. lengthGirth = longest + 2 × (median + shortest).
2. `sizeTierTable`의 티어를 순서대로 검사해 처음으로 맞는 티어를 고른다. 순서: Small Standard-Size → Large Standard-Size → Small Bulky → Large Bulky → Extra Large 0 to 50lb → 50+ to 70lb → 70+ to 150lb → 150+ lb.
   - 조건: longest ≤ 한도, median ≤ 한도, shortest ≤ 한도, lengthGirth ≤ 한도(한도가 있을 때만), 무게 ≤ 한도
   - 비교 무게: 상품이 Large Standard 한도(치수 또는 무게)를 넘으면 max(실제 무게, 치수 무게)를, 아니면 실제 무게를 쓴다
   - Small Standard의 무게 한도는 Media/Non-Media로 나뉜다. Media 카테고리는 Books, Video & DVD, Music, Software & Computer/Video Games, Video, Video Games
3. Standard 티어 이름에는 " Media" 또는 " Non-Media"를 붙인다. 아무 티어에도 맞지 않으면 "Unknown"이다.
4. Overmax: Extra Large 티어 중 longest > 96in 또는 lengthGirth > 130in이면 `overmaxFeeTable`의 추가 요금을 더한다.
5. 화면용 약어: Small Standard → `Sm Std`, Large Standard → `Lg Std`, Small Bulky → `Sm Bulky`, Large Bulky → `Lg Bulky`, Extra Large → `XL {구간}`.

### §2-2. 무게
- 치수 무게(dimWeight) = L × W × H / 139. Bulky·Extra Large 티어는 W와 H가 2in보다 작으면 2in으로 보고 계산한다.
- 출고 무게(outbound):
  - Small Standard: 실제 무게 + 포장 무게
  - 그 외: max(실제 무게, dimWeight) + 포장 무게. 단, Extra Large 150+ lb는 실제 무게만 쓴다
  - 포장 무게는 `packagingWeightTable`(2026년 표에서는 모두 0)
- 표시용 반올림: 1 lb 미만은 1/16 lb(1온스) 단위로, 1 lb 이상은 올림 정수로 표시한다. **수수료표 조회에는 원래 값을 소수 둘째 자리에서 버림한 값**을 쓴다.

### §2-3. 풀필먼트 수수료 (로컬 표)
- 표: `fulfillmentFeeTable[티어].fees[기간]`. 기간 인덱스는 0이 Non-Peak, 1이 Peak다. 위험물은 `fulfillmentFeeHazmatTable`, 의류는 `fulfillmentFeeClothingTable`을 쓴다.
- 각 표는 무게 구간 키("2oz"~"14oz", "1", "1.25" … )와 `above`로 되어 있다.
  - 키는 상한값이다. "oz" 키는 온스(÷16 lb), 나머지는 lb. 키를 무게순으로 정렬해 outbound 무게 이하인 첫 키를 고른다
  - outbound가 `above.startFrom`보다 크면 기본값 = `fees[startFrom]`이고, 추가분 = ceil((outbound − startFrom) / every) × `above.fee`를 더한다(every가 없으면 lb 단위 그대로 곱함)
- 값은 가격대별 3칸 배열이다. 인덱스 0은 P < $10, 1은 $10 ≤ P ≤ $50, 2는 P > $50.
- 2026-04-17부터 로컬 표 계산값에 1.035(연료·물류 추가 요금 3.5%)를 곱하고 round2한다. 이 비율과 시작일은 상수로 두고, 아마존 공지로 확인한다.

### §2-4. SP-API 수수료와 섞는 규칙 (중요)
상세페이지를 열면 Worker가 `getMyFeesEstimates`로 가격 $9, $13, $350에서 FBA 견적을 받아온다(07 §2 `fees/tiered`). 이 값이 각 가격대(<$10, $10–50, >$50)의 **정답 풀필먼트 수수료**다.
1. 무게·치수가 카탈로그 원래 값과 같고, 지금 보려는 기간(Peak/Non-Peak)이 오늘 날짜의 기간과 같으면 → **API 값을 쓴다**(P의 가격대에 맞는 견적)
2. 사용자가 무게·치수를 바꿨으면 → 로컬 표
3. 오늘과 다른 기간(예: 지금은 Non-Peak인데 Peak 열을 계산할 때)이면 → 로컬 표
4. 위험물 판정: 로컬 위험물 표로 계산한 값이 API 값과 같으면 위험물로 본다. 이후 보관료와 입고 배송비에 위험물 단가를 쓰고, Haz 배지 판단에도 쓴다
5. 의류 판정: 수수료 요율이 Clothing & Accessories 규칙과 같고, 의류 표로 계산한 값이 API와 같으면 의류 표를 쓴다
6. 로컬과 API 값이 다르면 콘솔에 기록하고 API 값을 쓴다. `pnpm verify:fees`로 차이를 모아 표를 고친다

### §2-5. 판매 수수료 (Referral)
- 규칙의 종류(`referralFeeTable` 항목 모양)
  - `{percent, min}`: P × percent
  - `{range:[{from,to,percent}], portion:true}`: 구간별 누진. 각 구간에 걸치는 금액에만 해당 요율을 적용해 더한다
  - `{range, portion:false}`: 가격 전체에 한 요율. `rangeFromInclusive`가 없으면 from < P ≤ to, 있으면 from ≤ P < to
  - `{fixed}`: 고정 금액
  - `min`: 계산값이 min보다 작으면 min (보통 $0.30)
- 결과는 round2한다.
- **상품별 규칙 찾기**: 카테고리 이름을 믿지 않고, API 견적에서 거꾸로 추론한다.
  1. pct9 = round(fee@9 / 9 × 100), pct350 = round(fee@350 / 350 × 100). 둘이 같으면 `{percent: pct9, min: 0.30}`
  2. 다르면 `referralFeesEstimateTable`에서 price9, price350(있으면 price13까지)이 같은 행을 찾아 그 `result` 규칙을 쓴다
  3. 그래도 없으면 "Everything Else"(15%)를 쓰고 경고를 기록한다
  4. Books, DVDs, Grocery & Gourmet Food, Music, Software & Computer/Video Games, Video & DVD, Video Games, Video Game Consoles, Gift Cards는 min을 0으로 둔다
  5. 예외: P > $500이고 productType이 LAWN_MOWER 또는 SNOW_BLOWER면 `{percent: 8, min: 0.30}`
- 변동 마감 수수료(Variable Closing Fee): API 견적의 VariableClosingFee를 쓴다. 없으면 `closingFeeTable`(미디어 $1.80)

### §2-6. 월 보관료
- cubicFeet = L × W × H / 1728
- 월 요금 = cubicFeet × `storageFeeTable[티어][i]`. i는 1~9월이면 0, 10~12월이면 1. 위험물은 `storageFeeHazmatTable`
- N개월(설정 `storageMonths`, 1~12) 합계. 시작 월은 Non-Peak 계산이면 1월, Peak 계산이면 10월부터 차례로 센다
- 합계 + 0.0001을 round2한다. 설명 문구는 "Jan-Sep ${월요금0}/mo Oct-Dec ${월요금1}/mo"
- 설정 `fbaCalcStorageFee`가 꺼져 있으면 0

### §2-7. 입고 배치 수수료 (Inbound Placement)
- Extra Large 티어는 해당 없음(N/A)
- 입고지 수 옵션: Standard 티어는 `1 | 5+`, Bulky 티어는 `1 | 2 | 3 | 5+`. 5+이면 0원. Standard 티어는 1일 때만 요금이 있다
- 조회 무게: Small Standard는 실제 무게, 그 외는 max(실제 무게, dimWeight)
- 요금 = `inboundPlacementTable[티어][지역][무게 구간][입고지 수 − 1]`. 무게 구간 키는 §2-3과 같은 상한값 규칙
- 설정 키: Standard는 `fbaInboundPlacementStandard{Enabled,Region,Location}`, Bulky는 `fbaInboundPlacement{Enabled,Region,Location}`

### §2-8. 재고 부족 수수료 (Low Inventory Level Fee)
- 기간 옵션: `Select`(0원) / `0-14` / `14-21` / `21-28` / `28+`(0원)
- 요금 = `lowInventoryTable[티어][기간]`. Large Standard는 outbound 무게가 3 lb 이하면 첫 번째 행, 넘으면 두 번째 행
- Extra Large와 식품(Grocery)은 0원(N/A)

### §2-9. FBA 입고 배송비 (Ship to FBA)
- 무게 = 실제 무게. 설정 `fbaInboundUseDim`이 켜져 있으면 max(실제 무게, dimWeight)
- 요금 = 무게 × 단가. 단가는 `fbaInbound`이고, 위험물이면 `fbaInboundHazmat`
- 체크가 꺼져 있으면 0. 팝업에서 금액을 직접 덮어쓸 수 있다(그 상품에만 적용)

### §2-10. Prep 칩
- 켜진 칩 금액의 합계. 기본값은 Bag 0.70, Tape 0.60, Label 0.55, Bubble 1.04이고 설정 `fbaExtrasChips`로 이름(최대 6자)과 금액을 바꿀 수 있다
- `fbaExtrasEnabled`가 꺼져 있으면 0

### §2-11. FBA 수수료 합계
FeesFBA = Referral + Closing + Fulfillment + Storage + ShipToFBA + Placement + LowInventory + PrepChips

## §3. 순이익·ROI·마진
### FBA
- NetFBA = P − FeesFBA − (C' + Other + Tax)
- ExpensesFBA = P − NetFBA (팝업 "Expenses"는 Buy Cost를 뺀 수수료 합계를 보여준다. 07의 export 필드 `fbaFeesExpensesNoBuyCost`와 같은 값)
- Non-Peak 값과 Peak 값을 따로 계산한다. 화면의 메인 Net은 설정 `usePeakFees`가 켜져 있으면 Peak, 아니면 Non-Peak

### FBM
- FeesFBM = Referral(P) + Closing + ShipToBuyer
- NetFBM = P − FeesFBM − (C' + Other + Tax)

### ROI (설정 `roiMethod`)
| 방식 | FBM 분모 | FBA 분모 |
|---|---|---|
| `buyCostOnly` (기본) | C' + Tax | C' + Tax |
| `buyCost_Other_Inbound` | C' + Tax + Other + ShipToBuyer | C' + Tax + Other + ShipToFBA |
| `allFees` | C' + Tax + FeesFBM + Other | C' + Tax + FeesFBA + Other |

ROI = Net ÷ 분모. Margin = Net ÷ P. 표시 소수점은 설정 `decimalProfit`(0~2). 분모가 0이면 `--`.

## §4. FBM 배송비 (Ship to Buyer)
- **FBM Sell Price는 배송비 수입 포함 총액**이다. 팝업에는 "Price(= 총액 − ShipRev) + Your Ship Rev(설정 `mfnShipRev`)"로 나눠 보여준다. 판매 수수료는 총액에 매긴다
- 방식(설정 `mfnShipEstimateMethod`, 체크 `mfnShipEstimate`가 꺼져 있으면 0)
  - `usps`: `uspsPriceTable[서비스][무게 키][존 인덱스]`. 서비스는 ground_advantage / priority / media_mail(미디어 상품이면 자동으로 media_mail). 존 4/5/8 → 인덱스 0/1/2
    - 무게 = 실제 무게 + MFN 포장 무게(`packagingWeightTableMFN`). 부피가 1 cu ft를 넘으면 치수 무게(L×W×H/166)와 비교해 큰 값
    - 1 lb 미만은 온스 구간 키("0.5", "0.75", "0.99")를 쓰고, 1 lb 이상은 올림 정수 키. 70 lb를 넘으면 70
    - 설정 "Always Use Priority" 또는 "Use Priority for Hazmat"(위험물일 때)이면 priority
  - `pound`: 실제 무게 × `mfnShipPoundPrice`
  - `flat`: `mfnShipFlatRate`
- 팝업에서 금액을 직접 덮어쓸 수 있다

## §5. 역산 (목표가·손익분기·최대 매입가)
기호: E0 = Expenses − C' − Tax (매입가와 세금을 뺀 비용 합계), X = ROI 방식이 `buyCost_Other_Inbound`일 때 분모에 더하는 값(Other + ShipToFBA 또는 ShipToBuyer), t = 세율

**최대 매입가(Max Buy)** — 판매가 P는 고정
- 순이익 목표 N: (P − N − E0) / (1 + t)
- ROI 목표 R
  - buyCostOnly: (P − E0) / ((1 + R)(1 + t))
  - buyCost_Other_Inbound: (P − E0 − R·X) / ((1 + R)(1 + t))
  - allFees: (P − E0·(1 + R)) / ((1 + R)(1 + t))
- 마진 목표 M: (P·(1 − M) − E0) / (1 + t)
- Breakeven Cost = 순이익 목표 0일 때 값

**최소 판매가(Min Sell)** — 매입가 C'는 고정
- 순이익 목표 N: S = N + (C' + Other + Tax) + (Fees − Referral). P = invertReferral(S)
- ROI 목표 R: S = 분모 × R + (C' + Other + Tax) + (Fees − Referral). P = invertReferral(S). ROI 방식이 allFees이면 FBA는 계산하지 않는다
- 마진 목표 M: 반복 계산. P₀ = Breakeven Price, Pₖ₊₁ = MinSell(순이익 = Pₖ × M). |Pₖ₊₁ − Pₖ| < 0.005가 되면 멈추고, 최대 25회
- Breakeven Price = 순이익 목표 0일 때 값
- **invertReferral(S)**: P − referral(P) = S를 푼다
  - percent: P = S / (1 − pct). referral(P) < min이면 P = S + min
  - range + portion: 구간을 차례로 보며 누적 수수료를 더해 P가 들어가는 구간을 찾고, 그 구간에서 P = (S − from·pct + 누적) / (1 − pct)
  - range 전체 요율: 각 구간 요율로 P를 구해 그 P가 해당 구간 안에 들어오는 첫 해를 쓴다
  - fixed: P = S + fixed
- **가격대 보정**: 구한 P가 현재 판매가와 다른 풀필먼트 가격대(<$10 / $10–50 / >$50)에 들어가면, 새 가격대의 풀필먼트 수수료와의 차이를 S에 더해 한 번 더 푼다

**Max Cost 칸** (설정 Max Buy Cost Rules)
- 켜진 규칙(값이 0이 아닌 것)마다 Max Buy를 계산해 **가장 작은 값**을 쓴다. 어떤 규칙이 기준이 되었는지(`net`/`roi`/`margin`)도 함께 돌려준다
- 기본값: FBA·FBM 모두 Net ≥ $3, ROI 0, Margin 0. `maxBuyCostType`(fba/fbm)은 검색결과 위젯 등에서 어느 쪽을 보여줄지 정한다

**Targets 표**: 목표 목록(설정의 콤마 구분 값)마다 Min Sell과 Max Buy를 계산한다. 목록에 0이 없으면 맨 앞에 0(Breakeven)을 넣는다.

**Order Totals**: units = n, 총 매입가 T → C = T / n. Sales total = P × n, Net profit = Net × n (FBM, FBA 각각)

## §6. 기본 판매가 (Default Sell Price)
| 설정 값 | FBA 기본가 | FBM 기본가 |
|---|---|---|
| `buybox_lowprice` (기본) | Buy Box(New) → 없으면 Low New | 같음 |
| `lowfba_buybox_lowprice` | Low FBA → Buy Box → Low New | 같음 |
| `lowfbm_buybox_lowprice` | (FBA에는 없음) | Low FBM → Buy Box → Low New |
- Used 모드에서는 Low Used를 쓴다
- 사용자가 직접 입력한 값이 있으면 그 상품을 보는 동안 유지한다

## §7. 판매 지표
- **랭크 드롭(Drops)**
  - `standard`(기본): Keepa `stats.salesRankDrops30/90/180`을 그대로 쓴다
  - `threePercentDrop`: Keepa SALES 히스토리(csv[3])에서 직전 값 ÷ 현재 값 > 1.03인 시점(랭크가 3% 넘게 좋아진 순간)을 세서 30/90/180일 구간별로 합한다. 값이 0 이하인 점은 건너뛴다
- **Keepa 시간 변환**: keepaMinutes → Unix ms = (keepaMinutes + 21564000) × 60000
- **평균 가격·랭크**: Keepa `stats.avg30/avg90/avg180`의 해당 인덱스(0 AMAZON, 1 NEW, 2 USED, 3 SALES, 10 NEW_FBA, 18 BUY_BOX_SHIPPING 등). 가격은 센트 단위라 ÷100. 값이 −1이면 `--`
- **OOS 비율**: Keepa `stats.outOfStockPercentage30/90`(Amazon=인덱스 0, 3P New=인덱스 1)
- **Top %**: rank ÷ 카테고리 전체 상품 수 × 100. 5% 이상이면 올림 정수, 미만이면 소수 둘째 자리. 0.00이면 0.01로 표시. 전체 상품 수는 `category-tables-us.json`의 `totalProductsTable`(추정치). 나중에 Keepa category 요청의 productCount로 갱신할 수 있다
- **Low FBA 근접 오퍼 수**: Low FBA 가격 × (1 + x%) 이하인 FBA 오퍼 수. x는 설정 `closeFBAPercent`(1~3)
- **등록 경과일**: 오늘 − (Keepa `listedSince` 또는 카탈로그 `product_site_launch_date`)

## §8. 수수료 절감 알림 (Fee Savings, 초록 $ 아이콘)
설정 `feeSavingThreshold`(기본 10%) 안쪽에 있을 때만 표시한다.
1. **판매가 기준(Referral)**: 판매 수수료 요율이 바뀌는 경계(예: Beauty $10) 바로 위에 있으면, 경계 가격에서의 판매 수수료와 비교해 보여준다
2. **저가 FBA**: $10 ≤ P ≤ $10 × 0.92 / 0.85(약 $10.82)이면 $9.99에서의 풀필먼트 수수료와 비교해 보여준다
3. **무게**: outbound 무게가 바로 아래 무게 구간 상한의 (1 + 임계%) 이내면, 그 구간의 수수료와 비교해 보여준다
4. **치수·티어**: 한 단계 작은 티어의 한도를 (1 + 임계%) 안에서만 넘는다면, 그 티어 한도 치수·무게일 때의 수수료를 보여주고, 넘는 치수(길이·폭·높이·무게)를 강조한다

## §9. 스마트 입력 (수식)
- 허용: 숫자, `+ - * / % ^ ( )`, 공백, 소수점. 변수와 함수는 허용하지 않는다(보안상 `eval` 금지, 직접 파서 작성)
- `$`와 `,`는 지우고 계산한다. 계산이 실패하면 입력칸에 빨간 테두리를 그리고 직전 값을 유지한다

## §10. 골든 테스트 (Vitest에 그대로 넣을 것)
### 10-1. 이익 계산 (수수료를 입력으로 받는 경우)
입력: P = 24.99, C = 8.00, d = 0, Other = 0, Referral 15%, Fulfillment = 4.50, Storage = 0.10, ShipToFBA = 0.50, Placement = 0, LowInv = 0, Prep = 0, Closing = 0

| 항목 | 기대값 |
|---|---|
| Referral | 3.75 (3.7485 → round2) |
| FeesFBA | 8.85 |
| NetFBA (t = 0) | 8.14 |
| ROI buyCostOnly | 101.75% (decimalProfit 0이면 "102%") |
| Margin | 32.57% ("33%") |
| Max Buy (Net ≥ $3) | 13.14 |
| Breakeven Cost | 16.14 |
| Breakeven Price | 15.41 (S = 8.00 + 5.10 = 13.10, 13.10 / 0.85 = 15.4118) |
| Min Sell (ROI 50%) | 20.12 (검산: Referral 3.02, Fees 8.12, Net 4.00) |
| Max Buy (Margin 20%) | 11.14 |
| t = 7%일 때 Tax | 0.56 |
| t = 7%일 때 NetFBA | 7.58 |
| t = 7%일 때 ROI buyCostOnly | 88.55% (7.58 / 8.56) |

### 10-2. 로컬 수수료표 (fee-tables-us-2026.json 기준)
아래 값은 표에서 계산한 기대값이다. 실제 SP-API 값과 맞는지 P1 단계에서 확인하고, 다르면 표 쪽을 고친다.

| 티어 | 무게(lb) | 치수(in) | 가격 | dimWeight | outbound | FF Non-Peak | FF Peak | ×1.035 적용 후 | cu ft | 보관 1월 | 보관 10월 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Large Standard | 1.10 | 10×6×3 | 24.99 | 1.295 | 1.295 | 5.42 | 5.73 | 5.61 / 5.93 | 0.1042 | 0.08 | 0.25 |
| Small Standard | 0.30 | 8×5×0.5 | 12.99 | 0.144 | 0.300 | 3.45 | 3.65 | 3.57 / 3.78 | 0.0116 | 0.01 | 0.03 |
| Large Standard | 4.20 | 14×10×6 | 39.99 | 6.043 | 6.043 | 8.01 | 8.55 | 8.29 / 8.85 | 0.4861 | 0.38 | 1.17 |
| Small Standard | 0.20 | 6×4×0.5 | 8.99 | 0.086 | 0.200 | 2.49 | 2.68 | 2.58 / 2.77 | 0.0069 | 0.01 | 0.02 |

### 10-3. 판매 수수료 규칙
| 규칙 | P | 기대값 |
|---|---|---|
| Beauty (8% ≤ $10, 이후 15%, 전체 요율) | 10.00 | 0.80 |
| Beauty | 10.01 | 1.50 |
| Clothing (5% ≤ $15, 10% ≤ $20, 이후 17%) | 14.99 | 0.75 |
| Clothing | 19.99 | 2.00 |
| Everything Else 15%, min 0.30 | 1.50 | 0.30 |
