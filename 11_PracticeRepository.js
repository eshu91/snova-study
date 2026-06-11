// ═══════════════════════════════════════════════════════════════════════════════
// 11_PracticeRepository.js — CRUD for PracticeLog sheet
// Three-level hierarchy: Book → Module → Section
//
// type values: 'book', 'module', 'section'
// parent_id:   '' for books, book_id for modules, module_id for sections
//
// Status auto-rolls up:
//   section done → check if all sections in module done → auto-complete module
//   module done  → check if all modules in book done → auto-complete book
// ═══════════════════════════════════════════════════════════════════════════════

// ── Templates ─────────────────────────────────────────────────────────────────
// Configurable book structure templates. When Snova adds a book she can pick
// a template and the system auto-creates modules + sections in one shot.
// Each key is a template name; value is { modules: { name: [sections] } }.

var PRACTICE_TEMPLATES = {
  'IELTS Standard': {
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

/**
 * Returns the list of available template names for the UI.
 */
function getPracticeTemplates() {
  return Object.keys(PRACTICE_TEMPLATES);
}

/**
 * Returns the structure of a specific template (for preview in UI).
 */
function getPracticeTemplateStructure(templateName) {
  var tpl = PRACTICE_TEMPLATES[templateName];
  if (!tpl) return null;
  return tpl.modules;
}

/**
 * Returns all practice data as a 3-level nested tree:
 * [ { ...book, modules: [ { ...module, sections: [ {...section} ] } ] } ]
 * Optionally filtered by track.
 */
function getAllPracticeData(track) {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var bookMap    = {};   // id → book object
  var moduleMap  = {};   // id → module object
  var sections   = [];   // raw section rows

  rows.forEach(function(r) {
    var type = String(r[COL_PRAC.TYPE]);
    var rowTrack = String(r[COL_PRAC.TRACK]);

    if (track && track !== 'All' && rowTrack !== track) return;

    if (type === PRAC_TYPE_BOOK) {
      var b = _rowToEntry_(r);
      b.modules = [];
      bookMap[b.id] = b;
    } else if (type === PRAC_TYPE_MODULE) {
      var m = _rowToEntry_(r);
      m.sections = [];
      moduleMap[m.id] = m;
    } else if (type === PRAC_TYPE_SECTION) {
      sections.push(r);
    }
  });

  // Attach sections to modules
  sections
    .sort(function(a, b) {
      return (parseInt(a[COL_PRAC.SORT_ORDER]) || 0) - (parseInt(b[COL_PRAC.SORT_ORDER]) || 0);
    })
    .forEach(function(r) {
      var parentId = String(r[COL_PRAC.PARENT_ID]);
      if (moduleMap[parentId]) {
        moduleMap[parentId].sections.push(_rowToEntry_(r));
      }
    });

  // Attach modules to books, compute progress
  Object.keys(moduleMap).forEach(function(mId) {
    var mod = moduleMap[mId];
    var parentId = mod.parentId;
    // Compute module progress from sections
    var total = mod.sections.length;
    var done  = mod.sections.filter(function(s) { return s.status === PRAC_STATUS_DONE; }).length;
    mod.totalSections = total;
    mod.doneSections  = done;

    if (bookMap[parentId]) {
      bookMap[parentId].modules.push(mod);
    }
  });

  // Sort modules within each book, compute book progress
  var result = Object.keys(bookMap).map(function(bId) {
    var book = bookMap[bId];
    book.modules.sort(function(a, b) {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    // Book progress = total sections across all modules
    var totalSections = 0;
    var doneSections  = 0;
    book.modules.forEach(function(m) {
      totalSections += m.totalSections;
      doneSections  += m.doneSections;
    });
    book.totalSections = totalSections;
    book.doneSections  = doneSections;
    return book;
  });

  result.sort(function(a, b) {
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  return result;
}

/**
 * Summary for dashboard widget — counts only sections (leaf nodes).
 */
function getPracticeSummary() {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return { tracks: {}, total: { entered: 0, completed: 0 } };

  var tracks = {};
  var totalEntered   = 0;
  var totalCompleted = 0;

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) !== PRAC_TYPE_SECTION) return;
    var t = String(r[COL_PRAC.TRACK]);
    if (!tracks[t]) tracks[t] = { entered: 0, completed: 0 };
    tracks[t].entered++;
    totalEntered++;
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) {
      tracks[t].completed++;
      totalCompleted++;
    }
  });

  return {
    tracks: tracks,
    total: { entered: totalEntered, completed: totalCompleted }
  };
}

/**
 * Upcoming due items for email triggers — only sections and modules with due dates.
 */
function getUpcomingDueItems(daysAhead) {
  daysAhead = daysAhead || 1;
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var now = new Date();
  now.setHours(0, 0, 0, 0);
  var cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead + 1);

  var results = [];
  var seen = {};

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) return;
    var dueRaw = r[COL_PRAC.DUE_DATE];
    if (!dueRaw) return;

    var due = new Date(dueRaw);
    if (isNaN(due.getTime())) return;
    due.setHours(0, 0, 0, 0);

    var id = String(r[COL_PRAC.ID]);
    if (seen[id]) return;

    // Include if due within window OR overdue
    if ((due >= now && due < cutoff) || due < now) {
      var obj = _rowToEntry_(r);
      obj.dueDate   = due.toISOString().split('T')[0];
      obj.isOverdue = due < now;
      results.push(obj);
      seen[id] = true;
    }
  });

  return results;
}


// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Add a book. If templateName is provided, auto-creates modules + sections.
 * params: { name, track, dueDate?, notes?, templateName? }
 */
function addPracticeBook(params) {
  var name  = (params.name  || '').trim();
  var track = (params.track || '').trim();
  if (!name)  return { error: 'Book name is required.' };
  if (!track) return { error: 'Track is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found. Run runSetup().' };

  var bookId  = _nextPracticeId_('bk', sheet);
  var now     = new Date().toISOString();
  var email   = getCurrentUserEmail_();

  var row = _emptyPracticeRow_();
  row[COL_PRAC.ID]         = bookId;
  row[COL_PRAC.TYPE]       = PRAC_TYPE_BOOK;
  row[COL_PRAC.PARENT_ID]  = '';
  row[COL_PRAC.TRACK]      = track;
  row[COL_PRAC.NAME]       = name;
  row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
  row[COL_PRAC.DUE_DATE]   = params.dueDate || '';
  row[COL_PRAC.COMPLETED_DATE] = '';
  row[COL_PRAC.COMPLETED_BY]   = '';
  row[COL_PRAC.SORT_ORDER] = _nextSortOrder_(sheet, '');
  row[COL_PRAC.NOTES]      = params.notes || '';
  row[COL_PRAC.ADDED_BY]   = email;
  row[COL_PRAC.ADDED_ON]   = now;

  sheet.appendRow(row);
  writeAudit('CREATE', SHEET_PRACTICE, bookId, 'book', '', name);

  // If template provided, auto-create modules + sections
  var templateName = (params.templateName || '').trim();
  if (templateName && PRACTICE_TEMPLATES[templateName]) {
    var tpl = PRACTICE_TEMPLATES[templateName];
    var modOrder = 1;

    Object.keys(tpl.modules).forEach(function(modName) {
      var sectionNames = tpl.modules[modName];
      var modId = _nextPracticeId_('mod', sheet);

      var modRow = _emptyPracticeRow_();
      modRow[COL_PRAC.ID]         = modId;
      modRow[COL_PRAC.TYPE]       = PRAC_TYPE_MODULE;
      modRow[COL_PRAC.PARENT_ID]  = bookId;
      modRow[COL_PRAC.TRACK]      = track;
      modRow[COL_PRAC.NAME]       = modName;
      modRow[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
      modRow[COL_PRAC.SORT_ORDER] = modOrder++;
      modRow[COL_PRAC.ADDED_BY]   = email;
      modRow[COL_PRAC.ADDED_ON]   = now;

      sheet.appendRow(modRow);
      writeAudit('CREATE', SHEET_PRACTICE, modId, 'module', '', modName);

      // Create sections within module
      sectionNames.forEach(function(secName, idx) {
        var secId = _nextPracticeId_('sec', sheet);

        var secRow = _emptyPracticeRow_();
        secRow[COL_PRAC.ID]         = secId;
        secRow[COL_PRAC.TYPE]       = PRAC_TYPE_SECTION;
        secRow[COL_PRAC.PARENT_ID]  = modId;
        secRow[COL_PRAC.TRACK]      = track;
        secRow[COL_PRAC.NAME]       = secName;
        secRow[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
        secRow[COL_PRAC.SORT_ORDER] = idx + 1;
        secRow[COL_PRAC.ADDED_BY]   = email;
        secRow[COL_PRAC.ADDED_ON]   = now;

        sheet.appendRow(secRow);
        writeAudit('CREATE', SHEET_PRACTICE, secId, 'section', '', secName);
      });
    });
  }

  return { success: true, id: bookId };
}

/**
 * Add a module under a book.
 * params: { name, parentId (bookId) }
 */
function addPracticeModule(params) {
  var name     = (params.name     || '').trim();
  var parentId = (params.parentId || '').trim();
  if (!name)     return { error: 'Module name is required.' };
  if (!parentId) return { error: 'Book ID is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  // Verify parent is a book
  var rows = _readPractice_();
  var parent = _findRowById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_BOOK) {
    return { error: 'Parent book not found: ' + parentId };
  }

  var modId = _nextPracticeId_('mod', sheet);
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();
  var track = String(parent[COL_PRAC.TRACK]);

  var row = _emptyPracticeRow_();
  row[COL_PRAC.ID]         = modId;
  row[COL_PRAC.TYPE]       = PRAC_TYPE_MODULE;
  row[COL_PRAC.PARENT_ID]  = parentId;
  row[COL_PRAC.TRACK]      = track;
  row[COL_PRAC.NAME]       = name;
  row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
  row[COL_PRAC.SORT_ORDER] = _nextSortOrder_(sheet, parentId);
  row[COL_PRAC.ADDED_BY]   = email;
  row[COL_PRAC.ADDED_ON]   = now;

  sheet.appendRow(row);
  writeAudit('CREATE', SHEET_PRACTICE, modId, 'module', '', name);

  return { success: true, id: modId };
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

  var rows = _readPractice_();
  var parent = _findRowById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_MODULE) {
    return { error: 'Parent module not found: ' + parentId };
  }

  var secId = _nextPracticeId_('sec', sheet);
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();
  var track = String(parent[COL_PRAC.TRACK]);

  var row = _emptyPracticeRow_();
  row[COL_PRAC.ID]         = secId;
  row[COL_PRAC.TYPE]       = PRAC_TYPE_SECTION;
  row[COL_PRAC.PARENT_ID]  = parentId;
  row[COL_PRAC.TRACK]      = track;
  row[COL_PRAC.NAME]       = name;
  row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
  row[COL_PRAC.DUE_DATE]   = params.dueDate || '';
  row[COL_PRAC.SORT_ORDER] = _nextSortOrder_(sheet, parentId);
  row[COL_PRAC.NOTES]      = params.notes || '';
  row[COL_PRAC.ADDED_BY]   = email;
  row[COL_PRAC.ADDED_ON]   = now;

  sheet.appendRow(row);
  writeAudit('CREATE', SHEET_PRACTICE, secId, 'section', '', name);

  return { success: true, id: secId };
}

/**
 * Batch-add sections to a module.
 * params: { parentId (moduleId), names: string[], dueDate? }
 */
function addPracticeSectionsBatch(params) {
  var parentId = (params.parentId || '').trim();
  var names    = params.names;
  if (!parentId) return { error: 'Module ID is required.' };
  if (!Array.isArray(names) || names.length === 0) return { error: 'At least one section name is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var rows = _readPractice_();
  var parent = _findRowById_(rows, parentId);
  if (!parent || String(parent[COL_PRAC.TYPE]) !== PRAC_TYPE_MODULE) {
    return { error: 'Parent module not found: ' + parentId };
  }

  var now     = new Date().toISOString();
  var email   = getCurrentUserEmail_();
  var track   = String(parent[COL_PRAC.TRACK]);
  var baseSO  = _nextSortOrder_(sheet, parentId);
  var dueDate = params.dueDate || '';
  var created = [];

  names.forEach(function(n, idx) {
    n = (n || '').trim();
    if (!n) return;
    var secId = _nextPracticeId_('sec', sheet);

    var row = _emptyPracticeRow_();
    row[COL_PRAC.ID]         = secId;
    row[COL_PRAC.TYPE]       = PRAC_TYPE_SECTION;
    row[COL_PRAC.PARENT_ID]  = parentId;
    row[COL_PRAC.TRACK]      = track;
    row[COL_PRAC.NAME]       = n;
    row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
    row[COL_PRAC.DUE_DATE]   = dueDate;
    row[COL_PRAC.SORT_ORDER] = baseSO + idx;
    row[COL_PRAC.ADDED_BY]   = email;
    row[COL_PRAC.ADDED_ON]   = now;

    sheet.appendRow(row);
    writeAudit('CREATE', SHEET_PRACTICE, secId, 'section', '', n);
    created.push(secId);
  });

  return { success: true, ids: created, count: created.length };
}


// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Toggle a section's done/pending status and auto-roll up to module → book.
 */
function togglePracticeSectionStatus(id) {
  if (!id) return { error: 'Section ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findPracticeRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Section not found: ' + id };

  var type = String(found.row[COL_PRAC.TYPE]);
  // Only sections can be directly toggled
  if (type !== PRAC_TYPE_SECTION) {
    return { error: 'Only sections can be toggled. Modules and books auto-compute.' };
  }

  var oldStatus = String(found.row[COL_PRAC.STATUS]);
  var newStatus = oldStatus === PRAC_STATUS_DONE ? PRAC_STATUS_PENDING : PRAC_STATUS_DONE;
  var now       = new Date().toISOString();
  var email     = getCurrentUserEmail_();

  sheet.getRange(found.rowIndex, COL_PRAC.STATUS + 1).setValue(newStatus);
  sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_DATE + 1).setValue(
    newStatus === PRAC_STATUS_DONE ? now : ''
  );
  sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_BY + 1).setValue(
    newStatus === PRAC_STATUS_DONE ? email : ''
  );

  writeAudit('UPDATE', SHEET_PRACTICE, id, 'status', oldStatus, newStatus);

  // Auto-roll up: section → module → book
  var moduleId = String(found.row[COL_PRAC.PARENT_ID]);
  _autoRollUpStatus_(sheet, moduleId);

  return { success: true, newStatus: newStatus };
}

/**
 * Update name, notes, dueDate, or sortOrder of any entry.
 */
function updatePracticeEntry(id, updates) {
  if (!id) return { error: 'ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findPracticeRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Entry not found: ' + id };

  var changed = false;
  var fieldMap = {
    name:      COL_PRAC.NAME,
    track:     COL_PRAC.TRACK,
    dueDate:   COL_PRAC.DUE_DATE,
    notes:     COL_PRAC.NOTES,
    sortOrder: COL_PRAC.SORT_ORDER,
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
 * Delete an entry. Cascading:
 *   book   → deletes all its modules and their sections
 *   module → deletes all its sections
 *   section → just deletes itself
 */
function deletePracticeEntry(id) {
  if (!id) return { error: 'ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findPracticeRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Entry not found: ' + id };

  var type = String(found.row[COL_PRAC.TYPE]);
  var name = String(found.row[COL_PRAC.NAME]);
  var allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length).getValues();

  var toDelete = [];

  if (type === PRAC_TYPE_BOOK) {
    // Find all modules of this book
    var moduleIds = [];
    for (var i = 0; i < allRows.length; i++) {
      if (String(allRows[i][COL_PRAC.PARENT_ID]) === id &&
          String(allRows[i][COL_PRAC.TYPE]) === PRAC_TYPE_MODULE) {
        moduleIds.push(String(allRows[i][COL_PRAC.ID]));
        toDelete.push(i + 2);
      }
    }
    // Find all sections of those modules
    for (var j = 0; j < allRows.length; j++) {
      if (moduleIds.indexOf(String(allRows[j][COL_PRAC.PARENT_ID])) !== -1 &&
          String(allRows[j][COL_PRAC.TYPE]) === PRAC_TYPE_SECTION) {
        toDelete.push(j + 2);
      }
    }
    toDelete.push(found.rowIndex);
    writeAudit('DELETE', SHEET_PRACTICE, id, 'book+children', name, '');

  } else if (type === PRAC_TYPE_MODULE) {
    // Find all sections of this module
    for (var k = 0; k < allRows.length; k++) {
      if (String(allRows[k][COL_PRAC.PARENT_ID]) === id &&
          String(allRows[k][COL_PRAC.TYPE]) === PRAC_TYPE_SECTION) {
        toDelete.push(k + 2);
      }
    }
    toDelete.push(found.rowIndex);
    writeAudit('DELETE', SHEET_PRACTICE, id, 'module+sections', name, '');

  } else {
    toDelete.push(found.rowIndex);
    writeAudit('DELETE', SHEET_PRACTICE, id, 'section', name, '');
  }

  // Delete from bottom to top to keep indices stable
  toDelete = _uniqueSort_(toDelete);
  toDelete.forEach(function(ri) { sheet.deleteRow(ri); });

  // If we deleted a section or module, re-check parent status
  if (type === PRAC_TYPE_SECTION) {
    var moduleId = String(found.row[COL_PRAC.PARENT_ID]);
    // Module might have been deleted if sheet changed, but try
    try { _autoRollUpStatus_(sheet, moduleId); } catch(e) { /* ignore */ }
  } else if (type === PRAC_TYPE_MODULE) {
    var bookId = String(found.row[COL_PRAC.PARENT_ID]);
    try { _autoRollUpParent_(sheet, bookId, _readPractice_()); } catch(e) { /* ignore */ }
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
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length)
    .getValues()
    .filter(function(r) { return r[COL_PRAC.ID]; });
}

function _findPracticeRow_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return { rowIndex: null, row: null };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_PRAC.ID]) === id) {
      return { rowIndex: i + 2, row: rows[i] };
    }
  }
  return { rowIndex: null, row: null };
}

function _findRowById_(rows, id) {
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_PRAC.ID]) === id) return rows[i];
  }
  return null;
}

function _nextPracticeId_(prefix, sheet) {
  var last = sheet.getLastRow();
  var num  = String(last).padStart(5, '0');
  return 'prac_' + prefix + '_' + num;
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

function _emptyPracticeRow_() {
  return HDR_PRACTICE.map(function() { return ''; });
}

/**
 * Unified row → object mapper for all three types.
 */
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

/**
 * Auto-roll up status from section → module → book.
 * Called after a section is toggled.
 */
function _autoRollUpStatus_(sheet, moduleId) {
  if (!moduleId) return;
  var rows = _readPractice_();

  // Check all sections under this module
  var allDone = true;
  var hasSections = false;

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) === PRAC_TYPE_SECTION &&
        String(r[COL_PRAC.PARENT_ID]) === moduleId) {
      hasSections = true;
      if (String(r[COL_PRAC.STATUS]) !== PRAC_STATUS_DONE) allDone = false;
    }
  });

  if (!hasSections) return;

  // Update module status
  var modFound = _findPracticeRow_(sheet, moduleId);
  if (!modFound.rowIndex) return;

  var modCurrentStatus = String(modFound.row[COL_PRAC.STATUS]);

  if (allDone && modCurrentStatus !== PRAC_STATUS_DONE) {
    _setStatus_(sheet, modFound, PRAC_STATUS_DONE);
    writeAudit('UPDATE', SHEET_PRACTICE, moduleId, 'status', modCurrentStatus, PRAC_STATUS_DONE + ' (auto)');
  } else if (!allDone && modCurrentStatus === PRAC_STATUS_DONE) {
    _clearStatus_(sheet, modFound);
    writeAudit('UPDATE', SHEET_PRACTICE, moduleId, 'status', modCurrentStatus, PRAC_STATUS_PENDING + ' (auto)');
  }

  // Now roll up to book
  var bookId = String(modFound.row[COL_PRAC.PARENT_ID]);
  _autoRollUpParent_(sheet, bookId, rows);
}

/**
 * Check if all modules under a book are done, and update the book status.
 */
function _autoRollUpParent_(sheet, bookId, rows) {
  if (!bookId) return;
  if (!rows) rows = _readPractice_();

  var allDone = true;
  var hasModules = false;

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) === PRAC_TYPE_MODULE &&
        String(r[COL_PRAC.PARENT_ID]) === bookId) {
      hasModules = true;
      if (String(r[COL_PRAC.STATUS]) !== PRAC_STATUS_DONE) allDone = false;
    }
  });

  if (!hasModules) return;

  var bookFound = _findPracticeRow_(sheet, bookId);
  if (!bookFound.rowIndex) return;

  var bookCurrentStatus = String(bookFound.row[COL_PRAC.STATUS]);

  if (allDone && bookCurrentStatus !== PRAC_STATUS_DONE) {
    _setStatus_(sheet, bookFound, PRAC_STATUS_DONE);
    writeAudit('UPDATE', SHEET_PRACTICE, bookId, 'status', bookCurrentStatus, PRAC_STATUS_DONE + ' (auto)');
  } else if (!allDone && bookCurrentStatus === PRAC_STATUS_DONE) {
    _clearStatus_(sheet, bookFound);
    writeAudit('UPDATE', SHEET_PRACTICE, bookId, 'status', bookCurrentStatus, PRAC_STATUS_PENDING + ' (auto)');
  }
}

function _setStatus_(sheet, found, status) {
  var now   = new Date().toISOString();
  var email = getCurrentUserEmail_();
  sheet.getRange(found.rowIndex, COL_PRAC.STATUS + 1).setValue(status);
  sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_DATE + 1).setValue(now);
  sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_BY + 1).setValue(email);
}

function _clearStatus_(sheet, found) {
  sheet.getRange(found.rowIndex, COL_PRAC.STATUS + 1).setValue(PRAC_STATUS_PENDING);
  sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_DATE + 1).setValue('');
  sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_BY + 1).setValue('');
}

function _uniqueSort_(arr) {
  var seen = {};
  var result = [];
  arr.forEach(function(v) { if (!seen[v]) { seen[v] = true; result.push(v); } });
  result.sort(function(a, b) { return b - a; }); // descending for delete safety
  return result;
}