/**
 * Google Apps Script: 판매/반품 데이터 처리 및 수불대장 업데이트 도구
 * (수량(Quantity) 정확도 개선 및 매핑 단순화 버전)
 *
 * [2026-09 수정 사항]
 * 1) "temp 기준 수불대장 업데이트" 관련 코드 전체 삭제 (더 이상 사용하지 않음)
 *    - 메뉴 항목, updateInventoryStatementFromTemp(), loadInventoryBaseFromTemp_(),
 *      applyPreviousBadStockToCurrentDisposalForSiligurad_(), applyTempSiliguardInbound_() 제거
 *    - buildInventoryStatement_()는 이제 옵션 없이 항상 lastmonthfinalinventorystatement 기준으로만 동작
 * 2) 아마존 트랜잭션 중 주문ID가 "S"로 시작하는 실리가드(SILIGUARD) 계열 주문 처리 로직 추가
 *    - 인플루언서 샘플 발송 건으로 보고, sales(쇼피파이) 탭에 동일 SKU/동일 수량 주문이 UTC 기준 24시간 이내에
 *      없는 경우에 한해 "가격 0원, 판매"로 결과보고서(아마존_결과) 및 수불대장에 반영
 *    - 동일 SKU/수량 주문이 sales 탭에 UTC 기준 24시간 이내로 존재하면, 쇼피파이 쪽에서 이미 판매/출고로
 *      집계되는 것으로 보고 중복 반영을 방지(스킵)
 * 3) [2026-09, 8월 데이터 검증 중 발견] processShopify()의 오토프로X 부속 케이블 자동집계 버그 수정
 *    - 기존 코드는 autoproQtyByWarehouse를 { '300': 0, '800': 0 }로만 초기화하여, 배송방법이
 *      "Standard"(출하창고코드 '100'/우체국)로 나간 오토프로X 물량은 케이블 매출행 생성 시
 *      전혀 집계되지 않았음(7월 데이터는 우연히 전량 By Air였서 드러나지 않았고, 8월 데이터에서
 *      당시 Standard 물량 13개가 결과보고서에서 누락되는 것으로 확인됨).
 *    - 오토프로X가 나갈 수 있는 모든 출하창고 코드를 추적하도록 수정했으며,
 *      Standard의 최종 창고코드는 아래 4번 기준에 따라 300 또는 800으로 다시 분기한다.
 * 4) [2026-09, 결과보고서의 Standard 출하창고 분기 보정]
 *    - Shopify sales의 Shipping Method가 "Standard"인 판매행은 transactions의 S-주문과
 *      동일 SKU/동일 수량/실제 출고시각 기준 24시간 이내로 1:1 대조한다.
 *    - 일치하는 S-주문이 있으면 아마존 창고(300), 없으면 By Air 창고(800)로 처리한다.
 *    - 동일 S-주문이 여러 Shopify 판매행에 중복 매칭되지 않도록 사용 여부를 기록한다.
 *    - 이 300/800 분기는 결과보고서에만 적용한다. 수불대장은 물리적 재고 버킷 기준을 유지한다.
 * 5) [2026-09, 수불대장 물리적 창고 버킷 복원 및 시간대 보정]
 *    - 수불대장에서는 Standard/By Air 정상 판매를 기존대로 우체국(post)에 반영한다.
 *      미국창고-서부(west)는 Shopify 미국 고객 반품/폐기 재고 용도로만 유지한다.
 *    - Shopify(+0900)와 Amazon(PST/PDT) 시각을 UTC timestamp로 변환한 뒤 비교해
 *      날짜 경계와 서머타임으로 인한 오매칭 위험을 제거한다.
 *
 * [2026-10 수정 사항]
 * 6) (철회) 실리가드 아마존 폐기를 Amazon Return UNSELLABLE 기준으로 바꿨던 변경을 되돌림
 *    - UNSELLABLE 기준은 판매 출고 = 주문 - 실제 반품 수량이 되어, 환불을 수량 -로 입력하는
 *      이카운트(아마존_결과)와 판매 출고가 어긋났다(2026-09 실리가드 4품목 합계 30개 차이).
 *    - 다시 판매 출고 = 주문 - 환불, 폐기 = 환불 - SELLABLE 반품으로 계산한다. 기말 재고는 두 방식이 같다.
 *    - 주문 없이 환불만 있는 실리가드 품목도 판매 출고에서 환불을 차감하도록 보완했다.
 * 7) 수불대장 Shopify 반품 누락 수정
 *    - 기존에는 return 탭을 행 단위로 보고 주문당 첫 행만 처리해서, 첫 행이 SKU 빈 행이면
 *      품목을 못 찾은 채 주문이 처리 완료로 표시되어 반품이 통째로 빠졌다
 *      (2026-09 #18896 오토프로X, #18377 칼럼 기어노브).
 *    - 결과보고서와 같은 함수(aggregateShopifyReturnsByOrder_, resolveShopifyReturnItem_)로
 *      주문 단위 순 반품액과 품목을 판정한다.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📦 데이터 처리')
    .addItem('통합 보고서 생성', 'mainProcess')
    .addItem('수불대장 업데이트 생성', 'updateInventoryStatement')
    .addToUi();
}

// 설정값
const CONFIG = {
  EXCHANGE_RATE: 1350,
  SHOPIFY_CUSTOMER_CODE: '5051',
  AMAZON_CUSTOMER_CODE: '5042',
  MANAGER_NAME: '도대웅',
  WAREHOUSE_CODE: '100',
  TRANSACTION_TYPE: '12',
  AUTOPRO_MAIN_SKU: 'M_AUTOPRO_X_3',
  AUTOPRO_CABLE_CODE: '8800248040989', // 부속 케이블
  AUTOPRO_HARDCODE_SKU: '8800248040019', // AutoPro X 본품
  SHOPIFY_COMM_RATE: 0.02,
  AMAZON_COMM_RATE: 0.15,
  WAREHOUSE_CODE_AMAZON: '300',
  WAREHOUSE_CODE_AMAZON_SHIPPING: '300',
  WAREHOUSE_CODE_BY_AIR: '800'
};

/**
 * 수불대장 업데이트 프로세스
 * - lastmonthfinalinventorystatement 기준
 * - 기초 / 입고 / 출고(판매/폐기) / 재고 구조로 생성
 * - Amazon Return 탭은 SILIGUARD의 SELLABLE 수량을 폐기(= 환불 - SELLABLE) 차감분으로만 사용
 * - 아마존 트랜잭션 중 주문ID가 "S"로 시작하는 실리가드 주문은 인플루언서 샘플 발송으로 보고,
 *   sales 탭에 동일 SKU/수량 주문이 UTC 기준 24시간 이내에 없을 때만 0원 판매로 반영한다.
 */
function updateInventoryStatement() {
  buildInventoryStatement_();
}

function buildInventoryStatement_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('sales');
  const returnSheet = ss.getSheetByName('return');
  const transSheet = ss.getSheetByName('transactions');
  const input2Sheet = ss.getSheetByName('input2');
  const amazonReturnSheet = ss.getSheetByName('Amazon Return');
  const lastInventorySheet = getSheetByPossibleNames_(ss, [
    'lastmonthfinalinventorystatement',
    'lastmonthfinalinventorystatemen'
  ]);

  if (!salesSheet || !returnSheet || !transSheet) {
    SpreadsheetApp.getUi().alert('필요한 시트들(sales, return, transactions)을 모두 확인해주세요.');
    return;
  }

  if (!lastInventorySheet) {
    SpreadsheetApp.getUi().alert('lastmonthfinalinventorystatement 시트를 확인해주세요.');
    return;
  }

  const skuToCodeMap = getSkuMapping(input2Sheet);
  const previousInventoryInfo = loadPreviousInventoryInfo_(lastInventorySheet);
  const baseInfo = loadInventoryBaseFromStatement_(lastInventorySheet);

  const stockMap = {};
  const rowOrder = [];

  baseInfo.order.forEach(codeKey => {
    const item = baseInfo.byCode[codeKey];
    if (!item) return;

    const prev = previousInventoryInfo.byCode[codeKey] || {};
    stockMap[codeKey] = createInventoryRecord_(item, prev);
    rowOrder.push(codeKey);
  });

  // 전월 수불대장에 아직 없는 신규 BACKLESS 품목은 input2 매핑 기준으로 기초재고 0의 신규 행을 생성한다.
  [
    'SILIGUARD_BACKLESS_BROWN_1',
    'SILIGUARD_BACKLESS_BLACK'
  ].forEach(sku => ensureMappedSkuInventoryRecord_(stockMap, rowOrder, sku, skuToCodeMap));

  // 1) Shopify Sales 수불대장 물리적 창고 기준:
  // - 실리가드/Amazon Shipping은 아마존
  // - Standard/By Air를 포함한 나머지 정상 판매는 기존대로 우체국
  // - 미국창고-서부(west)는 아래 Shopify 미국 고객 반품/폐기 처리에만 사용
  const salesData = getSheetData(salesSheet, 'Name');
  const transData = getSheetData(transSheet, 'type');
  salesData.forEach(row => {
    const sku = (row['Lineitem sku'] || '').toString().trim();
    const code = getCodeFromSku_(sku, skuToCodeMap);
    const qty = parseNum(row['Lineitem quantity']);
    const method = (row['Shipping Method'] || '').toString().trim();
    const warehouse = isSiliguradSku_(sku) || method.indexOf('Amazon') > -1
      ? 'amazon'
      : 'post';

    applyInventoryMovement_(stockMap, code, warehouse, 'salesOut', qty);
  });

  // 2) Shopify Return:
  // - 자사몰(Shopify) 반품은 SKU와 무관하게 무조건 폐기 처리
  // - 판매 출고에서는 차감하고, 폐기 수량으로 기록
  // - 결과보고서(processShopify)와 같은 기준: 주문 단위로 순 반품액을 합산해 음수인 주문만 1건 반영하고,
  //   품목도 같은 함수로 판정한다. (행 단위로 처리하면 SKU 빈 행이 먼저 나온 주문이 누락됨)
  const returnData = getSheetData(returnSheet, '주문 이름');
  const salesByOrderForReturn = groupShopifySalesByOrder_(salesData);
  const returnsByOrder = aggregateShopifyReturnsByOrder_(returnData);
  Object.keys(returnsByOrder).forEach(orderName => {
    const orderReturn = returnsByOrder[orderName];
    if (orderReturn.netReturn >= 0) return;

    const item = resolveShopifyReturnItem_(orderName, orderReturn, skuToCodeMap, salesByOrderForReturn);
    const warehouse = orderReturn.country === 'United States' ? 'west' : 'post';

    applyInventoryMovement_(stockMap, item.code, warehouse, 'salesOut', -1);
    applyInventoryMovement_(stockMap, item.code, warehouse, 'disposalOut', 1);
  });

  // 3) Amazon transactions: Order는 총 판매, Refund는 비실리가드 품목의 반품 수량 기준.
  //    단, 주문ID가 "S"로 시작하는 실리가드 계열 Order는 인플루언서 샘플 발송 건으로 보고
  //    sales(쇼피파이) 탭에 동일 SKU/수량 주문이 UTC 기준 24시간 이내에 없을 때만 0원 판매로 반영한다.
  //    (동일 건이 sales 탭에 있으면 쇼피파이 쪽에서 이미 판매 출고로 집계되므로 중복 방지 차원에서 스킵)
  const amazonOrderQtyByCode = {};
  const amazonRefundQtyByCode = {};
  const siliguardCodeSet = buildSiliguradCodeSetFromSkuMap_(skuToCodeMap);
  const shopifySiliguardSaleIndex = buildShopifySiliguardSaleIndex_(salesData);

  transData.forEach(row => {
    const orderId = (row['order id'] || '').toString();
    const sku = (row['sku'] || '').toString().trim();
    const type = (row['type'] || '').toString().toLowerCase();
    const isSStartOrder = orderId.toUpperCase().startsWith('S');
    const isSiliguardSampleOrder = isSStartOrder && type === 'order' && isSiliguradSku_(sku);

    // S로 시작하지만 실리가드 Order 건이 아니면(환불 등) 기존과 동일하게 제외
    if (isSStartOrder && !isSiliguardSampleOrder) return;

    if (type !== 'order' && type !== 'refund') return;

    const code = getCodeFromSku_(sku, skuToCodeMap);
    const codeKey = cleanItemCode_(code);
    const qty = Math.abs(parseNum(row['quantity']));
    if (!codeKey || qty === 0) return;

    if (isSiliguradSku_(sku)) siliguardCodeSet[codeKey] = true;

    if (isSiliguardSampleOrder) {
      const orderTimestampMs = parseTimestampMs_(row['date/time']);
      const alreadyCountedViaShopify = consumeMatchingShopifySale_(shopifySiliguardSaleIndex, sku, qty, orderTimestampMs);
      if (alreadyCountedViaShopify) return; // 쇼피파이 판매로 이미 반영됨 -> 중복 집계 방지
    }

    if (type === 'order') {
      amazonOrderQtyByCode[codeKey] = (amazonOrderQtyByCode[codeKey] || 0) + qty;
    } else if (type === 'refund') {
      amazonRefundQtyByCode[codeKey] = (amazonRefundQtyByCode[codeKey] || 0) + qty;
    }
  });

  // 4) Amazon SILIGUARD: 이카운트(아마존_결과)는 환불을 수량 -로 입력하므로 판매 출고도 같은 기준으로 맞춘다.
  //    - 판매 출고 = 주문 - 환불 (아마존_결과의 판매 + 환불 수량과 동일)
  //    - 폐기 = 환불 - Amazon Return SELLABLE 수량 (환불분 중 재입고되지 않은 수량)
  //    UNSELLABLE 기준으로 폐기를 잡으면 판매 출고가 이카운트와 어긋나고(2026-09 확인),
  //    전월에 환불로 이미 폐기 처리된 건이 당월 UNSELLABLE로 다시 잡혀 이중 차감된다.
  const amazonSellableReturnQtyByCode = loadAmazonReturnQty_(amazonReturnSheet, skuToCodeMap).sellable;

  const salesOutCodeSet = {};
  [amazonOrderQtyByCode, amazonRefundQtyByCode].forEach(map => {
    Object.keys(map).forEach(codeKey => { salesOutCodeSet[codeKey] = true; });
  });

  Object.keys(salesOutCodeSet).forEach(codeKey => {
    const orderQty = amazonOrderQtyByCode[codeKey] || 0;
    const refundQty = siliguardCodeSet[codeKey] ? (amazonRefundQtyByCode[codeKey] || 0) : 0;
    applyInventoryMovement_(stockMap, codeKey, 'amazon', 'salesOut', orderQty - refundQty);
  });

  Object.keys(amazonRefundQtyByCode).forEach(codeKey => {
    const totalRefundQty = amazonRefundQtyByCode[codeKey] || 0;

    if (siliguardCodeSet[codeKey]) {
      const sellableReturnQty = amazonSellableReturnQtyByCode[codeKey] || 0;
      const disposalQty = Math.max(0, totalRefundQty - sellableReturnQty);
      applyInventoryMovement_(stockMap, codeKey, 'amazon', 'disposalOut', disposalQty);
    } else if (codeKey === cleanItemCode_(CONFIG.AUTOPRO_HARDCODE_SKU)) {
      applyInventoryMovement_(stockMap, codeKey, 'amazon', 'salesOut', -totalRefundQty);
    } else {
      applyInventoryMovement_(stockMap, codeKey, 'amazon', 'inbound', totalRefundQty);
    }
  });

  const headers = getNewInventoryStatementHeaders_();
  const finalOutput = rowOrder.map(codeKey => buildInventoryOutputRow_(stockMap[codeKey]));

  writeInventoryStatementToSheet_(ss, 'newlyupdatedinventorystatement', headers, finalOutput);
  SpreadsheetApp.getUi().alert('수불대장 업데이트가 완료되었습니다.');
}



function createInventoryRecord_(baseItem, previousItem) {
  return {
    maytonCode: baseItem.maytonCode || previousItem.maytonCode || '',
    itemCode: baseItem.itemCode || previousItem.itemCode || '',
    itemName: baseItem.itemName || previousItem.itemName || '',
    beginning: {
      amazon: parseNum(baseItem.beginning && baseItem.beginning.amazon),
      east: parseNum(baseItem.beginning && baseItem.beginning.east),
      west: parseNum(baseItem.beginning && baseItem.beginning.west),
      post: parseNum(baseItem.beginning && baseItem.beginning.post)
    },
    inbound: { amazon: 0, east: 0, west: 0, post: 0 },
    salesOut: { amazon: 0, east: 0, west: 0, post: 0 },
    disposalOut: { amazon: 0, east: 0, west: 0, post: 0 },
    previousDisposal: parseNum(previousItem.previousDisposal || baseItem.previousDisposal || 0)
  };
}

function buildInventoryOutputRow_(record) {
  const warehouses = ['amazon', 'east', 'west', 'post'];
  const beginning = warehouses.map(w => parseNum(record.beginning[w]));
  const inbound = warehouses.map(w => parseNum(record.inbound[w]));
  const salesOut = warehouses.map(w => parseNum(record.salesOut[w]));
  const disposalOut = warehouses.map(w => parseNum(record.disposalOut[w]));
  const ending = warehouses.map((w, i) => Math.max(0, beginning[i] + inbound[i] - salesOut[i] - disposalOut[i]));

  const beginningSum = sumArray_(beginning);
  const inboundSum = sumArray_(inbound);
  const salesOutSum = sumArray_(salesOut);
  const disposalOutSum = sumArray_(disposalOut);
  const endingSum = sumArray_(ending);
  const previousDisposal = parseNum(record.previousDisposal);
  const cumulativeDisposal = previousDisposal + disposalOutSum;

  return [
    record.maytonCode, record.itemCode, record.itemName,
    beginning[0], inbound[0], salesOut[0], disposalOut[0], ending[0],
    beginning[1], inbound[1], salesOut[1], disposalOut[1], ending[1],
    beginning[2], inbound[2], salesOut[2], disposalOut[2], ending[2],
    beginning[3], inbound[3], salesOut[3], disposalOut[3], ending[3],
    beginningSum, inboundSum, salesOutSum, disposalOutSum, endingSum,
    previousDisposal, cumulativeDisposal
  ];
}

function loadInventoryBaseFromStatement_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 4) return { byCode: {}, order: [] };

  // lastmonthfinalinventorystatement가 현재 newlyupdatedinventorystatement 양식이라고 가정
  // 1행: 합계
  // 2행: 창고 그룹 헤더
  // 3행: 세부 헤더
  // 4행부터 데이터
  const groupRow = values[1].map(h => (h || '').toString().replace(/\s/g, ''));
  const headers = values[2].map(h => (h || '').toString().replace(/\s/g, ''));

  const idxMaytonCode = findHeaderIndex(headers, '메이튼품목코드');
  const idxCode = findHeaderIndex(headers, '품목코드');
  const idxName = findHeaderIndex(headers, '품목명');

  // 전월 수불대장의 "기말"을 이번 달 "기초"로 사용
  const idxAmazonEnding = findTempGroupColumn_(groupRow, headers, '아마존', '기말');
  const idxEastEnding = findTempGroupColumn_(groupRow, headers, '미국창고-동부', '기말');
  const idxWestEnding = findTempGroupColumn_(groupRow, headers, '미국창고-서부', '기말');
  const idxPostEnding = findTempGroupColumn_(groupRow, headers, '우체국', '기말');

  // 전월 누적 폐기 수량을 이번 달 전월 누적 폐기 수량으로 사용
  const idxPreviousDisposal = getFirstExistingHeaderIndex_(headers, [
    '누적폐기수량',
    '월말불용재고'
  ]);

  const byCode = {};
  const order = [];

  if (idxCode === -1) return { byCode, order };

  for (let i = 3; i < values.length; i++) {
    const codeKey = cleanItemCode_(values[i][idxCode]);
    if (!codeKey) continue;

    byCode[codeKey] = {
      maytonCode: idxMaytonCode !== -1 ? values[i][idxMaytonCode] : '',
      itemCode: values[i][idxCode],
      itemName: idxName !== -1 ? values[i][idxName] : '',
      beginning: {
        amazon: idxAmazonEnding !== -1 ? parseNum(values[i][idxAmazonEnding]) : 0,
        east: idxEastEnding !== -1 ? parseNum(values[i][idxEastEnding]) : 0,
        west: idxWestEnding !== -1 ? parseNum(values[i][idxWestEnding]) : 0,
        post: idxPostEnding !== -1 ? parseNum(values[i][idxPostEnding]) : 0
      },
      previousDisposal: idxPreviousDisposal !== -1 ? parseNum(values[i][idxPreviousDisposal]) : 0
    };

    order.push(codeKey);
  }

  return { byCode, order };
}

function loadPreviousInventoryInfo_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { byCode: {}, order: [] };

  const headers = values[0].map(h => (h || '').toString().replace(/\s/g, ''));
  const idxMaytonCode = findHeaderIndex(headers, '메이튼품목코드');
  const idxCode = findHeaderIndex(headers, '품목코드');
  const idxName = findHeaderIndex(headers, '품목명');

  const idxPreviousDisposal = findHeaderIndex(headers, '누적폐기수량');

  const idxAmazonBad = getFirstExistingHeaderIndex_(headers, ['아마존불량']);
  const idxEastBad = getFirstExistingHeaderIndex_(headers, ['미국창고-동부불량']);
  const idxWestBad = getFirstExistingHeaderIndex_(headers, ['미국창고-서부환불', '미국창고-서부불량']);
  const idxPostBad = getFirstExistingHeaderIndex_(headers, ['우체국불량']);
  const idxBadTotal = findHeaderIndex(headers, '월말불용재고');

  const byCode = {};
  const order = [];

  for (let i = 1; i < values.length; i++) {
    const codeKey = cleanItemCode_(values[i][idxCode]);
    if (!codeKey) continue;

    const previousBadStock = {
      amazon: idxAmazonBad !== -1 ? parseNum(values[i][idxAmazonBad]) : 0,
      east: idxEastBad !== -1 ? parseNum(values[i][idxEastBad]) : 0,
      west: idxWestBad !== -1 ? parseNum(values[i][idxWestBad]) : 0,
      post: idxPostBad !== -1 ? parseNum(values[i][idxPostBad]) : 0
    };

    const previousBadStockSum =
      previousBadStock.amazon +
      previousBadStock.east +
      previousBadStock.west +
      previousBadStock.post;

    if (previousBadStockSum === 0 && idxBadTotal !== -1) {
      previousBadStock.amazon = parseNum(values[i][idxBadTotal]);
    }

    byCode[codeKey] = {
      maytonCode: idxMaytonCode !== -1 ? values[i][idxMaytonCode] : '',
      itemCode: idxCode !== -1 ? values[i][idxCode] : '',
      itemName: idxName !== -1 ? values[i][idxName] : '',
      previousDisposal: idxPreviousDisposal !== -1 ? parseNum(values[i][idxPreviousDisposal]) : 0,
      previousBadStock: previousBadStock
    };
    order.push(codeKey);
  }

  return { byCode, order };
}

/**
 * Amazon Return 탭의 SILIGUARD 반품 수량을 처리 결과(detailed-disposition)별로 집계한다.
 * - sellable: SELLABLE (재입고)
 * - unsellable: SELLABLE 이외 전부 (CUSTOMER_DAMAGED, CARRIER_DAMAGED, DEFECTIVE 등 → 폐기)
 */
function loadAmazonReturnQty_(sheet, skuToCodeMap) {
  const result = { sellable: {}, unsellable: {} };
  if (!sheet) return result;

  const data = getSheetData(sheet, 'return-date');
  data.forEach(row => {
    const sku = (row['sku'] || '').toString().trim();
    if (!isSiliguradSku_(sku)) return;

    const disposition = (row['detailed-disposition'] || '').toString().trim().toUpperCase();
    if (!disposition) return;

    const codeKey = cleanItemCode_(getCodeFromSku_(sku, skuToCodeMap));
    const qty = parseNum(row['quantity']);
    if (!codeKey || qty === 0) return;

    const bucket = disposition === 'SELLABLE' ? result.sellable : result.unsellable;
    bucket[codeKey] = (bucket[codeKey] || 0) + qty;
  });

  return result;
}

function buildSiliguradCodeSetFromSkuMap_(skuToCodeMap) {
  const result = {};

  Object.keys(skuToCodeMap || {}).forEach(sku => {
    if (!isSiliguradSku_(sku)) return;

    const codeKey = cleanItemCode_(skuToCodeMap[sku].code);
    if (codeKey) result[codeKey] = true;
  });

  return result;
}

/**
 * 쇼피파이(sales 탭)에 있는 실리가드(SILIGUARD) 계열 판매 내역을
 * { SKU: [{qty, timestampMs, used, orderName}, ...] } 형태로 인덱싱한다.
 * 아마존 트랜잭션의 "S-" 주문(인플루언서 샘플)이 쇼피파이 쪽에서 이미
 * 판매/출고로 집계된 것인지 대조(중복 방지)하는 데 사용한다.
 */
function buildShopifySiliguardSaleIndex_(salesData) {
  const bySku = {};

  (salesData || []).forEach(row => {
    const sku = (row['Lineitem sku'] || '').toString().trim();
    if (!isSiliguradSku_(sku)) return;

    const qty = Math.abs(parseNum(row['Lineitem quantity']));
    const timestampMs = getShopifySOrderMatchTimestamp_(row);
    if (qty === 0 || timestampMs === null) return;

    if (!bySku[sku]) bySku[sku] = [];
    bySku[sku].push({
      qty: qty,
      timestampMs: timestampMs,
      used: false,
      orderName: (row['Name'] || '').toString().trim()
    });
  });

  Object.keys(bySku).forEach(sku => {
    bySku[sku].sort((a, b) =>
      a.timestampMs - b.timestampMs || a.orderName.localeCompare(b.orderName)
    );
  });

  return bySku;
}

/**
 * transactions의 S-주문(Order)을
 * { SKU: [{qty, timestampMs, used, orderId}, ...] } 형태로 인덱싱한다.
 * Shopify Standard 판매행의 실제 출하창고가 300인지 800인지 판정할 때 사용한다.
 */
function buildAmazonSOrderIndex_(transData) {
  const bySku = {};

  (transData || []).forEach(row => {
    const orderId = (row['order id'] || '').toString().trim();
    const type = (row['type'] || '').toString().trim().toLowerCase();
    if (!orderId.toUpperCase().startsWith('S') || type !== 'order') return;

    const sku = (row['sku'] || '').toString().trim();
    const qty = Math.abs(parseNum(row['quantity']));
    const timestampMs = parseTimestampMs_(row['date/time']);
    if (!sku || qty === 0 || timestampMs === null) return;

    if (!bySku[sku]) bySku[sku] = [];
    bySku[sku].push({
      qty: qty,
      timestampMs: timestampMs,
      used: false,
      orderId: orderId
    });
  });

  Object.keys(bySku).forEach(sku => {
    bySku[sku].sort((a, b) =>
      a.timestampMs - b.timestampMs || a.orderId.localeCompare(b.orderId)
    );
  });

  return bySku;
}

/**
 * S-주문은 실제 Amazon 출고 시점에 생성되므로 Shopify의 결제일보다 Fulfilled at을 우선한다.
 * Fulfilled at이 비어 있을 때만 Paid at, Created at 순서로 보조한다.
 */
function getShopifySOrderMatchTimestamp_(row, fallbackRow) {
  const fallback = fallbackRow || {};
  return parseTimestampMs_(
    row['Fulfilled at'] || fallback['Fulfilled at'] ||
    row['Paid at'] || fallback['Paid at'] ||
    row['Created at'] || fallback['Created at']
  );
}

/**
 * 동일 SKU/동일 수량이고 실제 시각 차이가 24시간 이내인 아직 사용되지 않은 S-주문 중
 * 시각 차이가 가장 작은 한 건을 찾아 사용 처리한다.
 */
function consumeMatchingAmazonSOrder_(amazonSOrderIndex, sku, qty, shopifyTimestampMs) {
  const list = amazonSOrderIndex[sku];
  if (!list || shopifyTimestampMs === null) return false;

  const oneDayMs = 24 * 60 * 60 * 1000;
  let bestIndex = -1;
  let bestDateDiff = Infinity;

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry.used) continue;
    if (entry.qty !== Math.abs(parseNum(qty))) continue;

    const dateDiff = Math.abs(entry.timestampMs - shopifyTimestampMs);
    if (dateDiff > oneDayMs || dateDiff >= bestDateDiff) continue;

    bestIndex = i;
    bestDateDiff = dateDiff;
  }

  if (bestIndex === -1) return false;
  list[bestIndex].used = true;
  return true;
}

/**
 * Shopify Standard 판매행을 실제 출고시각 순으로 정렬한 뒤 S-주문과 미리 1:1 매칭한다.
 * 결과 생성 시 sales 행 순서가 바뀌어도 동일한 매칭 결과를 사용하도록 Map으로 고정한다.
 */
function buildShopifyStandardSOrderMatchMap_(salesByOrder, amazonSOrderIndex) {
  const entries = [];

  Object.keys(salesByOrder || {}).forEach(orderName => {
    const orderRows = salesByOrder[orderName] || [];
    const orderHeaderRow = orderRows.find(row =>
      row['Subtotal'] !== undefined && row['Subtotal'] !== null && row['Subtotal'] !== ''
    ) || orderRows.find(row =>
      row['Total'] !== undefined && row['Total'] !== null && row['Total'] !== ''
    ) || orderRows[0] || {};

    orderRows.forEach((row, rowIndex) => {
      const sku = (row['Lineitem sku'] || '').toString().trim();
      if (isSiliguradSku_(sku)) return;

      const shippingMethod = (
        row['Shipping Method'] || orderHeaderRow['Shipping Method'] || ''
      ).toString().trim();
      if (shippingMethod !== 'Standard') return;

      entries.push({
        row: row,
        sku: sku,
        qty: Math.abs(parseNum(row['Lineitem quantity'])),
        timestampMs: getShopifySOrderMatchTimestamp_(row, orderHeaderRow),
        orderName: orderName,
        rowIndex: rowIndex
      });
    });
  });

  entries.sort((a, b) =>
    a.sku.localeCompare(b.sku) ||
    a.qty - b.qty ||
    (a.timestampMs === null ? Infinity : a.timestampMs) -
      (b.timestampMs === null ? Infinity : b.timestampMs) ||
    a.orderName.localeCompare(b.orderName) ||
    a.rowIndex - b.rowIndex
  );

  const matchByRow = new Map();
  entries.forEach(entry => {
    const matched = consumeMatchingAmazonSOrder_(
      amazonSOrderIndex,
      entry.sku,
      entry.qty,
      entry.timestampMs
    );
    matchByRow.set(entry.row, matched);
  });

  return matchByRow;
}

/**
 * Shopify(+0900)와 Amazon(PST/PDT) 시각을 UTC timestamp(ms)로 변환한다.
 * 문자열에 포함된 시간대 오프셋을 직접 계산하여 실행 환경의 기본 시간대에 의존하지 않는다.
 */
function parseTimestampMs_(dateVal) {
  if (!dateVal) return null;

  if (Object.prototype.toString.call(dateVal) === '[object Date]') {
    const timestampMs = dateVal.getTime();
    return isNaN(timestampMs) ? null : timestampMs;
  }

  const str = dateVal.toString().trim();

  // Shopify: 2026-08-05 23:25:37 +0900 또는 +09:00
  const shopifyMatch = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([+-])(\d{2}):?(\d{2})$/
  );
  if (shopifyMatch) {
    const offsetMinutes =
      (shopifyMatch[7] === '-' ? -1 : 1) *
      (parseInt(shopifyMatch[8], 10) * 60 + parseInt(shopifyMatch[9], 10));
    return Date.UTC(
      parseInt(shopifyMatch[1], 10),
      parseInt(shopifyMatch[2], 10) - 1,
      parseInt(shopifyMatch[3], 10),
      parseInt(shopifyMatch[4], 10),
      parseInt(shopifyMatch[5], 10),
      parseInt(shopifyMatch[6] || '0', 10)
    ) - offsetMinutes * 60 * 1000;
  }

  // Amazon: Aug 5, 2026 7:26:31 AM PDT
  const amazonMatch = str.match(
    /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(AM|PM)\s+([A-Za-z]{3,5})$/
  );
  if (amazonMatch) {
    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const timezoneOffsetMinutes = {
      PST: -8 * 60,
      PDT: -7 * 60,
      UTC: 0,
      GMT: 0
    };
    const month = monthMap[amazonMatch[1]];
    const offsetMinutes = timezoneOffsetMinutes[amazonMatch[8].toUpperCase()];
    if (month !== undefined && offsetMinutes !== undefined) {
      let hour = parseInt(amazonMatch[4], 10) % 12;
      if (amazonMatch[7].toUpperCase() === 'PM') hour += 12;
      return Date.UTC(
        parseInt(amazonMatch[3], 10),
        month,
        parseInt(amazonMatch[2], 10),
        hour,
        parseInt(amazonMatch[5], 10),
        parseInt(amazonMatch[6] || '0', 10)
      ) - offsetMinutes * 60 * 1000;
    }
  }

  const fallbackDate = new Date(str);
  const fallbackTimestampMs = fallbackDate.getTime();
  return isNaN(fallbackTimestampMs) ? null : fallbackTimestampMs;
}

/**
 * shopifyIndex에서 SKU/수량이 같고 실제 시각 차이가 24시간 이내인
 * 아직 사용되지 않은 판매 건을 찾아 사용 처리(used=true)한다.
 * 매칭되는 건을 찾으면 true(이미 쇼피파이에서 집계됨), 없으면 false를 반환한다.
 */
function consumeMatchingShopifySale_(shopifyIndex, sku, qty, amazonTimestampMs) {
  const list = shopifyIndex[sku];
  if (!list || amazonTimestampMs === null) return false;

  const oneDayMs = 24 * 60 * 60 * 1000;
  let bestIndex = -1;
  let bestDateDiff = Infinity;

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry.used) continue;
    if (entry.qty !== Math.abs(parseNum(qty))) continue;

    const dateDiff = Math.abs(entry.timestampMs - amazonTimestampMs);
    if (dateDiff > oneDayMs || dateDiff >= bestDateDiff) continue;

    bestIndex = i;
    bestDateDiff = dateDiff;
  }

  if (bestIndex === -1) return false;
  list[bestIndex].used = true;
  return true;
}

function ensureMappedSkuInventoryRecord_(stockMap, rowOrder, sku, skuToCodeMap) {
  const mapped = skuToCodeMap[sku];
  if (!mapped) return;

  const codeKey = cleanItemCode_(mapped.code);
  if (!codeKey || stockMap[codeKey]) return;

  stockMap[codeKey] = createInventoryRecord_({
    maytonCode: '',
    itemCode: mapped.code,
    itemName: mapped.name,
    beginning: { amazon: 0, east: 0, west: 0, post: 0 },
    previousDisposal: 0
  }, {});
  rowOrder.push(codeKey);
}

function applyInventoryMovement_(stockMap, itemCode, warehouse, movementType, amount) {
  const codeKey = cleanItemCode_(itemCode);
  if (!codeKey || !stockMap[codeKey]) return;

  stockMap[codeKey][movementType][warehouse] += amount;

  // 기존 로직 유지: AutoPro X 본품 변동 시 부속 케이블도 동일하게 반영.
  if (codeKey === cleanItemCode_(CONFIG.AUTOPRO_HARDCODE_SKU)) {
    const cableKey = cleanItemCode_(CONFIG.AUTOPRO_CABLE_CODE);
    if (stockMap[cableKey]) stockMap[cableKey][movementType][warehouse] += amount;
  }
}

function getCodeFromSku_(sku, skuToCodeMap) {
  const cleanSku = (sku || '').toString().trim();
  return skuToCodeMap[cleanSku] ? skuToCodeMap[cleanSku].code : cleanSku;
}

function isSiliguradSku_(sku) {
  return (sku || '').toString().toUpperCase().indexOf('SILIGUARD') > -1;
}

function cleanItemCode_(value) {
  let cleaned = (value === undefined || value === null) ? '' : value.toString().replace(/[^0-9]/g, '').trim();
  if (cleaned.length > 0 && cleaned.length < 13) cleaned = cleaned.replace(/^0+/, '') || '0';
  return cleaned;
}

function getSheetByPossibleNames_(ss, names) {
  for (let i = 0; i < names.length; i++) {
    const sheet = ss.getSheetByName(names[i]);
    if (sheet) return sheet;
  }
  return null;
}

function getFirstExistingHeaderIndex_(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = findHeaderIndex(headers, candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function findTempGroupColumn_(groupRow, headerRow, groupName, targetHeader) {
  const cleanGroupName = groupName.replace(/\s/g, '');
  const cleanTargetHeader = targetHeader.replace(/\s/g, '');

  for (let i = 0; i < groupRow.length; i++) {
    if (groupRow[i] !== cleanGroupName) continue;

    for (let j = i; j < Math.min(i + 5, headerRow.length); j++) {
      if (headerRow[j] === cleanTargetHeader) return j;
    }
  }

  return -1;
}

function sumArray_(arr) {
  return arr.reduce((sum, v) => sum + parseNum(v), 0);
}

/**
 * 숫자로 변환 (쉼표 제거 및 유효성 검사)
 */
function parseNum(val) {
  if (val === undefined || val === null || val === "") return 0;
  const cleaned = val.toString().replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * 헤더 인덱스 탐색 (공백 제거 후 유연한 비교)
 */
function findHeaderIndex(headers, keyword) {
  const cleanKeyword = keyword.replace(/\s/g, '');
  for (let i = 0; i < headers.length; i++) {
    const cleanHeader = headers[i].toString().replace(/\s/g, '');
    if (cleanHeader === cleanKeyword) return i;
  }
  return -1;
}

/**
 * 결과 시트 기록
 */
function writeResultToSheet(ss, name, headers, rows) {
  let sheet = ss.getSheetByName(name);
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet(name);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground('#EFEFEF').setFontWeight('bold');
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, headers.length);
}

function getNewInventoryStatementHeaders_() {
  return [
    [
      '', '', '',
      '아마존', '', '', '', '',
      '미국창고-동부', '', '', '', '',
      '미국창고-서부', '', '', '', '',
      '우체국', '', '', '', '',
      '합계/누적', '', '', '', '', '', ''
    ],
    [
      '메이튼품목코드', '품목코드', '품목명',
      '기초', '입고', '출고(판매)', '출고(폐기)', '기말',
      '기초', '입고', '출고(판매)', '출고(폐기)', '기말',
      '기초', '입고', '출고(판매)', '출고(폐기)', '기말',
      '기초', '입고', '출고(판매)', '출고(폐기)', '기말',
      '기초 합계', '입고 합계', '판매 출고 합계', '당월 폐기 수량', '월말 재고',
      '전월 누적 폐기 수량', '누적 폐기 수량'
    ]
  ];
}

function writeInventoryStatementToSheet_(ss, name, headers, rows) {
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    sheet.getDataRange().breakApart();
    sheet.clear();
  } else {
    sheet = ss.insertSheet(name);
  }

  const headerRowCount = headers.length;
  const colCount = headers[0].length;
  const dataStartRow = 4;

  // 1행: temp 양식처럼 각 수량 컬럼 합계 표시
  const totalRow = new Array(colCount).fill('');
  for (let c = 4; c <= colCount; c++) {
    const colLetter = columnToLetter_(c);
    totalRow[c - 1] = rows.length > 0 ? `=SUM(${colLetter}${dataStartRow}:${colLetter})` : 0;
  }

  sheet.getRange(1, 1, 1, colCount).setValues([totalRow]);

  // 2~3행: 창고 그룹 / 세부 헤더
  sheet.getRange(2, 1, headerRowCount, colCount)
    .setValues(headers)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // 데이터 입력
  if (rows.length > 0) {
    sheet.getRange(dataStartRow, 1, rows.length, colCount).setValues(rows);
  }

  const lastRow = Math.max(dataStartRow + rows.length - 1, dataStartRow);
  const fullRange = sheet.getRange(1, 1, lastRow, colCount);
  const headerRange = sheet.getRange(2, 1, 2, colCount);
  const subHeaderRange = sheet.getRange(3, 1, 1, colCount);
  const bodyRange = rows.length > 0 ? sheet.getRange(dataStartRow, 1, rows.length, colCount) : null;

  // 기본 폰트/정렬
  fullRange
    .setFontFamily('Arial')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight('normal')
    .setHorizontalAlignment('right');

  sheet.getRange(1, 1, 1, 3).setHorizontalAlignment('left');

  headerRange
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  subHeaderRange
    .setBackground('#FCE4D6')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  if (bodyRange) {
    bodyRange.setVerticalAlignment('middle');
    sheet.getRange(dataStartRow, 1, rows.length, 3).setHorizontalAlignment('left');
    sheet.getRange(dataStartRow, 4, rows.length, colCount - 3).setHorizontalAlignment('right');
  }

  // temp처럼 그룹 헤더 병합
  sheet.getRange(2, 4, 1, 5).merge();   // 아마존
  sheet.getRange(2, 9, 1, 5).merge();   // 미국창고-동부
  sheet.getRange(2, 14, 1, 5).merge();  // 미국창고-서부
  sheet.getRange(2, 19, 1, 5).merge();  // 우체국
  sheet.getRange(2, 24, 1, 7).merge();  // 합계/누적

  // 열 너비: temp처럼 품목명은 넓게, 수량 컬럼은 균일하게
  sheet.setColumnWidth(1, 120); // 메이튼품목코드
  sheet.setColumnWidth(2, 120); // 품목코드
  sheet.setColumnWidth(3, 280); // 품목명
  sheet.setColumnWidths(4, colCount - 3, 82);

  // 행 높이
  sheet.setRowHeight(1, 22);
  sheet.setRowHeight(2, 24);
  sheet.setRowHeight(3, 24);
  if (rows.length > 0) {
    sheet.setRowHeights(dataStartRow, rows.length, 22);
  }

  // 숫자 서식
  if (rows.length > 0) {
    sheet.getRange(dataStartRow, 4, rows.length, colCount - 3).setNumberFormat('#,##0');
  }
  sheet.getRange(1, 4, 1, colCount - 3).setNumberFormat('#,##0');

  // 전체 얇은 테두리
  fullRange.setBorder(
    true, true, true, true, true, true,
    '#D9D9D9',
    SpreadsheetApp.BorderStyle.SOLID
  );

  // 표 외곽 굵은 테두리
  sheet.getRange(2, 1, lastRow - 1, colCount).setBorder(
    true, true, true, true, null, null,
    '#000000',
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  // 창고별 그룹 테두리
  applyMediumBorder_(sheet.getRange(2, 4, lastRow - 1, 5));   // 아마존
  applyMediumBorder_(sheet.getRange(2, 9, lastRow - 1, 5));   // 미국창고-동부
  applyMediumBorder_(sheet.getRange(2, 14, lastRow - 1, 5));  // 미국창고-서부
  applyMediumBorder_(sheet.getRange(2, 19, lastRow - 1, 5));  // 우체국
  applyMediumBorder_(sheet.getRange(2, 24, lastRow - 1, 7));  // 합계/누적

  // 헤더 하단 굵은 선
  sheet.getRange(3, 1, 1, colCount).setBorder(
    null, null, true, null, null, null,
    '#000000',
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  // 보기 편의
  sheet.setFrozenRows(3);
  sheet.setFrozenColumns(3);

  // 필터는 세부 헤더 행 기준
  const filterRange = sheet.getRange(3, 1, Math.max(rows.length + 1, 1), colCount);
  filterRange.createFilter();
}

function applyMediumBorder_(range) {
  range.setBorder(
    true, true, true, true, null, null,
    '#000000',
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
}

function columnToLetter_(column) {
  let temp = '';
  let letter = '';

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}

// --- 공통 유틸리티 및 보고서 생성 ---

function mainProcess() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('sales');
  const returnSheet = ss.getSheetByName('return');
  const transSheet = ss.getSheetByName('transactions');
  const input2Sheet = ss.getSheetByName('input2');
  if (!salesSheet || !returnSheet || !transSheet) {
    SpreadsheetApp.getUi().alert('sales, return, transactions 시트가 모두 필요합니다.');
    return;
  }
  const skuMap = getSkuMapping(input2Sheet);
  const rateInput = SpreadsheetApp.getUi().prompt('환율 설정', '현재 환율을 입력하세요 (기본값: ' + CONFIG.EXCHANGE_RATE + ')', SpreadsheetApp.getUi().ButtonSet.OK_CANCEL);
  let currentRate = CONFIG.EXCHANGE_RATE;
  if (rateInput.getSelectedButton() == SpreadsheetApp.getUi().Button.OK) {
    currentRate = parseFloat(rateInput.getResponseText()) || CONFIG.EXCHANGE_RATE;
  }
  const salesDataForAmazon = getSheetData(salesSheet, 'Name');
  processShopify(ss, salesSheet, returnSheet, transSheet, currentRate, skuMap);
  processAmazon(ss, transSheet, currentRate, skuMap, salesDataForAmazon);
  SpreadsheetApp.getUi().alert('통합 보고서 처리가 완료되었습니다.');
}

function processShopify(ss, salesSheet, returnSheet, transSheet, rate, skuMap) {
  const salesData = getSheetData(salesSheet, 'Name');
  const returnRawData = getSheetData(returnSheet, '주문 이름');
  const transData = getSheetData(transSheet, 'type');
  const amazonSOrderIndexForReport = buildAmazonSOrderIndex_(transData);
  let result = [];
  // 오토프로X 본품이 나가는 모든 출하창고 코드(우체국 '100' 포함)를 빠짐없이 추적해야
  // 부속 케이블 자동집계 매출행이 창고별로 누락되지 않는다.
  let autoproQtyByWarehouse = {};
  [CONFIG.WAREHOUSE_CODE, CONFIG.WAREHOUSE_CODE_AMAZON_SHIPPING, CONFIG.WAREHOUSE_CODE_BY_AIR].forEach(code => {
    autoproQtyByWarehouse[code] = 0;
  });
  let referenceDate = "";

  // 주문별 판매 데이터 그룹화: Subtotal/Total을 주문당 한 번만 반영한다.
  const salesByOrder = groupShopifySalesByOrder_(salesData);

  const standardSOrderMatchByRow = buildShopifyStandardSOrderMatchMap_(
    salesByOrder,
    amazonSOrderIndexForReport
  );

  Object.keys(salesByOrder).forEach(orderName => {
    const orderRows = salesByOrder[orderName];
    const orderHeaderRow = orderRows.find(row =>
      row['Subtotal'] !== undefined && row['Subtotal'] !== null && row['Subtotal'] !== ''
    ) || orderRows.find(row =>
      row['Total'] !== undefined && row['Total'] !== null && row['Total'] !== ''
    ) || orderRows[0];

    const lineGrossAmounts = orderRows.map(row => {
      const qty = Math.abs(parseNum(row['Lineitem quantity']));
      const unitPrice = Math.abs(parseNum(row['Lineitem price']));
      return qty * unitPrice;
    });
    const orderLineGross = lineGrossAmounts.reduce((sum, amount) => sum + amount, 0);

    const hasSubtotal = orderHeaderRow['Subtotal'] !== undefined &&
      orderHeaderRow['Subtotal'] !== null && orderHeaderRow['Subtotal'] !== '';
    const hasTotal = orderHeaderRow['Total'] !== undefined &&
      orderHeaderRow['Total'] !== null && orderHeaderRow['Total'] !== '';
    const discountAmount = Math.abs(parseNum(orderHeaderRow['Discount Amount']));
    const orderNetSales = hasSubtotal
      ? Math.max(0, parseNum(orderHeaderRow['Subtotal']))
      : (hasTotal
        ? Math.max(0, parseNum(orderHeaderRow['Total']))
        : Math.max(0, orderLineGross - discountAmount));

    let allocatedNetSales = 0;
    orderRows.forEach((row, rowIndex) => {
      const qty = Math.abs(parseNum(row['Lineitem quantity']));
      const lineGross = lineGrossAmounts[rowIndex];
      const isLastRow = rowIndex === orderRows.length - 1;
      const lineNetSales = isLastRow
        ? Math.max(0, orderNetSales - allocatedNetSales)
        : (orderLineGross > 0 ? orderNetSales * (lineGross / orderLineGross) : 0);
      allocatedNetSales += lineNetSales;

      // 100% 할인 주문은 판매금액 0으로 처리한다.
      const unitPrice = qty > 0 ? lineNetSales / qty : 0;
      // Paid at이 비어 있는 주문은 Created at을 보조 날짜로 사용한다.
      const dateStr = formatDate(
        row['Paid at'] || orderHeaderRow['Paid at'] || row['Created at'] || orderHeaderRow['Created at']
      );
      if (!referenceDate && dateStr) referenceDate = dateStr;
      const sku = (row['Lineitem sku'] || '').toString().trim();
      const mapped = skuMap[sku] || { code: sku, name: row['Lineitem name'] };
      const shippingMethod = (
        row['Shipping Method'] || orderHeaderRow['Shipping Method'] || ''
      ).toString().trim();
      let warehouseCode;

      if (isSiliguradSku_(sku)) {
        warehouseCode = CONFIG.WAREHOUSE_CODE_AMAZON;
      } else if (shippingMethod === 'Amazon Shipping') {
        warehouseCode = CONFIG.WAREHOUSE_CODE_AMAZON_SHIPPING;
      } else if (shippingMethod === 'Standard') {
        const matchedSOrder = standardSOrderMatchByRow.get(row) === true;
        warehouseCode = matchedSOrder
          ? CONFIG.WAREHOUSE_CODE_AMAZON
          : CONFIG.WAREHOUSE_CODE_BY_AIR;
      } else if (shippingMethod === 'By Air') {
        warehouseCode = CONFIG.WAREHOUSE_CODE_BY_AIR;
      } else {
        warehouseCode = CONFIG.WAREHOUSE_CODE;
      }

      if (sku === CONFIG.AUTOPRO_MAIN_SKU && autoproQtyByWarehouse[warehouseCode] !== undefined) {
        autoproQtyByWarehouse[warehouseCode] += qty;
      }
      result.push(createOutputRow(dateStr, CONFIG.SHOPIFY_CUSTOMER_CODE, '도대웅', mapped.code, mapped.name, qty, unitPrice, rate, '판매', CONFIG.SHOPIFY_COMM_RATE, warehouseCode));
    });
  });

  // 동일 주문의 환불·환불취소 행을 먼저 합산한 뒤 순 환불액만 한 번 반영한다.
  const returnsByOrder = aggregateShopifyReturnsByOrder_(returnRawData);

  Object.keys(returnsByOrder).forEach(orderName => {
    const orderReturn = returnsByOrder[orderName];
    const netReturn = orderReturn.netReturn;
    if (netReturn >= 0) return;

    const dateStr = formatDate(orderReturn.dateValue);
    const csvSku = orderReturn.csvSku;
    const returnItem = resolveShopifyReturnItem_(orderName, orderReturn, skuMap, salesByOrder);
    const finalSku = returnItem.code;
    const finalName = returnItem.name;

    const finalQty = -1;
    const finalUnitPrice = Math.abs(netReturn);
    if (finalSku === CONFIG.AUTOPRO_HARDCODE_SKU || (csvSku && csvSku === CONFIG.AUTOPRO_MAIN_SKU)) {
      autoproQtyByWarehouse[CONFIG.WAREHOUSE_CODE_AMAZON] += finalQty;
    }
    result.push(createOutputRow(dateStr, CONFIG.SHOPIFY_CUSTOMER_CODE, '도대웅', finalSku, finalName, finalQty, finalUnitPrice, rate, '환불', CONFIG.SHOPIFY_COMM_RATE, CONFIG.WAREHOUSE_CODE_AMAZON));
  });

  Object.keys(autoproQtyByWarehouse).forEach(warehouseCode => {
    const qty = autoproQtyByWarehouse[warehouseCode];
    if (qty !== 0) {
      const cableDate = getLastDayOfMonthStr(referenceDate);
      result.push(createOutputRow(cableDate, CONFIG.SHOPIFY_CUSTOMER_CODE, '도대웅', CONFIG.AUTOPRO_CABLE_CODE, '오토프로X 부속 케이블 (자동집계)', qty, 0, rate, '판매', CONFIG.SHOPIFY_COMM_RATE, warehouseCode));
    }
  });
  writeResultToSheet(ss, '쇼피파이_결과', ["일자", "순번", "거래처코드", "거래처명", "담당자", "비고", "출하창고", "거래유형", "통화", "환율", "품목코드", "품목명", "규격", "수량", "단가(vat포함)순매출", "외화금액", "공급가액", "부가세", "적요", "생산전표생성", "수수료", "수수료포함가"], result);
}

/**
 * salesData: sales(쇼피파이) 탭 데이터. 아마존 "S-" 주문(인플루언서 샘플)이
 * 쇼피파이 쪽과 중복인지 대조하는 데 사용한다(없으면 건너뛰고 기존 로직만 수행).
 */
function processAmazon(ss, transSheet, rate, skuMap, salesData) {
  const transData = getSheetData(transSheet, 'type');
  let result = [];
  let autoproQtySum = 0;
  let referenceDate = "";
  const shopifySiliguardSaleIndex = buildShopifySiliguardSaleIndex_(salesData || []);

  transData.forEach(row => {
    const orderId = (row['order id'] || "").toString();
    const sku = (row['sku'] || '').toString().trim();
    const type = (row['type'] || "").toLowerCase();
    const isSStartOrder = orderId.toUpperCase().startsWith('S');
    // "S-" 주문 중 실리가드 계열의 Order 건은 인플루언서 샘플 발송으로 보고 별도 처리한다.
    const isSiliguardSampleOrder = isSStartOrder && type === 'order' && isSiliguradSku_(sku);

    if (isSStartOrder && !isSiliguardSampleOrder) return;
    if (type !== 'order' && type !== 'refund') return;

    let qty = parseFloat(row['quantity']) || 0;
    let isSampleSale = false;

    if (isSiliguardSampleOrder) {
      const orderTimestampMs = parseTimestampMs_(row['date/time']);
      const alreadyCountedViaShopify = consumeMatchingShopifySale_(shopifySiliguardSaleIndex, sku, qty, orderTimestampMs);
      if (alreadyCountedViaShopify) return; // sales 탭에 동일 SKU/수량 주문이 있으면 중복 반영 방지
      isSampleSale = true;
    }

    let productSales = parseFloat(row['product sales']) || 0;
    let unitPrice = isSampleSale ? 0 : Math.abs(productSales / (qty || 1));
    const isRefund = (type === 'refund');
    if (isRefund) qty = -Math.abs(qty);
    const dateStr = formatAmazonDate(row['date/time']);
    if (!referenceDate && dateStr) referenceDate = dateStr;
    const mapped = skuMap[sku] || { code: sku, name: row['description'] };
    if (sku === CONFIG.AUTOPRO_MAIN_SKU) autoproQtySum += qty;
    result.push(createOutputRow(dateStr, CONFIG.AMAZON_CUSTOMER_CODE, CONFIG.MANAGER_NAME, mapped.code, mapped.name, qty, unitPrice, rate, isRefund ? '환불' : '판매', CONFIG.AMAZON_COMM_RATE, CONFIG.WAREHOUSE_CODE_AMAZON));
  });
  if (autoproQtySum !== 0) {
    const cableDate = getLastDayOfMonthStr(referenceDate);
    result.push(createOutputRow(cableDate, CONFIG.AMAZON_CUSTOMER_CODE, CONFIG.MANAGER_NAME, CONFIG.AUTOPRO_CABLE_CODE, '오토프로X 부속 케이블 (자동집계)', autoproQtySum, 0, rate, '판매', CONFIG.AMAZON_COMM_RATE, CONFIG.WAREHOUSE_CODE_AMAZON));
  }
  writeResultToSheet(ss, '아마존_결과', ["일자", "순번", "거래처코드", "거래처명", "담당자", "비고", "출하창고", "거래유형", "통화", "환율", "품목코드", "품목명", "규격", "수량", "단가(vat포함)순매출", "외화금액", "공급가액", "부가세", "적요", "생산전표생성", "수수료", "수수료포함가"], result);
}

function groupShopifySalesByOrder_(salesData) {
  const salesByOrder = {};
  (salesData || []).forEach((row, index) => {
    const orderName = (row['Name'] || '').toString().trim() || `__ROW_${index}`;
    if (!salesByOrder[orderName]) salesByOrder[orderName] = [];
    salesByOrder[orderName].push(row);
  });
  return salesByOrder;
}

/**
 * Shopify return 탭을 주문 단위로 합산한다.
 * 한 주문의 반품이 SKU 있는 행 / SKU 없는 행 / 환불취소(+) 행으로 나뉘어 들어오므로
 * 순 반품액은 합산하고 SKU·국가·제품명은 값이 있는 행에서 가져온다.
 * 결과보고서(processShopify)와 수불대장이 같은 기준을 쓰도록 공용으로 사용한다.
 */
function aggregateShopifyReturnsByOrder_(returnRawData) {
  const returnsByOrder = {};
  (returnRawData || []).forEach(retRow => {
    const orderName = (retRow['주문 이름'] || '').toString().trim();
    if (!orderName) return;

    if (!returnsByOrder[orderName]) {
      returnsByOrder[orderName] = {
        netReturn: 0,
        totalReturn: 0,
        dateValue: '',
        csvSku: '',
        productName: '',
        country: ''
      };
    }

    const orderReturn = returnsByOrder[orderName];
    orderReturn.netReturn += parseNum(retRow['순 반품액']);
    orderReturn.totalReturn += parseNum(retRow['총 반품액']);
    if (retRow['일']) orderReturn.dateValue = retRow['일'];
    if (retRow['제품 이형 SKU(재고 관리 코드)']) {
      orderReturn.csvSku = retRow['제품 이형 SKU(재고 관리 코드)'].toString().trim();
    }
    if (retRow['판매 시점의 제품 이름']) {
      orderReturn.productName = retRow['판매 시점의 제품 이름'].toString();
    }
    if (retRow['배송 국가']) {
      orderReturn.country = retRow['배송 국가'].toString().trim();
    }
  });
  return returnsByOrder;
}

/**
 * 순 반품 주문의 품목코드/품목명 판정 (결과보고서와 수불대장 공용).
 * SKU 매핑 → 당월 판매 주문의 SKU → 금액/제품명 기준 오토프로X 순서로 판정한다.
 */
function resolveShopifyReturnItem_(orderName, orderReturn, skuMap, salesByOrder) {
  const csvSku = orderReturn.csvSku;
  const productName = orderReturn.productName;
  let code = '';
  let name = productName || 'Unknown Product';

  if (csvSku && skuMap[csvSku]) {
    code = skuMap[csvSku].code;
    name = skuMap[csvSku].name;
  } else {
    const matchedSales = salesByOrder[orderName] || [];
    if (matchedSales.length > 0) {
      const matchedRow = matchedSales[0];
      const matchedSku = (matchedRow['Lineitem sku'] || '').toString().trim();
      const matched = skuMap[matchedSku] || { code: matchedSku, name: matchedRow['Lineitem name'] };
      code = matched.code;
      name = matched.name;
    } else if (Math.abs(orderReturn.totalReturn) >= 90 || productName.indexOf('AutoPro') > -1) {
      code = CONFIG.AUTOPRO_HARDCODE_SKU;
      name = name === 'Unknown Product' ? '메이튼 오토 프로 X' : name;
    }
  }

  return { code: code, name: name };
}

function createOutputRow(date, custCode, manager, sku, itemName, qty, unitPrice, rate, note, commRate, warehouseCode) {
  const unitPriceKrw = Math.round(Math.abs(unitPrice * rate));
  const supplyValue = Math.round(qty * unitPrice * rate);
  const commission = Math.round(supplyValue * (commRate || 0));
  return [date, '', custCode, '', manager, '', warehouseCode || CONFIG.WAREHOUSE_CODE, CONFIG.TRANSACTION_TYPE, '', '', sku, itemName, '', qty, unitPriceKrw, '', supplyValue, 0, note, '', commission, ''];
}

function getSkuMapping(sheet) {
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) return {};
  const headers = values[0].map(h => h.toString().trim());
  const skuIdx = findHeaderIndex(headers, 'SKU');
  const codeIdx = findHeaderIndex(headers, '코드');
  const nameIdx = findHeaderIndex(headers, '한글제품명');
  let map = {};
  for (let i = 1; i < values.length; i++) {
    const sku = (values[i][skuIdx] || "").toString().trim();
    if (sku) {
      map[sku] = { code: (values[i][codeIdx] || "").toString().trim(), name: (values[i][nameIdx] || "").toString().trim() };
    }
  }
  return map;
}

function getSheetData(sheet, headerKeyword) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) return [];
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(values.length, 30); i++) {
    const row = values[i].map(c => c.toString().trim());
    if (row.indexOf(headerKeyword) > -1) {
      headerRowIndex = i;
      break;
    }
  }
  const headers = values[headerRowIndex].map(h => h.toString().trim());
  const dataRows = values.slice(headerRowIndex + 1);
  return dataRows.filter(row => row.join('').trim() !== '').map(row => {
    let obj = {};
    headers.forEach((header, i) => { if (header) obj[header.toString().trim()] = row[i]; });
    return obj;
  });
}

function formatDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    const parts = dateVal.toString().match(/(\d{4})-(\d{2})-(\d{2})/);
    if (parts) return parts[1] + parts[2] + parts[3];
    return dateVal;
  }
  return `${d.getFullYear()}${('0' + (d.getMonth() + 1)).slice(-2)}${('0' + d.getDate()).slice(-2)}`;
}

function formatAmazonDate(dateStr) {
  if (!dateStr) return '';
  try {
    const cleaned = dateStr.toString().split(' ').slice(0, 3).join(' ');
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? dateStr : formatDate(d);
  } catch(e) { return dateStr; }
}

function getLastDayOfMonthStr(dateStr) {
  if (!dateStr || dateStr.length < 8) {
    const now = new Date();
    return formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }
  return formatDate(new Date(parseInt(dateStr.substring(0, 4)), parseInt(dateStr.substring(4, 6)), 0));
}
