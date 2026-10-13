# 05. 설정 항목과 기본값

`packages/shared/src/settings.ts`에 타입과 기본값을 이 표 그대로 정의한다. 설정은 `chrome.storage.local`에 저장한다.
- **마켓별 설정**(`settings.us.*`): 수수료·배송·링크처럼 마켓마다 다른 값. `.ca`는 쓰지 않지만 구조는 남겨 둔다
- **공통 설정**(`settings.*`): 화면·동작
- **설정 구성(Configurations)**: 이름 붙인 설정 묶음을 최대 7개까지 만든다. 위치·폭·섹션 열림 같은 화면 상태는 구성에 넣지 않는다. 바꾸는 즉시 자동 저장한다
- Export/Import: 전체 설정을 JSON 파일로 저장하고 불러온다. 불러올 때는 키와 타입을 검증하고 모르는 키는 버린다

## 설정 팝업 탭 구성 (02 §K-5)
탭 순서: FBA · FBM · Sell Price/Buy Cost · ROI-Margin · 30/90/180 Table · Offers Table · Targets · Graphs · Variation Viewer · Position · General · Custom Links · Settings Configs · Display · (Copy and Export → export-settings 페이지 링크)

### FBA 탭 (마켓별)
| 화면 라벨 | 키 | 기본값 | 비고 |
|---|---|---|---|
| 마켓 선택 | | Amazon.com | .ca 라디오는 숨김 |
| Ship to FBA $/lb › Use dimensional weight | `fbaInboundUseDim` | false | 툴팁: 실제 무게와 치수 무게 중 큰 값을 쓴다. 대부분 끄고 쓴다 |
| Normal $/lb (체크 + 금액) | `fbaInboundEnabled`, `fbaInbound` | true, 0 | |
| Hazmat $/lb | `fbaInboundHazmatEnabled`, `fbaInboundHazmat` | true, 0 | |
| Prep 칩 (기본 켜짐 선택 + 편집) | `fbaExtrasEnabled`, `fbaExtrasBag/Tape/Label/Bubble`, `fbaExtrasChips` | true, 모두 false, {bag 0.70, tape 0.60, label 0.55, bubble 1.04} | 툴팁 "Click a chip to turn it on by default. Customize by clicking the edit icon." |
| Other | `fbaOtherEnabled`, `fbaOther` | true, 0 | |
| Monthly Storage (개월 + 체크) | `storageMonths`, `fbaCalcStorageFee` | 1, true | |
| Inbound Placement: Standard Size Tiers | `fbaInboundPlacementStandardEnabled`, `…StandardRegion`, `…StandardLocation` | true, "west", "2"(=5+) | Location 옵션 1 / 5+ |
| Inbound Placement: Bulky Size Tiers | `fbaInboundPlacementEnabled`, `fbaInboundPlacementRegion`, `fbaInboundPlacementLocation` | true, "west", "4"(=5+) | Location 옵션 1 / 2 / 3 / 5+ |
| Low Inventory Fee - Historical Days of Supply | `fbaLowInventoryEnabled`, `fbaLowInventoryPeriod` | true, "select" | |

### FBM 탭 (마켓별)
| 화면 라벨 | 키 | 기본값 |
|---|---|---|
| Ship revenue | `mfnShipRevEnabled`, `mfnShipRev` | true, 0 |
| Other | `mfnOtherEnabled`, `mfnOther` | true, 0 |
| FBM ship estimate (체크 + 방식 $/pound · Flat Rate · USPS) | `mfnShipEstimate`, `mfnShipEstimateMethod` | true, "usps" |
| $/pound 금액 | `mfnShipPoundPrice` | 0 |
| Flat Rate 금액 | `mfnShipFlatRate` | 0 |
| USPS 서비스 | `mfnUSPSMethod` | "ground_advantage" |
| USPS Ship Zone 4 / 5 / 8 | `mfnShipZone` | 5 (툴팁: Zone 4가 더 가까워 조금 싸다) |
| Use Priority for Hazmat | `mfnUSPSUsePriorityForHazmat` | false |
| Always Use Priority | `mfnUSPSAlwaysUsePriority` | false |

### Sell Price/Buy Cost 탭
| 화면 라벨 | 키 | 기본값 | 옵션 |
|---|---|---|---|
| Default Sell Price - FBM | `sellPriceOrderFBM` | "buybox_lowprice" | Buy Box then Low New / Low FBA then Buy Box then Low New / Low FBM then Buy Box then Low New |
| Default Sell Price - FBA | `sellPriceOrderFBA` | "buybox_lowprice" | Buy Box then Low New / Low FBA then Buy Box then Low New |
| Buy Cost Sales Tax % (마켓별) | `salesTax` | 0 | |
| (팝업 체크 기본값) | `useSalesTax` | true | |
| Buy Cost decimal places | `decimalBuyCost` | 2 | 2~6 |
| Buy Cost - Use List Price | `useListPrice` | false | |
| Save Buy Cost | `saveBuycost` | true | |
| Max Buy Cost Rules (FBA/FBM 라디오) | `maxBuyCostType` | "fba" | |
| FBA: Net ≥ $ / ROI ≥ % / Margin ≥ % | `maxBuyCostFBAByNet/ByROI/ByMargin` | 3 / 0 / 0 | |
| FBM: Net ≥ $ / ROI ≥ % / Margin ≥ % | `maxBuyCostMFNByNet/ByROI/ByMargin` | 3 / 0 / 0 | |

### ROI-Margin 탭
| 화면 라벨 | 키 | 기본값 | 옵션 |
|---|---|---|---|
| ROI Method (설명: 분자는 모두 순이익, 분모만 다르다) | `roiMethod` | "buyCostOnly" | 드롭다운에 각 방식 아래 공식 설명 줄(비활성 옵션)을 넣는다. 04 §3 표 |
| ROI and Margin decimal places | `decimalProfit` | 0 | 0 / 1 / 2 |
| Show ROI and Margin at bottom | `alwaysShowROI` | true | |

### 30/90/180 Table 탭
- 안내 "Select which rows appear after you click on the 30/90/180 button:"
- 행 체크 목록(드래그로 순서 변경). 키 `keepaMoreTableRows`(콤마 구분), 기본은 전체: `sales, salesDrop, avgRank, outOfStockRateAmz, outOfStockRate3p, avgPriceFBA, avgPriceBB, avgPriceNew, avgPrice3p, avgPriceUsed`
- 라벨: Sales / Rank - Drops / Rank - Avg / Out of Stock Rate - Amz / Out of Stock Rate - 3p / Price Avg - FBA / Price Avg - Buy Box / Price Avg - Amz / Price Avg - 3p / Price Avg - Used

### Offers Table 탭
- 안내 "Select which columns appear in the Offers table:"
- `offersTableColumns` 기본 `offers, stock, price, buybox, ship, rating, ratingCount`
- 설명 라벨: Offer type + Seller Name / Stock Count / Price / Buy Box % / Ship Date (not delivery date) / Rating % (storefront positive feedback %) / Rating (storefront rating count)
- 그 밖: `hideFBMColumn` false, `offersBuyBoxChartPinned` false, `defaultOffersCount` "active"

### Targets 탭
| 화면 라벨 | 키 | 기본값 |
|---|---|---|
| Sell Price Estimate for Target Profits ($, 콤마 구분) | `profitPriceTargets` | "0,1,2,3,4,10" |
| Sell Price / Buy Cost Est. for Target ROI (%) | `roiPriceTargets` | "0,10,20,30,40,50" |
| Sell Price / Buy Cost Est. for Target Margin (%) | `marginPriceTargets` | "0,10,20,30,40,50" |
| (섹션 라디오 기억) | `targetsFbaFbm`, `targetsMetric` | "fba", "margin" |

### Graphs 탭
| 화면 라벨 | 키 | 기본값 |
|---|---|---|
| Default range | `keepaRange` | 365 (옵션: 1 Day, 7 Week, 30 Month, 90 3 Months, 365 Year, all) |
| Invert Rank Y Axis | `keepaAxisYReverted` | false |
| (범례 표시 상태) | `keepaShowAmz` true, `keepaShowUsed` false, `keepaShow3p` true, `keepaShowSalesRank` true, `keepaShow3pFBM` false, `keepaShow3pFBA` false, `keepaShowBuyBox` false, `keepaShowRating` false, `keepaShowReviews` false, `keepaShowOffers` true, `keepaShowSold` true | |

### Variation Viewer 탭
| 화면 라벨 | 키 | 기본값 |
|---|---|---|
| Ignore sellers with 0 feedback | `vvIgnoreSellersZeroFeedback` | false |
| Click to open filters instead of hover | `vvClickToOpenFilters` | false |
| (기타) | `vvDefaultView` "table", `vvSalesSignalsRange` "all", `vvColumns` "img,reviews,rank,monthlySold,variationType1,variationType2,variationType3,price,lowFBAPrice,buyBoxPrice,amzPrice,offers", `vvUseSizeFilter` false, `sizeFilter`·`sizeFilterM`·`sizeFilterW` "" | |

### Position 탭
| 화면 라벨 | 키 | 기본값 |
|---|---|---|
| Keep main widget popped out, on top of Amazon page instead of below product title | `keepMainWidgetPoppedOut` | false |
| Popout position main | `mainWidgetPosition` | "top_middle" |
| Popout position variation viewer | `vvWidgetPosition` | "top_left" |
- 위치 옵션: top_left, top_middle, top_right, bottom_left, bottom_middle, bottom_right

### General 탭
| 화면 라벨 | 키 | 기본값 |
|---|---|---|
| Default Offer Condition (New/Used) | `defaultCondition` | "new" |
| Offers within % FBA | `closeFBAPercent` | 3 (1 / 2 / 3) |
| Sales Rank Drop Count Calculation | `salesRankDropCalcMethod` | "standard" (Standard / 3% Drop) |
| Fee Alerts: Show alert if within x% of lower fee | `feeSavingThreshold` | 10 |
| Show Search Features | `showSERPButtons` | true |
| Show Storefront features | `showStorefrontButtons` | true |
| On product detail pages, check Seller Central Calculator weight/dims | `checkSellerCentralDimensions` | false (P9 이후 선택 기능) |
| Auto Update/Smart Inputs | `smartInput` | false |
| Amazon.ca: Use metric system | `useMetricSystem` | false (숨김) |
| (Peak 수수료 사용) | `usePeakFees` | false |
| (프로모션 수수료 반영) | `usePromoFees` | true |
| (툴팁 숨기기) | `hideHints` | false |

### Custom Links 탭 (마켓별)
- 안내: URL에 `TITLE`, `TITLE6`(제목 첫 6단어), `ASIN`, `UPC`, `ISBN10`, `ISBN13`, `MODEL`을 넣을 수 있다
- **Links box after product titles** (`customTitleLinks`): 행 = Text, URL, 삭제. `+ New link`. 기본값

  | id | text | url |
  |---|---|---|
  | g (기본 제공) | G | `https://www.google.com/search?q=TITLE` |
  | gs (기본 제공) | GS | `https://www.google.com/search?tbm=shop&q=TITLE` |
  | copy (기본 제공) | (복사 아이콘) | 제목 복사 |
  | | W | `https://www.walmart.com/search/?query=TITLE` |
  | | E | `https://www.ebay.com/sch/i.html?_nkw=TITLE` |
- **Links in header / at top of main widget** (`customHeaderLinks`, 헤더 표시 토글 `customLinksOnTop` false). 기본값: Keepa `https://keepa.com/#!product/1-ASIN`, Camel `https://camelcamelcamel.com/product/ASIN`. 안내: 여기 링크는 헤더 Links 팝업에 나오고, 토글을 켜면 헤더 줄에도 나온다

### Settings Configs 탭
- 안내 "You can create up to 7 configurations."
- 순서 안내 1) 이름 입력 후 Create 2) 같은 방법으로 더 만들기 3) 상단 "Current Settings Configuration"에서 바꾸기(자동 저장) 4) 메인 위젯의 Net 옆 톱니에서 바로 바꾸기
- 키 `confName`(현재 구성 이름)

### Display 탭
- Font Size 라디오 `displayFontSize`: smaller(-10%) / small(-5%) / default / large(+5%) / larger(+10%). 기본 default
- 팁 문구: 페이지 전체 크기는 브라우저 확대(Ctrl/Cmd + +/-)로 조절

## 화면 상태 (구성에 넣지 않음)
| 키 | 기본값 |
|---|---|
| `sidebar` | false |
| `sidebarWidth` | 400 |
| `sidebar3pWidth` | 500 |
| `listsWidgetWidth` | 435 |
| `sidebarOpenSections` | "stats,calculator,productInfo,offers,graph" |
| `widgetOpenSection` | "" |
| `dragPosition` | "" |
| `autoKeepaTable`, `autoTargetsTable`, `autoOffersWidget`, `autoNotes`, `autoKeepaGraph` | false |
| `autoCopyExportPinned`, `autoCopyExportPinnedType` | false, "Google" |
| `enableSERP`, `enableStorefrontSERP`, `enableStorefront` | false, false, true |
| `serpViewMode`, `storefrontViewMode`, `serpSpeedMode`, `serpTableSort` | "widget", "graph", "all", "" |
| `storefrontShowRank` | false |
| `bulkPerPage`, `bulkExportAll`, `bulkCols` | 200, true, "" |
| `search3pSource` | "amazon" |
| 내보내기: `exportOrder`, `exportMode`, `exportConf`, `exportConfActive`, `exportSheetTitle`, `exportCustomBlankFields` | 기본 필드 순서, "gsheets", {}, "", "", {} |
| 공유 이미지: `shareImageLayout`, `shareImageFields`, `shareImageFulfillment`, `shareImageTitle`, `shareVelocity`, `shareCalculator`, `shareGraphs`, `shareTargets`, `shareOffers` | "vertical", "{}", "fba", 모두 true |
| 기능 안내 점(처음 클릭 전 초록 점) | `featureDiscovery: {bulk, history, lists, google}` 모두 false |
