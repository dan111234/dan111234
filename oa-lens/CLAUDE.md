# OA Lens — Claude Code 작업 지침

## 프로젝트 한 줄 요약
아마존 US 상품 상세페이지에 FBA/FBM 수수료·순이익·ROI·마진·오퍼·판매 지표 패널을 띄우는 **개인용 Chrome 확장(MV3)**.
사용자(셀러 1명)는 RevSeller의 화면과 조작에 익숙하다. **화면 배치·라벨·클릭 동작·기본값을 RevSeller와 최대한 똑같이** 만드는 것이 목표다.
데이터 출처는 사용자 본인의 **SP-API private app**(앱 이름 "REvseller 대체")과 **Keepa API**다.

## 절대 규칙
1. **클린룸 구현.** RevSeller의 JS·CSS·HTML 템플릿·아이콘·로고·이름을 복사하거나 저장소에 넣지 않는다. `docs/`의 스펙과 `docs/reference/screenshots/`의 스크린샷만 보고 새로 작성한다. 아이콘은 오픈소스 세트(Lucide 등)를 쓴다. 확장 이름은 "OA Lens".
   - 예외: `docs/reference/*.json`은 아마존이 공개한 수수료 수치(사실 데이터)다. 그대로 써도 되지만, 값은 아마존 공식 페이지와 SP-API 결과로 검증한다.
2. **비밀값은 Worker secret에만 둔다.** LWA client id/secret, refresh token, Keepa key, 확장↔Worker 공유키는 코드·저장소·로그·확장 번들 어디에도 넣지 않는다. 로컬 개발용 `apps/worker/.dev.vars`는 `.gitignore`에 넣는다.
3. **확장은 SP-API·Keepa를 직접 호출하지 않는다.** 모든 외부 호출은 `apps/worker`를 거친다.
4. **계산은 `packages/core`의 순수 함수로 만든다.** DOM이나 네트워크에 의존하지 않게 하고, Vitest 테스트를 반드시 붙인다. `docs/04-calc-spec.md`의 골든 테스트 값이 전부 통과해야 한다.
5. **UI는 Shadow DOM 안에서 렌더**해 아마존 CSS와 충돌하지 않게 한다. Tailwind 클래스 prefix는 `oal-`.
6. **단계 순서를 지킨다.** `docs/08-roadmap.md`의 단계별 완료 기준을 통과한 뒤에만 다음 단계로 넘어간다. 각 단계가 끝나면 사용자가 직접 확인할 방법(어떤 페이지에서 무엇을 보면 되는지)을 한국어로 보고한다.
7. 사용자에게는 **한국어로 보고**한다. 코드·식별자·커밋 메시지는 영어로 쓴다.
8. 스펙이 모호하거나 스크린샷과 다르면 **스크린샷을 우선**한다. 둘 다 없으면 질문한다. 임의로 기능을 빼거나 바꾸지 않는다.

## 기술 스택
| 영역 | 선택 | 이유 |
|---|---|---|
| 확장 프레임워크 | WXT (Vite 기반, MV3) | content script·background·options 페이지·HMR을 기본 제공 |
| UI | Preact + TypeScript + Tailwind(prefix `oal-`) | 가볍고 Shadow DOM에 넣기 쉽다 |
| 차트 | Chart.js 4 + chartjs-plugin-zoom + date adapter | RevSeller와 같은 계열이라 그래프 모양을 맞추기 쉽다 |
| 백엔드 | Cloudflare Workers + Hono + D1(SQLite) + KV(캐시) | 무료 플랜으로 충분, secret 관리, 전 세계 엣지 |
| 테스트 | Vitest (core, worker), Playwright (확장 E2E, 선택) | |
| 패키지 | pnpm workspaces | |

## 저장소 구조
```
oa-lens/
├─ CLAUDE.md                  ← 이 파일
├─ README.md                  ← 사람용 설치·설정 안내
├─ docs/                      ← 스펙 (구현 전에 해당 문서를 먼저 읽을 것)
│  ├─ 01-architecture.md
│  ├─ 02-ui-main-widget.md    ← 상세페이지 메인 위젯 (가장 중요)
│  ├─ 03-ui-other-screens.md  ← Variation Viewer, 검색결과, 스토어프런트, 리스트·히스토리, 벌크, 소싱, 내보내기
│  ├─ 04-calc-spec.md         ← 수수료·순이익·ROI·마진·목표가 계산식 + 골든 테스트
│  ├─ 05-settings.md          ← 설정 항목 전체와 기본값
│  ├─ 06-data-sources.md      ← 화면 필드별 데이터 출처
│  ├─ 07-backend-api.md       ← Worker 엔드포인트·캐시·D1 스키마
│  ├─ 08-roadmap.md           ← 단계별 구현 계획과 완료 기준
│  └─ reference/
│     ├─ fee-tables-us-2026.json
│     ├─ category-tables-us.json
│     └─ screenshots/         ← 사용자가 찍은 RevSeller 화면 (git 제외)
├─ apps/
│  ├─ extension/              ← WXT 확장
│  │  ├─ entrypoints/
│  │  │  ├─ background.ts     ← API 큐·캐시·메시지 라우터
│  │  │  ├─ product.content/  ← /dp/, /gp/product/ 상세페이지 메인 위젯
│  │  │  ├─ serp.content/     ← 검색결과 위젯·테이블·그래프
│  │  │  ├─ storefront.content/
│  │  │  ├─ options/          ← 확장 설정(Worker URL, 공유키)
│  │  │  ├─ bulk/             ← Bulk Analysis 페이지
│  │  │  ├─ sourcing/         ← Sourcing 페이지
│  │  │  ├─ lists/            ← Lists·History 패널 페이지
│  │  │  └─ export-settings/  ← Copy & Export 필드 설정 페이지
│  │  ├─ components/          ← 위젯 섹션별 Preact 컴포넌트
│  │  ├─ lib/                 ← DOM 파서, API 클라이언트, 저장소 래퍼
│  │  └─ styles/
│  └─ worker/                 ← Cloudflare Worker (Hono)
│     ├─ src/routes/          ← spapi/*, keepa/*, userdata/*
│     ├─ src/spapi/           ← LWA 토큰, 서명 없는 요청 클라이언트, 재시도
│     ├─ src/keepa/
│     ├─ migrations/          ← D1 SQL
│     └─ wrangler.toml
└─ packages/
   ├─ core/                   ← 수수료 엔진·이익 계산·Keepa 파서·포매터 (순수 TS)
   │  ├─ src/fees/            ← sizeTier, weight, referral, fulfillment, storage, placement, lowInventory, mfnShipping
   │  ├─ src/profit/          ← net, roi, margin, breakeven, maxCost, targets, orderTotals
   │  ├─ src/keepa/           ← csv 시간 변환, 평균, 드롭 수, OOS 비율
   │  ├─ src/smartInput/      ← "24.99*0.9" 같은 수식 입력 파서
   │  └─ data/                ← reference JSON을 타입 붙여 import
   └─ shared/                 ← 타입(ProductData, Settings, API DTO)
```

## 명령어
- `pnpm i`: 설치 (확장의 `wxt prepare`까지 실행)
- `pnpm dev:ext`: 확장 개발 모드(watch). `apps/extension/.output/chrome-mv3-dev`를 Chrome "압축해제된 확장 프로그램 로드"로 올린다. 브라우저를 자동으로 띄우지 않는다.
- `pnpm dev:worker`: `wrangler dev` (로컬 D1·KV). 처음에는 `pnpm --filter @oa-lens/worker db:migrate:local`
- `pnpm test`: core·worker·extension 단위 테스트 (Vitest projects)
- `pnpm typecheck`, `pnpm lint`, `pnpm format`: tsc / ESLint / Prettier
- `pnpm build`: 확장 zip(`.output/chrome-mv3` + zip)과 Worker 배포용 번들(`apps/worker/dist`) 생성
- `pnpm deploy:worker`: `wrangler deploy`
- `pnpm ext:key`: 확장 ID 고정용 manifest key 생성(`apps/extension/.env.local`), Worker `ALLOWED_ORIGINS` 값 출력

## 구현 메모
- Tailwind는 **v3.4**를 쓴다(prefix `oal-`). v4는 `@property`로 변수를 등록하는데 Shadow DOM 안에서는 동작하지 않는다. `postcss.config.cjs`가 `rem`을 px로 바꾼다(Shadow DOM은 페이지의 html font-size를 따라가기 때문).
- Worker의 공유키 401에는 `WWW-Authenticate: Bearer`가 붙는다. 확장은 이것으로 "공유키 불일치"와 "SP-API 인증 오류"(같은 401/AUTH)를 구분한다.
- 확장 테스트는 `WxtVitest` + happy-dom. 아마존 DOM 로직은 `lib/amazonDom.ts`의 순수 함수로 두고 테스트한다.

## 작업 방식
- 새 기능을 시작하기 전에 관련 docs 섹션을 다시 읽는다. 스펙 번호(예: `02 §C-3`)를 커밋 메시지나 PR 설명에 적는다.
- 수수료 로직을 바꾸면 `packages/core` 테스트와 "SP-API 대조 스크립트"(`pnpm verify:fees ASIN...`, P1에서 작성)를 같이 돌린다.
- Keepa 토큰은 유료이고 분당 한도가 있다. 화면을 펼칠 때만 비싼 요청(offers 등)을 보낸다. 자세한 규칙은 `docs/01 §5`.
- 아마존 페이지 DOM 선택자는 자주 바뀐다. 선택자는 `apps/extension/lib/amazonDom.ts` 한 곳에 모으고, 각 선택자에 대체 선택자를 2개 이상 둔다.
