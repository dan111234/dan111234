# 01. 아키텍처

## 1. 전체 구조

```
 ┌──────────────────────── Chrome (사용자 PC) ────────────────────────┐
 │                                                                      │
 │  amazon.com 상세/검색/스토어 페이지                                   │
 │   └ content script ── Shadow DOM 위젯 (Preact)                        │
 │        │  ▲    DOM에서 읽는 값: ASIN, 제목, 현재가, "bought in past   │
 │        │  │    month", 변형(twister) 목록, 리뷰 수                    │
 │        ▼  │                                                          │
 │  background service worker                                           │
 │   ├ 메시지 라우터 (content ↔ background)                              │
 │   ├ 요청 큐: 작업별 동시성·간격 제한 (§4)                             │
 │   ├ 메모리 캐시 + chrome.storage.session                              │
 │   └ Worker API 클라이언트 (Authorization: Bearer EXT_SHARED_KEY)      │
 │                                                                      │
 │  확장 페이지: bulk / sourcing / lists / export-settings / options     │
 └───────────────────────────────┬──────────────────────────────────────┘
                                 │ HTTPS
 ┌───────────────────────────────▼──────────── Cloudflare ──────────────┐
 │  Worker (Hono)                                                        │
 │   ├ /v1/{mp}/spapi/*  → LWA 토큰 발급·캐시 → SP-API NA 엔드포인트      │
 │   ├ /v1/{mp}/keepa/*  → api.keepa.com                                 │
 │   ├ /v1/userdata/*    → D1 (매입가, 메모, 리스트, 히스토리, 브랜드 상태)│
 │   ├ /v1/{mp}/product/{asin} → 상세페이지용 묶음 응답 (병렬 호출)        │
 │   ├ KV 캐시 (TTL 표는 07 문서)                                         │
 │   └ secrets: LWA_*, SELLER_ID, KEEPA_API_KEY, EXT_SHARED_KEY          │
 └───────────────────────────────┬──────────────────────────────────────┘
                                 │
        sellingpartnerapi-na.amazon.com / api.amazon.com (LWA) / api.keepa.com
```

## 2. 상세페이지 데이터 흐름

1. content script가 URL에서 ASIN을 찾는다(`/dp/ASIN`, `/gp/product/ASIN`, `?asin=`). 같은 페이지에서 변형을 바꾸면 ASIN이 바뀌므로 URL 변화와 `#twister` 변화를 감시해 다시 불러온다.
2. 위젯 뼈대를 상품명 아래(§3)에 먼저 그리고, 숫자 칸은 `--`로 둔다.
3. background에 두 요청을 동시에 보낸다.
   - `GET /v1/us/product/{asin}?condition=new`: 카탈로그 + 오퍼(New) + 단계별 수수료 견적 + 판매 제한 + FBA 입고 가능 여부 묶음
   - `GET /v1/us/keepa/product/{asin}?stats=180&history=1&buybox=1&offers=0`: 통계와 히스토리
4. 먼저 도착한 데이터부터 그린다(점진적 렌더링). 계산은 `packages/core`가 맡는다.
5. 사용자가 Offers 섹션을 펼치면 그때 Keepa offers(`offers=20`)를 요청한다. 토큰이 비싸기 때문이다.
6. Prep 팝업을 열면 그때 `GET /v1/us/spapi/prep/{asin}`을 호출한다.
7. 매입가를 입력하면 0.8초 디바운스 후 D1에 저장한다(설정 "Save Buy Cost"가 켜져 있을 때).
8. 상품을 볼 때마다 히스토리에 한 줄을 기록한다(ASIN, 제목, 이미지, 브랜드, 판매 제한 상태, 시각).

## 3. 위젯 배치 모드
- **Embedded(기본)**: 상품명 블록 바로 아래에 삽입한다. 삽입 위치 후보는 순서대로 `#titleblock_feature_div` → `#title_feature_div` → `#centerCol` 맨 위. `amazonDom.ts`에서 관리한다.
- **Sidebar**: 화면 오른쪽에 고정된 패널. 폭은 기본 400px이고 왼쪽 가장자리를 끌어 조절하며, 폭은 저장한다. 사이드바에서는 섹션별 열림 상태를 따로 저장한다(`sidebarOpenSections`).
- **Pop-out/Drag**: 하단 드래그 아이콘을 누르면 페이지 위에 뜬 창이 되고, 상단을 잡아 옮길 수 있다. 다시 누르면 제자리로 돌아간다. 설정 "Keep main widget popped out"이 켜져 있으면 처음부터 지정 위치(`mainWidgetPosition`: top_left~bottom_right)에 뜬다.
- 반응형: 위젯 폭에 따라 글자 크기와 2열/1열 배치를 바꾼다(컨테이너 쿼리). 설정 Display의 글자 크기(-10%~+10%)는 루트 font-size 배율로 적용한다.

## 4. 호출 한도와 큐 (단일 사용자 기준)
SP-API 한도는 작업마다 다르다. 응답 헤더 `x-amzn-RateLimit-Limit`로 실제 값을 확인하고 아래 표를 갱신한다.

| 작업 | 대략적인 한도(초당) | 큐 규칙 |
|---|---|---|
| getCatalogItem / searchCatalogItems | 2 | 동시 2, 간격 500ms |
| getItemOffers | 0.5 | 동시 1, 간격 2s, 상세페이지는 우선순위 높음 |
| getItemOffersBatch (20개) | 0.1 | 검색결과·Variation Viewer 전용 |
| getMyFeesEstimates (최대 20개 묶음) | 0.5 | 동시 1 |
| getListingsRestrictions | 5 | 동시 3 |
| getCompetitivePricing (20개) | 0.5 | |
| getItemEligibilityPreview | 1 | |
| getPrepInstructions | 2 | 팝업 열 때만 |

- 큐는 background에 둔다. 사용자는 한 명이라 Worker에 분산 rate limiter(Durable Object)를 둘 필요는 없다.
- Worker는 429/503을 받으면 지수 백오프(0.5s → 1s → 2s, 최대 3회)로 재시도하고, 실패하면 `{error, retryAfter}`를 돌려준다. 확장은 해당 칸에 재시도 아이콘을 보여준다.

## 5. Keepa 토큰 예산
- 최소 플랜은 분당 20토큰이고, 남은 토큰은 응답의 `tokensLeft`로 알 수 있다. Worker는 이 값을 KV에 저장하고 `/v1/quota`로 보여준다.
- 대략적인 비용: 상품 1개(stats·history)는 1토큰, offers는 오퍼 10개 페이지당 +6토큰, 셀러 조회는 셀러당 1토큰, Product Finder는 결과 10개 페이지당 10토큰. 정확한 값은 keepa.com/api-docs에서 확인한다.
- 규칙
  1. 상세페이지는 stats·history만 자동으로 받는다. offers는 Offers 섹션을 펼칠 때(또는 고정했을 때)만 받는다.
  2. 검색결과 위젯은 화면에 보이는 상품만, 한 번에 최대 10개씩 묶어서 요청한다(IntersectionObserver).
  3. 같은 ASIN은 1시간 동안 캐시한다. Offers는 10분.
  4. 남은 토큰이 5 미만이면 자동 요청을 멈추고 위젯 상단에 "Keepa 토큰 대기 중"을 표시한다.

## 6. 저장소
| 데이터 | 위치 | 이유 |
|---|---|---|
| 설정(최대 7개 구성), 섹션 열림 상태, 위젯 위치·폭 | `chrome.storage.local` | 기기별 UI 상태. Export/Import JSON 지원 |
| 매입가, 메모(수량·URL 포함), 리스트, 히스토리, ASIN별 판매 제한 기록, IP 브랜드 목록 | D1 (Worker 경유) | 재설치·다른 PC에서도 유지 |
| API 응답 캐시 | Worker KV + background 메모리 | |

## 7. 보안
- 확장 → Worker 요청에는 `Authorization: Bearer <EXT_SHARED_KEY>`를 붙인다. Worker는 키가 다르면 401을 돌려준다.
- Worker CORS는 `chrome-extension://<확장 ID>`만 허용한다. 개발 중 확장 ID가 바뀌지 않도록 `wxt.config.ts`의 manifest에 고정 `key`를 넣는다(키 쌍은 사용자가 직접 생성).
- 로그에 refresh token, access token, Keepa key를 찍지 않는다.
- Amazon 데이터는 사용자 본인만 쓰고 외부에 공유하지 않는다. 이는 SP-API 프로필에 적은 내용과 일치해야 한다.

## 8. RevSeller와 다르게 갈 수밖에 없는 부분
| RevSeller 기능 | 원래 출처 | OA Lens 대안 |
|---|---|---|
| Melt(녹는 상품) 배지 | RevSeller 서버가 보유한 아마존 meltable 목록 | 카테고리·키워드 규칙(초콜릿, 캔디, 왁스, 립밤 등) + 사용자가 수동으로 표시. 4/15~10/15에는 경고를 강조 |
| IP 배지 | 제휴사(OAChallenge) IP 신고 데이터 | 사용자 본인의 "IP 주의 브랜드" 목록(D1)에 있으면 표시 |
| Haz 배지 | 서버 판단 + Seller Central 페이지 | FBA Inbound Eligibility API 결과와 수수료 비교(위험물 요금표와 일치하면 Haz) |
| Prep 요구사항 | Seller Central 페이지 파싱(로그인 세션) | SP-API `getPrepInstructions`(v0, ASIN 목록). 안 되면 같은 방식으로 Seller Central 페이지 파싱으로 대체 |
| Keepa 데이터 | RevSeller가 대신 구독한 Keepa | 사용자 본인 Keepa API 구독 |
| Seller Central 계산기 무게·치수 확인 | Seller Central 내부 API | 기본은 Catalog Items의 패키지 치수. 옵션으로 Seller Central 계산기 페이지 열기 링크만 제공 |
| 모바일 앱, Firefox | | 범위 밖 |
