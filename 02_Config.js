function getConfig(key) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  if (!sheet) return String(CONFIG_DEFAULTS[key] ?? '');

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_CFG.KEY]) === key) {
      const v = data[i][COL_CFG.VALUE];
      return v !== undefined && v !== null ? String(v) : '';
    }
  }
  return String(CONFIG_DEFAULTS[key] ?? '');
}

function getConfigInt(key) { return parseInt(getConfig(key), 10) || 0; }

function getConfigDate(key) {
  const v = getConfig(key);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function getConfigAll() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  const result = Object.assign({}, CONFIG_DEFAULTS);
  if (!sheet) return result;
  sheet.getDataRange().getValues().slice(1).forEach(row => {
    if (row[COL_CFG.KEY]) result[String(row[COL_CFG.KEY])] = String(row[COL_CFG.VALUE] ?? '');
  });
  return result;
}

function setConfigValue(key, value) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  if (!sheet) return { error: 'Config sheet not found' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_CFG.KEY]) === key) {
      const before = String(data[i][COL_CFG.VALUE] ?? '');
      sheet.getRange(i + 1, COL_CFG.VALUE + 1).setValue(String(value));
      writeAudit('UPDATE', SHEET_CONFIG, key, 'value', before, String(value));
      return { success: true };
    }
  }
  sheet.appendRow([key, String(value), '']);
  writeAudit('CREATE', SHEET_CONFIG, key, 'value', '', String(value));
  return { success: true };
}

function getCurrentUserEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function getCurrentUserContext() {
  const email  = getCurrentUserEmail_();
  const owner  = getConfig('owner_email');
  const collab = getConfig('collaborator_email');
  if (email && email === owner)  return { email, role: 'owner' };
  if (email && email === collab) return { email, role: 'collaborator' };
  return { email, role: 'viewer' };
}

function getDaysUntilIELTS() {
  const d = getConfigDate('ielts_test_date');
  if (!d) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}


// ── Access control ───────────────────────────────────────────────────────────

/**
 * Returns true if the current user is allowed to use the app.
 * Allowed = owner OR collaborator OR in the allowed_emails list.
 */
function isCurrentUserAllowed() {
  const email = getCurrentUserEmail_();
  if (!email) return false;                       // can't identify → block
  const owner  = getConfig('owner_email');
  const collab = getConfig('collaborator_email');
  if (email === owner || email === collab) return true;
  const allowed = getAllowedEmails();
  return allowed.includes(email);
}

/** Parse the comma-separated allowed_emails config into a clean array. */
function getAllowedEmails() {
  const raw = getConfig('allowed_emails');
  if (!raw) return [];
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

/** Add an email to the allowlist. Returns the updated list. */
function addAllowedEmail(email) {
  email = String(email).trim().toLowerCase();
  if (!email || !email.includes('@')) return { error: 'Invalid email address' };
  const list = getAllowedEmails();
  if (list.includes(email)) return { emails: list };   // already there
  list.push(email);
  setConfigValue('allowed_emails', list.join(','));
  return { emails: list };
}

/** Remove an email from the allowlist. Returns the updated list. */
function removeAllowedEmail(email) {
  email = String(email).trim().toLowerCase();
  const list = getAllowedEmails().filter(e => e !== email);
  setConfigValue('allowed_emails', list.join(','));
  return { emails: list };
}