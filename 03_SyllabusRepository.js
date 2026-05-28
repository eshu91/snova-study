// ── Public API (callable by google.script.run) ────────────────────────────────

function getTopicsByLevel(level) {
  const rows = readSyllabus_(level);
  if (rows.error) return rows;
  return rows.filter(r => r[COL_SYL.STATUS] !== STATUS_ARCHIVED).map(rowToTopic_);
}

function getTopicStats(level) {
  const rows = readSyllabus_(level);
  if (rows.error) return { total: 0, notStarted: 0, learning: 0, mastered: 0 };
  const active = rows.filter(r => r[COL_SYL.STATUS] !== STATUS_ARCHIVED);
  return {
    total:      active.length,
    notStarted: active.filter(r => r[COL_SYL.STATUS] === STATUS_NOT_STARTED).length,
    learning:   active.filter(r => r[COL_SYL.STATUS] === STATUS_LEARNING).length,
    mastered:   active.filter(r => r[COL_SYL.STATUS] === STATUS_MASTERED).length,
  };
}

function addTopic(params) {
  const { level, category, topic, status, notes, resources, prerequisites, collaboratorNote } = params || {};
  if (!level)    return { error: 'level is required.' };
  if (!category) return { error: 'category is required.' };
  if (!topic)    return { error: 'topic name is required.' };

  const sheetName = SYLLABUS_SHEETS[level];
  if (!sheetName) return { error: 'Unknown level: ' + level };
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet)     return { error: 'Sheet not found: ' + sheetName };

  const id      = generateTopicId_(sheet, level, category);
  const now     = new Date().toISOString();
  const email   = getCurrentUserEmail_();
  const st      = status || STATUS_NOT_STARTED;
  const startOn = (st === STATUS_LEARNING || st === STATUS_MASTERED) ? now : '';
  const mastOn  = st === STATUS_MASTERED ? now : '';

  sheet.appendRow([
    id, category, topic, st,
    startOn, mastOn, '',
    notes || '', resources || '', prerequisites || '', collaboratorNote || '',
    email, now,
  ]);

  writeAudit('CREATE', sheetName, id, 'topic', '', topic);
  return { success: true, id };
}

function updateTopic(id, changes) {
  if (!id) return { error: 'Topic ID is required.' };

  const { sheet, rowIndex, row } = findTopicRow_(id);
  if (!sheet) return { error: 'Topic not found: ' + id };

  const colMap = {
    category:         COL_SYL.CATEGORY,
    topic:            COL_SYL.TOPIC,
    status:           COL_SYL.STATUS,
    notes:            COL_SYL.NOTES,
    resources:        COL_SYL.RESOURCES,
    prerequisites:    COL_SYL.PREREQUISITES,
    collaboratorNote: COL_SYL.COLLABORATOR_NOTE,
  };

  const now = new Date().toISOString();
  let changed = false;

  Object.entries(changes).forEach(([field, newVal]) => {
    const col = colMap[field];
    if (col === undefined) return;

    const before = String(row[col] ?? '');
    const after  = String(newVal ?? '');
    if (before === after) return;

    sheet.getRange(rowIndex, col + 1).setValue(after);
    writeAudit('UPDATE', sheet.getName(), id, field, before, after);
    changed = true;

    if (field === 'status') {
      if (newVal === STATUS_LEARNING && !row[COL_SYL.STARTED_ON]) {
        sheet.getRange(rowIndex, COL_SYL.STARTED_ON + 1).setValue(now);
      }
      if (newVal === STATUS_MASTERED) {
        if (!row[COL_SYL.STARTED_ON])  sheet.getRange(rowIndex, COL_SYL.STARTED_ON  + 1).setValue(now);
        if (!row[COL_SYL.MASTERED_ON]) sheet.getRange(rowIndex, COL_SYL.MASTERED_ON + 1).setValue(now);
      }
    }
  });

  return { success: true, changed };
}

function archiveTopic(id) {
  if (!id) return { error: 'Topic ID is required.' };
  const { sheet, rowIndex, row } = findTopicRow_(id);
  if (!sheet) return { error: 'Topic not found: ' + id };

  const before = String(row[COL_SYL.STATUS]);
  sheet.getRange(rowIndex, COL_SYL.STATUS + 1).setValue(STATUS_ARCHIVED);
  writeAudit('ARCHIVE', sheet.getName(), id, 'status', before, STATUS_ARCHIVED);
  return { success: true };
}

function searchTopics(query) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase();

  const results = [];
  Object.entries(SYLLABUS_SHEETS).forEach(([level, sheetName]) => {
    const rows = readSyllabus_(level);
    if (rows.error) return;
    rows
      .filter(r => r[COL_SYL.STATUS] !== STATUS_ARCHIVED)
      .filter(r =>
        String(r[COL_SYL.TOPIC]).toLowerCase().includes(q) ||
        String(r[COL_SYL.CATEGORY]).toLowerCase().includes(q) ||
        String(r[COL_SYL.NOTES]).toLowerCase().includes(q)
      )
      .forEach(r => results.push({ ...rowToTopic_(r), level }));
  });

  return results.slice(0, 20);
}

function getTotalMinutesPerTopic() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  if (!sheet || sheet.getLastRow() < 2) return {};

  const result = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SESSIONS.length).getValues()
    .filter(r => r[COL_SESS.STATUS] === 'completed')
    .forEach(r => {
      const mins = parseInt(r[COL_SESS.MINUTES_SELF_REPORTED] || r[COL_SESS.DURATION_MIN], 10) || 0;
      if (mins === 0) return;
      String(r[COL_SESS.TOPIC_IDS] || '')
        .split(',').map(s => s.trim()).filter(Boolean)
        .forEach(id => { result[id] = (result[id] || 0) + mins; });
    });
  return result;
}

// Returns active (Learning / Not started) topics for the timer chip list.
// For IELTS tracks, filtered to the relevant categories.
function getTopicsForTrack(track) {
  const level = TRACK_TO_LEVEL[track];
  if (!level) return [];

  const IELTS_FILTER = {
    'IELTS Reading':   ['Skills','Question types','Strategy','Vocabulary'],
    'IELTS Writing':   ['Task 1 — Chart types','Task 1 — Structure','Task 1 — Language',
                        'Task 1 — Strategy','Task 2 — Essay types','Task 2 — Structure',
                        'Task 2 — Language','Task 2 — Topic vocab','Task 2 — Strategy',
                        'Assessment criteria','Common errors'],
    'IELTS Listening': ['Skills','Question types','Strategy','Accents'],
    'IELTS Speaking':  ['Part 1 — Topics','Part 1 — Strategy','Part 2 — Cue card types',
                        'Part 2 — Structure','Part 3 — Discussion','Assessment criteria',
                        'Pronunciation','Fluency','Strategy'],
  };

  const rows = readSyllabus_(level);
  if (rows.error) return [];

  const cats = IELTS_FILTER[track];
  return rows
    .filter(r => r[COL_SYL.STATUS] !== STATUS_ARCHIVED && r[COL_SYL.STATUS] !== STATUS_MASTERED)
    .filter(r => !cats || cats.includes(String(r[COL_SYL.CATEGORY])))
    .slice(0, 25)
    .map(r => ({
      id:     String(r[COL_SYL.ID]),
      topic:  String(r[COL_SYL.TOPIC]),
      status: String(r[COL_SYL.STATUS]),
    }));
}

// ── Private helpers ───────────────────────────────────────────────────────────

function readSyllabus_(level) {
  const sheetName = SYLLABUS_SHEETS[level];
  if (!sheetName) return { error: 'Unknown level: ' + level };
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet)     return { error: 'Sheet not found: ' + sheetName };
  if (sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, HDR_SYLLABUS.length)
    .getValues()
    .filter(r => r[COL_SYL.ID]);
}

function findTopicRow_(id) {
  for (const [level, sheetName] of Object.entries(SYLLABUS_SHEETS)) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) continue;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_SYLLABUS.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][COL_SYL.ID]) === id)
        return { sheet, rowIndex: i + 2, row: rows[i], level };
    }
  }
  return { sheet: null, rowIndex: null, row: null, level: null };
}

function rowToTopic_(r) {
  const fmt = v => v ? new Date(v).toISOString() : '';
  return {
    id:               String(r[COL_SYL.ID]),
    category:         String(r[COL_SYL.CATEGORY]         || ''),
    topic:            String(r[COL_SYL.TOPIC]             || ''),
    status:           String(r[COL_SYL.STATUS]            || STATUS_NOT_STARTED),
    startedOn:        fmt(r[COL_SYL.STARTED_ON]),
    masteredOn:       fmt(r[COL_SYL.MASTERED_ON]),
    lastReviewed:     fmt(r[COL_SYL.LAST_REVIEWED]),
    notes:            String(r[COL_SYL.NOTES]             || ''),
    resources:        String(r[COL_SYL.RESOURCES]         || ''),
    prerequisites:    String(r[COL_SYL.PREREQUISITES]     || ''),
    collaboratorNote: String(r[COL_SYL.COLLABORATOR_NOTE] || ''),
    addedBy:          String(r[COL_SYL.ADDED_BY]          || ''),
    addedOn:          fmt(r[COL_SYL.ADDED_ON]),
  };
}

function generateTopicId_(sheet, level, category) {
  const GERMAN_CODES = {
    'Grammar':'GR','Vocabulary':'VO','Reading':'RE','Writing':'WR',
    'Listening':'LI','Speaking':'SP','Culture/Communication':'CU',
  };
  const prefix = level === 'IELTS'
    ? 'IELTS-UC-'
    : level + '-' + (GERMAN_CODES[category] || 'XX') + '-';

  const existing = new Set();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
      .forEach(r => { if (String(r[0]).startsWith(prefix)) existing.add(String(r[0])); });
  }
  let n = 1;
  let id;
  do { id = prefix + String(n++).padStart(3, '0'); } while (existing.has(id));
  return id;
}