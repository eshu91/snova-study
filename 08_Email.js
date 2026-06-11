/**
 * All email templates and send functions.
 * Called only from 07_Triggers.gs - never directly from the web app.
 */

// ── Send functions ────────────────────────────────────────────────────────────

function sendDailyNudge_(config, todayMinutes) {
  const name   = config.user_name || 'there';
  const minReq = parseInt(config.min_session_minutes, 10) || 15;
  const notif  = config.notification_email || config.owner_email;
  const days   = getDaysUntilIELTS();

  const msgLine = todayMinutes === 0
    ? `No sessions logged yet today.`
    : `You've logged <strong>${todayMinutes}&nbsp;min</strong> today - just short of the ${minReq}&nbsp;min that counts toward your streak.`;

  const countdownHtml = (days && days > 0 && config.phase === PHASE_PRE_IELTS)
    ? `<div style="display:inline-block;background:#e6f0fb;border-radius:8px;padding:10px 16px;margin-top:18px">
        <span style="font-size:22px;font-weight:700;color:#1a4580">${days}</span>
        <span style="font-size:13px;color:#2d6bcc;margin-left:6px">days until IELTS</span>
       </div>`
    : '';

  const body = `
    <p style="font-size:21px;font-weight:700;margin:0 0 16px;letter-spacing:-0.3px">
      Hey&nbsp;${_esc_(name)}&nbsp;👋
    </p>
    <p style="font-size:15px;line-height:1.75;color:#3a3a3a;margin:0 0 12px">${msgLine}</p>
    <p style="font-size:14px;line-height:1.75;color:#6b6560;margin:0">
      Even 15 quiet minutes counts. Rest days are healthy too - 
      if today was one intentionally, ignore this.
    </p>
    ${countdownHtml}
    ${_ctaBtn_('Open tracker →')}`;

  MailApp.sendEmail({
    to:       notif,
    subject:  `Hey ${name} - quick check-in 👋`,
    htmlBody: _wrap_(body, _footerLine_(config)),
  });
}

function sendWeeklySummary_(config) {
  const name  = config.user_name || 'there';
  const notif = config.notification_email || config.owner_email;

  const summary    = getStatsSummary();
  const candidates = getReviewCandidates().slice(0, 4);
  const thisWeek   = _minutesByTrack_(1)[0] || { german: 0, ielts: 0 };
  const days       = getDaysUntilIELTS();

  // Stats table
  const row = (label, val, color) =>
    `<tr>
      <td style="padding:9px 0;font-size:13px;color:#6b6560;border-bottom:1px solid #f0ede8">${label}</td>
      <td style="padding:9px 0;font-size:15px;font-weight:700;color:${color};text-align:right;border-bottom:1px solid #f0ede8">${val}</td>
    </tr>`;

  const statsTable = `
    <table style="width:100%;border-collapse:collapse;margin:14px 0 6px">
      ${row('Total study time',  _fmtMin_(summary.totalMinutes),  '#2d5016')}
      ${row('Days studied',      summary.daysStudied + ' / 7',    '#1c1a17')}
      ${row('Streak',            summary.streak + ' days 🔥',     '#9e6d1e')}
      ${row('Topics mastered',   summary.topicsMastered,          '#4a7a25')}
      ${thisWeek.german > 0 ? row('German',  _fmtMin_(thisWeek.german), '#2d5016') : ''}
      ${thisWeek.ielts  > 0 ? row('IELTS',   _fmtMin_(thisWeek.ielts),  '#1a4580') : ''}
    </table>`;

  // IELTS countdown banner
  const ieltsBanner = (days && days > 0 && config.phase === PHASE_PRE_IELTS) ? `
    <div style="background:#e6f0fb;border-radius:8px;padding:14px 18px;margin:18px 0;display:flex;align-items:center;gap:14px">
      <div style="font-size:40px;font-weight:700;color:#1a4580;line-height:1;flex-shrink:0">${days}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:#1a4580">days until IELTS</div>
        <div style="font-size:11px;color:#2d6bcc;margin-top:3px">${_esc_(config.ielts_test_date)}</div>
      </div>
    </div>` : '';

  // Review candidates
  const reviewHtml = candidates.length > 0 ? `
    <p style="font-size:13px;font-weight:700;margin:20px 0 8px;color:#1c1a17">Topics to revisit</p>
    <div style="background:#fdf4e3;border-radius:8px;padding:4px 16px">
      ${candidates.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;font-size:13px;border-bottom:1px solid #f7ead0">
          <span style="color:#1c1a17;flex:1;margin-right:12px">${_esc_(c.topic)}</span>
          <span style="color:#9e6d1e;font-weight:600;white-space:nowrap;font-size:12px">${c.daysSince}d ago</span>
        </div>`).join('')}
    </div>` : '';

  // Encouragement line
  const encouragement = summary.totalMinutes > 0
    ? `<p style="font-size:14px;color:#6b6560;line-height:1.7;margin:18px 0 0">
        ${summary.daysStudied >= 5
          ? 'Strong week. Keep that momentum going.'
          : summary.daysStudied >= 3
          ? 'Solid week. Every session adds up.'
          : 'Every session counts. Next week is a fresh start.'
        }
      </p>`
    : `<p style="font-size:14px;color:#6b6560;line-height:1.7;margin:18px 0 0">
        Quiet week. Sometimes rest is the right call. 
        When you're ready, the tracker is here.
      </p>`;

  const body = `
    <p style="font-size:13px;font-weight:500;color:#a89f95;margin:0 0 4px;text-transform:uppercase;letter-spacing:.6px">
      Week in review
    </p>
    <p style="font-size:21px;font-weight:700;margin:0 0 16px;letter-spacing:-0.3px;color:#1c1a17">
      ${_esc_(summary.weekLabel)}
    </p>
    ${statsTable}
    ${ieltsBanner}
    ${reviewHtml}
    ${encouragement}
    ${_ctaBtn_('Open tracker →')}`;

  MailApp.sendEmail({
    to:       notif,
    subject:  `${name}'s week - ${summary.weekLabel}`,
    htmlBody: _wrap_(body, _footerLine_(config)),
  });
}

function sendStaleTimerAlert_(config, count, hours) {
  const name  = config.user_name || 'there';
  const notif = config.notification_email || config.owner_email;

  const body = `
    <p style="font-size:21px;font-weight:700;margin:0 0 14px">Timer auto-closed 🕰</p>
    <p style="font-size:15px;line-height:1.75;color:#3a3a3a;margin:0 0 12px">
      Hey&nbsp;${_esc_(name)} - ${count === 1 ? 'a timer' : count + ' timers'} that had been 
      running for over <strong>${hours}&nbsp;hours</strong> 
      ${count === 1 ? 'was' : 'were'} automatically cancelled.
    </p>
    <p style="font-size:14px;color:#6b6560;line-height:1.7;margin:0">
      If you were actually studying the whole time, you can add it back 
      using <em>Log past session</em> on the Today page.
    </p>
    ${_ctaBtn_('Log past session →')}`;

  MailApp.sendEmail({
    to:       notif,
    subject:  `Your study timer was auto-closed - lernen / track`,
    htmlBody: _wrap_(body, _footerLine_(config)),
  });
}

function sendPhaseTransitionAlert_(config) {
  const userName = config.user_name || 'Snova';
  const collab   = config.collaborator_email;

  const body = `
    <p style="font-size:21px;font-weight:700;margin:0 0 14px">Phase update needed 📋</p>
    <p style="font-size:15px;line-height:1.75;color:#3a3a3a;margin:0 0 12px">
      Hey Nova - the IELTS test date 
      (<strong>${_esc_(config.ielts_test_date)}</strong>) has passed 
      while the tracker is still set to <strong>pre_ielts</strong>.
    </p>
    <p style="font-size:14px;line-height:1.75;color:#6b6560;margin:0 0 18px">
      Have a conversation with ${_esc_(userName)} about how it went, then flip 
      the phase to <strong>post_ielts_pre_germany</strong> in Settings. 
      This shifts the emails to German-only focus and dims the IELTS tab.
    </p>
    <div style="background:#ebf4e2;border-radius:8px;padding:12px 16px;font-size:13px;color:#2d5016;line-height:1.7;margin-bottom:18px">
      Settings &rarr; Learning phase &rarr; Post-IELTS / Pre-Germany &rarr; Save phase
    </div>
    ${_ctaBtn_('Open Settings →')}`;

  MailApp.sendEmail({
    to:       collab,
    subject:  `${userName}'s IELTS date has passed - phase update needed`,
    htmlBody: _wrap_(body, `lernen / track &nbsp;·&nbsp; ${_dateLabel_()}<br>Sent to Nova (${_esc_(collab)})`),
  });
}

/**
 * Morning briefing email with practice items due today/tomorrow and overdue.
 * Only sends if there are items to show — silent otherwise (non-shaming).
 * Called by morningBriefing() trigger at 6:00 AM NPT.
 */
function sendMorningBriefing_(config) {
  const name  = config.user_name || 'there';
  const notif = config.notification_email || config.owner_email;
  if (!notif) return { sent: false, reason: 'no email' };
 
  // Gather practice items: overdue + due today + due tomorrow
  const dueItems = getUpcomingDueItems(1); // today + tomorrow
  if (!dueItems || dueItems.length === 0) return { sent: false, reason: 'nothing due' };
 
  const overdue  = dueItems.filter(function(it) { return it.isOverdue; });
  const dueToday = dueItems.filter(function(it) {
    if (it.isOverdue) return false;
    var d = new Date(it.dueDate);
    var today = new Date(); today.setHours(0,0,0,0);
    d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  });
  const dueTomorrow = dueItems.filter(function(it) {
    if (it.isOverdue) return false;
    var d = new Date(it.dueDate);
    var today = new Date(); today.setHours(0,0,0,0);
    var tmrw = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
    d.setHours(0,0,0,0);
    return d.getTime() === tmrw.getTime();
  });
 
  // IELTS countdown
  const days = getDaysUntilIELTS();
  const countdownHtml = (days && days > 0 && config.phase === PHASE_PRE_IELTS)
    ? '<div style="background:#e6f0fb;border-radius:8px;padding:12px 16px;margin:0 0 18px;display:flex;align-items:center;gap:12px">' +
      '<div style="font-size:32px;font-weight:700;color:#1a4580;line-height:1;flex-shrink:0">' + days + '</div>' +
      '<div><div style="font-size:12px;font-weight:600;color:#1a4580">days until IELTS</div>' +
      '<div style="font-size:10px;color:#2d6bcc;margin-top:2px">' + _esc_(config.ielts_test_date) + '</div></div>' +
      '</div>'
    : '';
 
  // Practice summary
  var pracSummary;
  try { pracSummary = getPracticeSummary(); } catch (e) { pracSummary = null; }
 
  // Build the practice items sections
  var practiceHtml = '';
 
  if (overdue.length > 0) {
    practiceHtml += '<div style="margin-bottom:16px">';
    practiceHtml += '<div style="font-size:12px;font-weight:600;color:#c04040;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⚠ Overdue</div>';
    practiceHtml += _pracItemTable_(overdue, '#fbeaea', '#f0b8b8', '#8c2020');
    practiceHtml += '</div>';
  }
 
  if (dueToday.length > 0) {
    practiceHtml += '<div style="margin-bottom:16px">';
    practiceHtml += '<div style="font-size:12px;font-weight:600;color:#1a4580;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📋 Due today</div>';
    practiceHtml += _pracItemTable_(dueToday, '#e6f0fb', '#aac8f0', '#1a4580');
    practiceHtml += '</div>';
  }
 
  if (dueTomorrow.length > 0) {
    practiceHtml += '<div style="margin-bottom:16px">';
    practiceHtml += '<div style="font-size:12px;font-weight:600;color:#6b6560;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🔜 Due tomorrow</div>';
    practiceHtml += _pracItemTable_(dueTomorrow, '#f5f3ef', '#e2ddd7', '#6b6560');
    practiceHtml += '</div>';
  }
 
  // Overall progress line (if available)
  var progressHtml = '';
  if (pracSummary && pracSummary.total && pracSummary.total.entered > 0) {
    var pct = Math.round(pracSummary.total.completed / pracSummary.total.entered * 100);
    progressHtml = '<div style="background:#ebf4e2;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:13px;color:#2d5016">' +
      '📊 Overall: <strong>' + pracSummary.total.completed + '</strong> of <strong>' + pracSummary.total.entered + '</strong> practice items complete (' + pct + '%)' +
      '</div>';
  }
 
  // Greeting — time-aware
  var hr = new Date().getHours();
  var greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
 
  var totalDue = overdue.length + dueToday.length + dueTomorrow.length;
 
  var body =
    '<p style="font-size:13px;font-weight:500;color:#a89f95;margin:0 0 4px;text-transform:uppercase;letter-spacing:.6px">' +
      greeting +
    '</p>' +
    '<p style="font-size:21px;font-weight:700;margin:0 0 18px;letter-spacing:-0.3px;color:#1c1a17">' +
      _esc_(name) + ', here\'s your practice update' +
    '</p>' +
    countdownHtml +
    progressHtml +
    practiceHtml +
    _ctaBtn_('Open Practice →');
 
  // Subject line
  var subjectParts = [];
  if (overdue.length > 0)    subjectParts.push(overdue.length + ' overdue');
  if (dueToday.length > 0)   subjectParts.push(dueToday.length + ' due today');
  if (dueTomorrow.length > 0) subjectParts.push(dueTomorrow.length + ' due tomorrow');
  var subject = '📋 ' + subjectParts.join(', ') + ' — lernen / track';
 
  MailApp.sendEmail({
    to:       notif,
    subject:  subject,
    htmlBody: _wrap_(body, _footerLine_(config)),
  });
 
  return { sent: true, count: totalDue };
}
 

function _pracItemTable_(items, bgColor, borderColor, textColor) {
  var html = '<div style="background:' + bgColor + ';border-radius:8px;border:0.5px solid ' + borderColor + ';overflow:hidden">';
  items.forEach(function(it, idx) {
    var border = idx > 0 ? 'border-top:0.5px solid ' + borderColor + ';' : '';
    var icons = { book: '\uD83D\uDCD6', test: '\uD83D\uDCDD', module: '\uD83D\uDCC2', section: '\u2610' };
    var typeIcon = icons[it.type] || '\u2610';
    var trackLabel = it.track
      ? '<span style="font-size:10px;color:' + textColor + ';opacity:.7;margin-left:6px">' + _esc_(it.track) + '</span>'
      : '';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:9px 14px;font-size:13px;' + border + '">';
    html += '<span style="flex-shrink:0">' + typeIcon + '</span>';
    html += '<span style="flex:1;color:#1c1a17">' + _esc_(it.name) + trackLabel + '</span>';
    if (it.dueDate) {
      html += '<span style="font-size:11px;color:' + textColor + ';font-weight:500;white-space:nowrap">' + _fmtDueLabel_(it.dueDate) + '</span>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}



/**
 * Formats a due date into a human label for emails.
 */
function _fmtDueLabel_(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  var today = new Date(); today.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  var diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 0) return Math.abs(diff) + 'd overdue';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}


// ── Private helpers ───────────────────────────────────────────────────────────

function _wrap_(bodyHtml, footerHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1c1a17;-webkit-font-smoothing:antialiased">
<div style="max-width:520px;margin:0 auto;padding:0 20px">

  <div style="padding:28px 0 18px;border-bottom:1px solid #e2ddd7">
    <span style="font-size:18px;font-weight:700;color:#2d5016;letter-spacing:-0.3px">lernen</span
    ><span style="font-size:18px;color:#a89f95;font-style:italic"> / track</span>
  </div>

  <div style="background:#ffffff;border-radius:12px;padding:28px 24px 24px;margin:20px 0 0;border:0.5px solid #e2ddd7;box-shadow:0 1px 4px rgba(0,0,0,.05)">
    ${bodyHtml}
  </div>

  <div style="padding:16px 0 36px;font-size:11px;color:#a89f95;line-height:1.8">
    ${footerHtml}
  </div>

</div>
</body></html>`;
}

function _ctaBtn_(label) {
  const url = _appUrl_();
  if (!url) return '';
  return `<a href="${url}" style="display:inline-block;margin-top:20px;background:#2d5016;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:.1px">${label}</a>`;
}

function _footerLine_(config) {
  const days = getDaysUntilIELTS();
  const cd   = (days && days > 0 && config.phase === PHASE_PRE_IELTS)
    ? ` &nbsp;·&nbsp; ${days} days until IELTS`
    : '';
  return `lernen / track &nbsp;·&nbsp; ${_dateLabel_()}${cd}`;
}

function _appUrl_() {
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) return url;
  } catch (e) { /* fall through */ }
  return getConfig('web_app_url') || '';
}

function _esc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _dateLabel_() {
  return new Date().toLocaleDateString('en-GB',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function _fmtMin_(m) {
  if (!m || m === 0) return '0 min';
  return m < 60 ? m + ' min'
    : Math.floor(m / 60) + 'h' + (m % 60 > 0 ? '\u00a0' + (m % 60) + 'min' : '');
}