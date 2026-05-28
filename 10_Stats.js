// ── Public API ────────────────────────────────────────────────────────────────

function getStatsSummary() {
  const wStart   = _weekStart_();
  const sessions = _allCompletedSessions_();
  const thisWeek = sessions.filter(r => r[COL_SESS.END_TIME] && new Date(r[COL_SESS.END_TIME]) >= wStart);

  const totalMinutes = thisWeek.reduce((s, r) =>
    s + (parseInt(r[COL_SESS.MINUTES_SELF_REPORTED] || r[COL_SESS.DURATION_MIN], 10) || 0), 0);

  const daysStudied = new Set(
    thisWeek.map(r => new Date(r[COL_SESS.END_TIME]).toISOString().split('T')[0])
  ).size;

  const typeCounts = { Study: 0, Practice: 0, Review: 0, 'Watch/Listen': 0, Test: 0 };
  thisWeek.forEach(r => {
    const t = String(r[COL_SESS.SESSION_TYPE] || 'Study');
    if (Object.prototype.hasOwnProperty.call(typeCounts, t)) typeCounts[t]++;
  });

  let topicsMastered = 0;
  Object.values(SYLLABUS_SHEETS).forEach(sheetName => {
    const s = SpreadsheetApp.getActive().getSheetByName(sheetName);
    if (!s || s.getLastRow() < 2) return;
    s.getRange(2, 1, s.getLastRow() - 1, HDR_SYLLABUS.length).getValues()
      .forEach(r => {
        if (r[COL_SYL.STATUS] === STATUS_MASTERED && r[COL_SYL.MASTERED_ON] &&
            new Date(r[COL_SYL.MASTERED_ON]) >= wStart) topicsMastered++;
      });
  });

  const wEnd = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  const fmt  = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  return {
    totalMinutes,
    daysStudied,
    topicsMastered,
    streak:    getStreak(),
    typeCounts,
    weekLabel: fmt(wStart) + ' – ' + fmt(wEnd),
  };
}

// Returns all chart data in one call to minimise round-trips.
function getChartData() {
  return {
    minutesByTrack:  _minutesByTrack_(8),
    masteredByMonth: _masteredByMonth_(6),
    heatmap:         _heatmap_(182),
  };
}

function getReviewCandidates() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 21);
  const results = [];

  Object.entries(SYLLABUS_SHEETS).forEach(([level, sheetName]) => {
    const s = SpreadsheetApp.getActive().getSheetByName(sheetName);
    if (!s || s.getLastRow() < 2) return;
    s.getRange(2, 1, s.getLastRow() - 1, HDR_SYLLABUS.length).getValues()
      .filter(r => r[COL_SYL.STATUS] === STATUS_LEARNING && r[COL_SYL.LAST_REVIEWED])
      .forEach(r => {
        const lr = new Date(r[COL_SYL.LAST_REVIEWED]);
        if (lr <= cutoff) {
          results.push({
            id:          String(r[COL_SYL.ID]),
            topic:       String(r[COL_SYL.TOPIC]),
            level,
            lastReviewed: lr.toISOString(),
            daysSince:   Math.round((Date.now() - lr.getTime()) / 86400000),
          });
        }
      });
  });

  return results.sort((a, b) => b.daysSince - a.daysSince).slice(0, 10);
}

// Returns intentions config + this-week progress in one call.
function getWeeklyGoalsData() {
  return {
    intentions: getWeeklyIntentions(),
    progress:   _weeklyProgress_(),
  };
}

function getWeeklyIntentions() {
  const raw = getConfig('weekly_intentions');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  return _defaultIntentions_();
}

function saveWeeklyIntentions(intentions) {
  return setConfigValue('weekly_intentions', JSON.stringify(intentions));
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _weekStart_() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d;
}

function _allCompletedSessions_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues()
    .filter(r => r[COL_SESS.STATUS] === 'completed');
}

function _minutesByTrack_(numWeeks) {
  const sessions = _allCompletedSessions_();
  const now      = new Date();

  const weeks = Array.from({ length: numWeeks }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (numWeeks - 1 - i) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      start, end,
      label:  start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      german: 0,
      ielts:  0,
    };
  });

  sessions.forEach(r => {
    if (!r[COL_SESS.END_TIME]) return;
    const endDate = new Date(r[COL_SESS.END_TIME]);
    const mins    = parseInt(r[COL_SESS.MINUTES_SELF_REPORTED] || r[COL_SESS.DURATION_MIN], 10) || 0;
    const track   = String(r[COL_SESS.TRACK] || '');
    weeks.forEach(w => {
      if (endDate >= w.start && endDate < w.end) {
        if (track.startsWith('German')) w.german += mins;
        else if (track.startsWith('IELTS')) w.ielts += mins;
      }
    });
  });

  return weeks.map(({ label, german, ielts }) => ({ label, german, ielts }));
}

function _masteredByMonth_(numMonths) {
  const now    = new Date();
  const months = Array.from({ length: numMonths }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(),
             label: d.toLocaleDateString('en-GB', { month: 'short' }), count: 0 };
  });

  Object.values(SYLLABUS_SHEETS).forEach(sheetName => {
    const s = SpreadsheetApp.getActive().getSheetByName(sheetName);
    if (!s || s.getLastRow() < 2) return;
    s.getRange(2, 1, s.getLastRow() - 1, HDR_SYLLABUS.length).getValues()
      .forEach(r => {
        if (r[COL_SYL.STATUS] !== STATUS_MASTERED || !r[COL_SYL.MASTERED_ON]) return;
        const d  = new Date(r[COL_SYL.MASTERED_ON]);
        const bk = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth());
        if (bk) bk.count++;
      });
  });

  return months.map(({ label, count }) => ({ label, count }));
}

function _heatmap_(days) {
  const sessions = _allCompletedSessions_();
  const cutoff   = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const result   = {};

  sessions
    .filter(r => r[COL_SESS.END_TIME] && new Date(r[COL_SESS.END_TIME]) >= cutoff)
    .forEach(r => {
      const key  = new Date(r[COL_SESS.END_TIME]).toISOString().split('T')[0];
      const mins = parseInt(r[COL_SESS.MINUTES_SELF_REPORTED] || r[COL_SESS.DURATION_MIN], 10) || 0;
      result[key] = (result[key] || 0) + mins;
    });

  return result; // { 'YYYY-MM-DD': minutes, ... }
}

function _weeklyProgress_() {
  const wStart   = _weekStart_();
  const sessions = _allCompletedSessions_()
    .filter(r => r[COL_SESS.END_TIME] && new Date(r[COL_SESS.END_TIME]) >= wStart);

  const p = { german_sessions: 0, ielts_writing: 0, review_sessions: 0, mock_test: 0 };
  sessions.forEach(r => {
    const track = String(r[COL_SESS.TRACK]        || '');
    const type  = String(r[COL_SESS.SESSION_TYPE] || '');
    if (track.startsWith('German'))       p.german_sessions++;
    if (track === 'IELTS Writing')        p.ielts_writing++;
    if (type  === 'Review')               p.review_sessions++;
    if (track === 'IELTS Mock')           p.mock_test++;
  });
  return p;
}

function _defaultIntentions_() {
  return {
    german_sessions: { label: 'German sessions', target: 5, unit: 'sessions' },
    ielts_writing:   { label: 'IELTS Writing',   target: 3, unit: 'sessions' },
    review_sessions: { label: 'Review sessions', target: 2, unit: 'sessions' },
    mock_test:       { label: 'Mock test',        target: 1, unit: 'test'     },
  };
}