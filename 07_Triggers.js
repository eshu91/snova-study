/**
 * All time-based triggers. Every function writes to _systemLog so the
 * Settings page can show the last N runs with status.
 *
 * Important: set the Apps Script project time zone to Asia/Kathmandu
 * in Project Settings so atHour(22) fires at 22:00 NPT.
 */

function morningRefresh() {
  try {
    const { closed } = _autoCloseStaleSessions_();
    writeSystemLog('morningRefresh', 'ok',
      closed > 0 ? 'Auto-closed ' + closed + ' stale session(s)' : 'Clean');
  } catch (e) {
    writeSystemLog('morningRefresh', 'error', e.message);
  }
}

function dailyCheck() {
  try {
    const config    = getConfigAll();
    const notif     = config.notification_email || config.owner_email;
    if (!notif) {
      writeSystemLog('dailyCheck', 'error', 'No notification_email set in Config');
      return;
    }

    const todayMins = getTodayMinutesByTrack();
    const total     = Object.values(todayMins).reduce((a, b) => a + b, 0);
    const minReq    = parseInt(config.min_session_minutes, 10) || 15;

    if (total >= minReq) {
      writeSystemLog('dailyCheck', 'skipped', 'Already studied ' + total + ' min today');
      return;
    }

    sendDailyNudge_(config, total);
    writeSystemLog('dailyCheck', 'sent', 'Nudge sent — ' + total + ' min today');
  } catch (e) {
    writeSystemLog('dailyCheck', 'error', e.message);
  }
}

function weeklySummary() {
  try {
    const config = getConfigAll();
    const notif  = config.notification_email || config.owner_email;
    if (!notif) {
      writeSystemLog('weeklySummary', 'error', 'No notification_email set in Config');
      return;
    }
    sendWeeklySummary_(config);
    writeSystemLog('weeklySummary', 'sent', 'Sent to ' + notif);
  } catch (e) {
    writeSystemLog('weeklySummary', 'error', e.message);
  }
}

function checkStaleSessions() {
  try {
    const { closed } = _autoCloseStaleSessions_();
    writeSystemLog('checkStaleSessions', 'ok',
      closed > 0 ? 'Auto-closed ' + closed + ' session(s)' : 'No stale sessions');
  } catch (e) {
    writeSystemLog('checkStaleSessions', 'error', e.message);
  }
}

function phaseTransitionCheck() {
  try {
    const config = getConfigAll();

    if (config.phase !== PHASE_PRE_IELTS) {
      writeSystemLog('phaseTransitionCheck', 'ok', 'Phase is ' + config.phase);
      return;
    }

    const testDate = getConfigDate('ielts_test_date');
    if (!testDate) {
      writeSystemLog('phaseTransitionCheck', 'ok', 'No IELTS date set');
      return;
    }

    if (testDate > new Date()) {
      const days = Math.round((testDate - new Date()) / 86400000);
      writeSystemLog('phaseTransitionCheck', 'ok', days + ' days until IELTS');
      return;
    }

    const collab = config.collaborator_email;
    if (!collab) {
      writeSystemLog('phaseTransitionCheck', 'warn', 'IELTS date passed — no collaborator_email to alert');
      return;
    }

    sendPhaseTransitionAlert_(config);
    writeSystemLog('phaseTransitionCheck', 'sent', 'Alert sent to ' + collab);
  } catch (e) {
    writeSystemLog('phaseTransitionCheck', 'error', e.message);
  }
}

function pruneSystemLog() {
  try {
    if (new Date().getDate() !== 1) return;
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SYS_LOG);
    if (!sheet || sheet.getLastRow() <= 1001) return;
    const excess = sheet.getLastRow() - 1001;
    sheet.deleteRows(2, excess);
    writeSystemLog('pruneSystemLog', 'ok', 'Pruned ' + excess + ' old rows');
  } catch (e) {
    console.error('pruneSystemLog: ' + e.message);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _autoCloseStaleSessions_() {
  const config     = getConfigAll();
  const staleHours = parseInt(config.stale_session_hours, 10) || 4;
  const sheet      = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet || sheet.getLastRow() < 2) return { closed: 0 };

  const now  = new Date();
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues();
  let closed = 0;

  rows.forEach((row, i) => {
    if (row[COL_SESS.STATUS] !== 'active' || !row[COL_SESS.START_TIME]) return;
    const elapsed = (now - new Date(row[COL_SESS.START_TIME])) / 3600000;
    if (elapsed < staleHours) return;
    const ri = i + 2;
    sheet.getRange(ri, COL_SESS.END_TIME + 1).setValue(now.toISOString());
    sheet.getRange(ri, COL_SESS.STATUS  + 1).setValue('cancelled');
    closed++;
  });

  if (closed > 0 && (config.notification_email || config.owner_email)) {
    try { sendStaleTimerAlert_(config, closed, staleHours); } catch (e) { /* non-fatal */ }
  }

  return { closed };
}