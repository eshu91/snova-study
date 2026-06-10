// ═══════════════════════════════════════════════════════════════════════════════
// 12_Counters.js — Lightweight counter/stopwatch/timer
// Quick-access timing on the Stats page. No topics, no quality rating.
// Stored in Counters sheet; survives page reload via getActiveCounters().
// ═══════════════════════════════════════════════════════════════════════════════

// ── Start a counter ───────────────────────────────────────────────────────────

function startCounter(params) {
  var track = (params.track || '').trim();
  if (!track) return { error: 'Track is required.' };

  var sheet = _counterSheet_();
  if (!sheet) return { error: 'Counters sheet not found. Run runSetup().' };

  // Allow multiple counters at once (e.g. reading + listening simultaneously)
  // but prevent duplicate active counters for the same track
  var active = getActiveCounters();
  for (var i = 0; i < active.length; i++) {
    if (active[i].track === track) {
      return { error: 'A counter for "' + track + '" is already running.' };
    }
  }

  var id   = 'ctr_' + String(sheet.getLastRow()).padStart(5, '0');
  var now  = new Date().toISOString();
  var mode = params.targetMinutes ? 'timer' : 'stopwatch';

  var row = HDR_COUNTERS.map(function() { return ''; });
  row[COL_CTR.ID]             = id;
  row[COL_CTR.START_TIME]     = now;
  row[COL_CTR.END_TIME]       = '';
  row[COL_CTR.DURATION_MIN]   = '';
  row[COL_CTR.TARGET_MINUTES] = params.targetMinutes || '';
  row[COL_CTR.TRACK]          = track;
  row[COL_CTR.MODE]           = mode;
  row[COL_CTR.STATUS]         = 'active';
  row[COL_CTR.NOTES]          = params.notes || '';
  row[COL_CTR.CREATED_BY]     = getCurrentUserEmail_();

  sheet.appendRow(row);

  return {
    success: true,
    id: id,
    startTime: now,
    mode: mode,
    targetMinutes: params.targetMinutes || null
  };
}

// ── Stop a counter ────────────────────────────────────────────────────────────

function stopCounter(counterId) {
  if (!counterId) return { error: 'Counter ID required.' };

  var sheet = _counterSheet_();
  if (!sheet) return { error: 'Counters sheet not found.' };

  var found = _findCounterRow_(sheet, counterId);
  if (!found.rowIndex) return { error: 'Counter not found: ' + counterId };
  if (String(found.row[COL_CTR.STATUS]) !== 'active') {
    return { error: 'Counter is not active.' };
  }

  var now     = new Date();
  var start   = new Date(found.row[COL_CTR.START_TIME]);
  var elapsed = Math.max(1, Math.round((now - start) / 60000));

  sheet.getRange(found.rowIndex, COL_CTR.END_TIME + 1).setValue(now.toISOString());
  sheet.getRange(found.rowIndex, COL_CTR.DURATION_MIN + 1).setValue(elapsed);
  sheet.getRange(found.rowIndex, COL_CTR.STATUS + 1).setValue('completed');

  return { success: true, id: counterId, durationMin: elapsed };
}

// ── Cancel a counter ──────────────────────────────────────────────────────────

function cancelCounter(counterId) {
  if (!counterId) return { error: 'Counter ID required.' };

  var sheet = _counterSheet_();
  if (!sheet) return { error: 'Counters sheet not found.' };

  var found = _findCounterRow_(sheet, counterId);
  if (!found.rowIndex) return { error: 'Counter not found: ' + counterId };

  sheet.getRange(found.rowIndex, COL_CTR.END_TIME + 1).setValue(new Date().toISOString());
  sheet.getRange(found.rowIndex, COL_CTR.STATUS + 1).setValue('cancelled');

  return { success: true };
}

// ── Get all active counters (for page reload resume) ──────────────────────────

function getActiveCounters() {
  var sheet = _counterSheet_();
  if (!sheet || sheet.getLastRow() < 2) return [];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_COUNTERS.length).getValues();
  var result = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][COL_CTR.STATUS]) === 'active') {
      result.push(_rowToCounter_(rows[i]));
    }
  }

  return result;
}

// ── Today's counter minutes by track ──────────────────────────────────────────

function getTodayCounterMinutes() {
  var sheet = _counterSheet_();
  if (!sheet || sheet.getLastRow() < 2) return {};

  var todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  var result = {};
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_COUNTERS.length).getValues();

  rows.forEach(function(r) {
    if (String(r[COL_CTR.STATUS]) !== 'completed') return;
    var endTime = r[COL_CTR.END_TIME];
    if (!endTime || new Date(endTime) < todayStart) return;

    var track = String(r[COL_CTR.TRACK]);
    var mins  = parseInt(r[COL_CTR.DURATION_MIN]) || 0;
    result[track] = (result[track] || 0) + mins;
  });

  return result;
}

// ── Counter stats for a date range ────────────────────────────────────────────

function getCounterStats(days) {
  days = days || 7;
  var sheet = _counterSheet_();
  if (!sheet || sheet.getLastRow() < 2) return { byTrack: {}, total: 0 };

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  var byTrack = {};
  var total   = 0;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_COUNTERS.length).getValues();

  rows.forEach(function(r) {
    if (String(r[COL_CTR.STATUS]) !== 'completed') return;
    var endTime = r[COL_CTR.END_TIME];
    if (!endTime || new Date(endTime) < cutoff) return;

    var track = String(r[COL_CTR.TRACK]);
    var mins  = parseInt(r[COL_CTR.DURATION_MIN]) || 0;
    byTrack[track] = (byTrack[track] || 0) + mins;
    total += mins;
  });

  return { byTrack: byTrack, total: total };
}

// ── Recent completed counters ─────────────────────────────────────────────────

function getRecentCounters(n) {
  n = n || 10;
  var sheet = _counterSheet_();
  if (!sheet || sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_COUNTERS.length).getValues()
    .filter(function(r) { return String(r[COL_CTR.STATUS]) === 'completed'; })
    .reverse()
    .slice(0, n)
    .map(_rowToCounter_);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _counterSheet_() {
  return SpreadsheetApp.getActive().getSheetByName(SHEET_COUNTERS);
}

function _findCounterRow_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return { rowIndex: null, row: null };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_COUNTERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_CTR.ID]) === id) {
      return { rowIndex: i + 2, row: rows[i] };
    }
  }
  return { rowIndex: null, row: null };
}

function _rowToCounter_(r) {
  var startTime = r[COL_CTR.START_TIME];
  var start     = startTime ? new Date(startTime) : null;
  var nowMs     = Date.now();
  var elapsedSecs = start ? Math.floor((nowMs - start.getTime()) / 1000) : 0;

  return {
    id:            String(r[COL_CTR.ID]),
    startTime:     startTime ? new Date(startTime).toISOString() : '',
    endTime:       r[COL_CTR.END_TIME] ? new Date(r[COL_CTR.END_TIME]).toISOString() : '',
    durationMin:   parseInt(r[COL_CTR.DURATION_MIN]) || 0,
    targetMinutes: r[COL_CTR.TARGET_MINUTES] ? parseInt(r[COL_CTR.TARGET_MINUTES]) : null,
    track:         String(r[COL_CTR.TRACK]),
    mode:          String(r[COL_CTR.MODE] || 'stopwatch'),
    status:        String(r[COL_CTR.STATUS]),
    notes:         String(r[COL_CTR.NOTES] || ''),
    elapsedSecs:   elapsedSecs, // for active counters: resume offset
  };
}