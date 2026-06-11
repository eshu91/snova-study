function doGet() {
  // ── Access gate ──────────────────────────────────────────────────────────
  if (!isCurrentUserAllowed()) {
    var userEmail = getCurrentUserEmail_() || 'unknown';
    return HtmlService.createHtmlOutput(
      '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:80px auto;' +
      'text-align:center;padding:24px;color:#555">' +
      '<div style="font-size:40px;margin-bottom:16px">🔒</div>' +
      '<h2 style="margin:0 0 8px;color:#222;font-size:20px">Access restricted</h2>' +
      '<p style="font-size:14px;line-height:1.5;margin:0 0 20px">' +
      'This study tracker is private. Your account ' +
      '<strong>' + userEmail + '</strong> doesn\'t have access.</p>' +
      '<p style="font-size:13px;color:#888">Ask the owner to add your email in Settings → Access control.</p>' +
      '</div>'
    ).setTitle('Access Denied');
  }

  try {
    const tmpl  = HtmlService.createTemplateFromFile('index');
    const cfg   = getConfigAll();
    tmpl.config       = cfg;
    tmpl.daysToIELTS  = getDaysUntilIELTS() || 0;
    tmpl.userCtx      = getCurrentUserContext();
    tmpl.allTracks    = ALL_TRACKS;
    tmpl.sessionTypes = SESSION_TYPES;
    tmpl.statuses     = TOPIC_STATUSES;

    return tmpl.evaluate()
      .setTitle('Study Tracker - ' + (cfg.user_name || 'Study Tracker'))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:30px;color:#c04040">' +
      '<strong>App error:</strong> ' + err.message +
      '<br><br>Run <code>runSetup()</code> in the Apps Script editor, then redeploy.</p>'
    );
  }
}

// Include a file by name. Passes optional data object for template files.
function include(filename, data) {
  if (data) {
    const t = HtmlService.createTemplateFromFile(filename);
    Object.keys(data).forEach(k => { t[k] = data[k]; });
    return t.evaluate().getContent();
  }
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}