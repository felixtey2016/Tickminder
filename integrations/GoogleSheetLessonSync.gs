// Add this file to the Apps Script project bound to the Tuition spreadsheet.
// Keep the existing saveMonthData, loadMonthData and getManualInputs functions.
var SHEET_SYNC_SPREADSHEET_ID = '1BHltoe0W3slM8RVqXWecNbKmsiz0JiLEy7b6fDEHBIY';

function sheetSyncHex(bytes) {
  return bytes.map(function (value) { return ('0' + ((value + 256) % 256).toString(16)).slice(-2); }).join('');
}

function sheetSyncJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function sheetSyncVerify(request) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_SECRET');
  if (!secret || secret.length < 32) throw new Error('SHEET_SYNC_SECRET is not configured');
  if (!request || !/^\d{13}$/.test(String(request.timestamp)) ||
      Math.abs(Date.now() - Number(request.timestamp)) > 5 * 60 * 1000 ||
      !/^[0-9a-f-]{36}$/.test(String(request.nonce)) || typeof request.body !== 'string' ||
      !/^[0-9a-f]{64}$/.test(String(request.signature))) throw new Error('Invalid or expired request');
  var expected = sheetSyncHex(Utilities.computeHmacSha256Signature(
    request.timestamp + '.' + request.nonce + '.' + request.body, secret));
  var mismatch = 0;
  for (var i = 0; i < 64; i++) mismatch |= expected.charCodeAt(i) ^ request.signature.charCodeAt(i);
  if (mismatch) throw new Error('Invalid request signature');
  var cache = CacheService.getScriptCache();
  if (cache.get('sheet-sync-' + request.nonce)) throw new Error('Repeated request');
  cache.put('sheet-sync-' + request.nonce, '1', 300);
  return JSON.parse(request.body);
}

function sheetSyncMonth(sheet) {
  var cell = sheet.getRange('B2');
  var date = cell.getValue();
  var displayMonth = cell.getDisplayValue();
  if (!(date instanceof Date) || !displayMonth) throw new Error('Select a month in Lesson Records!B2 first');
  var month = Utilities.formatDate(date, 'Asia/Kuala_Lumpur', 'yyyy-MM');
  var props = PropertiesService.getDocumentProperties();
  if (!props || props.getProperty('CURRENT_MONTH') !== displayMonth) {
    throw new Error('Month switching is not finished. Open the sheet and run Initialize System if needed');
  }
  return { month: month, displayMonth: displayMonth };
}

function sheetSyncHistory(storage, displayMonth) {
  if (!storage || storage.getRange('A1').getDisplayValue() !== 'Month') throw new Error('Month history sheet is missing');
  var lastRow = storage.getLastRow();
  var months = storage.getRange(1, 1, lastRow, 1).getDisplayValues();
  for (var i = 1; i < months.length; i++) {
    if (months[i][0] === displayMonth) return { row: i + 1, previous: storage.getRange(i + 1, 2).getValue() };
  }
  return { row: 0, previous: '' };
}

function sheetSyncPreview(sheet, storage, monthState, pairs) {
  if (!Array.isArray(pairs) || pairs.length > 2000) throw new Error('Invalid website lesson summary');
  var website = Object.create(null);
  var duplicateWebsite = Object.create(null);
  pairs.forEach(function (pair) {
    if (!pair || typeof pair.student !== 'string' || typeof pair.subject !== 'string' ||
        !pair.student || !pair.subject || pair.student.length > 80 || pair.subject.length > 80 ||
        typeof pair.hours !== 'number' || !isFinite(pair.hours) || pair.hours < 0 || pair.hours > 10000) {
      throw new Error('Invalid website student, subject or hours');
    }
    var key = JSON.stringify([pair.student, pair.subject]);
    if (website[key]) duplicateWebsite[key] = true;
    website[key] = pair;
  });
  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 5 ? sheet.getRange(5, 1, lastRow - 4, 8).getValues() : [];
  var locations = Object.create(null);
  rows.forEach(function (row, index) {
    if (typeof row[0] === 'string' && row[0] && typeof row[1] === 'string' && row[1]) {
      var key = JSON.stringify([row[0], row[1]]);
      if (!locations[key]) locations[key] = [];
      locations[key].push({ row: index + 5, before: row[7] });
    }
  });
  var changes = [];
  var skipped = [];
  pairs.forEach(function (pair) {
    var key = JSON.stringify([pair.student, pair.subject]);
    var found = locations[key] || [];
    if (duplicateWebsite[key]) skipped.push({ student: pair.student, subject: pair.subject, reason: 'duplicate_website' });
    else if (!found.length) skipped.push({ student: pair.student, subject: pair.subject, reason: 'not_found' });
    else if (found.length !== 1) skipped.push({ student: pair.student, subject: pair.subject, reason: 'duplicate_sheet' });
    else changes.push({ row: found[0].row, student: pair.student, subject: pair.subject,
      before: found[0].before === '' ? '' : Number(found[0].before), after: pair.hours });
  });
  Object.keys(locations).forEach(function (key) {
    if (!website[key]) {
      var names = JSON.parse(key);
      skipped.push({ student: names[0], subject: names[1], reason: 'not_in_website' });
    }
  });
  changes.sort(function (a, b) { return a.row - b.row; });
  var history = sheetSyncHistory(storage, monthState.displayMonth);
  var fingerprint = JSON.stringify({ month: monthState.month, displayMonth: monthState.displayMonth,
    pairs: pairs, changes: changes, skipped: skipped, history: history.previous });
  var previewToken = sheetSyncHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, fingerprint));
  return { ok: true, month: monthState.month, displayMonth: monthState.displayMonth,
    changes: changes, skipped: skipped, previewToken: previewToken, history: history };
}

function sheetSyncCommit(ss, sheet, storage, monthState, preview) {
  if (!preview.changes.length) throw new Error('No matching student-subject rows to import');
  var oldValues = preview.changes.map(function (change) { return { row: change.row, value: sheet.getRange(change.row, 8).getValue() }; });
  var oldHistory = preview.history;
  var newHistoryRow = 0;
  try {
    preview.changes.forEach(function (change) { sheet.getRange(change.row, 8).setValue(change.after); });
    SpreadsheetApp.flush();
    if (sheetSyncMonth(sheet).month !== monthState.month) throw new Error('Month changed during import');
    var json = JSON.stringify(getManualInputs(sheet));
    if (json.length > 49000) throw new Error('Monthly lesson history is too large for one cell');
    if (oldHistory.row) storage.getRange(oldHistory.row, 2).setValue(json);
    else {
      storage.appendRow([monthState.displayMonth, json]);
      newHistoryRow = storage.getLastRow();
    }
    SpreadsheetApp.flush();
    if (sheetSyncMonth(sheet).month !== monthState.month ||
        preview.changes.some(function (change) { return sheet.getRange(change.row, 8).getValue() !== change.after; }) ||
        storage.getRange(oldHistory.row || newHistoryRow, 2).getValue() !== json) {
      throw new Error('Import verification failed or month changed');
    }
    return { ok: true, month: monthState.month, displayMonth: monthState.displayMonth,
      written: preview.changes.length, changes: preview.changes, skipped: preview.skipped };
  } catch (error) {
    oldValues.forEach(function (item) { sheet.getRange(item.row, 8).setValue(item.value); });
    if (oldHistory.row) storage.getRange(oldHistory.row, 2).setValue(oldHistory.previous);
    else if (newHistoryRow) storage.getRange(newHistoryRow, 1, 1, 2).clearContent();
    SpreadsheetApp.flush();
    throw error;
  }
}

function doPost(e) {
  try {
    var payload = sheetSyncVerify(JSON.parse(e.postData.contents));
    if (!payload || ['month', 'preview', 'commit'].indexOf(payload.action) === -1) throw new Error('Invalid operation');
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = SpreadsheetApp.openById(SHEET_SYNC_SPREADSHEET_ID);
      var sheet = ss.getSheetByName('Lesson Records');
      var storage = ss.getSheetByName('System_Data_Storage');
      if (!sheet || !storage) throw new Error('Required spreadsheet tab is missing');
      var monthState = sheetSyncMonth(sheet);
      if (payload.action === 'month') return sheetSyncJson({ ok: true, month: monthState.month, displayMonth: monthState.displayMonth });
      if (payload.month !== monthState.month) throw new Error('Month changed. Preview again');
      var preview = sheetSyncPreview(sheet, storage, monthState, payload.pairs);
      if (payload.action === 'preview') {
        delete preview.history;
        return sheetSyncJson(preview);
      }
      if (typeof payload.previewToken !== 'string' || payload.previewToken !== preview.previewToken) {
        throw new Error('Sheet or website data changed. Preview again');
      }
      return sheetSyncJson(sheetSyncCommit(ss, sheet, storage, monthState, preview));
    } finally { lock.releaseLock(); }
  } catch (error) { return sheetSyncJson({ ok: false, error: String(error && error.message || error) }); }
}

// Replace the existing onEdit function with: function onEdit(e) { sheetSyncSafeOnEdit(e); }
// Both month switching and website import must use the same script lock.
function sheetSyncSafeOnEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== 'Lesson Records' || e.range.getA1Notation() !== 'B2') return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = e.range.getSheet();
    var newMonth = sheet.getRange('B2').getDisplayValue();
    if (!newMonth) return;
    var props = PropertiesService.getDocumentProperties();
    var oldMonth = props.getProperty('CURRENT_MONTH');
    if (oldMonth && oldMonth !== newMonth) saveMonthData(oldMonth);
    if (oldMonth !== newMonth) loadMonthData(newMonth);
    props.setProperty('CURRENT_MONTH', newMonth);
    SpreadsheetApp.getActiveSpreadsheet().toast('已切换至 [' + newMonth + ']', '月份切换');
  } finally { lock.releaseLock(); }
}
