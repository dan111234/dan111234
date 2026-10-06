/***********************
 * Amazon Delivered Mail Export
 *
 * 최초 1회: setupScheduledTrigger() 를 수동 실행 → 10일마다 자동 실행 트리거 등록
 * 자동 실행: runScheduledAmazonExport() → 시트 갱신 후 AI agent 작업 시작용 알림 메일 발송
 ***********************/

const CONFIG = {
  SPREADSHEET_ID: '10K3X6ME4xyna3MLC2_XItVgdrt8JGyvkG4KbmAVkuD4',
  SHEET_NAME: 'Amazon_Delivered',
  FROM_EMAIL: 'order-update@amazon.com',
  SUBJECT_PREFIX: 'Delivered:',
  DAYS_BACK: 30,

  // 스케줄 / 알림
  RUN_EVERY_DAYS: 10,
  RUN_AT_HOUR: 9,
  NOTIFY_EMAIL: 'amzmaster2368@gmail.com',

  // AI agent 트리거 코드네임 (이 코드가 제목에 있으면 작업 시작)
  AGENT_CODE_READY: 'AMZ-DLV-READY',
  AGENT_CODE_FAILED: 'AMZ-DLV-FAILED',

  // 테스트 샘플 (testRunAmazonExportWindow)
  TEST_WINDOW_START: '2026-09-22', // 포함
  TEST_WINDOW_END: '2026-10-06',   // 포함 (해당 날짜 23:59:59까지)
  TEST_SHEET_NAME: 'Amazon_Delivered_TEST'
};


/***********************
 * Scheduling
 ***********************/

function setupScheduledTrigger() {
  const handler = 'runScheduledAmazonExport';

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyDays(CONFIG.RUN_EVERY_DAYS)
    .atHour(CONFIG.RUN_AT_HOUR)
    .create();

  Logger.log(`Trigger set: every ${CONFIG.RUN_EVERY_DAYS} days around ${CONFIG.RUN_AT_HOUR}:00`);
}

function runScheduledAmazonExport() {
  const runId = buildRunId_();

  try {
    const result = exportAmazonDeliveredEmailsToSheet();
    sendAgentReadyEmail_(runId, result);
  } catch (e) {
    sendAgentFailedEmail_(runId, e);
    throw e;
  }
}

/**
 * 테스트 샘플: TEST_WINDOW_START ~ TEST_WINDOW_END 기간에 받은 Delivered 메일만
 * TEST_SHEET_NAME 탭에 내보내고, [TEST] 표시가 붙은 알림 메일을 발송.
 * 편집기에서 직접 실행하세요. (정기 트리거와는 무관)
 */
function testRunAmazonExportWindow() {
  const runId = `TEST-${buildRunId_()}`;
  const tz = Session.getScriptTimeZone();

  const startDate = Utilities.parseDate(`${CONFIG.TEST_WINDOW_START} 00:00:00`, tz, 'yyyy-MM-dd HH:mm:ss');
  const endDate = Utilities.parseDate(`${CONFIG.TEST_WINDOW_END} 00:00:00`, tz, 'yyyy-MM-dd HH:mm:ss');
  endDate.setDate(endDate.getDate() + 1); // 종료일 포함 → 다음날 0시 미만

  const options = {
    sheetName: CONFIG.TEST_SHEET_NAME,
    startDate: startDate,
    endDate: endDate
  };

  try {
    const result = exportAmazonDeliveredEmailsToSheet(options);
    result.window = `${CONFIG.TEST_WINDOW_START} ~ ${CONFIG.TEST_WINDOW_END} (${tz})`;
    sendAgentReadyEmail_(runId, result, true);
  } catch (e) {
    sendAgentFailedEmail_(runId, e, true);
    throw e;
  }
}


/***********************
 * Export
 ***********************/

/**
 * @param {Object} [options]
 * @param {string} [options.sheetName] 기본값 CONFIG.SHEET_NAME
 * @param {Date} [options.startDate] 지정 시 이 시각 이후 수신 메일만 (포함)
 * @param {Date} [options.endDate] 지정 시 이 시각 이전 수신 메일만 (미포함)
 */
function exportAmazonDeliveredEmailsToSheet(options) {
  const opts = options || {};
  const startDate = opts.startDate || null;
  const endDate = opts.endDate || null;

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(ss, opts.sheetName || CONFIG.SHEET_NAME);

  const dateTerms = (startDate || endDate)
    ? [
        startDate ? `after:${Math.floor(startDate.getTime() / 1000)}` : '',
        endDate ? `before:${Math.floor(endDate.getTime() / 1000)}` : ''
      ].filter(Boolean)
    : [`newer_than:${CONFIG.DAYS_BACK}d`];

  const query = [
    'in:inbox',
    `from:${CONFIG.FROM_EMAIL}`,
    ...dateTerms,
    'subject:Delivered'
  ].join(' ');

  const threads = GmailApp.search(query, 0, 500);
  const rows = [];

  threads.forEach(thread => {
    const messages = thread.getMessages();

    messages.forEach(message => {
      const from = message.getFrom() || '';
      const subject = message.getSubject() || '';

      if (!isFromAmazonOrderUpdate_(from)) return;
      if (!subject.startsWith(CONFIG.SUBJECT_PREFIX)) return;

      // 스레드 안에 기간 밖 메시지가 섞여 있을 수 있어 메시지 단위로 한 번 더 거름
      const receivedAt = message.getDate();
      if (startDate && receivedAt < startDate) return;
      if (endDate && receivedAt >= endDate) return;

      const htmlBody = message.getBody() || '';
      const plainBody = message.getPlainBody() || '';

      const recipientEmail = extractEmailOnly_(message.getTo());
      const orderNumber = extractOrderNumber_(plainBody, htmlBody);
      const trackUrl = extractTrackShipmentUrl_(htmlBody);
      const sortOrderId = extractOrderIdFromTrackUrl_(trackUrl) || orderNumber;

      if (!recipientEmail && !orderNumber && !trackUrl) return;

      rows.push([
        recipientEmail,
        orderNumber,
        trackUrl,
        sortOrderId
      ]);
    });
  });

  const uniqueRows = rows;

  sheet.clearContents();
  sheet.clearFormats();

  sheet.getRange(1, 1, 1, 4).setValues([[
    'Recipient Email',
    'Order #',
    'Track Shipment Link',
    'Sort Order ID'
  ]]);

  sheet.getRange(1, 1, 1, 4)
    .setFontWeight('bold')
    .setBackground('#d9ead3');

  if (uniqueRows.length > 0) {
    sheet.getRange(2, 1, uniqueRows.length, 4).setValues(uniqueRows);

    sheet
      .getRange(2, 1, uniqueRows.length, 4)
      .sort([
        { column: 4, ascending: true },
        { column: 2, ascending: true },
        { column: 3, ascending: true }
      ]);

    applyAlternatingColorsByOrderNumber_(sheet, uniqueRows.length);
  }

  sheet.autoResizeColumns(1, 4);

  Logger.log(`Done. Exported rows: ${uniqueRows.length}`);

  return {
    rowCount: uniqueRows.length,
    sheetUrl: `${ss.getUrl()}#gid=${sheet.getSheetId()}`,
    sheetName: sheet.getName()
  };
}


/***********************
 * Agent notification
 ***********************/

function sendAgentReadyEmail_(runId, result, isTest) {
  const testTag = isTest ? ' [TEST]' : '';
  const subject = `[${CONFIG.AGENT_CODE_READY}]${testTag} 처리 필요 - ${result.sheetName} (${runId})`;

  const body = [
    'Amazon Delivered 시트가 갱신되었습니다. 처리가 필요합니다.',
    '',
    '----- AGENT TASK -----',
    `AGENT_CODE: ${CONFIG.AGENT_CODE_READY}`,
    `RUN_ID: ${runId}`,
    `SPREADSHEET_URL: ${result.sheetUrl}`,
    `SPREADSHEET_ID: ${CONFIG.SPREADSHEET_ID}`,
    `SHEET_NAME: ${result.sheetName}`,
    `ROW_COUNT: ${result.rowCount}`,
    `MODE: ${isTest ? 'TEST' : 'SCHEDULED'}`,
    ...(result.window ? [`WINDOW: ${result.window}`] : []),
    `EXPORTED_AT: ${formatNow_()}`,
    '----- END -----'
  ].join('\n');

  GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
}

function sendAgentFailedEmail_(runId, error, isTest) {
  const testTag = isTest ? ' [TEST]' : '';
  const sheetName = isTest ? CONFIG.TEST_SHEET_NAME : CONFIG.SHEET_NAME;
  const subject = `[${CONFIG.AGENT_CODE_FAILED}]${testTag} 실행 실패 - ${sheetName} (${runId})`;

  const body = [
    'Amazon Delivered 시트 갱신 중 오류가 발생했습니다. 작업을 시작하지 마세요.',
    '',
    '----- AGENT TASK -----',
    `AGENT_CODE: ${CONFIG.AGENT_CODE_FAILED}`,
    `RUN_ID: ${runId}`,
    `SHEET_NAME: ${sheetName}`,
    `MODE: ${isTest ? 'TEST' : 'SCHEDULED'}`,
    `ERROR: ${error && error.message ? error.message : error}`,
    `FAILED_AT: ${formatNow_()}`,
    '----- END -----'
  ].join('\n');

  GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
}

function buildRunId_() {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  return `RUN-${stamp}`;
}

function formatNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss z');
}


/***********************
 * Coloring
 ***********************/

function applyAlternatingColorsByOrderNumber_(sheet, rowCount) {
  if (rowCount <= 0) return;

  const startRow = 2;
  const startCol = 1;
  const colCount = 4;

  const orderValues = sheet
    .getRange(startRow, 2, rowCount, 1)
    .getValues()
    .map(row => String(row[0] || '').trim());

  const colors = [
    '#ffffff',
    '#fff2cc',
    '#d9eaf7',
    '#eadcf8',
    '#d9ead3',
    '#fce4d6'
  ];

  const backgrounds = [];
  let currentOrder = '';
  let colorIndex = -1;

  for (let i = 0; i < orderValues.length; i++) {
    const orderNumber = orderValues[i];

    if (orderNumber !== currentOrder) {
      currentOrder = orderNumber;
      colorIndex = (colorIndex + 1) % colors.length;
    }

    const rowColor = colors[colorIndex];
    backgrounds.push(new Array(colCount).fill(rowColor));
  }

  sheet
    .getRange(startRow, startCol, rowCount, colCount)
    .setBackgrounds(backgrounds);
}


/***********************
 * Helpers
 ***********************/

function getOrCreateSheet_(ss, sheetName) {
  const existing = ss.getSheetByName(sheetName);
  if (existing) return existing;
  return ss.insertSheet(sheetName);
}

function isFromAmazonOrderUpdate_(fromText) {
  const email = extractEmailOnly_(fromText).toLowerCase();
  return email === CONFIG.FROM_EMAIL.toLowerCase();
}

function extractEmailOnly_(text) {
  if (!text) return '';

  const match = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim() : '';
}

function extractOrderNumber_(plainBody, htmlBody) {
  const candidates = [
    plainBody || '',
    stripHtml_(htmlBody || ''),
    htmlBody || ''
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOrderText_(candidate);

    let match = normalized.match(/Order\s*#\s*([0-9]{3}\s*-\s*[0-9]{7}\s*-\s*[0-9]{7})/i);
    if (match && match[1]) {
      return match[1].replace(/\s+/g, '');
    }

    match = normalized.match(/\b([0-9]{3}\s*-\s*[0-9]{7}\s*-\s*[0-9]{7})\b/);
    if (match && match[1]) {
      return match[1].replace(/\s+/g, '');
    }
  }

  return '';
}

function normalizeOrderText_(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTrackShipmentUrl_(htmlBody) {
  if (!htmlBody) return '';

  const html = String(htmlBody);

  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = decodeHtmlEntities_(match[1] || '');
    const anchorText = stripHtml_(match[2] || '').replace(/\s+/g, ' ').trim();

    if (/track/i.test(anchorText) && /(shipment|package)/i.test(anchorText)) {
      return cleanAmazonRedirectUrl_(href);
    }
  }

  return '';
}

function extractOrderIdFromTrackUrl_(url) {
  if (!url) return '';

  const decodedUrl = decodeURIComponent(String(url));

  const match = decodedUrl.match(/[?&]orderId=([^&]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return '';
}

function cleanAmazonRedirectUrl_(url) {
  if (!url) return '';

  let cleaned = decodeHtmlEntities_(url);

  cleaned = cleaned.replace(/&amp;/g, '&');

  const encodedUrlMatch = cleaned.match(/[?&](?:U|url|u)=([^&]+)/i);
  if (encodedUrlMatch && encodedUrlMatch[1]) {
    try {
      return decodeURIComponent(encodedUrlMatch[1]);
    } catch (e) {
      return cleaned;
    }
  }

  return cleaned;
}

function stripHtml_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ');
}

function dedupeRows_(rows) {
  const seen = new Set();
  const result = [];

  rows.forEach(row => {
    const key = row.join('||');

    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  });

  return result;
}
