# 03. 그 밖의 화면 UI 스펙

메인 위젯 외의 화면이다. 구현 순서는 08 로드맵(P5~P9)을 따른다. 공통 시각 규칙은 02 문서 처음 부분과 같다.

## §A. Variation Viewer (변형 비교)
**진입**: 상세페이지 변형 선택 영역(`#twister` 등) 위에 초록 버튼 "Variation Viewer"를 띄운다. 클릭하면 페이지 위에 패널이 뜬다(기본 위치는 설정 `vvWidgetPosition`, 기본값 top_left). 패널은 끌어서 옮길 수 있다.

**상단 바**: 로고, 부모 ASIN, 드래그 버튼(툴팁: 클릭 후 상단을 끌어 이동, 다시 누르면 원위치), Google Sheets / Export / Copy 버튼(툴팁: Settings에서 필드 지정), Help, 닫기.

**Help 화면**(Back 버튼으로 복귀): 행을 클릭하면 페이지가 그 변형으로 바뀐다(품절 변형 제외). Price는 재고 있는 New 최저가(바이박스가 아닐 수 있음). 오퍼 수는 New만 센다. Low FBA $는 Low $와 다른 API 값이라 FBA 오퍼가 백오더면 비어 있을 수 있다.

**필터 영역 "Sales Velocity Signals"**(접이식)
- 체크박스 `In Stock Variations`, `Out of Stock Variations`, `Amazon`(모두 기본 켬)
- `My Shoe Size Filters` 체크 + `Choose: Men | Women` 프리셋 + 사이즈 칩 목록(설정 `sizeFilter`, `sizeFilterM`, `sizeFilterW`). 툴팁: 선택한 숫자가 사이즈명에 들어간 변형만 표시
- 리뷰 수와 판매 추정은 가능한 가장 긴 기간을 기본으로 한다(설정 `vvSalesSignalsRange`)
- `Jump to Active` 버튼: 현재 보고 있는 변형 행으로 스크롤
- 설정 "Click to open filters instead of hover"가 켜져 있으면 클릭으로 연다

**툴바**: `Close All Offers`, `All` 전체 선택 체크, `Get Low FBA $` 버튼(툴팁: 가격 조회가 느리니 필요할 때만), `Avg price: $X`, 보기 전환 `Table | Images | Graphs`, `Columns` 메뉴.

**열**(Columns 메뉴에서 켜고 끄기, 기본은 설정 `vvColumns`)
| key | 라벨 | 내용 |
|---|---|---|
| img | Image | 썸네일(hover 시 확대) |
| rank | ASIN/UPC | ASIN(복사), UPC, 랭크 |
| reviews | Review Counts | 변형별 리뷰 수(가능하면 30/90/전체) |
| monthlySold | 30d Sales | bought in past month 또는 Keepa |
| variationType1~3 | Variation Type 1~3 | 예: Size, Color |
| price | Low $ | New 최저가 |
| lowFBAPrice | Low FBA $ | |
| buyBoxPrice | BuyBox $ | |
| amzPrice | Amz $ | |
| offers | Offer Counts | FBA/FBM 오퍼 수 |
- 표 하단 고정 문구 "* Variation Viewer Only Show New Condition Prices"
- 열 머리 클릭으로 정렬, 행 앞 체크박스는 내보내기 대상 선택
- 가격 조회가 느릴 때 상단 안내 "Amazon has reduced the speed of getting pricing information..." + "Hide message"
- 데이터: 변형 목록은 Catalog Items의 relationships(또는 페이지 twister), 가격은 getItemOffersBatch(20개씩 묶음), 랭크와 판매량은 Keepa 묶음 요청
- 설정 "Ignore sellers with 0 feedback"이 켜져 있으면 피드백 0인 셀러 오퍼는 최저가 계산에서 뺀다

**Child ASIN 확인**: 위젯 안의 "Check for Child ASINs" 버튼을 누르면 부모 ASIN 아래 자식 ASIN 목록 표를 보여준다(Catalog relationships).

## §B. 검색결과 페이지 (SERP)
**토글 바**: 검색결과 상단에 작은 바를 띄운다. 설정 "Show Search Features"가 꺼져 있으면 띄우지 않는다.
- 보기 모드 `Widget | Table | Graph`(설정 `serpViewMode`)
- 켜기/끄기 스위치(설정 `enableSERP`)

**Widget 모드**: 각 검색결과 카드 아래에 작은 위젯을 붙인다. 내용(위에서 아래로):
1. `#{랭크} in {카테고리}`(접기 쉐브론) + 상품명 링크
2. 배지: Melt, Haz, Tp, IP, 판매 제한(Sell/Appr/Rstr), 별(리스트 담기)
3. 1열: "bought in past month" 값(툴팁: 아마존이 제공한 추정치), `Max Cost {$}`(설정이 없으면 "Define" 툴팁)
4. 2열 2×2: `Low FBA`, `Low FBM`, `Buy Box`, `AMZ` 가격(오퍼를 아직 안 불렀으면 `get` 링크, 툴팁 "We can only check the lowest 20 offers.")
5. `Net FBM ({FBM 오퍼 수}) ${n}`, `Net FBA ({FBA 오퍼 수}) ${n}`
6. `Offers: FBA {n} | FBM {n}`, `Brand: {브랜드}`(브랜드 액션), `{티어 약어} {무게 단위}: {무게}`, `ASIN: {복사}`, `UPC: {복사}`, Google/Copy 내보내기 아이콘
- 화면에 보이는 카드만 불러온다(01 §5).
- Net 계산에 쓰는 Sell Price는 Default Sell Price 규칙을, Buy Cost는 저장된 매입가를 쓴다.

**Table 모드**: 페이지 위에 큰 패널(iframe 또는 확장 페이지)을 띄운다.
- 진행 스피너, `Stop`, `Export .CSV`, "Copy & Export configuration" 셀렉트, `Exclude if Amz in Stock` 체크, `Columns` 버튼
- 기본 열 순서(검색결과용): date, asin, title, upc, itemBrand, sizeTier, sales30d, rank, rankCategory, productURL, buyboxPrice, lowAmzPrice, lowFBAPrice, lowUsedPrice, fbaNetProfit, mfnNetProfit, newOffers, usedOffers, fbaOffers, ipComplaintReason, meltable, hazStatus, restrictions, keepaImg365
- 열 머리 클릭으로 정렬(설정 `serpTableSort`로 기억)

**Graph 모드**: 각 결과 카드 옆에 Keepa 미니 그래프(가격·랭크)를 그린다. 그래프 기간은 Graphs 설정을 따른다.

## §C. 스토어프런트 분석
**진입**: 셀러 스토어프런트 페이지(`/sp?seller=`, `/s?me=`)에서 자동으로 표시한다. 설정 "Show Storefront features"로 끌 수 있다.
- 상단 아이콘: History, Lists, Bulk Analysis, Sourcing
- 제목 "Storefront Analysis", 스피너
- 옵션: `Exclude if Amz in Stock`, `Show Rank in Graphs`(설정 `storefrontShowRank`), `Export`, 보기 `Graph | Table`(설정 `storefrontViewMode`)
- 요약 카드
  - 헤더: 셀러명
  - Location, ASINs in Store, 90d Review Count
  - "Show Analysis for Products on this Page" 버튼
  - **Top Brands** 표(브랜드 버튼 | ASIN count, `More`로 확장). 브랜드를 누르면 그 브랜드로 필터한다
  - **Top Categories** 표(카테고리 버튼 | ASIN count, `More`)
- 하단 안내 "All counts and data should be considered estimates."
- 데이터: Keepa seller 요청(storefront=1)으로 ASIN 목록과 브랜드·카테고리 통계를 받는다. 상품 행은 검색결과 Table 모드와 같은 열을 쓴다

## §D. 다른 사이트에서 아마존 검색 (3P Sidebar)
- 진입 방법 세 가지: 브라우저 툴바의 확장 아이콘 클릭, 텍스트를 드래그한 뒤 우클릭 메뉴 "OA Lens - Amazon Search", 이미지 우클릭 메뉴(이미지 alt나 파일명으로 검색)
- 오른쪽 사이드 패널(폭 기본 500px, 끌어서 조절, 설정 `sidebar3pWidth`)
- 상단 아이콘: History, Lists, Bulk Analysis, Sourcing
- 제목 "Amazon Search", 검색어 입력 + `Search`, 출처 체크 `Amazon`(검색결과 페이지를 새 탭으로 여는 화살표) / `Seller Central`(SC 상품 검색 화살표), 마켓 `.com`(.ca는 숨김)
- 결과: 검색결과 위젯(§B)과 같은 카드 목록. 출처는 SP-API `searchCatalogItems`(keywords)
- 소매 사이트(Walmart, Target 등) 상품 페이지에서 제목이나 UPC를 자동으로 읽어 검색어에 채운다. 사이트별 선택자는 `lib/retailerDom.ts`에 모은다

## §E. Lists & History 패널
**진입**: 메인 위젯 하단 바 History/Lists, 또는 각 화면 상단 아이콘. 페이지 오른쪽 패널(폭 기본 435px, 설정 `listsWidgetWidth`).

**History 탭**
- 처음 열면 안내 모달: "History helps you find products you viewed in the last 30 days. Search, sort by visit date, or open a listing again." + "Got it"
- 검색칸 "Search product in history" + 지우기 X, 정렬 버튼 → Sort By 팝업(`Newest to Oldest` / `Oldest to Newest`, 선택 항목에 체크)
- 행: 썸네일, 제목(링크), ASIN, 브랜드, 판매 제한 배지, 본 날짜·시각, 별(리스트 담기)
- 보관 기간은 30일(D1에서 cron으로 정리). 같은 ASIN을 다시 보면 시각만 갱신한다

**Lists 탭**
- 처음 열면 안내 모달(리스트 개념, 메인 위젯 오른쪽 위 별로 담는다는 설명)
- 상단: 전체 리스트 검색칸 "Search product in lists", `+` 버튼 → "Create New List" 팝업(이름 입력)
- 리스트 목록: 이름, 상품 수, 편집(→ "Edit List Name" 팝업), 삭제, 내보내기
- 리스트를 열면 검색칸 "Search product in list"와 상품 행(썸네일, 제목, ASIN, 담은 날짜, 담을 때 가격·랭크 스냅샷, 메모 아이콘, 다른 리스트로 담기 "Your Lists" 팝업, 빼기)
- 기본 리스트("Saved")는 자동으로 만든다

## §F. Bulk Analysis 페이지
- 상단: 로고, `How It Works`(도움말 모달), 제목 "Bulk Analysis", 닫기
- 입력: 텍스트칸 "Paste ASINs or UPCs (max 2,000)" **OR** `File` 버튼(.xlsx/.csv/.tsv/.txt). 안내: 파일에 매입가와 판매가를 넣을 수 있다. 엑셀은 첫 시트만 읽고 수식·매크로는 받지 않는다
- 마켓 `Amazon.com`(.ca 숨김)
- 모드 라디오
  - `Restrictions` (번개 아이콘, 기본값): 판매 제한, Hazmat, Meltable, IP, 랭크, 기본 카탈로그만 빠르게
  - `All Data`: 가격·수수료·오퍼·내보내기 필드까지 전부(느림)
- `Analyze`, 스피너, `Stop`, 파일명 표시, `Export`, "Copy & Export Config" 셀렉트, 내보내기 설정 버튼, `Columns`
- 결과 표: 선택한 내보내기 구성의 열. 페이지당 200행(설정 `bulkPerPage`), 정렬 가능
- 10자리 숫자만 붙여넣으면 "Are these ASINs or UPCs?" 모달(`Analyze as ASINs` / `Match as UPCs`)
- 파일을 넣으면 "Confirm Data Columns" 모달: 식별자 종류(ASINs/UPCs), Identifier column, EAN fallback column, GTIN fallback column, Buy Cost column, Sell Price column, "Buy cost is for one unit; multiply it by Amazon's pack quantity for multipack ASINs"(기본 켬), 검증 요약, `Cancel` / `Load File`
- UPC 매칭: `searchCatalogItems`(identifiersType=UPC/EAN/GTIN, 20개씩). 한 UPC에 ASIN이 여러 개면 모두 행으로 만든다
- 처리 중에 탭을 닫으면 결과가 사라진다는 안내. 진행 상황은 메모리에만 둔다
- 수수료는 `getMyFeesEstimates` 20개 묶음

## §G. Sourcing 페이지
- 상단: 로고, `How It Works`, 제목 "Sourcing", 닫기. 처음 열면 환영 모달
- 모드 카드 3개(라디오)
  1. **Profitability**: "Review profit based on costs you've entered". 저장된 매입가 최근 10,000건을 불러와 현재 바이박스(없으면 New 최저가) 기준 FBA/FBM 순이익을 계산한다. `Analyze` / `Stop`
  2. **Restrictions**: "Brands and ASINs viewed". 지금까지 위젯에서 본 ASIN의 브랜드별 판매 제한 기록. Report Type `Brands | Products`, Restriction Status 필터 `All | Sell | Appr | Rstr | Mixed`, Last Checked(All time/Today/7/30/90일), 브랜드 검색. 브랜드를 누르면 그 브랜드 ASIN 목록(최대 1,000)
  3. **Search Products**: "Search and filter products". Keepa Product Finder 래퍼
     - 필터: Brand, Seller IDs(콤마 구분), Rank From/To, Sales Rank Category(전체 선택/해제/완료가 있는 체크 목록), Buy Box From/To, Offers From/To, Amazon is selling(Any/Yes/No), 30 Day Sales From/To(툴팁: 아마존이 모든 상품에 30일 판매를 주지는 않음), `Additional Filters`, Sort 셀렉트
     - Saved Searches 셀렉트 + 이름 바꾸기·삭제, 이름 입력 + `Save`, `Reset`, `Search`(조건이 없으면 비활성, 툴팁 "Please add search criteria first")
     - 결과는 최대 1,000 ASIN, 상세는 50개씩 `Load More`
     - Restrictions에서 넘어왔으면 "← Back to Restrictions" 링크
- 마켓 `.com`(.ca 숨김)
- 결과 표 공통: 카메라 아이콘(이미지 미리보기), 제목 링크, ASIN 복사, 판매 제한 배지, 리스트 담기, 정렬. 상단 요약 문구, `Export`(선택한 ASIN 또는 처음 10,000건, 툴팁)

## §H. Copy & Export
**구성(Configuration)**: 내보낼 필드와 순서의 묶음. 여러 개를 저장할 수 있고 화면마다 고를 수 있다(설정 `exportConf`, `exportConfActive`).

**export-settings 페이지**
- 왼쪽: 사용 가능한 필드 목록(검색 가능, 그룹별)
- 오른쪽: 선택한 필드(드래그로 순서 변경). `Blank` 필드로 빈 열을 끼울 수 있고, 빈 열 이름을 따로 지정할 수 있다(`exportCustomBlankFields`)
- 구성 이름 저장·삭제·복제
- Google Sheets 대상: Apps Script 웹앱 URL과 시트 탭 이름(`exportSheetTitle`) 입력, `Test` 버튼

**전송 방식**
- Copy: 탭 구분 텍스트를 클립보드에 복사(엑셀·시트에 붙여넣기). 첫 줄 헤더 포함 여부 옵션
- Export: CSV 파일 다운로드
- Google Sheets: Apps Script 웹앱에 `POST {sheet, headers, rows}`. Apps Script는 헤더가 없으면 만들고 행을 추가한 뒤 `{ok, rowNumber}`를 돌려준다. 예시 스크립트는 P5 단계에서 `tools/apps-script/Code.gs`로 만든다

**필드 목록**(key, 의미). 그룹 이름은 화면에 그대로 쓴다.
- 기본: blank, date, asin, asinLink, parentAsin, parentAsinLink, upc, isbn10, isbn13, model, productURL, title, breadcrumbs, imageURL, keepaImg365(Keepa 1년 그래프 이미지 URL), itemBrand, itemBinding, productGroup
- 랭크·판매: rank, rankCategory, rankPercentile, sales30d, reviews, reviewsPercentage, revCount
- 제한·위험: restrictions, transparency, hazStatus, meltable, ipComplaintReason
- 오퍼: fbaOffers, mfnOffers, allOffers, newOffers, usedOffers, fbaUsedOffers, mfnUsedOffers, closeFBAOffers, lowNewPrice, lowUsedPrice, lowFBAPrice, lowMFNPrice, lowAmzPrice, listPrice, buyboxPrice, buyboxPriceNew, buyboxPriceUsed, thisSellerPrice
- 수수료: resReferalFee, resReferalFeePercent, resReferalFeePercentages, resFulfillmentFee, resFulfillmentFeePeak, resFulfillmentFeeChecked(현재 선택한 기간의 값), resFulfillmentFeePeakNonPeakChecked, resClosingFee, resInboundShipping, resInboundPlacement, resLowInventory, mfnShipToBuyer, resBuyCostSalesTax, mfnOtherFee, fbaOtherFee, storageFee, fbaMonthlyStoragePeak, storageFeeLTSF
- 크기: itemWeight, itemShipWeight, dimensions, sizeTier
- FBA 결과: fbaSellPrice, fbaBuyCost, fbaBuyCostOther, fbaBuyCostOtherShipToFBA, fbaNetProfit, fbaRoi, fbaMargin, fbaNetProfitNormal, fbaRoiNormal, fbaMarginNormal, fbaNetProfitPeak, fbaRoiPeak, fbaMarginPeak, fbaFeesExpenses, fbaFeesExpensesNoBuyCost, maxBuyCost
- FBM 결과: mfnSellPrice, mfnBuyCost, mfnBuyCostOther, mfnNetProfit, mfnRoi, mfnMargin, mfnFeesExpenses, mfnFeesExpensesNoBuyCost, maxBuyCostMFN
- Keepa 통계: keepaAvgPriceNew30/90/180, keepaAvgPrice3p30/90/180, keepaAvgPriceUsed30/90/180, keepaAvgPriceFBA30/90/180, keepaAvgRank30/90/180, keepaSalesDrop30/90/180, outOfStockRateAmz30/90, outOfStockRate3p30/90
- 변형: variations, variationsModelUPC, variation1, variation2, variation3, vvAvgPrice, variationsInStock, variationsOutOfStock, variationsTotal
- 메모: exportNotes, exportLastNote, exportUnsavedNote, exportQuantity, exportLastQuantity, exportUnsavedQuantity, exportLink, exportLastLink, exportUnsavedLink
- 벌크 전용: bulkImportedIdentifier, bulkMatchedUPC, bulkAmazonPackQuantity, bulkImportedUnitBuyCost, bulkAdjustedBuyCost, bulkSellPriceForCalc

## §I. 확장 옵션 페이지 (OA Lens 고유)
- Worker URL, EXT_SHARED_KEY 입력 + `연결 테스트`(→ `/v1/health`, SP-API 토큰 상태, Keepa 남은 토큰 표시)
- 셀러 ID 표시(Worker에서 읽기 전용)
- 캐시 비우기, 설정 Export/Import
- IP 주의 브랜드 목록 편집(브랜드, 사유)
- Melt 키워드 목록 편집
