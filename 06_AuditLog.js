function writeAudit(action, sheet, rowId, field, before, after) {
  try {
    const log = SpreadsheetApp.getActive().getSheetByName(SHEET_AUDIT_LOG);
    if (!log) return;
    log.appendRow([new Date().toISOString(), getCurrentUserEmail_(),
                   action, sheet, rowId, field, String(before), String(after)]);
  } catch (e) {
    console.error('writeAudit failed: ' + e.message);
  }
}

function writeSystemLog(trigger, status, detail) {
  try {
    const log = SpreadsheetApp.getActive().getSheetByName(SHEET_SYS_LOG);
    if (!log) return;
    log.appendRow([new Date().toISOString(), trigger, status, String(detail || '')]);
  } catch (e) {
    console.error('writeSystemLog failed: ' + e.message);
  }
}

function getRecentTriggerRuns() {
  const log = SpreadsheetApp.getActive().getSheetByName(SHEET_SYS_LOG);
  if (!log || log.getLastRow() < 2) return [];
  return log.getRange(2, 1, log.getLastRow() - 1, 4).getValues()
    .reverse().slice(0, 10)
    .map(r => ({
      timestamp: r[0] ? new Date(r[0]).toISOString() : '',
      trigger:   String(r[1] || ''),
      status:    String(r[2] || ''),
      detail:    String(r[3] || ''),
    }));
}