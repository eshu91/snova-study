function startSession(params) {
  const { track, topicIds, sessionType, notes } = params || {};
  if (!track) return { error: 'Track is required.' };

  const active = getActiveSession();
  if (active) return { error: 'A session is already active — stop it first.' };

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet) return { error: 'Sessions sheet not found.' };

  const id    = 'sess_' + String(sheet.getLastRow()).padStart(5, '0');
  const now   = new Date().toISOString();
  const ids   = Array.isArray(topicIds) ? topicIds.join(',') : (topicIds || '');

  sheet.appendRow([id, now, '', '', track, ids, sessionType || 'Study',
                   '', '', notes || '', 'active', getCurrentUserEmail_()]);

  if (ids) updateLastReviewed_(track, ids.split(',').map(s => s.trim()), now);
  return { success: true, sessionId: id, startTime: now };
}

function stopSession(params) {
  const { qualityRating, minutesSelfReported } = params || {};
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet) return { error: 'Sessions sheet not found.' };

  const { rowIndex, session } = findActiveRow_(sheet);
  if (!rowIndex) return { error: 'No active session found.' };

  const now     = new Date();
  const elapsed = Math.round((now - new Date(session.startTime)) / 60000);
  const minMin  = getConfigInt('min_session_minutes') || 15;
  const reported = minutesSelfReported != null ? parseInt(minutesSelfReported, 10) : elapsed;

  sheet.getRange(rowIndex, COL_SESS.END_TIME + 1).setValue(now.toISOString());
  sheet.getRange(rowIndex, COL_SESS.DURATION_MIN + 1).setValue(elapsed);
  sheet.getRange(rowIndex, COL_SESS.QUALITY_RATING + 1).setValue(qualityRating || '');
  sheet.getRange(rowIndex, COL_SESS.MINUTES_SELF_REPORTED + 1).setValue(reported);
  sheet.getRange(rowIndex, COL_SESS.STATUS + 1).setValue('completed');

  return { success: true, sessionId: session.sessionId, durationMin: elapsed,
           reportedMin: reported, qualifies: reported >= minMin };
}

function cancelSession() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet) return { error: 'Sessions sheet not found.' };
  const { rowIndex } = findActiveRow_(sheet);
  if (!rowIndex) return { error: 'No active session to cancel.' };
  sheet.getRange(rowIndex, COL_SESS.END_TIME + 1).setValue(new Date().toISOString());
  sheet.getRange(rowIndex, COL_SESS.STATUS + 1).setValue('cancelled');
  return { success: true };
}

function getActiveSession() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  return findActiveRow_(sheet).session || null;
}

function getRecentSessions(n) {
  n = n || 5;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues()
    .filter(r => r[COL_SESS.STATUS] === 'completed')
    .reverse().slice(0, n).map(toSessionObj_);
}

function getTodayMinutesByTrack() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const result = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues()
    .forEach(r => {
      if (r[COL_SESS.STATUS] !== 'completed') return;
      if (!r[COL_SESS.END_TIME] || new Date(r[COL_SESS.END_TIME]) < todayStart) return;
      const track = String(r[COL_SESS.TRACK]);
      const mins  = parseInt(r[COL_SESS.MINUTES_SELF_REPORTED] || r[COL_SESS.DURATION_MIN], 10) || 0;
      result[track] = (result[track] || 0) + mins;
    });
  return result;
}

function getStreak() {
  const sheet    = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  const minMins  = getConfigInt('min_session_minutes') || 15;
  const grace    = getConfigInt('streak_grace_days') || 1;
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const studyDates = new Set();
  sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues()
    .forEach(r => {
      if (r[COL_SESS.STATUS] !== 'completed') return;
      const mins = parseInt(r[COL_SESS.MINUTES_SELF_REPORTED] || r[COL_SESS.DURATION_MIN], 10) || 0;
      if (mins < minMins || !r[COL_SESS.END_TIME]) return;
      studyDates.add(new Date(r[COL_SESS.END_TIME]).toISOString().split('T')[0]);
    });

  if (studyDates.size === 0) return 0;

  let streak = 0, weekMissed = 0, lastWeek = null;
  const today = new Date(); today.setHours(0,0,0,0);

  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    d.setDate(d.getDate() - d.getDay());
    const wk = d.toISOString().split('T')[0];
    if (wk !== lastWeek) { lastWeek = wk; weekMissed = 0; }
    if (studyDates.has(ds)) { streak++; }
    else { if (++weekMissed > grace) break; }
  }
  return streak;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function findActiveRow_(sheet) {
  if (sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][COL_SESS.STATUS] === 'active') {
      return { rowIndex: i + 2, session: toSessionObj_(rows[i]) };
    }
  }
  return {};
}

function toSessionObj_(r) {
  return {
    sessionId:           String(r[COL_SESS.SESSION_ID]),
    startTime:           r[COL_SESS.START_TIME] ? new Date(r[COL_SESS.START_TIME]).toISOString() : '',
    endTime:             r[COL_SESS.END_TIME]   ? new Date(r[COL_SESS.END_TIME]).toISOString()   : '',
    durationMin:         r[COL_SESS.DURATION_MIN] || 0,
    track:               String(r[COL_SESS.TRACK] || ''),
    topicIds:            String(r[COL_SESS.TOPIC_IDS] || ''),
    sessionType:         String(r[COL_SESS.SESSION_TYPE] || 'Study'),
    qualityRating:       r[COL_SESS.QUALITY_RATING] || '',
    minutesSelfReported: r[COL_SESS.MINUTES_SELF_REPORTED] || 0,
    notes:               String(r[COL_SESS.NOTES] || ''),
    status:              String(r[COL_SESS.STATUS] || ''),
  };
}

function updateLastReviewed_(track, topicIds, timestamp) {
  try {
    const level = TRACK_TO_LEVEL[track];
    if (!level) return;
    const sheet = SpreadsheetApp.getActive().getSheetByName(SYLLABUS_SHEETS[level]);
    if (!sheet || sheet.getLastRow() < 2) return;
    const ids  = new Set(topicIds);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SYLLABUS.length).getValues();
    rows.forEach((r, i) => {
      if (ids.has(String(r[COL_SYL.ID])))
        sheet.getRange(i + 2, COL_SYL.LAST_REVIEWED + 1).setValue(timestamp);
    });
  } catch (e) { console.error('updateLastReviewed_ error: ' + e.message); }
}