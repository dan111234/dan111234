/************************************************************
 * Keepa_Top100 — 실리콘 차별화 분류 (Vertex AI 배치 예측 버전)
 *
 * silicone_classifier.gs 와 같은 Apps Script 프로젝트에 넣어서 사용합니다.
 * 프롬프트·응답 스키마·시트 헬퍼는 그 파일의 것을 그대로 씁니다.
 *
 * 왜 배치인가
 *  - Vertex AI 배치 예측은 실시간 호출의 약 50% 단가 (Flash + MEDIUM 조합 권장)
 *  - 6분 실행 제한·429 재시도·타임아웃 걱정이 없음 → 요청 1건에 상품을 많이(기본 50개) 담아
 *    시스템 프롬프트 반복 비용을 줄이고, features 는 줄이지 않음
 *
 * 흐름
 *  1) batchExportInput()    대기 행(등급 또는 근거가 빈 행)을 JSONL 로 만들어 GCS 에 업로드
 *                           (6분 안에 못 끝나면 같은 함수를 다시 실행하면 이어서 업로드)
 *  2) batchSubmitJob()      배치 작업 생성  ─ 또는 GCP 콘솔에서 직접 생성 (아래 콘솔 안내 참고)
 *  3) batchCheckJob()       상태 확인 (보통 수십 분 ~ 수 시간, 최대 24시간)
 *  4) batchImportResults()  결과를 시트에 기록 (마찬가지로 끊기면 다시 실행하면 이어서)
 *  5) showProgress()        (silicone_classifier.gs) 진행률·등급 분포 확인
 *     빈 칸이 남으면 1)부터 다시 → 남은 행만 새 작업으로 처리
 *     batchResetRun()       현재 배치 실행 상태를 지우고 새로 시작 (GCS 파일·시트 값은 유지)
 *
 * 자동 실행 (권장)
 *  batchStartAuto()   10분 트리거 1개를 설치하고 즉시 1회 실행. 트리거가 단계에 맞춰
 *                     업로드 → 작업 생성 → 상태 확인 → 결과 기록 → 빈 칸 재처리(최대 3회차) 를 진행하고
 *                     끝나면 스스로 트리거를 삭제합니다. 이 방식에서는 콘솔에서 작업을 따로 만들지 마세요.
 *  batchStopAuto()    트리거만 삭제 (진행 상태 유지, batchStartAuto로 재개)
 *
 * GCP 콘솔에서 직접 작업을 만들 경우
 *  Vertex AI → 배치 추론(Batch inference) → 만들기
 *   - 모델: Gemini 3.5 Flash (BATCH_MODEL_ID 와 같은 모델)
 *   - 리전: BATCH_LOCATION 과 같은 리전
 *   - 입력: Cloud Storage → batchExportInput() 로그에 나온 input 폴더의 *.jsonl 파일
 *   - 출력: Cloud Storage → 로그에 나온 output 폴더 (gs://버킷/silicone-batch/<실행ID>/output/)
 *   thinking(MEDIUM)·응답 스키마·최대 출력 토큰은 JSONL 각 줄에 들어 있어 콘솔에서 따로 설정할 필요 없음.
 *   작업이 끝나면 batchImportResults() 를 실행하면 output 폴더를 읽어 시트에 씁니다.
 *
 * Script Properties
 *  필수  GCP_PROJECT_ID, GCS_BUCKET (버킷 이름 또는 gs://버킷)
 *  선택  BATCH_LOCATION           기본 us-central1 (모델이 그 리전에 없으면 global 등으로 변경)
 *        BATCH_MODEL_ID           기본 gemini-3.5-flash
 *        BATCH_THINKING_LEVEL     기본 MEDIUM
 *        BATCH_ITEMS_PER_REQUEST  기본 50  (요청 1건에 담는 상품 수, 10~100)
 *        BATCH_ROWS_PER_FILE      기본 2000 (JSONL 파일 1개에 담는 상품 수)
 *        BATCH_MAX_ROWS           기본 0 = 제한 없음. 시험할 때 200 등으로 두면 그 행 수만 업로드
 *        TITLE_MAX_CHARS / FEATURES_MAX_CHARS 등은 silicone_classifier.gs 설정을 그대로 사용
 *
 * 권한
 *  appsscript.json 의 oauthScopes 에 cloud-platform 범위가 있어야 합니다 (같이 드린 appsscript.json 참고).
 *  Vertex AI 서비스 에이전트(service-<프로젝트번호>@gcp-sa-aiplatform.iam.gserviceaccount.com)가
 *  버킷을 읽고 쓸 수 있어야 합니다. 같은 프로젝트의 버킷이면 보통 기본 권한으로 됩니다.
 ************************************************************/


/* =========================================================
 * B1. 설정
 * ========================================================= */

const BATCH_DEFAULTS = {
  BATCH_LOCATION: "us-central1",
  BATCH_MODEL_ID: "gemini-3.5-flash",
  BATCH_THINKING_LEVEL: "MEDIUM",
  BATCH_ITEMS_PER_REQUEST: 50,
  BATCH_ROWS_PER_FILE: 2000,
  BATCH_MAX_ROWS: 0
};

/* 배치 단가 (표준 단가의 50%, USD / 1M tokens). 로그의 예상 비용 계산용 */
const BATCH_PRICE_PER_1M_TOKENS = {
  "gemini-3.5-flash-lite": { input: 0.15, output: 1.25 },
  "gemini-3.5-flash": { input: 0.75, output: 4.50 }
};

const BATCH_LIMITS = {
  STOP_AFTER_MS: 270 * 1000,          // 4분 30초가 지나면 상태 저장 후 종료 (다시 실행하면 이어서)
  READ_ROWS: 5000,                    // 시트에서 한 번에 읽는 행 수 (export)
  DOWNLOAD_BYTES: 6 * 1024 * 1024,    // GCS 결과 파일을 나눠 읽는 크기 (import)
  ROOT_PREFIX: "silicone-batch"
};

const BATCH_KEYS = {
  RUN: "SILI_BATCH_RUN" // 현재 배치 실행 상태(JSON)
};

function loadBatchSettings_() {
  const s = loadSettings_();
  const p = PropertiesService.getScriptProperties().getProperties();
  const str = function (key) {
    const v = p[key];
    return String(v != null && String(v).trim() !== "" ? v : BATCH_DEFAULTS[key]).trim();
  };
  const int = function (key, min, max) {
    const n = parseInt(str(key), 10);
    return Math.min(max, Math.max(min, isNaN(n) ? BATCH_DEFAULTS[key] : n));
  };

  const bucket = String(p.GCS_BUCKET || "").trim().replace(/^gs:\/\//, "").replace(/\/.*$/, "");
  if (!bucket) throw new Error("Script Properties에 GCS_BUCKET(버킷 이름)을 추가하세요.");

  const thinking = str("BATCH_THINKING_LEVEL").toUpperCase();
  if (THINKING_LEVELS.indexOf(thinking) < 0) {
    throw new Error("BATCH_THINKING_LEVEL은 " + THINKING_LEVELS.join(" / ") + " 중 하나여야 합니다: " + thinking);
  }

  s.bucket = bucket;
  s.batchLocation = str("BATCH_LOCATION");
  s.batchModelId = str("BATCH_MODEL_ID");
  s.batchThinking = thinking;
  s.itemsPerRequest = int("BATCH_ITEMS_PER_REQUEST", 10, 100);
  s.rowsPerFile = int("BATCH_ROWS_PER_FILE", 100, 20000);
  s.maxRows = int("BATCH_MAX_ROWS", 0, 10000000);
  return s;
}


/* =========================================================
 * B2. 1단계 — 입력 JSONL 생성·업로드
 * ========================================================= */

function batchExportInput() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    console.log("다른 작업이 실행 중입니다. 끝난 뒤 다시 실행하세요.");
    return;
  }
  const startedAt = Date.now();

  try {
    const s = loadBatchSettings_();
    const sheet = getTargetSheet_(s);
    const cols = ensureResultColumn_(sheet, s);
    const token = ScriptApp.getOAuthToken();

    let run = loadBatchRun_();
    if (run && run.stage !== "exporting") {
      console.log(
        "진행 중인 배치 실행이 있습니다 (" + run.id + ", 단계: " + run.stage + "). " +
        "결과를 먼저 batchImportResults()로 가져오거나, 버리려면 batchResetRun() 후 다시 실행하세요."
      );
      return;
    }
    if (!run) {
      const id = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd-HHmmss");
      run = {
        id: id,
        stage: "exporting",
        prefix: BATCH_LIMITS.ROOT_PREFIX + "/" + id,
        model: s.batchModelId,
        location: s.batchLocation,
        thinking: s.batchThinking,
        titleMax: s.titleMax,
        featuresMax: s.featuresMax,
        cursor: 2,
        files: [],
        rows: 0,
        requests: 0,
        chars: 0,
        noData: 0
      };
      saveBatchRun_(run);
      console.log("새 배치 실행 " + run.id + " 시작 (모델 " + run.model + ", thinking " + run.thinking + ", 요청당 " + s.itemsPerRequest + "개)");
    }

    const lastRow = sheet.getLastRow();
    const settings = Object.assign({}, s, { titleMax: run.titleMax, featuresMax: run.featuresMax });

    while (run.cursor <= lastRow && !(s.maxRows && run.rows >= s.maxRows)) {
      if (elapsed_(startedAt) >= BATCH_LIMITS.STOP_AFTER_MS) {
        saveBatchRun_(run);
        console.log("시간 제한 대비 중단: " + run.files.length + "개 파일 업로드됨. batchExportInput()을 다시 실행하면 " + run.cursor + "행부터 이어갑니다.");
        return;
      }

      // 대기 행을 fileCap 개 모을 때까지 시트를 읽음 (BATCH_MAX_ROWS가 있으면 남은 한도까지만)
      const fileCap = s.maxRows ? Math.min(s.rowsPerFile, s.maxRows - run.rows) : s.rowsPerFile;
      const items = [];
      let row = run.cursor;
      while (row <= lastRow && items.length < fileCap) {
        const n = Math.min(BATCH_LIMITS.READ_ROWS, lastRow - row + 1, fileCap - items.length + 500);
        const block = readRowsForBatch_(sheet, cols, row, n);
        let noDataDirty = false;

        for (let i = 0; i < n; i++) {
          if (!isPendingRow_(block.result[i][0], block.reason[i][0])) continue;
          const item = buildItem_(block.cat[i][0], block.title[i][0], block.feat[i][0], settings);
          if (!item) {
            block.result[i][0] = NO_DATA_LABEL;
            block.reason[i][0] = "title·features가 비어 있음";
            run.noData++;
            noDataDirty = true;
            continue;
          }
          item.id = row + i; // 시트 행 번호를 그대로 id로 사용 → 결과를 행에 바로 매칭
          items.push(item);
          if (items.length >= fileCap) {
            if (noDataDirty) block.writeBack();
            noDataDirty = false;
            row = row + i + 1;
            break;
          }
        }
        if (noDataDirty) block.writeBack();
        if (items.length < fileCap) row = row + n;
      }

      if (items.length) {
        const fileNo = run.files.length + 1;
        const name = run.prefix + "/input/part-" + ("0000" + fileNo).slice(-4) + ".jsonl";
        const built = buildBatchJsonl_(items, s, run);
        gcsUpload_(s.bucket, name, built.text, token);
        run.files.push(name);
        run.rows += items.length;
        run.requests += built.requests;
        run.chars += built.text.length;
      }
      run.cursor = row;
      saveBatchRun_(run);
    }

    run.stage = "exported";
    saveBatchRun_(run);

    if (!run.files.length) {
      console.log("처리할 대기 행이 없습니다. (데이터없음 " + run.noData + "행 기록) batchResetRun()으로 정리하세요.");
      return;
    }

    const estIn = run.chars / 3.5; // 영문 위주 대략치
    const price = batchPriceForModel_(run.model);
    console.log(
      "✅ 업로드 완료: 파일 " + run.files.length + "개, 상품 " + run.rows + "행, 요청 " + run.requests + "건 (데이터없음 " + run.noData + "행)\n" +
      "입력 폴더: gs://" + s.bucket + "/" + run.prefix + "/input/\n" +
      "출력 폴더: gs://" + s.bucket + "/" + run.prefix + "/output/\n" +
      "예상 입력 토큰 약 " + Math.round(estIn / 1e6 * 10) / 10 + "M → 입력 비용 약 $" + (estIn * price.input / 1e6).toFixed(0) +
      " | 출력(근거+thinking)은 상품당 150~450토큰 가정 시 약 $" +
      (run.rows * 150 * price.output / 1e6).toFixed(0) + "~" + (run.rows * 450 * price.output / 1e6).toFixed(0) + "\n" +
      "다음: batchSubmitJob() 실행 또는 GCP 콘솔에서 위 입력/출력 폴더로 배치 작업 생성"
    );
  } finally {
    lock.releaseLock();
  }
}

function readRowsForBatch_(sheet, cols, startRow, n) {
  const resultRange = sheet.getRange(startRow, cols.result, n, 1);
  const reasonRange = sheet.getRange(startRow, cols.reason, n, 1);
  const block = {
    result: resultRange.getValues(),
    reason: reasonRange.getValues(),
    cat: sheet.getRange(startRow, cols.category, n, 1).getValues(),
    title: sheet.getRange(startRow, cols.title, n, 1).getValues(),
    feat: sheet.getRange(startRow, cols.features, n, 1).getValues()
  };
  block.writeBack = function () {
    resultRange.setValues(block.result);
    reasonRange.setValues(block.reason);
  };
  return block;
}

/** 상품을 itemsPerRequest 개씩 묶어 Vertex 배치 입력 JSONL 문자열로 */
function buildBatchJsonl_(items, s, run) {
  const systemText = SYSTEM_PROMPT + "\n\n" + REASON_ADDON;
  const lines = [];
  for (let i = 0; i < items.length; i += s.itemsPerRequest) {
    const group = items.slice(i, i + s.itemsPerRequest);
    const generationConfig = {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA_WITH_REASON,
      maxOutputTokens: 65535 // thinking 토큰도 이 한도를 함께 씀
    };
    if (run.thinking !== "NONE") {
      generationConfig.thinkingConfig = { thinkingLevel: run.thinking };
    }
    lines.push(JSON.stringify({
      request: {
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: buildUserText_(group) }] }],
        generationConfig: generationConfig
      }
    }));
  }
  return { text: lines.join("\n") + "\n", requests: lines.length };
}


/* =========================================================
 * B3. 2단계 — 배치 작업 생성·상태 확인
 * ========================================================= */

function batchSubmitJob() {
  const s = loadBatchSettings_();
  const run = loadBatchRun_();
  if (!run || run.stage !== "exported") {
    console.log("업로드가 끝난 배치 실행이 없습니다. batchExportInput()을 먼저 끝내세요." + (run ? " (현재 단계: " + run.stage + ")" : ""));
    return;
  }

  const body = {
    displayName: "silicone-" + run.id,
    model: "publishers/google/models/" + run.model,
    inputConfig: {
      instancesFormat: "jsonl",
      gcsSource: { uris: run.files.map(function (f) { return "gs://" + s.bucket + "/" + f; }) }
    },
    outputConfig: {
      predictionsFormat: "jsonl",
      gcsDestination: { outputUriPrefix: "gs://" + s.bucket + "/" + run.prefix + "/output/" }
    }
  };

  const res = UrlFetchApp.fetch(batchJobsUrl_(s.projectId, run.location), {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    let hint = "";
    if (code === 404 || code === 400) hint = "\n→ 모델이 " + run.location + " 리전 배치를 지원하는지 확인하고, 안 되면 BATCH_LOCATION을 바꾼 뒤 batchResetRun()부터 다시 하세요.";
    if (code === 403) hint = "\n→ Vertex AI API 사용 설정, 실행 계정 권한, appsscript.json의 cloud-platform 범위를 확인하세요.";
    throw new Error("배치 작업 생성 실패 HTTP " + code + ": " + text.slice(0, 800) + hint);
  }

  const job = JSON.parse(text);
  run.stage = "submitted";
  run.jobName = job.name;
  saveBatchRun_(run);
  console.log("✅ 배치 작업 생성: " + job.name + " (상태 " + job.state + ")\nbatchCheckJob()으로 상태를 확인하세요.");
}

function batchCheckJob() {
  const run = loadBatchRun_();
  if (!run || !run.jobName) {
    console.log("이 스크립트로 만든 배치 작업이 없습니다. 콘솔에서 만들었다면 콘솔에서 상태를 확인하고, 끝나면 batchImportResults()를 실행하세요.");
    return;
  }
  const job = fetchBatchJob_(run);
  console.log(describeBatchJob_(job, run) +
    (isBatchJobDone_(job.state) ? "\n→ batchImportResults()를 실행해 시트에 기록하세요." : ""));
}

function fetchBatchJob_(run) {
  const host = run.location === "global" ? "aiplatform.googleapis.com" : run.location + "-aiplatform.googleapis.com";
  const res = UrlFetchApp.fetch("https://" + host + "/v1/" + run.jobName, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("상태 조회 실패 HTTP " + res.getResponseCode() + ": " + res.getContentText().slice(0, 500));
  }
  return JSON.parse(res.getContentText());
}

function describeBatchJob_(job, run) {
  const st = job.completionStats || {};
  return "작업 " + job.name + "\n상태: " + job.state +
    " | 성공 요청 " + (st.successfulCount || 0) + " / 실패 " + (st.failedCount || 0) + " / 미완료 " + (st.incompleteCount || 0) +
    " (전체 " + run.requests + "건)" +
    (job.error ? "\n오류: " + JSON.stringify(job.error).slice(0, 500) : "");
}

/** 결과를 가져올 수 있는 종료 상태 */
function isBatchJobDone_(state) {
  return state === "JOB_STATE_SUCCEEDED" || state === "JOB_STATE_PARTIALLY_SUCCEEDED";
}

/** 결과 없이 끝난 상태 → 자동 실행 중지 */
function isBatchJobDead_(state) {
  return state === "JOB_STATE_FAILED" || state === "JOB_STATE_CANCELLED" || state === "JOB_STATE_EXPIRED";
}

function batchJobsUrl_(projectId, location) {
  const host = location === "global" ? "aiplatform.googleapis.com" : location + "-aiplatform.googleapis.com";
  return "https://" + host + "/v1/projects/" + encodeURIComponent(projectId) +
    "/locations/" + encodeURIComponent(location) + "/batchPredictionJobs";
}


/* =========================================================
 * B4. 3단계 — 결과 가져오기
 * ========================================================= */

function batchImportResults() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    console.log("다른 작업이 실행 중입니다. 끝난 뒤 다시 실행하세요.");
    return;
  }
  const startedAt = Date.now();

  try {
    const s = loadBatchSettings_();
    const run = loadBatchRun_();
    if (!run || run.stage === "exporting") {
      console.log("가져올 배치 실행이 없습니다." + (run ? " 업로드가 아직 끝나지 않았습니다." : ""));
      return;
    }
    if (run.stage === "imported") {
      console.log("이미 가져온 실행입니다 (" + run.id + "). 남은 빈 칸은 batchResetRun() 후 batchExportInput()으로 다시 처리하세요.");
      return;
    }

    const token = ScriptApp.getOAuthToken();
    if (!run.outFiles) {
      const outPrefix = run.prefix + "/output/";
      run.outFiles = gcsList_(s.bucket, outPrefix, token)
        .filter(function (o) { return /\.jsonl$/i.test(o.name) && Number(o.size) > 0; })
        .map(function (o) { return { name: o.name, size: Number(o.size) }; });
      if (!run.outFiles.length) {
        delete run.outFiles;
        console.log("출력 파일이 아직 없습니다: gs://" + s.bucket + "/" + outPrefix + "\n작업이 끝났는지 확인하세요 (batchCheckJob 또는 콘솔).");
        return;
      }
      run.stage = "importing";
      run.fileIdx = 0;
      run.offset = 0;
      run.stats = { lines: 0, failedLines: 0, written: 0, mismatch: 0, missing: 0, inTok: 0, outTok: 0, thinkTok: 0 };
      saveBatchRun_(run);
      console.log("출력 파일 " + run.outFiles.length + "개를 읽습니다.");
    }

    const sheet = getTargetSheet_(s);
    const cols = getColumnMap_(sheet, s);
    const lastRow = sheet.getLastRow();
    const n = lastRow - 1;
    const titles = sheet.getRange(2, cols.title, n, 1).getValues();
    const resultRange = sheet.getRange(2, cols.result, n, 1);
    const reasonRange = sheet.getRange(2, cols.reason, n, 1);
    const resultVals = resultRange.getValues();
    const reasonVals = reasonRange.getValues();
    let dirty = false;

    const applyLine = function (line) {
      if (!line.trim()) return;
      run.stats.lines++;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (e) {
        run.stats.failedLines++;
        return;
      }

      // 이 요청에 담았던 상품들 (id = 시트 행 번호, title 로 행이 바뀌지 않았는지 확인)
      const expected = new Map();
      try {
        const userText = obj.request.contents[0].parts[0].text;
        userText.split("\n").forEach(function (l) {
          if (l.charAt(0) !== "{") return;
          const it = JSON.parse(l);
          expected.set(Number(it.id), it.title || "");
        });
      } catch (e) {
        run.stats.failedLines++;
        return;
      }

      const u = obj.response && obj.response.usageMetadata;
      if (u) {
        run.stats.inTok += Number(u.promptTokenCount || 0);
        run.stats.outTok += Number(u.candidatesTokenCount || 0);
        run.stats.thinkTok += Number(u.thoughtsTokenCount || 0);
      }

      const results = parseBatchResponse_(obj.response);
      if (obj.status || !results) {
        run.stats.failedLines++;
        run.stats.missing += expected.size;
        return;
      }

      const seen = new Set();
      results.forEach(function (r) {
        const id = Number(r.id);
        const g = String(r.grade || "").trim().toUpperCase();
        const reason = String(r.reason || "").trim();
        if (!expected.has(id) || seen.has(id) || !GRADE_LABELS[g] || !reason) return;
        seen.add(id);

        const idx = id - 2;
        if (idx < 0 || idx >= n || clip_(titles[idx][0], run.titleMax) !== expected.get(id)) {
          run.stats.mismatch++; // 업로드 이후 행이 삭제·정렬되어 위치가 바뀐 경우 → 기록하지 않음
          return;
        }
        resultVals[idx][0] = GRADE_LABELS[g];
        reasonVals[idx][0] = reason;
        run.stats.written++;
        dirty = true;
      });
      run.stats.missing += expected.size - seen.size;
    };

    while (run.fileIdx < run.outFiles.length) {
      if (elapsed_(startedAt) >= BATCH_LIMITS.STOP_AFTER_MS) break;
      const f = run.outFiles[run.fileIdx];
      if (run.offset >= f.size) {
        run.fileIdx++;
        run.offset = 0;
        continue;
      }

      const chunk = gcsReadLines_(s.bucket, f.name, run.offset, f.size, token);
      chunk.text.split("\n").forEach(applyLine);
      run.offset += chunk.bytes;
    }

    if (dirty) {
      resultRange.setValues(resultVals);
      reasonRange.setValues(reasonVals);
    }

    const st = run.stats;
    const price = batchPriceForModel_(run.model);
    const cost = (st.inTok * price.input + (st.outTok + st.thinkTok) * price.output) / 1e6;
    const summary =
      "기록 " + st.written + "행 | 응답 누락 " + st.missing + "행 | 행 위치 불일치 " + st.mismatch + "행 | 실패 요청 " + st.failedLines +
      " | 토큰 in " + st.inTok + " / out " + st.outTok + " / think " + st.thinkTok + " | 비용 약 $" + cost.toFixed(2);

    if (run.fileIdx >= run.outFiles.length) {
      run.stage = "imported";
      saveBatchRun_(run);
      console.log(
        "✅ 가져오기 완료 (" + run.id + ")\n" + summary +
        (st.missing + st.mismatch > 0
          ? "\n빈 칸으로 남은 행은 batchResetRun() → batchExportInput() → 새 작업으로 다시 처리하세요." : "")
      );
    } else {
      saveBatchRun_(run);
      console.log("시간 제한 대비 중단 (파일 " + (run.fileIdx + 1) + "/" + run.outFiles.length + "). batchImportResults()를 다시 실행하세요.\n지금까지: " + summary);
    }
  } finally {
    lock.releaseLock();
  }
}

/** 배치 출력의 response(GenerateContentResponse)에서 results 배열 추출. 실패 시 null */
function parseBatchResponse_(response) {
  const cand = response && response.candidates && response.candidates[0];
  if (!cand || !cand.content) return null;
  const text = (cand.content.parts || [])
    .filter(function (p) { return p && typeof p.text === "string" && !p.thought; })
    .map(function (p) { return p.text; })
    .join("");

  try {
    const data = parseJsonLoose_(text);
    return Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : null);
  } catch (e) {
    // 출력이 잘린 경우: 완성된 항목만 건짐
    const out = [];
    const re = /"id"\s*:\s*(\d+)\s*,\s*"reason"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"grade"\s*:\s*"(HIGH|MEDIUM|LOW|NONE)"/g;
    let m;
    while ((m = re.exec(text)) !== null) out.push({ id: Number(m[1]), reason: unescapeJsonString_(m[2]), grade: m[3] });
    return out.length ? out : null;
  }
}

/** 현재 배치 실행 상태 출력 / 초기화 */
function batchShowRun() {
  const run = loadBatchRun_();
  console.log(run ? JSON.stringify(Object.assign({}, run, { files: run.files.length + "개", outFiles: run.outFiles ? run.outFiles.length + "개" : "-" }), null, 2) : "배치 실행 상태가 없습니다.");
}

function batchResetRun() {
  PropertiesService.getScriptProperties().deleteProperty(BATCH_KEYS.RUN);
  console.log("배치 실행 상태를 지웠습니다. (GCS 파일과 시트 값은 그대로)");
}


/* =========================================================
 * B5. GCS·상태 유틸
 * ========================================================= */

function gcsUpload_(bucket, name, text, token) {
  const url = "https://storage.googleapis.com/upload/storage/v1/b/" + encodeURIComponent(bucket) +
    "/o?uploadType=media&name=" + encodeURIComponent(name);
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: { Authorization: "Bearer " + token },
    payload: Utilities.newBlob(text, "application/jsonl"),
    contentType: "application/jsonl",
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("GCS 업로드 실패 HTTP " + res.getResponseCode() + " (" + name + "): " + res.getContentText().slice(0, 500));
  }
}

function gcsList_(bucket, prefix, token) {
  const items = [];
  let pageToken = "";
  do {
    const url = "https://storage.googleapis.com/storage/v1/b/" + encodeURIComponent(bucket) +
      "/o?prefix=" + encodeURIComponent(prefix) + "&fields=items(name,size),nextPageToken" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error("GCS 목록 조회 실패 HTTP " + res.getResponseCode() + ": " + res.getContentText().slice(0, 500));
    }
    const json = JSON.parse(res.getContentText());
    Array.prototype.push.apply(items, json.items || []);
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return items;
}

/** offset부터 최대 DOWNLOAD_BYTES 를 읽어, 마지막 줄바꿈까지만 문자열로 돌려줌 (UTF-8 글자 중간에서 끊기지 않게) */
function gcsReadLines_(bucket, name, offset, size, token) {
  const end = Math.min(size, offset + BATCH_LIMITS.DOWNLOAD_BYTES) - 1;
  const url = "https://storage.googleapis.com/storage/v1/b/" + encodeURIComponent(bucket) +
    "/o/" + encodeURIComponent(name) + "?alt=media";
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token, Range: "bytes=" + offset + "-" + end },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 206 && code !== 200) {
    throw new Error("GCS 읽기 실패 HTTP " + code + " (" + name + "): " + res.getContentText().slice(0, 300));
  }

  let bytes = res.getContent();
  if (code === 200 && offset > 0) bytes = bytes.slice(offset, end + 1); // Range 미적용 응답 대비

  const isLast = end >= size - 1;
  let cut = bytes.length;
  if (!isLast) {
    cut = bytes.lastIndexOf(10) + 1; // '\n'
    if (cut <= 0) throw new Error("한 줄이 " + BATCH_LIMITS.DOWNLOAD_BYTES + "바이트보다 깁니다. DOWNLOAD_BYTES를 늘리세요.");
  }
  const text = Utilities.newBlob(cut === bytes.length ? bytes : bytes.slice(0, cut)).getDataAsString("UTF-8");
  return { text: text, bytes: cut };
}

function loadBatchRun_() {
  const v = PropertiesService.getScriptProperties().getProperty(BATCH_KEYS.RUN);
  return v ? JSON.parse(v) : null;
}

function saveBatchRun_(run) {
  PropertiesService.getScriptProperties().setProperty(BATCH_KEYS.RUN, JSON.stringify(run));
}

function batchPriceForModel_(modelId) {
  const keys = Object.keys(BATCH_PRICE_PER_1M_TOKENS).sort(function (a, b) { return b.length - a.length; });
  for (let i = 0; i < keys.length; i++) {
    if (String(modelId).indexOf(keys[i]) === 0) return BATCH_PRICE_PER_1M_TOKENS[keys[i]];
  }
  return BATCH_PRICE_PER_1M_TOKENS["gemini-3.5-flash"];
}


/* =========================================================
 * B6. 자동 실행 (트리거 1개로 업로드 → 작업 생성 → 상태 확인 → 결과 기록)
 * ========================================================= */

const BATCH_AUTO = {
  HANDLER: "batchAutoStep",
  EVERY_MINUTES: 10,   // 한 번 실행이 최대 약 4분 30초라 10분 간격이면 겹치지 않음
  MAX_ROUNDS: 3,       // 응답 누락 행을 새 작업으로 다시 돌리는 최대 회차
  ROUND_KEY: "SILI_BATCH_AUTO_ROUND"
};

/** 자동 실행 시작: 트리거 설치 후 즉시 1회 실행. 이 방식을 쓸 때는 콘솔에서 작업을 따로 만들지 마세요 */
function batchStartAuto() {
  loadBatchSettings_(); // 설정 오류는 트리거 설치 전에 걸러냄
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(BATCH_AUTO.ROUND_KEY)) props.setProperty(BATCH_AUTO.ROUND_KEY, "1");

  const removedRealtime = removeTriggers_(); // 실시간 분류 트리거와 동시에 시트를 쓰지 않도록 정리
  removeBatchAutoTriggers_();
  ScriptApp.newTrigger(BATCH_AUTO.HANDLER).timeBased().everyMinutes(BATCH_AUTO.EVERY_MINUTES).create();

  console.log(
    "자동 실행 트리거 설치 (" + BATCH_AUTO.EVERY_MINUTES + "분마다 " + BATCH_AUTO.HANDLER + ")" +
    (removedRealtime ? ", 실시간 분류 트리거 " + removedRealtime + "개 삭제" : "") + ". 첫 단계를 바로 실행합니다."
  );
  batchAutoStep();
}

function batchStopAuto() {
  const n = removeBatchAutoTriggers_();
  console.log("자동 실행 트리거 " + n + "개 삭제. 진행 상태는 유지됩니다 (batchStartAuto로 재개).");
}

/** 트리거가 10분마다 호출. 현재 단계에 맞는 일을 한 가지만 하고 끝남 */
function batchAutoStep() {
  const props = PropertiesService.getScriptProperties();
  const round = toInt_(props.getProperty(BATCH_AUTO.ROUND_KEY), 1);
  let run = loadBatchRun_();

  try {
    if (!run || run.stage === "exporting") {
      console.log("[자동 " + round + "회차] 업로드 단계");
      batchExportInput();
      run = loadBatchRun_();
      if (run && run.stage === "exported" && !run.files.length) {
        finishBatchAuto_("처리할 대기 행이 없어 종료합니다.");
      }
      return;
    }

    if (run.stage === "exported") {
      console.log("[자동 " + round + "회차] 배치 작업 생성");
      batchSubmitJob();
      return;
    }

    if (run.stage === "submitted") {
      const job = fetchBatchJob_(run);
      console.log("[자동 " + round + "회차] " + describeBatchJob_(job, run));
      if (isBatchJobDead_(job.state)) {
        stopBatchAutoWithError_("배치 작업이 결과 없이 끝났습니다 (" + job.state + "). 로그를 확인한 뒤 batchResetRun() → batchStartAuto()로 다시 시작하세요.");
        return;
      }
      if (!isBatchJobDone_(job.state)) return; // 아직 진행 중 → 다음 트리거에서 다시 확인
      batchImportResults(); // 끝났으면 바로 가져오기 시작 (남으면 다음 트리거에서 이어서)
      return;
    }

    if (run.stage === "importing") {
      console.log("[자동 " + round + "회차] 결과 가져오기 이어서");
      batchImportResults();
      return;
    }

    if (run.stage === "imported") {
      const left = run.stats ? run.stats.missing + run.stats.mismatch : 0;
      const capped = loadBatchSettings_().maxRows > 0; // 시험 모드(BATCH_MAX_ROWS)는 1회차만
      if (left > 0 && !capped && round < BATCH_AUTO.MAX_ROUNDS) {
        props.setProperty(BATCH_AUTO.ROUND_KEY, String(round + 1));
        batchResetRun();
        console.log("[자동] 빈 칸 " + left + "행이 남아 " + (round + 1) + "회차를 시작합니다.");
        batchExportInput();
        return;
      }
      finishBatchAuto_(left > 0
        ? "최대 회차(" + BATCH_AUTO.MAX_ROUNDS + ")에 도달해 종료합니다. 빈 칸 약 " + left + "행은 수동으로 확인하세요."
        : "모든 행 처리 완료.");
    }
  } catch (e) {
    // 일시적인 네트워크 오류일 수 있으므로 트리거는 유지하고 다음 실행에서 재시도
    console.error("[자동] 이번 실행 오류 (다음 트리거에서 재시도): " + errMsg_(e));
    throw e;
  }
}

function finishBatchAuto_(msg) {
  removeBatchAutoTriggers_();
  PropertiesService.getScriptProperties().deleteProperty(BATCH_AUTO.ROUND_KEY);
  console.log("✅ [자동] " + msg + " 트리거를 삭제했습니다. showProgress()로 결과를 확인하세요.");
}

function stopBatchAutoWithError_(msg) {
  removeBatchAutoTriggers_();
  console.error("⛔ [자동] " + msg);
}

function removeBatchAutoTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === BATCH_AUTO.HANDLER) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}
