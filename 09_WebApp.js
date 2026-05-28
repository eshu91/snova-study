function doGet() {
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
      .setTitle('lernen / track — ' + (cfg.user_name || 'Study Tracker'))
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