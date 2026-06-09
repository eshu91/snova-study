// ═══════════════════════════════════════════════════════════════════════════════
// 11_PracticeRepository.js — CRUD for PracticeLog sheet
// Two-level hierarchy: Resources (books/tests) → Items (passages/tasks)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Read ──────────────────────────────────────────────────────────────────────

function getPracticeResourcesByTrack(track) {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var filtered = rows.filter(function(r) {
    return String(r[COL_PRAC.TYPE]) === 'resource' &&
           (track === 'All' || String(r[COL_PRAC.TRACK]) === track);
  });

  return filtered.map(function(r) { return _rowToResource_(r); });
}

function getPracticeItemsByResource(resourceId) {
  if (!resourceId) return [];
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  return rows
    .filter(function(r) {
      return String(r[COL_PRAC.TYPE]) === 'item' &&
             String(r[COL_PRAC.PARENT_ID]) === resourceId;
    })
    .sort(function(a, b) {
      return (parseInt(a[COL_PRAC.SORT_ORDER]) || 0) - (parseInt(b[COL_PRAC.SORT_ORDER]) || 0);
    })
    .map(function(r) { return _rowToItem_(r); });
}

function getPracticeResourceWithItems(resourceId) {
  if (!resourceId) return { error: 'Resource ID required.' };
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return { error: 'No practice data found.' };

  var resRow = null;
  var items = [];

  rows.forEach(function(r) {
    var id = String(r[COL_PRAC.ID]);
    if (id === resourceId && String(r[COL_PRAC.TYPE]) === 'resource') {
      resRow = r;
    }
    if (String(r[COL_PRAC.PARENT_ID]) === resourceId && String(r[COL_PRAC.TYPE]) === 'item') {
      items.push(r);
    }
  });

  if (!resRow) return { error: 'Resource not found: ' + resourceId };

  items.sort(function(a, b) {
    return (parseInt(a[COL_PRAC.SORT_ORDER]) || 0) - (parseInt(b[COL_PRAC.SORT_ORDER]) || 0);
  });

  var resource = _rowToResource_(resRow);
  resource.items = items.map(function(r) { return _rowToItem_(r); });
  return resource;
}

function getAllPracticeData() {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var resourceMap = {};
  var items = [];

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) === 'resource') {
      var res = _rowToResource_(r);
      res.items = [];
      resourceMap[res.id] = res;
    } else if (String(r[COL_PRAC.TYPE]) === 'item') {
      items.push(r);
    }
  });

  items
    .sort(function(a, b) {
      return (parseInt(a[COL_PRAC.SORT_ORDER]) || 0) - (parseInt(b[COL_PRAC.SORT_ORDER]) || 0);
    })
    .forEach(function(r) {
      var parentId = String(r[COL_PRAC.PARENT_ID]);
      if (resourceMap[parentId]) {
        resourceMap[parentId].items.push(_rowToItem_(r));
      }
    });

  var result = Object.keys(resourceMap).map(function(k) { return resourceMap[k]; });
  result.sort(function(a, b) {
    return (parseInt(a.sortOrder) || 0) - (parseInt(b.sortOrder) || 0);
  });
  return result;
}

// ── Summary for dashboard widget ──────────────────────────────────────────────

function getPracticeSummary() {
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return { tracks: {}, total: { entered: 0, completed: 0 } };

  var tracks = {};
  var totalEntered = 0;
  var totalCompleted = 0;

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) !== 'item') return;
    var track = String(r[COL_PRAC.TRACK]);
    if (!tracks[track]) tracks[track] = { entered: 0, completed: 0 };
    tracks[track].entered++;
    totalEntered++;
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) {
      tracks[track].completed++;
      totalCompleted++;
    }
  });

  return {
    tracks: tracks,
    total: { entered: totalEntered, completed: totalCompleted }
  };
}

// ── Upcoming due items (for email triggers) ───────────────────────────────────

function getUpcomingDueItems(daysAhead) {
  daysAhead = daysAhead || 1;
  var rows = _readPractice_();
  if (!rows || rows.length === 0) return [];

  var now = new Date();
  now.setHours(0, 0, 0, 0);
  var cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead + 1); // inclusive of daysAhead

  var results = [];
  rows.forEach(function(r) {
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) return;
    var dueRaw = r[COL_PRAC.DUE_DATE];
    if (!dueRaw) return;

    var due = new Date(dueRaw);
    if (isNaN(due.getTime())) return;
    due.setHours(0, 0, 0, 0);

    if (due >= now && due < cutoff) {
      var obj = String(r[COL_PRAC.TYPE]) === 'resource' ? _rowToResource_(r) : _rowToItem_(r);
      obj.dueDate = due.toISOString().split('T')[0];
      obj.isOverdue = due < now;
      results.push(obj);
    }
  });

  // Also include overdue items (past due, not done)
  rows.forEach(function(r) {
    if (String(r[COL_PRAC.STATUS]) === PRAC_STATUS_DONE) return;
    var dueRaw = r[COL_PRAC.DUE_DATE];
    if (!dueRaw) return;
    var due = new Date(dueRaw);
    if (isNaN(due.getTime())) return;
    due.setHours(0, 0, 0, 0);

    if (due < now) {
      var obj = String(r[COL_PRAC.TYPE]) === 'resource' ? _rowToResource_(r) : _rowToItem_(r);
      obj.dueDate = due.toISOString().split('T')[0];
      obj.isOverdue = true;
      results.push(obj);
    }
  });

  return results;
}

// ── Create ────────────────────────────────────────────────────────────────────

function addPracticeResource(params) {
  var name  = (params.name  || '').trim();
  var track = (params.track || '').trim();
  if (!name)  return { error: 'Resource name is required.' };
  if (!track) return { error: 'Track is required.' };

  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found. Run runSetup().' };

  var id      = _nextPracticeId_('res', sheet);
  var now     = new Date().toISOString();
  var email   = getCurrentUserEmail_();
  var dueDate = params.dueDate || '';

  var row = _emptyPracticeRow_();
  row[COL_PRAC.ID]         = id;
  row[COL_PRAC.TYPE]       = 'resource';
  row[COL_PRAC.PARENT_ID]  = '';
  row[COL_PRAC.TRACK]      = track;
  row[COL_PRAC.NAME]       = name;
  row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
  row[COL_PRAC.DUE_DATE]   = dueDate;
  row[COL_PRAC.COMPLETED_DATE] = '';
  row[COL_PRAC.COMPLETED_BY]   = '';
  row[COL_PRAC.SORT_ORDER] = params.sortOrder || _nextSortOrder_(sheet, '');
  row[COL_PRAC.NOTES]      = params.notes || '';
  row[COL_PRAC.ADDED_BY]   = email;
  row[COL_PRAC.ADDED_ON]   = now;

  sheet.appendRow(row);
  writeAudit('CREATE', SHEET_PRACTICE, id, 'resource', '', name);

  return { success: true, id: id };
}

function addPracticeItem(params) {
  var name     = (params.name     || '').trim();
  var parentId = (params.parentId || '').trim();
  if (!name)     return { error: 'Item name is required.' };
  if (!parentId) return { error: 'Parent resource ID is required.' };

  // Verify parent exists
  var rows = _readPractice_();
  var parent = null;
  (rows || []).forEach(function(r) {
    if (String(r[COL_PRAC.ID]) === parentId && String(r[COL_PRAC.TYPE]) === 'resource') {
      parent = r;
    }
  });
  if (!parent) return { error: 'Parent resource not found: ' + parentId };

  var sheet   = _practiceSheet_();
  var id      = _nextPracticeId_('itm', sheet);
  var now     = new Date().toISOString();
  var email   = getCurrentUserEmail_();
  var track   = String(parent[COL_PRAC.TRACK]);
  var dueDate = params.dueDate || '';

  var row = _emptyPracticeRow_();
  row[COL_PRAC.ID]         = id;
  row[COL_PRAC.TYPE]       = 'item';
  row[COL_PRAC.PARENT_ID]  = parentId;
  row[COL_PRAC.TRACK]      = track;
  row[COL_PRAC.NAME]       = name;
  row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
  row[COL_PRAC.DUE_DATE]   = dueDate;
  row[COL_PRAC.COMPLETED_DATE] = '';
  row[COL_PRAC.COMPLETED_BY]   = '';
  row[COL_PRAC.SORT_ORDER] = params.sortOrder || _nextSortOrder_(sheet, parentId);
  row[COL_PRAC.NOTES]      = params.notes || '';
  row[COL_PRAC.ADDED_BY]   = email;
  row[COL_PRAC.ADDED_ON]   = now;

  sheet.appendRow(row);
  writeAudit('CREATE', SHEET_PRACTICE, id, 'item', '', name);

  return { success: true, id: id };
}

function addPracticeItemsBatch(params) {
  var parentId = (params.parentId || '').trim();
  var names    = params.names; // array of strings
  if (!parentId) return { error: 'Parent resource ID is required.' };
  if (!Array.isArray(names) || names.length === 0) return { error: 'At least one item name is required.' };

  // Verify parent
  var rows = _readPractice_();
  var parent = null;
  (rows || []).forEach(function(r) {
    if (String(r[COL_PRAC.ID]) === parentId && String(r[COL_PRAC.TYPE]) === 'resource') {
      parent = r;
    }
  });
  if (!parent) return { error: 'Parent resource not found: ' + parentId };

  var sheet   = _practiceSheet_();
  var now     = new Date().toISOString();
  var email   = getCurrentUserEmail_();
  var track   = String(parent[COL_PRAC.TRACK]);
  var baseSO  = _nextSortOrder_(sheet, parentId);
  var created = [];

  names.forEach(function(n, idx) {
    n = (n || '').trim();
    if (!n) return;
    var id  = _nextPracticeId_('itm', sheet);
    var dueDate = (params.dueDates && params.dueDates[idx]) || '';

    var row = _emptyPracticeRow_();
    row[COL_PRAC.ID]         = id;
    row[COL_PRAC.TYPE]       = 'item';
    row[COL_PRAC.PARENT_ID]  = parentId;
    row[COL_PRAC.TRACK]      = track;
    row[COL_PRAC.NAME]       = n;
    row[COL_PRAC.STATUS]     = PRAC_STATUS_PENDING;
    row[COL_PRAC.DUE_DATE]   = dueDate;
    row[COL_PRAC.COMPLETED_DATE] = '';
    row[COL_PRAC.COMPLETED_BY]   = '';
    row[COL_PRAC.SORT_ORDER] = baseSO + idx;
    row[COL_PRAC.NOTES]      = '';
    row[COL_PRAC.ADDED_BY]   = email;
    row[COL_PRAC.ADDED_ON]   = now;

    sheet.appendRow(row);
    writeAudit('CREATE', SHEET_PRACTICE, id, 'item', '', n);
    created.push(id);
  });

  return { success: true, ids: created, count: created.length };
}

// ── Update ────────────────────────────────────────────────────────────────────

function togglePracticeItemStatus(id) {
  if (!id) return { error: 'Item ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findPracticeRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Item not found: ' + id };

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

  // Check if all items in parent are done → auto-complete parent
  if (String(found.row[COL_PRAC.TYPE]) === 'item') {
    var parentId = String(found.row[COL_PRAC.PARENT_ID]);
    _checkAutoCompleteResource_(sheet, parentId);
  }

  return { success: true, newStatus: newStatus };
}

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

function deletePracticeEntry(id) {
  if (!id) return { error: 'ID required.' };
  var sheet = _practiceSheet_();
  if (!sheet) return { error: 'PracticeLog sheet not found.' };

  var found = _findPracticeRow_(sheet, id);
  if (!found.rowIndex) return { error: 'Entry not found: ' + id };

  var type = String(found.row[COL_PRAC.TYPE]);
  var name = String(found.row[COL_PRAC.NAME]);

  // If resource, also delete all its items
  if (type === 'resource') {
    var allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_PRACTICE.length).getValues();
    // Delete from bottom to top to keep row indices stable
    var toDelete = [];
    for (var i = 0; i < allRows.length; i++) {
      if (String(allRows[i][COL_PRAC.PARENT_ID]) === id) {
        toDelete.push(i + 2);
      }
    }
    toDelete.push(found.rowIndex);
    toDelete.sort(function(a, b) { return b - a; }); // descending
    toDelete.forEach(function(ri) { sheet.deleteRow(ri); });
    writeAudit('DELETE', SHEET_PRACTICE, id, 'resource+items', name, '');
  } else {
    sheet.deleteRow(found.rowIndex);
    writeAudit('DELETE', SHEET_PRACTICE, id, 'item', name, '');
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
      : String(r[COL_PRAC.TYPE]) === 'resource';
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

function _rowToResource_(r) {
  return {
    id:        String(r[COL_PRAC.ID]),
    type:      'resource',
    track:     String(r[COL_PRAC.TRACK]),
    name:      String(r[COL_PRAC.NAME]),
    status:    String(r[COL_PRAC.STATUS]),
    dueDate:   _fmtDate_(r[COL_PRAC.DUE_DATE]),
    notes:     String(r[COL_PRAC.NOTES] || ''),
    sortOrder: parseInt(r[COL_PRAC.SORT_ORDER]) || 0,
    addedBy:   String(r[COL_PRAC.ADDED_BY] || ''),
    addedOn:   _fmtDate_(r[COL_PRAC.ADDED_ON]),
  };
}

function _rowToItem_(r) {
  return {
    id:            String(r[COL_PRAC.ID]),
    type:          'item',
    parentId:      String(r[COL_PRAC.PARENT_ID]),
    track:         String(r[COL_PRAC.TRACK]),
    name:          String(r[COL_PRAC.NAME]),
    status:        String(r[COL_PRAC.STATUS]),
    dueDate:       _fmtDate_(r[COL_PRAC.DUE_DATE]),
    completedDate: _fmtDate_(r[COL_PRAC.COMPLETED_DATE]),
    completedBy:   String(r[COL_PRAC.COMPLETED_BY] || ''),
    notes:         String(r[COL_PRAC.NOTES] || ''),
    sortOrder:     parseInt(r[COL_PRAC.SORT_ORDER]) || 0,
  };
}

function _fmtDate_(v) {
  if (!v) return '';
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().split('T')[0];
}

function _checkAutoCompleteResource_(sheet, resourceId) {
  if (!resourceId) return;
  var rows = _readPractice_();
  var allDone = true;
  var hasItems = false;

  rows.forEach(function(r) {
    if (String(r[COL_PRAC.TYPE]) === 'item' && String(r[COL_PRAC.PARENT_ID]) === resourceId) {
      hasItems = true;
      if (String(r[COL_PRAC.STATUS]) !== PRAC_STATUS_DONE) allDone = false;
    }
  });

  if (!hasItems) return;

  var found = _findPracticeRow_(sheet, resourceId);
  if (!found.rowIndex) return;

  var currentStatus = String(found.row[COL_PRAC.STATUS]);

  if (allDone && currentStatus !== PRAC_STATUS_DONE) {
    sheet.getRange(found.rowIndex, COL_PRAC.STATUS + 1).setValue(PRAC_STATUS_DONE);
    sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_DATE + 1).setValue(new Date().toISOString());
    sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_BY + 1).setValue(getCurrentUserEmail_());
    writeAudit('UPDATE', SHEET_PRACTICE, resourceId, 'status', currentStatus, PRAC_STATUS_DONE + ' (auto)');
  } else if (!allDone && currentStatus === PRAC_STATUS_DONE) {
    // Un-complete resource if an item was unchecked
    sheet.getRange(found.rowIndex, COL_PRAC.STATUS + 1).setValue(PRAC_STATUS_PENDING);
    sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_DATE + 1).setValue('');
    sheet.getRange(found.rowIndex, COL_PRAC.COMPLETED_BY + 1).setValue('');
    writeAudit('UPDATE', SHEET_PRACTICE, resourceId, 'status', currentStatus, PRAC_STATUS_PENDING + ' (auto)');
  }
}