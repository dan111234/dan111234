/************************************************************
 * silicone_batch_auto — 배치 자동 실행 추가 파일
 *
 * 언제 쓰나
 *  자동 실행 기능이 없는 예전 silicone_batch.gs 가 들어 있는 Apps Script 프로젝트에
 *  "새 스크립트 파일"로 추가합니다. (최신 silicone_batch.gs 에는 같은 기능이 이미 있으므로
 *  그 파일을 쓰는 프로젝트에는 추가하지 마세요 — 이름 중복 오류가 납니다)
 *
 * 사용법
 *  batchStartAuto()  10분 트리거 1개 설치 + 즉시 1회 실행. 업로드 → 작업 생성 → 상태 확인 →
 *                    결과 기록 → 빈 칸 재처리(최대 3회차) 후 스스로 트리거 삭제
 *  batchStopAuto()   트리거만 삭제 (진행 상태 유지, batchStartAuto로 재개)
 *  이 방식을 쓸 때는 GCP 콘솔에서 배치 작업을 따로 만들지 마세요.
 *
 * 기존 파일의 함수를 그대로 사용합니다:
 *  batchExportInput, batchSubmitJob, batchImportResults, batchResetRun,
 *  loadBatchRun_, loadBatchSettings_, removeTriggers_, toInt_, errMsg_
 ************************************************************/

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
      const job = autoFetchBatchJob_(run);
      console.log("[자동 " + round + "회차] " + autoDescribeBatchJob_(job, run));
      if ((job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED" || job.state === "JOB_STATE_EXPIRED")) {
        stopBatchAutoWithError_("배치 작업이 결과 없이 끝났습니다 (" + job.state + "). 로그를 확인한 뒤 batchResetRun() → batchStartAuto()로 다시 시작하세요.");
        return;
      }
      if ((job.state !== "JOB_STATE_SUCCEEDED" && job.state !== "JOB_STATE_PARTIALLY_SUCCEEDED")) return; // 아직 진행 중 → 다음 트리거에서 다시 확인
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
      const capped = (loadBatchSettings_().maxRows || 0) > 0; // 시험 모드(BATCH_MAX_ROWS)는 1회차만
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

function autoFetchBatchJob_(run) {
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

function autoDescribeBatchJob_(job, run) {
  const st = job.completionStats || {};
  return "작업 " + job.name + "\n상태: " + job.state +
    " | 성공 요청 " + (st.successfulCount || 0) + " / 실패 " + (st.failedCount || 0) + " / 미완료 " + (st.incompleteCount || 0) +
    " (전체 " + run.requests + "건)" +
    (job.error ? "\n오류: " + JSON.stringify(job.error).slice(0, 500) : "");
}
