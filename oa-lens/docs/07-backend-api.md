# 07. Worker API · 캐시 · D1 스키마

## §1. 공통
- Base URL: `https://oa-lens.<계정>.workers.dev`
- 인증: 모든 요청에 `Authorization: Bearer <EXT_SHARED_KEY>`를 붙인다. 키가 틀리면 401
- CORS: 확장 origin만 허용
- 응답 형식: 성공 `{ ok: true, data, cached: boolean, fetchedAt }`, 실패 `{ ok: false, error: { code, message, retryAfter? } }`
- 오류 코드: `AUTH`(LWA·키 문제), `RATE_LIMIT`(429, retryAfter 초), `NOT_FOUND`, `UPSTREAM`(아마존·Keepa 5xx), `BAD_REQUEST`
- `{mp}`은 지금은 `us`만. 마켓플레이스 ID는 Worker 상수로 둔다

## §2. SP-API 프록시
LWA access token은 `POST https://api.amazon.com/auth/o2/token`(grant_type=refresh_token)으로 받는다. KV에 55분 캐시하고, 요청 헤더 `x-amz-access-token`에 넣는다. AWS SigV4 서명은 필요 없다. 호스트는 `https://sellingpartnerapi-na.amazon.com`.

| Worker 경로 | SP-API | 쿼리·본문 | 캐시 TTL |
|---|---|---|---|
| `GET /v1/{mp}/spapi/catalog/{asin}` | `GET /catalog/2022-04-01/items/{asin}` | includedData=attributes,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries,classifications | 7일 |
| `GET /v1/{mp}/spapi/catalog/search?type=UPC&ids=a,b` | `GET /catalog/2022-04-01/items` | identifiersType, identifiers(최대 20) 또는 keywords | 7일 |
| `GET /v1/{mp}/spapi/offers/{asin}?condition=New` | `GET /products/pricing/v0/items/{asin}/offers` | ItemCondition, CustomerType=Consumer | 3분 |
| `POST /v1/{mp}/spapi/offers/batch` `{asins, condition}` | `POST /batches/products/pricing/v0/itemOffers` | 최대 20개 | 3분 |
| `GET /v1/{mp}/spapi/competitive?asins=a,b` | `GET /products/pricing/v0/competitivePrice` | Asins 최대 20 | 10분 |
| `GET /v1/{mp}/spapi/fees/{asin}/tiered` | `POST /products/fees/v0/feesEstimate` | 가격 9, 13, 350 × IsAmazonFulfilled=true를 한 번에 묶어 요청 | 1일 |
| `POST /v1/{mp}/spapi/fees/batch` `{items:[{asin, price, fba}]}` | 같음 | 최대 20개 | 1일(가격별 키) |
| `GET /v1/{mp}/spapi/restrictions/{asin}?condition=new_new` | `GET /listings/2021-08-01/restrictions` | asin, sellerId(SELLER_ID), marketplaceIds, conditionType | 12시간 |
| `GET /v1/{mp}/spapi/eligibility/{asin}` | `GET /fba/inbound/v1/eligibility/itemPreview` | asin, program=INBOUND, marketplaceIds | 1일 |
| `GET /v1/{mp}/spapi/prep/{asin}` | `GET /fba/inbound/v0/prepInstructions` | ShipToCountryCode=US, ASINList | 7일 |

`fees/{asin}/tiered` 응답은 다음처럼 정규화한다.
```json
{ "9":   { "ReferralFee": 0.72, "FBAFees": 3.14, "VariableClosingFee": 0 },
  "13":  { "ReferralFee": 1.95, "FBAFees": 4.08, "VariableClosingFee": 0 },
  "350": { "ReferralFee": 52.5, "FBAFees": 4.34, "VariableClosingFee": 0 } }
```

> `getPrepInstructions`(v0)는 2024년 Fulfillment Inbound v0 폐지 목록에 들어 있지 않았다. P2를 시작할 때 실제로 호출되는지 먼저 확인하고, 안 되면 01 §8의 대안(Seller Central 페이지 파싱)으로 바꾼다.

## §3. 상세페이지 묶음 응답
`GET /v1/{mp}/product/{asin}?condition=New`
- catalog, offers, fees/tiered, restrictions(new_new), eligibility를 `Promise.allSettled`로 동시에 부른다
- 하나가 실패해도 나머지는 돌려준다
```json
{ "ok": true,
  "data": {
    "asin": "B0...",
    "catalog":      { "ok": true,  "data": { /* 정규화된 CatalogDTO */ } },
    "offers":       { "ok": true,  "data": { /* OffersDTO */ } },
    "feesTiered":   { "ok": true,  "data": { "9": {}, "13": {}, "350": {} } },
    "restrictions": { "ok": false, "error": { "code": "RATE_LIMIT", "retryAfter": 2 } },
    "eligibility":  { "ok": true,  "data": { "eligible": true, "reasons": [] } }
  } }
```
DTO 타입은 `packages/shared/src/dto.ts`에 정의한다. 아마존 원본 필드명과 정규화 필드명의 대응은 06 문서를 따른다.

## §4. Keepa 프록시
호스트는 `https://api.keepa.com`, domain=1(US). 응답의 `tokensLeft`, `refillIn`을 KV `keepa:quota`에 저장한다.

| Worker 경로 | Keepa | 기본 파라미터 | 캐시 TTL |
|---|---|---|---|
| `GET /v1/{mp}/keepa/product/{asins}` (콤마, 최대 100) | `/product` | stats=180, history=1, buybox=1, rating=1. 옵션 offers(0/20), days | stats: 1시간, offers: 10분 |
| `GET /v1/{mp}/keepa/seller/{ids}` | `/seller` | 옵션 storefront=1 | 24시간 |
| `POST /v1/{mp}/keepa/finder` `{selection}` | `/query` | Product Finder selection JSON | 1시간 |
| `GET /v1/{mp}/keepa/category/{id}` | `/category` | | 7일 |
| `GET /v1/quota` | — | `{ keepa: {tokensLeft, refillIn}, spapi: {last429At} }` | 없음 |

Keepa 그래프 이미지(`keepaImg365` 내보내기 필드)는 `https://api.keepa.com/graphimage?key=...`이라 키가 URL에 노출된다. Worker 경로 `/v1/{mp}/keepa/graph/{asin}.png`에서 대신 받아 이미지로 돌려준다.

## §5. 사용자 데이터 (D1)
| 경로 | 동작 |
|---|---|
| `GET /v1/userdata/buycost/{asin}` · `PUT` `{fba, fbm, condition}` · `DELETE` | 매입가 |
| `GET /v1/userdata/buycosts?limit=10000` | Sourcing > Profitability용, 최근 수정순 |
| `GET/POST /v1/userdata/notes/{asin}` · `PUT/DELETE /v1/userdata/notes/{id}` | 메모(text, quantity, url) |
| `GET/POST /v1/userdata/lists` · `PUT/DELETE /v1/userdata/lists/{id}` | 리스트 |
| `GET/POST /v1/userdata/lists/{id}/items` · `DELETE /v1/userdata/lists/{id}/items/{asin}` | 리스트 상품 |
| `GET /v1/userdata/lists/search?q=` | 모든 리스트에서 상품 검색 |
| `POST /v1/userdata/history` `{asin, title, image, brand, restriction}` · `GET /v1/userdata/history?q=&sort=desc&page=` | 히스토리 |
| `GET /v1/userdata/brands?status=&lastChecked=` · `GET /v1/userdata/brands/{brand}/asins` | Sourcing > Restrictions |
| `GET/PUT /v1/userdata/ip-brands` | IP 주의 브랜드 |
| `GET/POST/DELETE /v1/userdata/finder-searches` | Sourcing 저장 검색 |

판매 제한 결과가 나올 때마다 Worker가 `asin_restrictions`에 기록한다(브랜드 포함). Sourcing의 Restrictions 리포트는 이 테이블을 읽는다.

### D1 스키마 (`apps/worker/migrations/0001_init.sql`)
```sql
CREATE TABLE buy_costs (
  asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us', condition TEXT NOT NULL DEFAULT 'new',
  fba_cost REAL, fbm_cost REAL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (asin, mp, condition));
CREATE INDEX idx_buy_costs_updated ON buy_costs(updated_at DESC);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us',
  text TEXT, quantity INTEGER, url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX idx_notes_asin ON notes(asin, mp);

CREATE TABLE lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE list_items (
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE, asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us',
  title TEXT, image TEXT, snapshot_json TEXT, added_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, asin, mp));

CREATE TABLE history (
  asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us', title TEXT, image TEXT, brand TEXT,
  restriction TEXT, viewed_at INTEGER NOT NULL, PRIMARY KEY (asin, mp));
CREATE INDEX idx_history_viewed ON history(viewed_at DESC);

CREATE TABLE asin_restrictions (
  asin TEXT NOT NULL, mp TEXT NOT NULL DEFAULT 'us', condition TEXT NOT NULL, brand TEXT,
  title TEXT, image TEXT, status TEXT NOT NULL, checked_at INTEGER NOT NULL,
  PRIMARY KEY (asin, mp, condition));
CREATE INDEX idx_restr_brand ON asin_restrictions(brand, mp);

CREATE TABLE ip_brands (brand TEXT PRIMARY KEY, reason TEXT, added_at INTEGER NOT NULL);
CREATE TABLE melt_keywords (keyword TEXT PRIMARY KEY);
CREATE TABLE finder_searches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, selection_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
```
- Worker cron(매일 1회)으로 30일이 지난 history를 지운다
- 시각은 Unix ms

## §6. 캐시 키와 무효화
- 키 형식: `{source}:{mp}:{op}:{정렬된 파라미터 해시}`
- 상세페이지 판매 제한 배지의 새로고침 버튼은 `?fresh=1`을 붙여 캐시를 무시하고 다시 받는다
- 옵션 페이지의 "캐시 비우기"는 `DELETE /v1/cache?prefix=`로 처리한다

## §7. 대조 스크립트 (P1)
`pnpm verify:fees B0AAA B0BBB ...`
- 각 ASIN에 대해 catalog와 fees/tiered를 받고, 로컬 엔진으로 같은 가격(9, 13, 350)의 풀필먼트 수수료와 판매 수수료를 계산한다
- `asin | tier | outbound | api_ff | local_ff | diff | referral_rule` 표를 출력한다. diff가 0.01을 넘는 행은 빨간색
