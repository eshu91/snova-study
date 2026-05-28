function morningRefresh()       { writeSystemLog('morningRefresh',       'ok', ''); }
function dailyCheck()           { writeSystemLog('dailyCheck',           'ok', ''); }
function weeklySummary()        { writeSystemLog('weeklySummary',        'ok', ''); }
function checkStaleSessions()   { writeSystemLog('checkStaleSessions',   'ok', ''); }
function phaseTransitionCheck() { writeSystemLog('phaseTransitionCheck', 'ok', ''); }
function pruneSystemLog() {
  if (new Date().getDate() !== 1) return;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SYS_LOG);
  if (!sheet || sheet.getLastRow() <= 1001) return;
  sheet.deleteRows(2, sheet.getLastRow() - 1001);
  writeSystemLog('pruneSystemLog', 'ok', 'Pruned to 1000 rows');
}