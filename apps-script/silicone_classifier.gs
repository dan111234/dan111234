/************************************************************
 * Keepa_Top100 — 실리콘 차별화 가능성 분류기 (Vertex AI Gemini Flash-Lite)
 *
 * 하는 일
 *  - "실리콘_차별화_v2" 및 "실리콘_판단근거_v2" 컬럼을 없을 때만 추가
 *    (이전 버전 결과 컬럼은 건드리지 않음 → 새 판정과 비교 가능)
 *  - 각 행의 category_name / title / features 세 값만 보고
 *    "금형 실리콘 성형만 하는 공장이 Siliguard와 같은 실리콘으로 만들었을 때
 *     소재 전환만으로 차별화가 되는가"를 3단계 관문으로 판정
 *      1) 차량용품인가          → 아니면 불가 [비차량]
 *      2) 금형 실리콘만으로 완성되는가 (금속·플라스틱·원단·접착제·전자부품 추가 불가)
 *                               → 아니면 불가 [제조불가] / [소재부적합]
 *      3) 소재 전환의 차별화 강도 → 상 / 중 / 하
 *    한국어 판단근거 앞에 태그를 붙여 기록 (title·features가 모두 비면 "데이터없음")
 *
 * 12만 행 처리 구조
 *  - 시트를 청크(기본 640행) 단위로 읽고, 등급 또는 판단근거가 빈 행만 묶어 1회 호출
 *  - UrlFetchApp.fetchAll 로 요청 8개를 병렬 전송
 *  - 라운드 소요시간을 재서, 6분 제한 전에 끝낼 수 없는 라운드는 시작하지 않음
 *  - 요청 타임아웃이 나면 배치 크기를 절반으로 줄여 재시도 (줄인 크기는 다음 실행에도 유지)
 *  - 등급과 판단근거가 모두 저장된 행은 건너뜀 (저장 전 중단된 요청은 재호출될 수 있음)
 *
 * Script Properties (프로젝트 설정 → 스크립트 속성)
 *  필수  GCP_PROJECT_ID
 *  선택  VERTEX_MODEL_ID   기본 gemini-3.5-flash-lite
 *        VERTEX_LOCATION   기본 global
 *        THINKING_LEVEL    기본 HIGH  (MINIMAL / LOW / MEDIUM / HIGH, thinkingConfig를 아예 빼려면 NONE)
 *        SPREADSHEET_ID    기본 아래 DEFAULTS 값 (URL 그대로 넣어도 됨)
 *        SHEET_NAME, RESULT_HEADER, REASON_HEADER, BATCH_SIZE, PARALLEL_REQUESTS,
 *        CHUNK_ROWS, TITLE_MAX_CHARS, FEATURES_MAX_CHARS, MAX_PASSES, PREVIEW_COUNT
 *  ※ 이전에 RESULT_HEADER / REASON_HEADER / THINKING_LEVEL / BATCH_SIZE 를 속성으로 넣어 두었다면
 *    속성값이 우선하므로 삭제하거나 새 값으로 바꾸세요.
 *
 * 실행 순서 (Apps Script 편집기에서 함수 선택 후 실행)
 *  1) checkSetup()          설정·시트 헤더·Vertex 연결 점검 (시트 수정 없음)
 *  2) previewSample()       무작위 행을 등급+이유로 로그 출력 + 전체 예상 비용 (시트 수정 없음)
 *  3) startBackgroundRun()  등급·근거 컬럼 추가 + 5분 트리거 설치 + 즉시 1회 실행
 *  4) showProgress()        진행률·등급 분포 확인
 *     stopBackgroundRun()   트리거 중지
 *     resetProgress()       커서 초기화 (시트 값은 유지, 빈 칸만 다시 처리)
 ************************************************************/


/* =========================================================
 * 1. 요청 프롬프트
 * ========================================================= */

const SYSTEM_PROMPT = [
  "You are a senior product-sourcing analyst and silicone-molding engineer for an Amazon US seller of automotive accessories.",
  "Your job is to screen Amazon listings and find product types that this seller's factory could make better simply by making them out of its silicone.",
  "Be strict and skeptical. A wrong HIGH wastes a mold investment; a wrong NONE only skips one idea. When torn between two grades, choose the lower one.",
  "",
  "## 1. What the factory can and cannot do",
  "The factory does exactly ONE process: it presses or injects a single silicone compound into a steel mold and demolds finished parts (compression molding / liquid silicone injection molding).",
  "CAN: any 3D shape that fits in a mold; thin sheets (about 2-5 mm) or thick solid parts; vehicle-specific contoured shapes; raised edges, ribs, pockets, compartments, dividers, slots, holes, textures, embossed logos, any color; several silicone pieces sold as a set; straps, loops, tabs, plugs and sleeves molded in silicone as part of the same piece.",
  "CANNOT add any other component: no metal (springs, clips, hooks, magnets, screws, rivets, wire cores, rods, chains); no rigid plastic frames, shells, buckles or hinges; no fabric, leather, foam, padding, sewing, elastic or zippers; no adhesive backing or double-sided tape; no suction cups made of other materials; no electronics, batteries, LEDs, chargers or sensors; no glass, mirrors or optics; no liquids, chemicals or fragrance.",
  "So the finished product must do its whole job as molded silicone alone, staying in place by its own shape, weight, friction, stretch-fit, press-fit or molded silicone straps.",
  "",
  "## 2. The silicone (same as the seller's Siliguard car-seat protector)",
  "Siliguard is a 3 mm, 2.85 kg, 100% food-grade silicone full-cover protector for the vehicle seat under a child car seat. Buyers praise: no seat dents, spills wipe off, does not slide, no chemical smell in a hot car, safe for babies, durable for years.",
  "Strengths:",
  "- 100% food-grade / medical-grade, BPA-free, phthalate-free, no odor and no VOC off-gassing even in a hot car; safe for babies' mouths and pets.",
  "- Stable from -40°C to 240°C (464°F): does not warp, crack, harden or melt in summer sun or winter cold; can be boiled or steam-sterilized.",
  "- Fully waterproof and stain-proof: liquids bead and wipe off; does not absorb odor; rinse under a tap.",
  "- High-grip, non-slip surface that stays put without adhesive; damps rattles and vibration.",
  "- Dense and tear-resistant yet flexible: about 3 mm thin, keeps shape for 5+ years, spreads pressure so leather and trim do not dent or scratch.",
  "Limitations:",
  "- Heavy: a 3 mm sheet weighs about 3.5 kg per m². Items larger than about 1.5 m² or needing more than about 5 kg of silicone become too heavy and too expensive to ship and sell.",
  "- More expensive than PVC, TPE, EVA, rubber, fabric or carpet; hurts very cheap commodity items (under about $8) the most.",
  "- Soft and elastic: cannot be rigid, structural, load-bearing at a point, a precise mechanism, a clamp that must hold tension on a rod, or a sharp scraping/cutting/spreading edge.",
  "- Weaker than rubber against heavy abrasion and dragging cargo; tears if cut.",
  "- Swells and degrades with gasoline, diesel, motor oil, brake fluid and solvents.",
  "- Attracts dust, lint and pet hair; not breathable (feels warm and sweaty against skin or clothes for long periods); not absorbent (cannot wipe, polish or soak up liquid); not electrically conductive.",
  "",
  "## 3. How to read a listing",
  "- category_name is an Amazon browse node and may be broad or misleading; title is often keyword-stuffed. First identify the single core product noun (what the buyer is actually paying for). For a set or kit, grade the main item.",
  "- Judge the product TYPE, not the brand or the exact listing. Assume nothing is added beyond molded silicone.",
  "- If the text is thin, infer the product type from title and category_name and still decide.",
  "",
  "## 4. Decide with three gates, in order. Stop at the first gate that fails.",
  "GATE 1 - Is it a vehicle accessory?",
  "Pass: used in, on, or directly for a road motor vehicle - car, SUV, pickup truck, van, EV, motorcycle, ATV/UTV. Includes interior accessories, exterior accessories, truck-bed and towing accessories, and car-care tools that touch the vehicle.",
  "Fail: home, kitchen, bedding, furniture, garden, patio; pet or baby items not used in a vehicle; RV living-space, plumbing and camping items (sewer and water fittings, patio mats, RV kitchen, propane tanks, generators, stabilizer jacks, leveling blocks); boats, jet skis and marine parts; bicycles and scooters; workshop/garage tools and tool storage; general electronics and phone accessories not mounted in a vehicle.",
  "If GATE 1 fails → NONE, reason tag [비차량].",
  "",
  "GATE 2 - Can molded silicone alone deliver the product's core function?",
  "Fail with tag [제조불가] when the core function needs a component the factory cannot add: metal hardware or tools (shackles, hitch pins, decorative metal covers, chrome trim), electronics or lights, mechanisms (mounts with jaws or ratchets, retractors, hinges), rigid frames or rigid boxes that must hold shape under load, fabric/foam comfort products (cushions, breathable seat covers, sheepskin pads), absorbent textiles (wash mitts, microfiber, foam applicators), consumables (cleaners, waxes, oils, fluids, fragrances), or attachment to a vertical or curved surface that only works with adhesive, magnets, screws or clips (stick-on door guards, adhesive tank pads, bolt-on mud flaps).",
  "Fail with tag [소재부적합] when silicone could be molded into the shape but is physically the wrong material: contact with fuel, oil or solvents (oil drip pans and mats, fuel caps); heavy abrasion or dragging cargo (truck bed liners and mats); point loads or structural support (jack pads, lift pads, steps); needs rigidity or a hard edge (squeegees, filler spreaders, scrapers, cup-holder expanders); too large or heavy (full car or truck covers, tarps, truck bed mats, cargo hammocks over about 1.5 m²); long continuous extrusions sold by the foot (edge trim, weatherstrip rolls).",
  "If GATE 2 fails → NONE.",
  "",
  "GATE 3 - How strong is the differentiation from the material switch ALONE?",
  "HIGH (tag [차별화강함]): typical products in this category are made of fabric, carpet, foam, PU leather, PVC, TPE, rubber or hard plastic, AND they have a pain point buyers clearly complain about that silicone fixes (stains and hard cleaning, slipping or shifting, dents and scratches on seats or trim, warping or cracking in heat, chemical smell or VOC, unsafe for kids or pets), AND \"100% food-grade silicone\" would be an instantly understood headline. The listing itself is NOT already silicone. Reserve HIGH for clear cases.",
  "MEDIUM (tag [차별화보통]): a real but partial or secondary benefit; OR silicone versions are already common in this category so switching is less novel; OR the listing is already silicone (at most MEDIUM); OR size, weight or price pressure makes the silicone version hard to win with.",
  "LOW (tag [차별화약함]): buyers choose this product for reasons silicone does not change (looks such as chrome or carbon fiber, exact fit, brand), or silicone is the market standard already, or it is a very cheap commodity where silicone's cost kills the margin, or comfort/breathability matters more than cleaning.",
  "",
  "## 5. Calibration examples (product type → grade, tag)",
  "- Seat protector mat under a child car seat (usually fabric/foam/PVC) → HIGH [차별화강함]",
  "- Vehicle-specific all-weather floor mats (TPE/rubber/carpet) → HIGH [차별화강함]",
  "- Trunk / cargo liner tray, rear seat-back kick mat held by molded straps → HIGH [차별화강함]",
  "- Center console armrest cover (PU leather / fabric), molded console tray insert or organizer liner → HIGH [차별화강함]",
  "- Door pocket / center console / wireless-charging-pad liners for a specific model (if typical ones are TPE or felt) → HIGH; if the listing is silicone already → MEDIUM",
  "- Cup holder coaster or insert, dashboard non-slip pad, key fob cover, gear shift knob cover, steering wheel cover → MEDIUM [차별화보통] (silicone already common)",
  "- License plate frame (silicone frame prevents rattle and paint scratches), truck bed stake-pocket plugs, hitch receiver rubber plug, EV charge-port or plug dust cap, seat gap filler, collapsible car trash bin → MEDIUM [차별화보통]",
  "- Headrest cover, seat belt shoulder pad, full fabric seat cover set, seat cushion → LOW [차별화약함] or NONE [제조불가] if comfort depends on foam/fabric",
  "- Silicone tire-shine applicator vs foam/microfiber applicator pads → LOW [차별화약함]",
  "- Engine vacuum or coolant hose (silicone hoses already standard) → LOW [차별화약함]",
  "- Truck bed mat or bed liner → NONE [소재부적합]; oil drain pan or oil drip mat → NONE [소재부적합]; body filler spreader or PPF squeegee → NONE [소재부적합]",
  "- Tow shackle, D-ring, decorative metal hitch cover, phone mount, dash cam, sunshade with wire frame, wiper blade, car wash mitt, wax, cleaner → NONE [제조불가]",
  "- Adhesive door sill or kick guard film, adhesive motorcycle tank pad, bolt-on mud flaps → NONE [제조불가]",
  "- RV sewer hose fitting, patio mat, propane tank holder, boat trailer bumper, bicycle phone holder, mattress pad, socket organizer tray → NONE [비차량]",
  "",
  "## 6. Output",
  "Return JSON only, with exactly one entry per input id, in input order: {\"results\":[{\"id\":1,\"grade\":\"HIGH\"}]}. grade must be one of HIGH, MEDIUM, LOW, NONE."
].join("\n");

/* 전체 분류 및 미리보기: 판정 이유를 함께 요청 (등급보다 먼저 쓰게 해서 근거에 맞춰 등급을 고르도록 함) */
const REASON_ADDON = [
  "Also add \"reason\" to each entry and write it BEFORE \"grade\": {\"id\":1,\"reason\":\"...\",\"grade\":\"HIGH\"}.",
  "reason is ONE short Korean sentence (max 70 characters) that starts with exactly one tag from:",
  "[비차량] [제조불가] [소재부적합] (for NONE), [차별화약함] (LOW), [차별화보통] (MEDIUM), [차별화강함] (HIGH).",
  "After the tag, name the core product in Korean and the decisive reason (the failed gate, or the main pain point silicone fixes).",
  "Example: \"[차별화강함] 카시트 보호매트: 오염·눌림 자국 문제를 실리콘이 해결\"."
].join("\n");

/* 사용자 메시지: 배치 안 상품을 JSON Lines로 전달 */
function buildUserText_(items) {
  const lines = items.map(function (it, k) {
    return JSON.stringify({
      id: k + 1,
      category_name: it.category_name,
      title: it.title,
      features: it.features
    });
  });
  return "Grade every product below with the three gates. Input is JSON Lines with fields id, category_name, title, features.\n\n" +
    lines.join("\n");
}

const GRADE_ENUM = ["HIGH", "MEDIUM", "LOW", "NONE"];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "INTEGER" },
          grade: { type: "STRING", enum: GRADE_ENUM }
        },
        required: ["id", "grade"],
        propertyOrdering: ["id", "grade"]
      }
    }
  },
  required: ["results"]
};

const RESPONSE_SCHEMA_WITH_REASON = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "INTEGER" },
          reason: { type: "STRING" },
          grade: { type: "STRING", enum: GRADE_ENUM }
        },
        required: ["id", "reason", "grade"],
        propertyOrdering: ["id", "reason", "grade"]
      }
    }
  },
  required: ["results"]
};


/* =========================================================
 * 2. 설정
 * ========================================================= */

const DEFAULTS = {
  SPREADSHEET_ID: "1PryMRAg497BHY2_A9F8-5vY7pa9EIkT-wFLGQVlVdbo",
  SHEET_NAME: "Keepa_Top100",
  RESULT_HEADER: "실리콘_차별화_v2",
  REASON_HEADER: "실리콘_판단근거_v2",
  VERTEX_LOCATION: "global",
  VERTEX_MODEL_ID: "gemini-3.5-flash-lite",
  THINKING_LEVEL: "HIGH",
  BATCH_SIZE: 20,          // 요청 1건에 담는 상품 수 (HIGH thinking은 배치가 클수록 상품당 사고량이 줄어 20 권장)
  PARALLEL_REQUESTS: 8,    // fetchAll 동시 요청 수
  CHUNK_ROWS: 640,         // 시트에서 한 번에 읽고 쓰는 행 수
  TITLE_MAX_CHARS: 300,
  FEATURES_MAX_CHARS: 800, // 비용 절감 핵심 레버 (0이면 features 미전송)
  MAX_PASSES: 3,           // 실패 행 재시도용 전체 재스캔 횟수
  PREVIEW_COUNT: 20
};

/* 입력 컬럼 헤더 (1행, 대소문자·공백 무시) */
const INPUT_HEADERS = {
  category: ["category_name"],
  title: ["title"],
  features: ["features"]
};

const GRADE_LABELS = { HIGH: "상", MEDIUM: "중", LOW: "하", NONE: "불가" };
const NO_DATA_LABEL = "데이터없음";
const THINKING_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH", "NONE"];

const LIMITS = {
  STOP_NEW_WORK_AFTER_MS: 270 * 1000, // 4분 30초 이후 새 요청 시작 안 함 (6분 제한 대비)
  HARD_STOP_MS: 320 * 1000,           // 이 시각 안에 끝나지 않을 것 같은 라운드는 시작 안 함 (시트 저장 여유)
  ROUND_TIME_SAFETY: 1.3,             // 직전 최장 라운드 시간 × 1.3 으로 다음 라운드 소요 예측
  MIN_BATCH_ON_TIMEOUT: 5,            // 타임아웃 시 배치를 절반씩 줄이는 하한
  MAX_ATTEMPTS_PER_ROW: 3,            // 응답 누락·파싱 실패 시 재시도 횟수 (429/5xx는 미차감)
  RETRY_BATCH_DIVISOR: 4,             // 재시도는 1/4 크기 배치로
  BACKOFF_BASE_MS: 2000,
  BACKOFF_MAX_MS: 20000,
  MAX_ALL_TRANSIENT_ROUNDS: 5,        // 전 요청이 429/5xx인 라운드가 연속 5회면 이번 실행 종료
  TRIGGER_EVERY_MINUTES: 5
};

/* 로그용 예상 비용 (gemini-3.5-flash-lite 표준 단가, USD / 1M tokens). thinking 토큰은 output 단가로 과금. 모델을 바꾸면 수정 */
const PRICE_PER_1M_TOKENS = { input: 0.30, output: 2.50 };

const STATE_KEYS = {
  CURSOR: "SILI_CURSOR_ROW",
  PASS: "SILI_PASS",
  PASS_FAILED: "SILI_PASS_FAILED",
  DONE: "SILI_DONE_AT",
  NO_THINKING_MODEL: "SILI_NO_THINKING_MODEL", // thinkingLevel을 거부한 모델 ID 기억
  BATCH_OVERRIDE: "SILI_BATCH_OVERRIDE"        // 타임아웃으로 줄인 배치 크기 ("모델|thinking|크기")
};

function loadSettings_() {
  const p = PropertiesService.getScriptProperties().getProperties();

  const str = function (key) {
    const v = p[key];
    return String(v != null && String(v).trim() !== "" ? v : DEFAULTS[key]).trim();
  };
  const int = function (key, min, max) {
    const n = parseInt(str(key), 10);
    return Math.min(max, Math.max(min, isNaN(n) ? DEFAULTS[key] : n));
  };

  const projectId = String(p.GCP_PROJECT_ID || "").trim();
  if (!projectId) {
    throw new Error("Script Properties에 GCP_PROJECT_ID를 추가하세요.");
  }

  const thinkingLevel = str("THINKING_LEVEL").toUpperCase();
  if (THINKING_LEVELS.indexOf(thinkingLevel) < 0) {
    throw new Error("THINKING_LEVEL은 " + THINKING_LEVELS.join(" / ") + " 중 하나여야 합니다: " + thinkingLevel);
  }

  return {
    projectId: projectId,
    location: str("VERTEX_LOCATION"),
    modelId: str("VERTEX_MODEL_ID"),
    thinkingLevel: thinkingLevel,
    spreadsheetId: extractSpreadsheetId_(str("SPREADSHEET_ID")),
    sheetName: str("SHEET_NAME"),
    resultHeader: str("RESULT_HEADER"),
    reasonHeader: str("REASON_HEADER"),
    batchSize: int("BATCH_SIZE", 1, 100),
    parallel: int("PARALLEL_REQUESTS", 1, 20),
    chunkRows: int("CHUNK_ROWS", 50, 5000),
    titleMax: int("TITLE_MAX_CHARS", 50, 2000),
    featuresMax: int("FEATURES_MAX_CHARS", 0, 5000),
    maxPasses: int("MAX_PASSES", 1, 10),
    previewCount: int("PREVIEW_COUNT", 1, 60)
  };
}


/* =========================================================
 * 3. 실행 진입점
 * ========================================================= */

/** 전체 처리 (트리거가 5분마다 호출). 편집기에서 직접 실행해도 됨 */
function runClassification() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    console.log("다른 실행이 진행 중이라 이번 실행은 건너뜁니다.");
    return;
  }

  const startedAt = Date.now();
  const props = PropertiesService.getScriptProperties();
  const stats = newStats_();

  try {
    const s = loadSettings_();
    const sheet = getTargetSheet_(s);
    const cols = ensureResultColumn_(sheet, s);
    const doneAt = props.getProperty(STATE_KEYS.DONE);
    if (doneAt) {
      console.log("이미 완료된 작업입니다 (" + doneAt + "). 다시 돌리려면 resetProgress() 후 startBackgroundRun().");
      removeTriggers_();
      return;
    }

    const lastRow = sheet.getLastRow();

    const runtime = newRuntime_(s);

    let cursor = Math.max(2, toInt_(props.getProperty(STATE_KEYS.CURSOR), 2));
    let pass = Math.max(1, toInt_(props.getProperty(STATE_KEYS.PASS), 1));
    let passFailed = toInt_(props.getProperty(STATE_KEYS.PASS_FAILED), 0);

    console.log(
      "시작: 패스 " + pass + ", " + cursor + "행부터 (마지막 행 " + lastRow + "), 모델 " + s.modelId + " @ " + s.location +
      ", thinking " + (runtime.omitThinking ? "미지정" : s.thinkingLevel) + ", 배치 " + runtime.batchSize
    );

    while (cursor <= lastRow && elapsed_(startedAt) < LIMITS.STOP_NEW_WORK_AFTER_MS) {
      const endRow = Math.min(cursor + s.chunkRows - 1, lastRow);
      const result = processChunk_(sheet, cols, cursor, endRow, s, runtime, startedAt, stats);

      if (!result.complete) break; // 시간 부족·치명 오류: 같은 청크의 빈 칸을 다음 실행에서 이어서

      passFailed += result.failed;
      cursor = endRow + 1;

      const update = {};
      update[STATE_KEYS.CURSOR] = String(cursor);
      update[STATE_KEYS.PASS_FAILED] = String(passFailed);
      props.setProperties(update);
    }

    if (runtime.fatal) {
      throw new Error(runtime.fatal);
    }

    if (cursor > lastRow) {
      if (passFailed > 0 && pass < s.maxPasses) {
        const next = {};
        next[STATE_KEYS.CURSOR] = "2";
        next[STATE_KEYS.PASS] = String(pass + 1);
        next[STATE_KEYS.PASS_FAILED] = "0";
        props.setProperties(next);
        console.log("패스 " + pass + " 종료: 실패 " + passFailed + "행 → 패스 " + (pass + 1) + "에서 빈 칸만 재시도");
      } else {
        props.setProperty(STATE_KEYS.DONE, new Date().toISOString());
        removeTriggers_();
        console.log("✅ 전체 완료 (패스 " + pass + "). 남은 빈 칸: " + passFailed + "행. 트리거를 삭제했습니다.");
      }
    } else {
      console.log("이번 실행 종료: 다음 실행은 " + cursor + "행부터");
    }
  } finally {
    logRunSummary_(stats, startedAt);
    lock.releaseLock();
  }
}

/** 등급·근거 컬럼 추가 + 5분 트리거 설치 + 즉시 1회 실행 */
function startBackgroundRun() {
  const s = loadSettings_();
  getColumnMap_(getTargetSheet_(s), s); // 설정·헤더 문제는 트리거 설치 전에 여기서 걸러냄 (컬럼 추가는 runClassification이 잠금 안에서 수행)

  PropertiesService.getScriptProperties().deleteProperty(STATE_KEYS.DONE);
  removeTriggers_();
  ScriptApp.newTrigger("runClassification")
    .timeBased()
    .everyMinutes(LIMITS.TRIGGER_EVERY_MINUTES)
    .create();

  console.log("트리거 설치 완료 (" + LIMITS.TRIGGER_EVERY_MINUTES + "분마다 runClassification). 첫 실행을 시작합니다.");
  runClassification();
}

function stopBackgroundRun() {
  const n = removeTriggers_();
  console.log("트리거 " + n + "개 삭제. 진행 위치는 유지됩니다 (startBackgroundRun으로 재개).");
}

/** 커서·패스·줄인 배치 크기 초기화. 시트 값은 그대로 두며, 빈 칸만 다시 처리됩니다 */
function resetProgress() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(STATE_KEYS).forEach(function (k) {
    props.deleteProperty(STATE_KEYS[k]);
  });
  console.log("진행 상태를 초기화했습니다.");
}

/** 진행률과 등급 분포 */
function showProgress() {
  const s = loadSettings_();
  const sheet = getTargetSheet_(s);
  const cols = getColumnMap_(sheet, s);
  const props = PropertiesService.getScriptProperties();

  if (!cols.result) {
    console.log("아직 결과 컬럼이 없습니다. startBackgroundRun()을 실행하세요.");
    return;
  }

  const lastRow = sheet.getLastRow();
  const total = Math.max(0, lastRow - 1);
  const counts = {};
  const tags = {};
  let blank = 0;

  if (total > 0) {
    const reasonVals = cols.reason
      ? sheet.getRange(2, cols.reason, total, 1).getValues()
      : null;
    sheet.getRange(2, cols.result, total, 1).getValues().forEach(function (r, i) {
      const v = String(r[0]).trim();
      const reason = reasonVals ? String(reasonVals[i][0]) : "";
      if (isPendingRow_(v, reason)) {
        blank++;
        return;
      }
      counts[v] = (counts[v] || 0) + 1;
      const tag = reason.match(/^\s*(\[[^\]]+\])/);
      if (tag) tags[tag[1]] = (tags[tag[1]] || 0) + 1;
    });
  }

  const order = ["상", "중", "하", "불가", NO_DATA_LABEL];
  const parts = order.map(function (k) { return k + " " + (counts[k] || 0); });
  Object.keys(counts).forEach(function (k) {
    if (order.indexOf(k) < 0) parts.push(k + " " + counts[k]);
  });
  const tagParts = Object.keys(tags).map(function (k) { return k + " " + tags[k]; });

  const done = total - blank;
  console.log(
    "진행 " + done + " / " + total + " (" + (total ? (done / total * 100).toFixed(1) : "0") + "%)\n" +
    "등급: " + parts.join(" | ") + " | 미처리(등급 또는 근거 누락) " + blank + "\n" +
    "근거 태그: " + (tagParts.length ? tagParts.join(" | ") : "-") + "\n" +
    "커서 " + (props.getProperty(STATE_KEYS.CURSOR) || "2") +
    ", 패스 " + (props.getProperty(STATE_KEYS.PASS) || "1") +
    ", 완료시각 " + (props.getProperty(STATE_KEYS.DONE) || "-") +
    ", 트리거 " + countTriggers_() + "개"
  );
}


/* =========================================================
 * 4. 점검·미리보기 (시트 수정 없음)
 * ========================================================= */

function checkSetup() {
  const s = loadSettings_();
  console.log(
    "설정: project=" + s.projectId + ", model=" + s.modelId + ", location=" + s.location +
    ", thinking=" + s.thinkingLevel + ", batch=" + s.batchSize + ", parallel=" + s.parallel +
    ", sheet=" + s.sheetName
  );

  const sheet = getTargetSheet_(s);
  const cols = getColumnMap_(sheet, s);
  console.log(
    "시트 OK: 마지막 행 " + sheet.getLastRow() +
    " | category_name=" + colLetter_(cols.category) +
    ", title=" + colLetter_(cols.title) +
    ", features=" + colLetter_(cols.features) +
    " | 결과 컬럼: " + (cols.result ? colLetter_(cols.result) + "열 (이미 있음)" : "없음 → 첫 실행 때 추가") +
    " | 근거 컬럼: " + (cols.reason ? colLetter_(cols.reason) + "열 (이미 있음)" : "없음 → 첫 실행 때 추가")
  );

  const item = buildItem_(
    sheet.getRange(2, cols.category).getValue(),
    sheet.getRange(2, cols.title).getValue(),
    sheet.getRange(2, cols.features).getValue(),
    s
  ) || { category_name: "Car Seat Protectors", title: "Car seat protector for leather seats", features: "" };
  item.rowIdx = 2;

  const runtime = newRuntime_(s);
  const stats = newStats_();
  const t0 = Date.now();
  const out = classifyItems_([item], s, runtime, Date.now(), stats, true);

  if (runtime.fatal) throw new Error(runtime.fatal);
  if (!out.grades.has(2)) throw new Error("Vertex 응답에서 등급을 받지 못했습니다. 실행 로그의 경고를 확인하세요.");

  console.log(
    "Vertex OK (" + (Date.now() - t0) + "ms" + (runtime.omitThinking && s.thinkingLevel !== "NONE" ? ", thinkingConfig 없이" : "") + ")" +
    " → 2행 [" + out.grades.get(2) + "] " + item.title.slice(0, 80) + " | " + out.reasons.get(2)
  );
  logRunSummary_(stats, t0);
}

/**
 * 무작위 행을 등급 + 이유와 함께 로그로 출력 (프롬프트 품질 점검용)
 * 실제 실행과 같은 배치 크기·thinking 설정으로 호출하고, 사용 토큰으로 전체 처리 비용을 추정합니다.
 * THINKING_LEVEL 속성을 MINIMAL / HIGH 로 바꿔 각각 실행하면 품질과 비용을 직접 비교할 수 있습니다.
 */
function previewSample() {
  const s = loadSettings_();
  const sheet = getTargetSheet_(s);
  const cols = getColumnMap_(sheet, s);
  const lastRow = sheet.getLastRow();
  const rows = pickRandomRows_(2, lastRow, s.previewCount);

  const items = [];
  rows.forEach(function (row) {
    const item = buildItem_(
      sheet.getRange(row, cols.category).getValue(),
      sheet.getRange(row, cols.title).getValue(),
      sheet.getRange(row, cols.features).getValue(),
      s
    );
    if (item) {
      item.rowIdx = row;
      items.push(item);
    }
  });
  if (!items.length) {
    console.log("미리볼 데이터가 없습니다.");
    return;
  }

  const runtime = newRuntime_(s);
  const stats = newStats_();
  const startedAt = Date.now();
  const out = classifyItems_(items, s, runtime, startedAt, stats, true);
  if (runtime.fatal) throw new Error(runtime.fatal);

  const lines = items.map(function (it) {
    return it.rowIdx + "행 [" + (out.grades.get(it.rowIdx) || "실패") + "] " +
      it.category_name + " | " + it.title.slice(0, 70) +
      " | " + (out.reasons.get(it.rowIdx) || "");
  });
  console.log("미리보기 " + items.length + "건 (thinking " + (runtime.omitThinking ? "미지정" : s.thinkingLevel) + ", 배치 " + runtime.batchSize + ")\n" + lines.join("\n"));
  logRunSummary_(stats, startedAt);

  // 전체 행 기준 비용 추정 (미리보기 표본의 상품당 토큰 × 전체 행 수)
  const totalRows = Math.max(0, lastRow - 1);
  if (out.grades.size && totalRows) {
    const perItemCost = estimateCost_(stats) / out.grades.size;
    const perItemThink = stats.thoughtTokens / out.grades.size;
    console.log(
      "[전체 예상] " + totalRows + "행 × 상품당 $" + perItemCost.toFixed(5) +
      " ≈ $" + (perItemCost * totalRows).toFixed(0) +
      " (상품당 thinking " + Math.round(perItemThink) + " 토큰, 재시도·캐시 할인 미반영)"
    );
  }
}


/* =========================================================
 * 5. 청크 처리
 * ========================================================= */

function isPendingRow_(grade, reason) {
  return !String(grade == null ? "" : grade).trim() ||
    !String(reason == null ? "" : reason).trim();
}

function processChunk_(sheet, cols, startRow, endRow, s, runtime, startedAt, stats) {
  const n = endRow - startRow + 1;
  const resultRange = sheet.getRange(startRow, cols.result, n, 1);
  const resultVals = resultRange.getValues();
  const reasonRange = sheet.getRange(startRow, cols.reason, n, 1);
  const reasonVals = reasonRange.getValues();

  const pending = [];
  for (let i = 0; i < n; i++) {
    if (isPendingRow_(resultVals[i][0], reasonVals[i][0])) pending.push(i);
  }
  if (!pending.length) return { complete: true, failed: 0 };

  const cats = sheet.getRange(startRow, cols.category, n, 1).getValues();
  const titles = sheet.getRange(startRow, cols.title, n, 1).getValues();
  const feats = sheet.getRange(startRow, cols.features, n, 1).getValues();

  const items = [];
  let dirty = false;

  pending.forEach(function (i) {
    const item = buildItem_(cats[i][0], titles[i][0], feats[i][0], s);
    if (!item) {
      resultVals[i][0] = NO_DATA_LABEL;
      reasonVals[i][0] = "title·features가 비어 있음";
      stats.noData++;
      dirty = true;
      return;
    }
    item.rowIdx = i;
    items.push(item);
  });

  let out = { grades: new Map(), reasons: new Map(), failed: [], incomplete: false };
  if (items.length) {
    out = classifyItems_(items, s, runtime, startedAt, stats, true);
  }

  out.grades.forEach(function (label, i) {
    resultVals[i][0] = label;
    reasonVals[i][0] = out.reasons.get(i);
    dirty = true;
  });
  if (dirty) {
    resultRange.setValues(resultVals);
    reasonRange.setValues(reasonVals);
  }

  stats.classified += out.grades.size;
  const complete = !out.incomplete && !runtime.fatal;
  if (complete) stats.failed += out.failed.length;

  return { complete: complete, failed: out.failed.length };
}

function buildItem_(category, title, features, s) {
  const t = clip_(title, s.titleMax);
  const f = clip_(features, s.featuresMax);
  if (!t && !f) return null;
  return { category_name: clip_(category, 150), title: t, features: f };
}

function clip_(value, maxChars) {
  if (!maxChars) return "";
  const t = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return t.length > maxChars ? t.slice(0, maxChars) + "…" : t;
}


/* =========================================================
 * 6. Vertex 배치 분류 (fetchAll 병렬 + 재시도)
 * ========================================================= */

/**
 * items: [{ rowIdx, category_name, title, features }]
 * 반환: grades(Map rowIdx→상/중/하/불가), reasons(Map), failed(rowIdx[]), incomplete(시간 부족)
 */
function classifyItems_(items, s, runtime, startedAt, stats, withReason) {
  const grades = new Map();
  const reasons = new Map();
  const failed = [];
  let queue = items.map(function (item) { return { item: item, attempts: 0 }; });
  let incomplete = false;
  let backoffMs = LIMITS.BACKOFF_BASE_MS;
  let allTransientRounds = 0;

  while (queue.length) {
    if (runtime.fatal) break;
    const elapsed = elapsed_(startedAt);
    if (elapsed >= LIMITS.STOP_NEW_WORK_AFTER_MS ||
        elapsed + runtime.maxRoundMs * LIMITS.ROUND_TIME_SAFETY >= LIMITS.HARD_STOP_MS) {
      incomplete = true;
      break;
    }

    // 라운드 구성: 재시도 건은 작은 배치로
    const batches = [];
    while (queue.length && batches.length < s.parallel) {
      const size = queue[0].attempts > 0
        ? Math.max(1, Math.ceil(runtime.batchSize / LIMITS.RETRY_BATCH_DIVISOR))
        : runtime.batchSize;
      batches.push(queue.splice(0, size));
    }

    const sentWithThinking = !runtime.omitThinking;
    const requests = batches.map(function (b) {
      return buildRequest_(b.map(function (e) { return e.item; }), s, runtime, withReason);
    });

    let responses;
    const roundStart = Date.now();
    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (e) {
      const msg = errMsg_(e);
      if (/too many times|quota|bandwidth/i.test(msg)) {
        runtime.fatal = "UrlFetch 한도 초과로 중단합니다 (다음 날 자동 재개): " + msg;
        queue = batches.reduce(function (a, b) { return a.concat(b); }, []).concat(queue);
        break;
      }
      if (/time(d)?\s*out|timeout|deadline/i.test(msg)) {
        shrinkBatchOnTimeout_(s, runtime, msg);
      } else {
        console.warn("fetchAll 오류 (일시적 오류로 처리): " + msg);
      }
      responses = batches.map(function () { return null; });
    }
    runtime.maxRoundMs = Math.max(runtime.maxRoundMs, Date.now() - roundStart);
    stats.requests += batches.length;

    const requeue = [];
    let transientCount = 0;
    let lastTransient = "";

    batches.forEach(function (batch, bi) {
      const parsed = parseResponse_(responses[bi], batch.length);
      addUsage_(stats, parsed.usage);

      if (parsed.thinkingUnsupported && sentWithThinking) {
        if (!runtime.omitThinking) {
          runtime.omitThinking = true;
          PropertiesService.getScriptProperties().setProperty(STATE_KEYS.NO_THINKING_MODEL, s.modelId); // 다음 실행부터 바로 적용
          console.warn("이 모델은 thinkingLevel=" + s.thinkingLevel + "을 지원하지 않아 thinkingConfig 없이 재시도합니다. (" + parsed.error + ")");
        }
        Array.prototype.push.apply(requeue, batch);
        return;
      }
      if (parsed.fatal) {
        runtime.fatal = parsed.error;
        return;
      }
      if (parsed.transient) {
        transientCount++;
        lastTransient = parsed.error;
        Array.prototype.push.apply(requeue, batch); // 429·5xx·네트워크·타임아웃은 시도 횟수 미차감
        return;
      }
      if (!parsed.ok) {
        console.warn("배치 응답 오류 (" + batch.length + "건): " + parsed.error);
      }

      batch.forEach(function (entry, k) {
        const hit = parsed.ok ? parsed.byId.get(k + 1) : null;
        if (hit && (!withReason || hit.reason)) {
          grades.set(entry.item.rowIdx, GRADE_LABELS[hit.grade]);
          if (hit.reason) reasons.set(entry.item.rowIdx, hit.reason);
          return;
        }
        entry.attempts++;
        if (entry.attempts >= LIMITS.MAX_ATTEMPTS_PER_ROW) failed.push(entry.item.rowIdx);
        else requeue.push(entry);
      });
    });

    queue = requeue.concat(queue);
    if (runtime.fatal) break;

    if (transientCount > 0) {
      allTransientRounds = transientCount === batches.length ? allTransientRounds + 1 : 0;
      if (allTransientRounds >= LIMITS.MAX_ALL_TRANSIENT_ROUNDS) {
        console.warn("일시적 오류가 계속되어 이번 실행을 멈춥니다. 다음 트리거에서 재시도: " + lastTransient);
        incomplete = true;
        break;
      }
      const remain = LIMITS.STOP_NEW_WORK_AFTER_MS - elapsed_(startedAt);
      if (remain > 0) Utilities.sleep(Math.min(backoffMs, remain));
      backoffMs = Math.min(backoffMs * 2, LIMITS.BACKOFF_MAX_MS);
    } else {
      allTransientRounds = 0;
      backoffMs = LIMITS.BACKOFF_BASE_MS;
    }
  }

  if (queue.length && !incomplete) incomplete = true;
  return { grades: grades, reasons: reasons, failed: failed, incomplete: incomplete };
}

/** 요청 타임아웃: 배치 크기를 절반으로 줄이고 같은 모델·thinking 설정의 다음 실행에도 유지 */
function shrinkBatchOnTimeout_(s, runtime, msg) {
  const next = Math.max(LIMITS.MIN_BATCH_ON_TIMEOUT, Math.floor(runtime.batchSize / 2));
  if (next < runtime.batchSize) {
    runtime.batchSize = next;
    PropertiesService.getScriptProperties().setProperty(
      STATE_KEYS.BATCH_OVERRIDE,
      batchOverrideKey_(s) + "|" + next
    );
    console.warn("요청 타임아웃 → 배치 크기를 " + next + "개로 줄여 재시도합니다. (" + msg + ")");
  } else {
    console.warn("요청 타임아웃 (배치 " + runtime.batchSize + "개, 더 줄이지 않음): " + msg);
  }
}

function batchOverrideKey_(s) {
  return s.modelId + "|" + s.thinkingLevel + "|" + s.batchSize;
}

function buildRequest_(items, s, runtime, withReason) {
  const thinking = !runtime.omitThinking && s.thinkingLevel !== "MINIMAL";
  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: withReason ? RESPONSE_SCHEMA_WITH_REASON : RESPONSE_SCHEMA,
    // thinking 토큰도 maxOutputTokens 한도를 함께 쓰므로, 사고를 켜면 한도를 최대로 둬서 답이 잘리지 않게 함
    maxOutputTokens: thinking
      ? 65535
      : Math.min(65535, 1024 + items.length * (withReason ? 150 : 40))
  };
  if (!runtime.omitThinking) {
    generationConfig.thinkingConfig = { thinkingLevel: s.thinkingLevel };
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: withReason ? SYSTEM_PROMPT + "\n\n" + REASON_ADDON : SYSTEM_PROMPT }]
    },
    contents: [{ role: "user", parts: [{ text: buildUserText_(items) }] }],
    generationConfig: generationConfig
  };

  return {
    url: vertexEndpoint_(s),
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + runtime.token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
}

function vertexEndpoint_(s) {
  const host = s.location === "global"
    ? "aiplatform.googleapis.com"
    : s.location + "-aiplatform.googleapis.com";
  return "https://" + host + "/v1/projects/" + encodeURIComponent(s.projectId) +
    "/locations/" + encodeURIComponent(s.location) +
    "/publishers/google/models/" + encodeURIComponent(s.modelId) + ":generateContent";
}

/**
 * 응답 분류
 *  ok: byId(Map id→{grade, reason})
 *  transient: 429·5xx·네트워크 → 같은 배치 재전송
 *  thinkingUnsupported: thinkingLevel 미지원 400 → thinkingConfig 제거 후 재전송
 *  fatal: 인증·권한·모델 ID 오류 등 → 실행 중단
 */
function parseResponse_(res, n) {
  if (!res) return { ok: false, transient: true, error: "NETWORK_ERROR" };

  const code = res.getResponseCode();
  const body = String(res.getContentText() || "");

  if (code === 429 || code >= 500) {
    return { ok: false, transient: true, error: "HTTP " + code + ": " + body.slice(0, 200) };
  }
  if (code === 400 && /thinking[\s_]?(level|config|budget)/i.test(body)) {
    return { ok: false, thinkingUnsupported: true, fatal: true, error: "HTTP 400: " + body.slice(0, 300) };
  }
  if (code < 200 || code >= 300) {
    let hint = "";
    if (code === 401 || code === 403) hint = " → 실행 계정의 Vertex AI User 권한, Vertex AI API 사용 설정, GCP_PROJECT_ID를 확인하세요.";
    if (code === 404) hint = " → VERTEX_MODEL_ID / VERTEX_LOCATION 조합을 확인하세요.";
    return { ok: false, fatal: true, error: "Vertex HTTP " + code + ": " + body.slice(0, 500) + hint };
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { ok: false, error: "RESPONSE_NOT_JSON" };
  }

  const usage = json.usageMetadata || null;
  const cand = json.candidates && json.candidates[0];
  if (!cand || !cand.content) {
    const why = (json.promptFeedback && json.promptFeedback.blockReason) || (cand && cand.finishReason) || "";
    return { ok: false, usage: usage, error: "EMPTY_CANDIDATE " + why };
  }

  const text = (cand.content.parts || [])
    .filter(function (p) { return p && typeof p.text === "string" && !p.thought; })
    .map(function (p) { return p.text; })
    .join("");

  const byId = new Map();
  const accept = function (id, grade, reason) {
    const g = String(grade || "").trim().toUpperCase();
    const i = Number(id);
    if (Number.isInteger(i) && i >= 1 && i <= n && GRADE_LABELS[g] && !byId.has(i)) {
      byId.set(i, { grade: g, reason: reason ? String(reason).trim() : "" });
    }
  };

  try {
    const data = parseJsonLoose_(text);
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
    list.forEach(function (r) {
      if (r) accept(r.id, r.grade, r.reason);
    });
  } catch (e) {
    // 출력이 잘린 경우(MAX_TOKENS 등): 완성된 항목만 건지고 나머지는 재시도
    const re = /"id"\s*:\s*(\d+)\s*,\s*(?:"reason"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*)?"grade"\s*:\s*"(HIGH|MEDIUM|LOW|NONE)"/g;
    let m;
    while ((m = re.exec(text)) !== null) accept(m[1], m[3], m[2] ? unescapeJsonString_(m[2]) : "");
    if (!byId.size) {
      return { ok: false, usage: usage, error: "JSON_PARSE_FAILED finishReason=" + cand.finishReason };
    }
  }

  return { ok: true, byId: byId, usage: usage };
}

function unescapeJsonString_(s) {
  try {
    return JSON.parse("\"" + s + "\"");
  } catch (e) {
    return s;
  }
}

function parseJsonLoose_(text) {
  const t = String(text || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw e;
  }
}


/* =========================================================
 * 7. 시트 유틸
 * ========================================================= */

function getTargetSheet_(s) {
  const ss = s.spreadsheetId
    ? SpreadsheetApp.openById(s.spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("스프레드시트를 열 수 없습니다. SPREADSHEET_ID를 확인하세요.");

  const sheet = ss.getSheetByName(s.sheetName);
  if (!sheet) throw new Error("'" + s.sheetName + "' 탭을 찾을 수 없습니다.");
  return sheet;
}

function getColumnMap_(sheet, s) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(normHeader_);
  const find = function (names) {
    for (let k = 0; k < names.length; k++) {
      const idx = headers.indexOf(normHeader_(names[k]));
      if (idx >= 0) return idx + 1;
    }
    return 0;
  };

  const map = {
    result: find([s.resultHeader]),
    reason: find([s.reasonHeader]),
    category: find(INPUT_HEADERS.category),
    title: find(INPUT_HEADERS.title),
    features: find(INPUT_HEADERS.features)
  };

  const missing = ["category", "title", "features"].filter(function (k) { return !map[k]; });
  if (missing.length) {
    throw new Error("1행에서 헤더를 찾을 수 없습니다: " + missing.map(function (k) { return INPUT_HEADERS[k][0]; }).join(", "));
  }
  return map;
}

/** 등급·근거 컬럼을 헤더로 찾아 재사용하고, 없는 컬럼만 추가 */
function ensureResultColumn_(sheet, s) {
  const map = getColumnMap_(sheet, s);
  if (map.result && map.reason) return map;

  if (!map.result && !map.reason) {
    sheet.insertColumnsBefore(1, 2);
    sheet.getRange(1, 1, 1, 2).setValues([[s.resultHeader, s.reasonHeader]]).setFontWeight("bold");
  } else if (map.result && !map.reason) {
    sheet.insertColumnAfter(map.result);
    sheet.getRange(1, map.result + 1).setValue(s.reasonHeader).setFontWeight("bold");
  } else {
    sheet.insertColumnBefore(map.reason);
    sheet.getRange(1, map.reason).setValue(s.resultHeader).setFontWeight("bold");
  }
  SpreadsheetApp.flush();

  const after = getColumnMap_(sheet, s);
  if (!after.result || !after.reason) throw new Error("결과 컬럼 생성 확인에 실패했습니다.");
  // 새 컬럼이 생겼으므로 처음부터 다시 탐색.
  const props = PropertiesService.getScriptProperties();
  [STATE_KEYS.CURSOR, STATE_KEYS.PASS, STATE_KEYS.PASS_FAILED, STATE_KEYS.DONE].forEach(function (key) {
    props.deleteProperty(key);
  });
  console.log("등급·판단근거 컬럼을 준비했습니다. 누락된 결과를 처음부터 확인합니다.");
  return after;
}

function normHeader_(v) {
  return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, "_");
}

function extractSpreadsheetId_(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : raw;
}

function pickRandomRows_(firstRow, lastRow, count) {
  const total = lastRow - firstRow + 1;
  if (total <= 0) return [];
  const want = Math.min(count, total);
  const picked = new Set();
  while (picked.size < want) {
    picked.add(firstRow + Math.floor(Math.random() * total));
  }
  return Array.from(picked).sort(function (a, b) { return a - b; });
}

function colLetter_(n) {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "?";
}


/* =========================================================
 * 8. 트리거·로그·기타
 * ========================================================= */

function removeTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runClassification") {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

function countTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "runClassification";
  }).length;
}

function newRuntime_(s) {
  const props = PropertiesService.getScriptProperties();
  const rejectedModel = props.getProperty(STATE_KEYS.NO_THINKING_MODEL);

  // 같은 모델·thinking·배치 설정에서 타임아웃으로 줄여 둔 배치 크기가 있으면 이어서 사용
  let batchSize = s.batchSize;
  const override = String(props.getProperty(STATE_KEYS.BATCH_OVERRIDE) || "");
  const prefix = batchOverrideKey_(s) + "|";
  if (override.indexOf(prefix) === 0) {
    const n = toInt_(override.slice(prefix.length), 0);
    if (n >= 1 && n < batchSize) batchSize = n;
  }

  return {
    token: ScriptApp.getOAuthToken(),
    omitThinking: s.thinkingLevel === "NONE" || rejectedModel === s.modelId,
    batchSize: batchSize,
    maxRoundMs: 0,
    fatal: ""
  };
}

function newStats_() {
  return { classified: 0, noData: 0, failed: 0, requests: 0, promptTokens: 0, cachedTokens: 0, outputTokens: 0, thoughtTokens: 0 };
}

function addUsage_(stats, u) {
  if (!u) return;
  stats.promptTokens += Number(u.promptTokenCount || 0);
  stats.cachedTokens += Number(u.cachedContentTokenCount || 0);
  stats.outputTokens += Number(u.candidatesTokenCount || 0);
  stats.thoughtTokens += Number(u.thoughtsTokenCount || 0);
}

/** 표준 단가 기준 비용 (캐시 할인 미반영 → 실제보다 약간 높게 나옴) */
function estimateCost_(stats) {
  return (stats.promptTokens * PRICE_PER_1M_TOKENS.input +
    (stats.outputTokens + stats.thoughtTokens) * PRICE_PER_1M_TOKENS.output) / 1e6;
}

function logRunSummary_(stats, startedAt) {
  console.log(
    "[요약] " + Math.round(elapsed_(startedAt) / 1000) + "초" +
    " | 분류 " + stats.classified +
    " | 데이터없음 " + stats.noData +
    " | 실패 " + stats.failed +
    " | 요청 " + stats.requests +
    " | 토큰 in " + stats.promptTokens + " (캐시 " + stats.cachedTokens + ")" +
    " / out " + stats.outputTokens + " / think " + stats.thoughtTokens +
    " | 예상비용 약 $" + estimateCost_(stats).toFixed(3)
  );
}

function elapsed_(startedAt) {
  return Date.now() - startedAt;
}

function toInt_(v, fallback) {
  const n = parseInt(String(v == null ? "" : v), 10);
  return isNaN(n) ? fallback : n;
}

function errMsg_(e) {
  return String(e && e.message ? e.message : e);
}

/**
 * "하" / "불가" 행 전체 삭제
 * - 기존 분류기의 설정·헤더 검색 함수를 사용
 * - 아래쪽부터 연속된 행을 묶어서 삭제
 * - 시간 제한에 가까워지면 중단: 같은 함수를 다시 실행하면 이어서 삭제
 */
function deleteLowAndNoneRows() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    console.log("다른 작업이 실행 중입니다. 종료 후 다시 실행하세요.");
    return;
  }

  const startedAt = Date.now();
  const timeLimitMs = 240 * 1000;
  let deleted = 0;

  try {
    const s = loadSettings_();
    const sheet = getTargetSheet_(s);
    const cols = getColumnMap_(sheet, s);

    if (!cols.result) {
      throw new Error("실리콘 등급 컬럼을 찾을 수 없습니다.");
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      console.log("삭제할 데이터가 없습니다.");
      return;
    }

    const grades = sheet
      .getRange(2, cols.result, lastRow - 1, 1)
      .getValues()
      .map(function (r) {
        return String(r[0] == null ? "" : r[0]).trim();
      });

    const isTarget = function (grade) {
      return grade === "하" || grade === "불가";
    };

    // 아래쪽부터 삭제할 연속 구간을 수집합니다.
    const blocks = [];
    let totalTargets = 0;

    for (let i = grades.length - 1; i >= 0;) {
      if (!isTarget(grades[i])) {
        i--;
        continue;
      }

      const end = i;
      while (i >= 0 && isTarget(grades[i])) i--;

      const count = end - i;
      blocks.push({
        startRow: i + 3,
        count: count
      });
      totalTargets += count;
    }

    if (!totalTargets) {
      console.log("'하' 또는 '불가' 행이 없습니다.");
      return;
    }

    // 삭제 중 분류기가 자동으로 재개되지 않도록 중지합니다.
    stopBackgroundRun();

    console.log("삭제 대상: " + totalTargets + "행");

    for (let i = 0; i < blocks.length; i++) {
      if (Date.now() - startedAt >= timeLimitMs) {
        console.log(
          "시간 제한에 대비해 중단했습니다." +
          " 삭제: " + deleted + "행" +
          " / 남은 대상: " + (totalTargets - deleted) + "행." +
          " deleteLowAndNoneRows를 다시 실행하세요."
        );
        return;
      }

      const block = blocks[i];
      sheet.deleteRows(block.startRow, block.count);
      deleted += block.count;
    }

    console.log(
      "삭제 완료: " + deleted + "행." +
      " 현재 데이터: " + Math.max(0, sheet.getLastRow() - 1) + "행."
    );
  } catch (error) {
    console.error("오류 발생 전 삭제 완료: " + deleted + "행");
    throw error;
  } finally {
    lock.releaseLock();
  }
}
