# 06. 화면 필드별 데이터 출처

출처 약어: **CAT** Catalog Items v2022-04-01 `getCatalogItem` · **OFF** Product Pricing v0 `getItemOffers` · **FEE** Product Fees v0 `getMyFeesEstimates` · **RST** Listings Restrictions v2021-08-01 · **ELG** FBA Inbound Eligibility v1 `getItemEligibilityPreview` · **PRP** Fulfillment Inbound v0 `getPrepInstructions` · **KP** Keepa product · **KS** Keepa seller · **DOM** 아마존 페이지 · **D1** 사용자 데이터 · **CALC** packages/core 계산

마켓플레이스 ID(US): `ATVPDKIKX0DER`. Amazon 자체 오퍼의 셀러 ID: `ATVPDKIKX0DER`.

## 상단·헤더
| 화면 값 | 출처 | 상세 |
|---|---|---|
| ASIN | DOM | URL `/dp/{ASIN}`, `/gp/product/{ASIN}`. 변형을 바꾸면 URL이 바뀐다 |
| 부모 ASIN | CAT | `relationships[].relationships[] type=VARIATION, parentAsins` |
| 상품명 | CAT → DOM | `summaries[].itemName`, 없으면 `#productTitle` |
| 랭크, 카테고리 | CAT → KP | `salesRanks[].displayGroupRanks[0]`(대분류). 없으면 `classificationRanks`, 그래도 없으면 Keepa `salesRanks`·`categoryTree`. 자식 ASIN에 랭크가 없으면 부모 ASIN 랭크("loading parent rank...") |
| Top % | CALC | 04 §7 |
| 30d Sales | DOM → KP | `#social-proofing-faceout-title-tk_bought` 문구(예: "1K+ bought in past month"). 없으면 Keepa `monthlySold` |
| 30d Drops, 90d Rank, 90d 3p/Used/Amz | KP | `stats.salesRankDrops30`, `stats.avg90[3]`, `stats.avg90[1]`, `[2]`, `[0]` |
| 30/90/180 표 | KP | `stats.avg30/avg90/avg180`, `outOfStockPercentage30/90`, `salesRankDrops*`, `monthlySold` |
| Sell/Appr/Rstr | RST | `restrictions` 비어 있음 → Sell. `reasons[].reasonCode`가 APPROVAL_REQUIRED → Appr, NOT_ELIGIBLE → Rstr, ASIN_NOT_FOUND → `--`. 승인 링크는 `reasons[].links[]` |
| Used 조건별 제한 | RST | conditionType `used_like_new`, `used_very_good`, `used_good`, `used_acceptable`를 각각 호출 |
| Tp | RST | reasons의 message에 "Transparency"가 들어 있으면 표시. 없으면 숨김 |
| Haz | ELG + FEE + CALC | ELG `isEligibleForProgram=false`이고 사유 코드가 위험물 관련이면 빨강. 수수료 비교에서 위험물로 판정되면(04 §2-4) 빨강. 검토 중 코드면 Rvw. 코드표는 SP-API 문서에서 확인해 `lib/hazmatCodes.ts`에 모은다 |
| Melt | CALC + D1 | 카테고리·제목 키워드 규칙과 사용자 키워드 목록 |
| IP | D1 | IP 주의 브랜드 목록에 브랜드가 있으면 |
| Switch SC | — | 이 구현에서는 쓰지 않는다(SP-API는 마켓을 직접 지정). UI 자리만 남긴다 |

## 계산기
| 화면 값 | 출처 | 상세 |
|---|---|---|
| FBA/FBM 오퍼 수 | OFF | `Summary.NumberOfOffers[]`에서 condition과 fulfillmentChannel(Amazon/Merchant)별 OfferCount |
| List price | OFF → CAT | `Summary.ListPrice`, 없으면 CAT `attributes.list_price` |
| 기본 판매가 | OFF | `Summary.BuyBoxPrices[condition=New].LandedPrice`, `LowestPrices[]`(04 §6) |
| 매입가 | D1 | 저장된 buy cost |
| 판매 수수료 규칙, 풀필먼트(정답값), 마감 수수료 | FEE | 가격 9 / 13 / 350에서 IsAmazonFulfilled=true로 견적. `FeeDetailList`의 ReferralFee, FBAFees, VariableClosingFee |
| 사이즈 티어, 무게, 치수 | CAT | `dimensions[].package`(length, width, height는 inches, weight는 pounds). 단위가 다르면 변환한다. 없으면 `dimensions[].item` + "치수 추정" 표시 |
| 보관료, 입고 배치, 재고 부족, 입고 배송비, Prep 칩 | CALC | 04 §2 |
| FBA 입고 불가 사유 | ELG | `ineligibilityReasonList` |
| Net·ROI·Margin·Breakeven·Max Cost·Targets | CALC | 04 §3, §5 |

## 상품 정보 박스
| 화면 값 | 출처 | 상세 |
|---|---|---|
| 브랜드, 제조사, 모델 | CAT | `attributes.brand`, `attributes.manufacturer`, `attributes.model_number`(또는 `part_number`) |
| UPC/EAN/ISBN | CAT | `identifiers[].identifiers[]` (identifierType UPC, EAN, ISBN) |
| 등록 경과일 | KP → CAT | Keepa `listedSince`, 없으면 CAT `attributes.product_site_launch_date` |
| 상품 그룹, productType | CAT | `summaries[].websiteDisplayGroup`, `productTypes[].productType` |
| Prep 요구사항 | PRP | `ASINPrepInstructionsList[].PrepInstructionList`, 없으면 "None Listed". 팝업을 열 때만 호출 |
| LTSF | CALC | `ltsfTable` × cubic feet |

## 오퍼 요약·Offers 섹션
| 화면 값 | 출처 | 상세 |
|---|---|---|
| Low FBA / Low FBM | OFF | `Summary.LowestPrices[]`의 New + Amazon / Merchant, LandedPrice |
| Buy Box | OFF | `Summary.BuyBoxPrices[]` |
| BB 자격 오퍼 수 | OFF | `Summary.BuyBoxEligibleOffers[]` |
| Amz | OFF | `Offers[]` 중 SellerId = ATVPDKIKX0DER의 가격. 없으면 `--` |
| CPT | OFF | `Summary.CompetitivePriceThreshold`. 응답에 없으면 `--` |
| Low FBA 근접 오퍼 수 | OFF | `Offers[]`의 FBA 오퍼 가격으로 계산 |
| 오퍼 표: 셀러명 | KS | 셀러 ID로 Keepa seller 요청(24시간 캐시). 이름이 없으면 셀러 ID 앞 6자리 |
| 오퍼 표: 가격, 배송, 피드백 %, 평가 수, 발송 예정 | OFF | `ListingPrice + Shipping`, `ShippingTime`, `SellerFeedbackRating.SellerPositiveFeedbackRating`, `FeedbackCount` |
| 오퍼 표: 재고 | KP(offers) | `offers[].stockCSV` 마지막 값 |
| 오퍼 표: Buy Box % | KP | `stats.buyBoxStats[sellerId].percentageWon`(buybox=1과 stats=기간 파라미터 필요). 기간 선택이 바뀌면 다시 요청 |
| Suppr % | KP | 기간 중 Buy Box 히스토리(`buyBoxSellerIdHistory`)에서 셀러가 "-1"(바이박스 없음)인 시간 비율 |
| 재고 합계 | KP(offers) | 오퍼별 재고 합. FBA, FBM, Amazon으로 나눠 센다 |
| Historical Offers | KP(offers) | `offers[]` 중 현재 `liveOffersOrder`에 없는 오퍼 |

## 그래프
| 데이터셋 | Keepa csv 인덱스 |
|---|---|
| Amz | 0 (AMAZON) |
| 3p (New) | 1 (NEW) |
| Used | 2 (USED) |
| Rank | 3 (SALES) |
| 3p FBA | 10 (NEW_FBA) |
| 3p FBM | 7 (NEW_FBM_SHIPPING) |
| BuyBox | 18 (BUY_BOX_SHIPPING) |
| Offers | 11 (COUNT_NEW) |
| Rating | 16 (RATING, 값 ÷ 10) |
| Review Count | 17 (COUNT_REVIEWS) |
| Monthly Sold | `monthlySoldHistory` |
가격 값은 센트 단위다. 배송비가 포함된 시계열(…_SHIPPING)은 [시간, 가격, 배송비] 3개씩 끊어서 가격 + 배송비로 쓴다.

## Variation Viewer, 검색결과, 벌크
| 화면 값 | 출처 |
|---|---|
| 변형 목록과 변형 속성 | CAT `relationships`(부모 ASIN 기준 childAsins와 variationTheme), 부족하면 DOM `#twister` |
| 변형별 가격·오퍼 수 | `getItemOffersBatch`(20개씩) |
| 변형별 랭크·판매·리뷰 | Keepa 묶음 요청(최대 100 ASIN, stats만) |
| 검색결과 ASIN 목록 | DOM `[data-asin]` 카드 |
| UPC → ASIN | CAT `searchCatalogItems`(identifiersType=UPC/EAN/GTIN, 한 번에 20개) |
| 벌크 수수료 | FEE 20개 묶음 |
| 스토어프런트 상품 | KS(storefront=1)의 `asinList`, 브랜드·카테고리 통계 |
| Product Finder | Keepa `/query` (Sourcing > Search Products) |
