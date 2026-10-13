# OA Lens

RevSeller와 같은 사용감의 개인용 아마존 소싱 확장 프로그램입니다. 본인 SP-API 앱과 Keepa API로 동작합니다.

## 준비물 체크리스트

| 항목 | 어디서 | 비고 |
|---|---|---|
| SP-API 앱 (LWA Client ID / Client Secret) | Solution Provider Portal → 개발자 센트럴 → 앱 "REvseller 대체" → **LWA 자격 증명 "보기"** | 앱이 "초안" 상태여도 자체 승인으로 쓸 수 있음 |
| Refresh Token | 같은 화면 → **앱 편집 옆 ▾ → 앱 승인(Authorize app)** | 역할을 추가·변경하면 다시 승인해서 새 토큰을 받아야 함 |
| Seller ID (Merchant Token) | Seller Central → 설정 → 계정 정보 → 판매자 토큰 | Listings Restrictions 호출에 필요 |
| Keepa API Key | keepa.com → API Access | 유료 구독. 최소 플랜(분당 20토큰)으로 시작 |
| Cloudflare 계정 | dash.cloudflare.com | 무료 플랜으로 충분 |
| Node.js 20 이상, pnpm | | `npm i -g pnpm` |
| (선택) Google Sheets 웹훅 | Apps Script 웹 앱 배포 URL | "1 Click to Google Sheets" 기능용. `docs/03 §H` 참고 |

## 처음 설정하기

```bash
pnpm i
cd apps/worker
npx wrangler login
npx wrangler d1 create oa-lens            # 출력된 database_id를 wrangler.toml의 REPLACE_WITH_D1_DATABASE_ID 자리에 입력
npx wrangler kv namespace create CACHE     # 출력된 id를 wrangler.toml의 REPLACE_WITH_KV_NAMESPACE_ID 자리에 입력
npx wrangler d1 migrations apply oa-lens --remote

# 비밀값 등록 (값은 명령 실행 후 붙여넣기)
npx wrangler secret put LWA_CLIENT_ID
npx wrangler secret put LWA_CLIENT_SECRET
npx wrangler secret put LWA_REFRESH_TOKEN
npx wrangler secret put SELLER_ID
npx wrangler secret put KEEPA_API_KEY
npx wrangler secret put EXT_SHARED_KEY     # 아무 긴 랜덤 문자열. 확장 옵션에도 같은 값 입력
npx wrangler deploy
```

- `wrangler.toml`에는 바인딩(`DB`, `CACHE`)이 이미 들어 있습니다. `d1 create`/`kv namespace create`가 설정 파일에 바인딩을 추가할지 물으면 **No**를 고르고 id만 복사해 넣으세요.
- `EXT_SHARED_KEY`는 `openssl rand -hex 32` 등으로 만든 긴 문자열을 쓰세요.
- 배포가 끝나면 `https://oa-lens.<계정>.workers.dev`가 Worker 주소입니다.

### 로컬 개발 (선택)
```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # 값을 채워 넣기 (git 제외 파일)
pnpm --filter @oa-lens/worker db:migrate:local
pnpm dev:worker                                          # http://localhost:8787
```
로컬 Worker를 쓸 때는 확장 옵션의 Worker URL에 `http://localhost:8787`을 넣습니다.

### 확장 ID
확장 ID는 `apps/extension/extension-key.pub`(공개키, 비밀값 아님)로 고정되어 있습니다: `alialhhcfbmjkjlbhdmmegejmjhpeiap`.
Worker는 `wrangler.toml`의 `ALLOWED_ORIGINS`에 적힌 이 확장만 CORS로 허용합니다(비어 있으면 모든 확장 허용, 공유키는 항상 필요).
새 ID가 필요하면 `pnpm ext:key --force`를 실행하면 두 파일이 함께 바뀌고, Worker를 다시 배포해야 합니다.

## 확장 설치
1. `pnpm build`(배포용) 또는 `pnpm dev:ext`(코드 수정 시 자동 새로고침)를 실행합니다.
2. Chrome 주소창에 `chrome://extensions`를 입력하고 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램 로드**를 누르고 폴더를 선택합니다.
   - `pnpm build`: `apps/extension/.output/chrome-mv3` (같은 폴더에 `oa-lens-<버전>-chrome.zip`도 생성)
   - `pnpm dev:ext`: `apps/extension/.output/chrome-mv3-dev`
4. 확장 옵션 페이지에서 Worker URL과 `EXT_SHARED_KEY`를 입력하고 **연결 테스트**를 누릅니다. "SP-API OK, 셀러 ID 확인"이 나오면 연결 완료입니다.
5. 아마존 상품 페이지를 열면 상품명 아래에 위젯이 뜹니다.

## 명령어
| 명령 | 내용 |
|---|---|
| `pnpm test` | core·worker·extension 단위 테스트 (Vitest) |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | 타입 검사 / ESLint / Prettier |
| `pnpm build` | 확장 zip + Worker 배포 번들(`apps/worker/dist`) |
| `pnpm deploy:worker` | `wrangler deploy` |
| `pnpm test:coverage` | core 테스트 커버리지 (90% 미만이면 실패) |
| `pnpm verify:fees ASIN...` | 로컬 수수료 엔진과 SP-API 견적 대조. 환경 변수 `OA_LENS_WORKER_URL`, `EXT_SHARED_KEY` 필요. 차이가 $0.01을 넘는 행은 빨간색 |

## RevSeller 화면 스크린샷 (권장)
똑같은 화면을 만들려면 Claude Code가 참고할 실제 화면이 있어야 정확도가 확 올라갑니다. `docs/reference/screenshots/README.md`의 목록대로 찍어서 그 폴더에 넣어 주세요. 이 폴더는 개인 참고용이라 git에서 제외됩니다.

## Claude Code로 개발 시작
이 폴더에서 Claude Code를 열고 다음과 같이 시작하세요.

> CLAUDE.md와 docs/08-roadmap.md를 읽고 P0 단계를 진행해줘.

단계마다 쓸 프롬프트는 `docs/08-roadmap.md`에 정리돼 있습니다.
