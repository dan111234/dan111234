# reference 데이터

| 파일 | 내용 |
|---|---|
| `fee-tables-us-2026.json` | 아마존 US 2026년 FBA·판매 수수료 수치 |
| `category-tables-us.json` | `categoryIdToNameTable`: 카탈로그 websiteDisplayGroup 값을 랭크 카테고리 표시명으로 바꾸는 표. `totalProductsTable`: Top % 계산용 카테고리별 전체 상품 수 추정치 |

## fee-tables-us-2026.json 키
| 키 | 모양 | 쓰는 곳 |
|---|---|---|
| `referralFeeTable` | 카테고리명 → 판매 수수료 규칙 | 04 §2-5 |
| `referralFeesEstimateTable` | `[{price9, price13?, price350, result}]`: API 견적 금액으로 규칙을 찾는 표 | 04 §2-5 |
| `closingFeeTable` | 카테고리명 → 변동 마감 수수료 | 04 §2-5 |
| `sizeTierTable` | 티어명 → `{longest, medium, shortest, lengthGirth, weight}` (inch, lb). weight가 객체면 `{Media, nonMedia}` | 04 §2-1 |
| `packagingWeightTable`, `packagingWeightTableMFN` | 티어명 → 포장 무게(lb) | 04 §2-2, §4 |
| `fulfillmentFeeTable`, `…ClothingTable`, `…HazmatTable` | 티어명 → `{fees: [NonPeak표, Peak표]}`. 각 표는 무게 구간 키 → `[<$10, $10–50, >$50]`, `above: {startFrom, every, fee[3]}` | 04 §2-3 |
| `storageFeeTable`, `storageFeeHazmatTable` | 티어명 → `[1~9월 $/cu ft, 10~12월 $/cu ft]` | 04 §2-6 |
| `ltsfTable` | 보관 일수 구간 → `{foot: $/cu ft, unit?: 단위당 최소}` | 02 §K-13 |
| `inboundPlacementTable` | 티어 → 지역(west/central/east) → 무게 구간 → `[입고지 1, 2, 3]` | 04 §2-7 |
| `lowInventoryTable` | 티어 → 기간 → 요금. Large Standard는 `[3lb 이하, 3lb 초과]` 배열 | 04 §2-8 |
| `uspsPriceTable` | 서비스 → 무게 키 → `[Zone4, Zone5, Zone8]`(media_mail은 단일 값) | 04 §4 |
| `fbaExtrasFeeTable` | Prep 칩 기본 금액 | 04 §2-10 |
| `overmaxFeeTable` | Extra Large 티어 → 추가 요금 | 04 §2-1 |

## 주의
- 문자열 `"Infinity"`는 상한 없음이다. 로드할 때 숫자 `Infinity`로 바꾼다. 빈 문자열 `""`은 해당 없음이다.
- 이 수치는 아마존이 공개한 2026년 수수료표를 옮긴 것이다. 아마존은 해마다(보통 1월 중순) 수수료를 바꾸고, 중간에 추가 요금을 붙이기도 한다. **SP-API 견적이 항상 우선**이고, 로컬 표는 가격·치수를 바꿔 보는 계산과 SP-API가 주지 않는 항목(보관료, 입고 배치, 재고 부족, Peak 기간)에만 쓴다.
- 표를 고칠 때는 아마존 공식 페이지(Seller Central 도움말 "FBA fulfillment fees", "Monthly inventory storage fees", "Inbound placement service fee", "Low-inventory-level fee", "Referral fees")와 `pnpm verify:fees` 결과로 확인한다.
- USPS 요금(`uspsPriceTable`)은 USPS 소매 요금 기준이라 실제 라벨 구매가와 다를 수 있다.

## 검증 기록
- 2026-10-13: 사용자 ASIN 21개로 `pnpm verify:fees` 실행. 17개는 $9/$13/$350 세 가격대 모두 SP-API와 같다(신발, 의류, Lg Bulky, XL, Beauty 규칙 포함). 표 값은 2026 공식 요율표와도 같다.
- 차이가 난 4개(B0D22SLTFX, B0DQFCVFH5 의류 / B0D2S47TDZ, B0G27LRQQD Small Bulky)는 세 가격대에서 차이가 똑같다. 카탈로그 치수로 계산한 무게 구간이 아마존 청구 구간과 다르다는 뜻이고, 아마존이 창고에서 잰 치수가 카탈로그와 다른 경우로 보인다. 실제 화면에서는 SP-API 값을 쓰므로(04 §2-4) Net에는 영향이 없다.
- 확인된 규칙: SP-API 견적에는 3.5% 연료·물류 추가 요금이 이미 들어 있다. 신발(SHOES, SANDAL)은 의류 표가 아니라 일반 표를 쓴다. `packages/core/src/fees/fixtures/spapi-quotes-2026-10-13.json`이 회귀 테스트로 이 결과를 고정한다.
