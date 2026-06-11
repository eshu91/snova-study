// ═══════════════════════════════════════════════════════════════════════════════
// 11_PracticeRepository.js — CRUD for PracticeLog sheet
// Four-level hierarchy: Book → Test → Module → Section
//
// type values: 'book', 'test', 'module', 'section'
// parent_id chains:
//   book.parent_id    = ''
//   test.parent_id    = book_id
//   module.parent_id  = test_id
//   section.parent_id = module_id
//
// Status auto-rolls up:
//   section done → all sections in module? → module done
//   module done  → all modules in test?   → test done
//   test done    → all tests in book?     → book done
// ═══════════════════════════════════════════════════════════════════════════════

// ── Templates ─────────────────────────────────────────────────────────────────
// Structure per test. When creating a book with a template, each test gets
// this module/section structure replicated.

var PRACTICE_TEMPLATES = {
  'IELTS Full Test': {
    modules: {
      'Listening': ['Section 1', 'Section 2', 'Section 3', 'Section 4'],
      'Reading':   ['Passage 1', 'Passage 2', 'Passage 3'],
      'Writing':   ['Task 1', 'Task 2'],
      'Speaking':  ['Part 1', 'Part 2', 'Part 3'],
    }
  },
  'IELTS Listening Only': {
    modules: {
      'Listening': ['Section 1', 'Section 2', 'Section 3', 'Section 4'],
    }
  },
  'IELTS Reading Only': {
    modules: {
      'Reading': ['Passage 1', 'Passage 2', 'Passage 3'],
    }
  },
  'IELTS Writing Only': {
    modules: {
      'Writing': ['Task 1', 'Task 2'],
    }
  },
  'Custom': {
    modules: {}
  },
};

// ── Read ──────────────────────────────────────────────────────────────────────

function getPracticeTemplates() {
  return Object.keys(PRACTICE_TEMPLATES);
}

function getPracticeTemplateStructure(templateName) {
  var tpl = PRACTICE_TEMPLATES[templateName];
  return tpl ? tpl.modules : null;
}

/**
 * Returns all practice data as a 4-level nested tree:
 * [ { ...book, tests: [ { ...test, modules: [ { ...mod, sections: [...] } ] } ] } ]
 */
function getAllPracticeData(track) {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var bookMap   = {};
  var testMap   = {};
  var moduleMap = {};
  var sections  = [];

  rows.forEach(function(r) {
    var type     = String(r[COL_PRAC.TYPE]);
    var rowTrack = String(r[COL_PRAC.TRACK]);
    if (track && track !== 'All' && rowTrack !== track) return;

    if (type === PRAC_TYPE_BOOK) {
      var b = _rowToEntry_(r);
      b.tests = [];
      bookMap[b.id] = b;
    } else if (type === PRAC_TYPE_TEST) {
      var t = _rowToEntry_(r);
      t.modules = [];
      testMap[t.id] = t;
    } else if (type === PRAC_TYPE_MODULE) {
      var m = _rowToEntry_(r);
      m.sections = [];
      moduleMap[m.id] = m;
    } else if (type === PRAC_TYPE_SECTION) {
      sections.push(r);
    }
  });

  // Attach sections → modules
  _sortRows_(sections).forEach(function(r) {
    var pid = String(r[COL_PRAC.PARENT_ID]);
    if (moduleMap[pid]) moduleMap[pid].sections.push(_rowToEntry_(r));
  });

  // Compute module progress, attach modules → tests
  Object.keys(moduleMap).forEach(function(mId) {
    var mod   = moduleMap[mId];
    var total = mod.sections.length;
    var done  = mod.sections.filter(function(s) { return s.status === PRAC_STATUS_DONE; }).length;
    mod.totalSections = total;
    mod.doneSections  = done;

    var pid = mod.parentId;
    if (testMap[pid]) testMap[pid].modules.push(mod);
  });

  // Compute test progress, attach tests → books
  Object.keys(testMap).forEach(function(tId) {
    var test = testMap[tId];
    test.modules.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var totalSec = 0, doneSec = 0;
    test.modules.forEach(function(m) { totalSec += m.totalSections; doneSec += m.doneSections; });
    test.totalSections = totalSec;
    test.doneSections  = doneSec;

    var pid = test.parentId;
    if (bookMap[pid]) bookMap[pid].tests.push(test);
  });

  // Compute book progress, sort
  var result = Object.keys(bookMap).map(function(bId) {
    var book = bookMap[bId];
    book.tests.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var totalSec = 0, doneSec = 0;
    book.tests.forEach(function(t) { totalSec += t.totalSections; doneSec += t.doneSections; });
    book.totalSections = totalSec;
    book.doneSections  = doneSec;
    return book;
  });

  result.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  return result;
}

/**
 * Summary for dashboard — counts only sections (leaf nodes).
 */
function getPracticeSummary() {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return { tracks: {}, total: { entered: 0, completed: 0 } };

  var tracks = {};
  var totalE = 0, totalC = 0;

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) !== PRAC_TYPE_SECTION) return;
    var t = String(r[COL_PRAC.TRACK]);
    if (!tracks[t]) tracks[t] = { entered: 0, completed: 0 };
    tracks[t].entered++; totalE++;
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) { tracks[t].completed++; totalC++; }
  });

  return { tracks: tracks, total: { entered: totalE, completed: totalC } };
}

/**
 * Upcoming due items for email triggers.
 */
function getUpcomingDueItems(daysAhead) {
  daysAhead = daysAhead || 1;
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var now = new Date(); now.setHours(0,0,0,0);
  var cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead + 1);

  var results = [], seen = {};
  rows.forEach(function(r) {
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) return;
    var dueRaw = r[COL_PRAC.DUE_DATE];
    if (!dueRaw) return;
    var due = new Date(dueRaw);
    if (isNaN(due.getTime())) return;
    due.setHours(0,0,0,0);
    var id = String(r[COL_PRAC.ID]);
    if (seen[id]) return;
    if ((due >= now && due < cutoff) || due < now) {
      var obj = _rowToEntry_(r);
      obj.dueDate   = due.toISOString().split('T')[0];
      obj.isOverdue = due < now;
      results.push(obj); seen[id] = true;
    }
  });
  return results;
}


// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Add a book. If templateName + testCount provided, auto-creates full structure.
 * params: { name, track, dueDate?, notes?, templateName?, testCount? }
 */
function addPracticeBook(params) {
  var name  = (params.name  || '').trim();
  var track = (params.track || '').trim();
  if (!name)  return { error: 'Book name is required.' };
  if (!track) return { error: 'Track is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found. Run runSetup().' };

  var bookId = _nextId_('bk', sheet);
  var now    = new Date().toISOString();
  var email  = getCurrentUserEmail_();

  _appendEntry_(sheet, {
    id: bookId, type: PRAC_TYPE_BOOK, parentId: '', track: track,
    name: name, dueDate: params.dueDate || '', notes: params.notes || '',
    sortOrder: _nextSortOrder_(sheet, ''), email: email, now: now
  });
  writeAudit('CREATE', SHEET_PRACTICE, bookId, 'book', '', name);

  // Template: auto-create tests → modules → sections
  var tplName   = (params.templateName || '').trim();
  var testCount = parseInt(params.testCount) || 0;

  if (tplName && PRACTICE_TEMPLATES[tplName] && testCount > 0) {
    var tpl = PRACTICE_TEMPLATES[tplName];

    for (var t = 1; t <= testCount; t++) {
      var testId = _nextId_('ts', sheet);
      _appendEntry_(sheet, {
        id: testId, type: PRAC_TYPE_TEST, parentId: bookId, track: track,
        name: 'Test ' + t, sortOrder: t, email: email, now: now
      });
      writeAudit('CREATE', SHEET_PRACTICE, testId, 'test', '', 'Test ' + t);

      var modOrder = 1;
      Object.keys(tpl.modules).forEach(function(modName) {
        var secNames = tpl.modules[modName];
        var modId = _nextId_('md', sheet);
        _appendEntry_(sheet, {
          id: modId, type: PRAC_TYPE_MODULE, parentId: testId, track: track,
          name: modName, sortOrder: modOrder++, email: email, now: now
        });
        writeAudit('CREATE', SHEET_PRACTICE, modId, 'module', '', modName);

        secNames.forEach(function(secName, idx) {
          var secId = _nextId_('sc', sheet);
          _appendEntry_(sheet, {
            id: secId, type: PRAC_TYPE_SECTION, parentId: modId, track: track,
            name: secName, sortOrder: idx + 1, email: email, now: now
          });
          writeAudit('CREATE', SHEET_PRACTICE, secId, 'section', '', secName);
        });
      });
    }
  }

  return { success: true, id: bookId };
}

/**
 * Add a test under a book.
 * params: { name, parentId (bookId) }
 */
function addPracticeTest(params) {
  var name     = (params.name     || '').trim();
  var parentId = (params.parentId || '').trim();
  if (!name)     return { error: 'Test name is required.' };
  if (!parentId) return { error: 'Book ID is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var rows   = _readPractice_();
  var parent = _findById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_BOOK)
    return { error: 'Parent book not found.' };

  var id    = _nextId_('ts', sheet);
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();
  var track = String(parent[COL_PRAC.TRACK]);

  _appendEntry_(sheet, {
    id: id, type: PRAC_TYPE_TEST, parentId: parentId, track: track,
    name: name, sortOrder: _nextSortOrder_(sheet, parentId), email: email, now: now
  });
  writeAudit('CREATE', SHEET_PRACTICE, id, 'test', '', name);
  return { success: true, id: id };
}

/**
 * Add a module under a test.
 * params: { name, parentId (testId) }
 */
function addPracticeModule(params) {
  var name     = (params.name     || '').trim();
  var parentId = (params.parentId || '').trim();
  if (!name)     return { error: 'Module name is required.' };
  if (!parentId) return { error: 'Test ID is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var rows   = _readPractice_();
  var parent = _findById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_TEST)
    return { error: 'Parent test not found.' };

  var id    = _nextId_('md', sheet);
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();
  var track = String(parent[COL_PRAC.TRACK]);

  _appendEntry_(sheet, {
    id: id, type: PRAC_TYPE_MODULE, parentId: parentId, track: track,
    name: name, sortOrder: _nextSortOrder_(sheet, parentId), email: email, now: now
  });
  writeAudit('CREATE', SHEET_PRACTICE, id, 'module', '', name);
  return { success: true, id: id };
}

/**
 * Add a single section under a module.
 * params: { name, parentId (moduleId), dueDate?, notes? }
 */
function addPracticeSection(params) {
  var name     = (params.name     || '').trim();
  var parentId = (params.parentId || '').trim();
  if (!name)     return { error: 'Section name is required.' };
  if (!parentId) return { error: 'Module ID is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var rows   = _readPractice_();
  var parent = _findById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_MODULE)
    return { error: 'Parent module not found.' };

  var id    = _nextId_('sc', sheet);
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();
  var track = String(parent[COL_PRAC.TRACK]);

  _appendEntry_(sheet, {
    id: id, type: PRAC_TYPE_SECTION, parentId: parentId, track: track,
    name: name, dueDate: params.dueDate || '', notes: params.notes || '',
    sortOrder: _nextSortOrder_(sheet, parentId), email: email, now: now
  });
  writeAudit('CREATE', SHEET_PRACTICE, id, 'section', '', name);
  return { success: true, id: id };
}

/**
 * Batch-add sections to a module.
 * params: { parentId, names: string[], dueDate? }
 */
function addPracticeSectionsBatch(params) {
  var parentId = (params.parentId || '').trim();
  var names    = params.names;
  if (!parentId) return { error: 'Module ID is required.' };
  if (!Array.isArray(names) || names.length === 0) return { error: 'At least one section name is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var rows   = _readPractice_();
  var parent = _findById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_MODULE)
    return { error: 'Parent module not found.' };

  var now     = new Date().toISOString();
  var email   = getCurrentUserEmail_();
  var track   = String(parent[COL_PRAC.TRACK]);
  var baseSO  = _nextSortOrder_(sheet, parentId);
  var dueDate = params.dueDate || '';
  var created = [];

  names.forEach(function(n, idx) {
    n = (n || '').trim();
    if (!n) return;
    var id = _nextId_('sc', sheet);
    _appendEntry_(sheet, {
      id: id, type: PRAC_TYPE_SECTION, parentId: parentId, track: track,
      name: n, dueDate: dueDate, sortOrder: baseSO + idx, email: email, now: now
    });
    writeAudit('CREATE', SHEET_PRACTICE, id, 'section', '', n);
    created.push(id);
  });

  return { success: true, ids: created, count: created.length };
}


// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Toggle a section's done/pending and auto-roll up: module → test → book.
 */
function togglePracticeSectionStatus(id) {
  if (!id) return { error: 'Section ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Section not found: ' + id };
  if (String(found.row[COL_PRAC.TYPE]) !== PRAC_TYPE_SECTION)
    return { error: 'Only sections can be toggled. Parents auto-compute.' };

  var oldStatus = String(found.row[COL_PRAC.STATUS]);
  var newStatus = oldStatus === PRAC_STATUS_DONE ? PRAC_STATUS_PENDING : PRAC_STATUS_DONE;
  var now       = new Date().toISOString();
  var email     = getCurrentUserEmail_();

  _writeStatus_(sheet, found.rowIndex, newStatus, now, email);
  writeAudit('UPDATE', SHEET_PRACTICE, id, 'status', oldStatus, newStatus);

  // Roll up: section → module → test → book
  var moduleId = String(found.row[COL_PRAC.PARENT_ID]);
  _rollUp_(sheet, moduleId);

  return { success: true, newStatus: newStatus };
}

/**
 * Update name, notes, dueDate, or sortOrder of any entry.
 */
function updatePracticeEntry(id, updates) {
  if (!id) return { error: 'ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Entry not found: ' + id };

  var changed = false;
  var fieldMap = {
    name: COL_PRAC.NAME, track: COL_PRAC.TRACK,
    dueDate: COL_PRAC.DUE_DATE, notes: COL_PRAC.NOTES, sortOrder: COL_PRAC.SORT_ORDER,
  };

  Object.keys(updates || {}).forEach(function(field) {
    var col = fieldMap[field];
    if (col === undefined) return;
    var before = String(found.row[col] || '');
    var after  = String(updates[field] || '');
    if (before === after) return;
    sheet.getRange(found.rowIndex, col + 1).setValue(after);
    writeAudit('UPDATE', SHEET_PRACTICE, id, field, before, after);
    changed = true;
  });

  return { success: true, changed: changed };
}

/**
 * Cascading delete:
 *   book    → tests → modules → sections
 *   test    → modules → sections
 *   module  → sections
 *   section → just itself
 */
function deletePracticeEntry(id) {
  if (!id) return { error: 'ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Entry not found: ' + id };

  var type    = String(found.row[COL_PRAC.TYPE]);
  var name    = String(found.row[COL_PRAC.NAME]);
  var allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length).getValues();

  // Collect all descendant row indices to delete
  var idsToDelete = _collectDescendants_(allRows, id, type);
  idsToDelete.push(id);

  var rowNums = [];
  for (var i = 0; i < allRows.length; i++) {
    if (idsToDelete.indexOf(String(allRows[i][COL_PRAC.ID])) !== -1) {
      rowNums.push(i + 2);
    }
  }

  // Delete bottom-up for index stability
  rowNums.sort(function(a, b) { return b - a; });
  rowNums.forEach(function(ri) { sheet.deleteRow(ri); });
  writeAudit('DELETE', SHEET_PRACTICE, id, type + '+children', name, '');

  // Roll up parent if needed
  var parentId = String(found.row[COL_PRAC.PARENT_ID]);
  if (parentId) {
    try { _rollUp_(sheet, parentId); } catch(e) { /* parent may be deleted */ }
  }

  return { success: true };
}


// ── Private helpers ───────────────────────────────────────────────────────────

function _practiceSheet_() {
  return SpreadsheetApp.getActive().getSheetByName(SHEET_PRACTICE);
}

function _readPractice_() {
  var sheet = _practiceSheet_();
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length)
    .getValues().filter(function(r) { return r[COL_PRAC.ID]; });
}

function _findRow_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return { rowIndex: null, row: null };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_PRAC.ID]) === id) return { rowIndex: i + 2, row: rows[i] };
  }
  return { rowIndex: null, row: null };
}

function _findById_(rows, id) {
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_PRAC.ID]) === id) return rows[i];
  }
  return null;
}

function _nextId_(prefix, sheet) {
  return 'prac_' + prefix + '_' + String(sheet.getLastRow()).padStart(5, '0');
}

function _nextSortOrder_(sheet, parentId) {
  if (sheet.getLastRow() < 2) return 1;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length).getValues();
  var max  = 0;
  rows.forEach(function(r) {
    var matches = parentId
      ? String(r[COL_PRAC.PARENT_ID]) === parentId
      : String(r[COL_PRAC.TYPE]) === PRAC_TYPE_BOOK;
    if (matches) {
      var so = parseInt(r[COL_PRAC.SORT_ORDER]) || 0;
      if (so > max) max = so;
    }
  });
  return max + 1;
}

function _appendEntry_(sheet, p) {
  var row = HDR_PRACTICE.map(function() { return ''; });
  row[COL_PRAC.ID]         = p.id;
  row[COL_PRAC.TYPE]       = p.type;
  row[COL_PRAC.PARENT_ID]  = p.parentId || '';
  row[COL_PRAC.TRACK]      = p.track || '';
  row[COL_PRAC.NAME]       = p.name || '';
  row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
  row[COL_PRAC.DUE_DATE]   = p.dueDate || '';
  row[COL_PRAC.COMPLETED_DATE] = '';
  row[COL_PRAC.COMPLETED_BY]   = '';
  row[COL_PRAC.SORT_ORDER] = p.sortOrder || 0;
  row[COL_PRAC.NOTES]      = p.notes || '';
  row[COL_PRAC.ADDED_BY]   = p.email || '';
  row[COL_PRAC.ADDED_ON]   = p.now || new Date().toISOString();
  sheet.appendRow(row);
}

function _rowToEntry_(r) {
  return {
    id:            String(r[COL_PRAC.ID]),
    type:          String(r[COL_PRAC.TYPE]),
    parentId:      String(r[COL_PRAC.PARENT_ID] || ''),
    track:         String(r[COL_PRAC.TRACK]),
    name:          String(r[COL_PRAC.NAME]),
    status:        String(r[COL_PRAC.STATUS]),
    dueDate:       _fmtDate_(r[COL_PRAC.DUE_DATE]),
    completedDate: _fmtDate_(r[COL_PRAC.COMPLETED_DATE]),
    completedBy:   String(r[COL_PRAC.COMPLETED_BY] || ''),
    notes:         String(r[COL_PRAC.NOTES] || ''),
    sortOrder:     parseInt(r[COL_PRAC.SORT_ORDER]) || 0,
    addedBy:       String(r[COL_PRAC.ADDED_BY] || ''),
    addedOn:       _fmtDate_(r[COL_PRAC.ADDED_ON]),
  };
}

function _fmtDate_(v) {
  if (!v) return '';
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().split('T')[0];
}

function _sortRows_(rows) {
  return rows.sort(function(a, b) {
    return (parseInt(a[COL_PRAC.SORT_ORDER]) || 0) - (parseInt(b[COL_PRAC.SORT_ORDER]) || 0);
  });
}

function _writeStatus_(sheet, rowIndex, status, now, email) {
  sheet.getRange(rowIndex, COL_PRAC.STATUS + 1).setValue(status);
  sheet.getRange(rowIndex, COL_PRAC.COMPLETED_DATE + 1).setValue(
    status === PRAC_STATUS_DONE ? now : ''
  );
  sheet.getRange(rowIndex, COL_PRAC.COMPLETED_BY + 1).setValue(
    status === PRAC_STATUS_DONE ? email : ''
  );
}

/**
 * Roll up status from a given node upward to root.
 * Called with the moduleId after a section toggle.
 * Walks: module → test → book.
 */
function _rollUp_(sheet, nodeId) {
  if (!nodeId) return;
  var rows  = _readPractice_();
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();

  // Walk up the parent chain
  var currentId = nodeId;
  while (currentId) {
    var found = _findRow_(sheet, currentId);
    if (!found.rowIndex) break;

    var currentType   = String(found.row[COL_PRAC.TYPE]);
    var currentStatus = String(found.row[COL_PRAC.STATUS]);

    // What child type to check?
    var childType = null;
    if (currentType === PRAC_TYPE_MODULE) childType = PRAC_TYPE_SECTION;
    else if (currentType === PRAC_TYPE_TEST) childType = PRAC_TYPE_MODULE;
    else if (currentType === PRAC_TYPE_BOOK) childType = PRAC_TYPE_TEST;
    else break;

    // Re-read rows (may have changed from previous iteration's write)
    rows = _readPractice_();

    var allDone    = true;
    var hasChildren = false;
    rows.forEach(function(r) {
      if (String(r[COL_PRAC.TYPE]) === childType &&
          String(r[COL_PRAC.PARENT_ID]) === currentId) {
        hasChildren = true;
        if (String(r[COL_PRAC.STATUS]) !== PRAC_STATUS_DONE) allDone = false;
      }
    });

    if (!hasChildren) break;

    if (allDone && currentStatus !== PRAC_STATUS_DONE) {
      _writeStatus_(sheet, found.rowIndex, PRAC_STATUS_DONE, now, email);
      writeAudit('UPDATE', SHEET_PRACTICE, currentId, 'status', currentStatus, PRAC_STATUS_DONE + ' (auto)');
    } else if (!allDone && currentStatus === PRAC_STATUS_DONE) {
      _writeStatus_(sheet, found.rowIndex, PRAC_STATUS_PENDING, now, email);
      writeAudit('UPDATE', SHEET_PRACTICE, currentId, 'status', currentStatus, PRAC_STATUS_PENDING + ' (auto)');
    }

    // Walk up
    currentId = String(found.row[COL_PRAC.PARENT_ID]);
  }
}

/**
 * Collect all descendant IDs for cascading delete.
 */
function _collectDescendants_(allRows, parentId, parentType) {
  var childIds = [];
  var childTypeMap = {};
  childTypeMap[PRAC_TYPE_BOOK]   = PRAC_TYPE_TEST;
  childTypeMap[PRAC_TYPE_TEST]   = PRAC_TYPE_MODULE;
  childTypeMap[PRAC_TYPE_MODULE] = PRAC_TYPE_SECTION;

  var childType = childTypeMap[parentType];
  if (!childType) return [];

  allRows.forEach(function(r) {
    if (String(r[COL_PRAC.PARENT_ID]) === parentId &&
        String(r[COL_PRAC.TYPE]) === childType) {
      var cid = String(r[COL_PRAC.ID]);
      childIds.push(cid);
      // Recurse deeper
      var deeper = _collectDescendants_(allRows, cid, childType);
      childIds = childIds.concat(deeper);
    }
  });

  return childIds;
}