function addDailyLogEntry(params) {
  const { mood, ankiDone, notes } = params || {};
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_DAILY_LOG);
  if (!sheet) return { error: 'DailyLog sheet not found.' };

  const today    = new Date().toISOString().split('T')[0];
  const todayMin = getTodayMinutesByTrack();
  const total    = Object.values(todayMin).reduce((a, b) => a + b, 0);
  const tracks   = Object.keys(todayMin).join(', ');

  sheet.appendRow([today, tracks, total, ankiDone ? 'yes' : 'no',
                   mood || '', notes || '', getCurrentUserEmail_()]);
  return { success: true };
}

function getLastNDaysLog(n) {
  n = n || 7;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_DAILY_LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_DAILY_LOG.length).getValues()
    .reverse().slice(0, n).map(r => ({
      date:         String(r[COL_LOG.DATE] || ''),
      tracks:       String(r[COL_LOG.TRACKS_STUDIED] || ''),
      totalMinutes: r[COL_LOG.TOTAL_MINUTES] || 0,
      ankiDone:     String(r[COL_LOG.ANKI_DONE] || ''),
      mood:         String(r[COL_LOG.MOOD] || ''),
      notes:        String(r[COL_LOG.NOTES] || ''),
    }));
}