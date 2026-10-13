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
npx wrangler d1 create oa-lens            # 출력된 database_id를 wrangler.toml에 입력
npx wrangler kv namespace create CACHE     # 출력된 id를 wrangler.toml에 입력
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

로컬 개발은 `apps/worker/.dev.vars`에 같은 이름으로 값을 적고 `pnpm dev:worker`를 실행합니다. 이 파일은 git에 올리지 않습니다.

## 확장 설치
1. `pnpm build` 또는 `pnpm dev:ext`를 실행합니다.
2. Chrome 주소창에 `chrome://extensions`를 입력하고 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램 로드**를 누르고 `apps/extension/.output/chrome-mv3`를 선택합니다.
4. 확장 옵션 페이지에서 Worker URL과 `EXT_SHARED_KEY`를 입력합니다.
5. 아마존 상품 페이지를 열면 상품명 아래에 위젯이 뜹니다.

## RevSeller 화면 스크린샷 (권장)
똑같은 화면을 만들려면 Claude Code가 참고할 실제 화면이 있어야 정확도가 확 올라갑니다. `docs/reference/screenshots/README.md`의 목록대로 찍어서 그 폴더에 넣어 주세요. 이 폴더는 개인 참고용이라 git에서 제외됩니다.

## Claude Code로 개발 시작
이 폴더에서 Claude Code를 열고 다음과 같이 시작하세요.

> CLAUDE.md와 docs/08-roadmap.md를 읽고 P0 단계를 진행해줘.

단계마다 쓸 프롬프트는 `docs/08-roadmap.md`에 정리돼 있습니다.
