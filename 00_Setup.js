/**
 * Run once from Apps Script editor to initialise the spreadsheet.
 * Safe to re-run - skips existing sheets and config keys.
 * After running, call populateIELTSSyllabus() to seed all 140 IELTS topics.
 */
function runSetup() {
  const ss = SpreadsheetApp.getActive();

  createSheet_(ss, SHEET_CONFIG, HDR_CONFIG);
  Object.values(SYLLABUS_SHEETS).forEach(name => createSheet_(ss, name, HDR_SYLLABUS));
  createSheet_(ss, SHEET_SESSIONS, HDR_SESSIONS);
  createSheet_(ss, SHEET_DAILY_LOG, HDR_DAILY_LOG);
  createSheet_(ss, SHEET_AUDIT_LOG, HDR_AUDIT_LOG);
  createSheet_(ss, SHEET_SYS_LOG, HDR_SYS_LOG);
  createDashboardSheet_(ss);

  seedConfig_(ss);
  seedGermanA1_(ss);
  installTriggers_();

  const sysLog = ss.getSheetByName(SHEET_SYS_LOG);
  if (sysLog) sysLog.hideSheet();

  console.log('runSetup() complete. Next: run populateIELTSSyllabus().');
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function createSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (!sheet.getRange(1, 1).getValue()) {
    const r = sheet.getRange(1, 1, 1, headers.length);
    r.setValues([headers]).setFontWeight('bold').setBackground('#f0ede8');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function createDashboardSheet_(ss) {
  if (ss.getSheetByName(SHEET_DASHBOARD)) return;
  const s = ss.insertSheet(SHEET_DASHBOARD);
  s.getRange('A1').setValue('Dashboard - auto-generated').setFontWeight('bold');
}

// ── Config seed ───────────────────────────────────────────────────────────────

function seedConfig_(ss) {
  const sheet = ss.getSheetByName(SHEET_CONFIG);
  const existing = new Set();
  sheet.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) existing.add(String(r[0])); });

  const descs = {
    user_name: 'Display name used in the app and emails',
    owner_email: "Snova's Google account (owner of script)",
    collaborator_email: "Nova's Google account",
    notification_email: 'Where daily nudge and weekly summary emails go',
    timezone: 'IANA timezone identifier',
    phase: 'pre_ielts | post_ielts_pre_germany | in_germany',
    ielts_test_date: 'YYYY-MM-DD',
    expected_arrival_germany: 'YYYY-MM-DD, or blank',
    daily_check_hour: '24-hour; when daily nudge check runs (NPT)',
    weekly_summary_day: 'Day name, e.g. Sunday',
    weekly_summary_hour: '24-hour; when weekly summary sends (NPT)',
    streak_grace_days: 'Missed days allowed per week before streak resets',
    min_session_minutes: 'Minimum minutes for a session to count toward streak',
    stale_session_hours: 'Hours before an active timer is considered stale',
    theme: 'auto | light | dark',
    web_app_version: 'Set by runSetup(); shown in Settings',
  };

  Object.entries(CONFIG_DEFAULTS).forEach(([key, val]) => {
    if (!existing.has(key)) sheet.appendRow([key, val, descs[key] || '']);
  });
}

// ── German A1 seed ────────────────────────────────────────────────────────────

function seedGermanA1_(ss) {
  const sheet = ss.getSheetByName(SYLLABUS_SHEETS.A1);
  if (!sheet || sheet.getLastRow() > 1) return;

  const now   = new Date().toISOString();
  const email = getOwnerEmail_();
  const ns    = STATUS_NOT_STARTED;

  [
    ['A1-GR-001','Grammar','Subject–Verb–Object word order (SVO)',ns],
    ['A1-GR-002','Grammar','Gender of nouns (der / die / das)',ns],
    ['A1-GR-003','Grammar','Definite and indefinite articles',ns],
    ['A1-GR-004','Grammar','Personal pronouns: Nominative',ns],
    ['A1-GR-005','Grammar','Present tense - regular verbs',ns],
    ['A1-GR-006','Grammar','sein and haben in present tense',ns],
    ['A1-GR-007','Grammar','Modal verbs: können, müssen, wollen',ns],
    ['A1-GR-008','Grammar','Negation: nicht and kein',ns],
    ['A1-GR-009','Grammar','Cases: Nominative & Accusative',ns],
    ['A1-GR-010','Grammar','Possessive adjectives (mein, dein, sein…)',ns],
    ['A1-GR-011','Grammar','Separable and inseparable verbs',ns],
    ['A1-GR-012','Grammar','Basic prepositions of place and time',ns],
    ['A1-GR-013','Grammar','Simple conjunctions: und, aber, oder, denn',ns],
    ['A1-GR-014','Grammar','Imperative (du, ihr, Sie forms)',ns],
    ['A1-VO-001','Vocabulary','Greetings and farewells',ns],
    ['A1-VO-002','Vocabulary','Numbers 0–1,000',ns],
    ['A1-VO-003','Vocabulary','Ordinal numbers and dates',ns],
    ['A1-VO-004','Vocabulary','Days, months, seasons',ns],
    ['A1-VO-005','Vocabulary','Time and clock',ns],
    ['A1-VO-006','Vocabulary','Family members and relationships',ns],
    ['A1-VO-007','Vocabulary','Colors and basic shapes',ns],
    ['A1-VO-008','Vocabulary','Rooms and furniture',ns],
    ['A1-VO-009','Vocabulary','Food and drink',ns],
    ['A1-VO-010','Vocabulary','Clothing items',ns],
    ['A1-VO-011','Vocabulary','Transport and basic directions',ns],
    ['A1-VO-012','Vocabulary','Weather descriptions',ns],
    ['A1-VO-013','Vocabulary','Body parts',ns],
    ['A1-VO-014','Vocabulary','Daily routines and activities',ns],
    ['A1-SP-001','Speaking','Introductions: name, age, origin',ns],
    ['A1-SP-002','Speaking','Asking and answering simple questions',ns],
    ['A1-SP-003','Speaking','Polite phrases: bitte, danke, entschuldigung',ns],
  ].forEach(([id, cat, topic, status]) => {
    sheet.appendRow([id, cat, topic, status, '', '', '', '', '', '', '', email, now]);
  });
}

function getOwnerEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ── Trigger installation ──────────────────────────────────────────────────────

function installTriggers_() {
  const managed = ['morningRefresh','dailyCheck','weeklySummary',
                   'checkStaleSessions','phaseTransitionCheck','pruneSystemLog'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (managed.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('morningRefresh').timeBased().atHour(5).everyDays(1).create();
  ScriptApp.newTrigger('checkStaleSessions').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(22).everyDays(1).create();
  ScriptApp.newTrigger('weeklySummary')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(20).create();
  ScriptApp.newTrigger('phaseTransitionCheck')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  ScriptApp.newTrigger('pruneSystemLog').timeBased().atHour(3).everyDays(1).create();
}

// ── Full IELTS seed (run separately after runSetup) ───────────────────────────

function populateIELTSSyllabus() {
  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SYLLABUS_SHEETS.IELTS);
  if (!sheet) throw new Error('IELTS sheet not found - run runSetup() first.');

  if (sheet.getLastRow() > 1) {
    const res = SpreadsheetApp.getUi().alert(
      'IELTS sheet already has data. Clear and reseed?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    if (res !== SpreadsheetApp.getUi().Button.YES) return 'Cancelled.';
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  const now   = new Date().toISOString();
  const email = getOwnerEmail_();
  const ns    = STATUS_NOT_STARTED;

  const rows = [
    // Listening
    ['IELTS-LI-001','Skills','Identifying specific information (names, numbers, dates, times)',ns],
    ['IELTS-LI-002','Skills','Following directions and instructions',ns],
    ['IELTS-LI-003','Skills','Understanding main ideas vs supporting details',ns],
    ['IELTS-LI-004','Skills','Recognizing speaker attitude and opinion',ns],
    ['IELTS-LI-005','Skills','Following a conversation with multiple speakers',ns],
    ['IELTS-LI-006','Skills','Predicting answers before listening',ns],
    ['IELTS-LI-007','Skills','Spelling under time pressure (names, places)',ns],
    ['IELTS-LI-008','Skills','Handling distractors (corrections, hesitations, false starts)',ns],
    ['IELTS-LI-009','Question types','Form / note / table / flowchart / summary completion',ns],
    ['IELTS-LI-010','Question types','Multiple choice (single and multi-answer)',ns],
    ['IELTS-LI-011','Question types','Matching (speakers, items, locations)',ns],
    ['IELTS-LI-012','Question types','Plan / map / diagram labeling',ns],
    ['IELTS-LI-013','Question types','Sentence completion',ns],
    ['IELTS-LI-014','Question types','Short answer questions',ns],
    ['IELTS-LI-015','Accents','British accent familiarity',ns],
    ['IELTS-LI-016','Accents','Australian accent familiarity',ns],
    ['IELTS-LI-017','Accents','American accent familiarity',ns],
    ['IELTS-LI-018','Accents','New Zealand and other accents',ns],
    ['IELTS-LI-019','Strategy','Time management during the 10-minute transfer period',ns],
    ['IELTS-LI-020','Strategy','Reading questions in advance during section breaks',ns],
    // Reading
    ['IELTS-RE-001','Skills','Skimming for main idea and structure',ns],
    ['IELTS-RE-002','Skills','Scanning for specific information',ns],
    ['IELTS-RE-003','Skills','Reading for detail vs reading for gist',ns],
    ['IELTS-RE-004','Skills','Identifying the writer\'s purpose and tone',ns],
    ['IELTS-RE-005','Skills','Understanding implied meaning and inference',ns],
    ['IELTS-RE-006','Skills','Paraphrase recognition (matching reworded statements to text)',ns],
    ['IELTS-RE-007','Skills','Vocabulary inference from context',ns],
    ['IELTS-RE-008','Skills','Understanding cohesion (referencing, linking words)',ns],
    ['IELTS-RE-009','Question types','True / False / Not Given',ns],
    ['IELTS-RE-010','Question types','Yes / No / Not Given (writer\'s views)',ns],
    ['IELTS-RE-011','Question types','Multiple choice',ns],
    ['IELTS-RE-012','Question types','Matching headings to paragraphs',ns],
    ['IELTS-RE-013','Question types','Matching information to paragraphs',ns],
    ['IELTS-RE-014','Question types','Matching features (e.g. theory to researcher)',ns],
    ['IELTS-RE-015','Question types','Matching sentence endings',ns],
    ['IELTS-RE-016','Question types','Sentence completion',ns],
    ['IELTS-RE-017','Question types','Summary, note, table, or flowchart completion',ns],
    ['IELTS-RE-018','Question types','Diagram label completion',ns],
    ['IELTS-RE-019','Question types','Short answer questions',ns],
    ['IELTS-RE-020','Strategy','Time allocation across 3 passages (17 / 20 / 23 min)',ns],
    ['IELTS-RE-021','Strategy','Deciding when to skip and return',ns],
    ['IELTS-RE-022','Strategy','Handling unfamiliar academic vocabulary',ns],
    ['IELTS-RE-023','Strategy','Distinguishing False from Not Given',ns],
    ['IELTS-RE-024','Vocabulary','Academic Word List (AWL) - sublist 1',ns],
    ['IELTS-RE-025','Vocabulary','Academic Word List (AWL) - sublists 2–3',ns],
    ['IELTS-RE-026','Vocabulary','Academic Word List (AWL) - sublists 4–6',ns],
    ['IELTS-RE-027','Vocabulary','Academic Word List (AWL) - sublists 7–10',ns],
    ['IELTS-RE-028','Vocabulary','Common academic collocations',ns],
    // Writing Task 1
    ['IELTS-WR-001','Task 1 - Chart types','Line graphs (trends over time)',ns],
    ['IELTS-WR-002','Task 1 - Chart types','Bar charts (comparison)',ns],
    ['IELTS-WR-003','Task 1 - Chart types','Pie charts (proportions)',ns],
    ['IELTS-WR-004','Task 1 - Chart types','Tables (mixed data)',ns],
    ['IELTS-WR-005','Task 1 - Chart types','Process diagrams',ns],
    ['IELTS-WR-006','Task 1 - Chart types','Maps (showing change over time)',ns],
    ['IELTS-WR-007','Task 1 - Chart types','Mixed / combined charts',ns],
    ['IELTS-WR-008','Task 1 - Structure','Introduction (paraphrasing the prompt)',ns],
    ['IELTS-WR-009','Task 1 - Structure','Overview paragraph (key trends / features)',ns],
    ['IELTS-WR-010','Task 1 - Structure','Body paragraph organisation (logical grouping)',ns],
    ['IELTS-WR-011','Task 1 - Language','Trend vocabulary (rise, fall, fluctuate, plateau)',ns],
    ['IELTS-WR-012','Task 1 - Language','Comparative and superlative for data comparison',ns],
    ['IELTS-WR-013','Task 1 - Language','Approximation language (approximately, just over, slightly)',ns],
    ['IELTS-WR-014','Task 1 - Language','Cohesion (first, additionally, in contrast, overall)',ns],
    ['IELTS-WR-015','Task 1 - Strategy','Selecting key features for the overview',ns],
    ['IELTS-WR-016','Task 1 - Strategy','Avoiding personal opinion',ns],
    ['IELTS-WR-017','Task 1 - Strategy','Hitting 150 words without padding',ns],
    // Writing Task 2
    ['IELTS-WR-018','Task 2 - Essay types','Opinion essays (agree / disagree, to what extent)',ns],
    ['IELTS-WR-019','Task 2 - Essay types','Discussion essays (discuss both views + opinion)',ns],
    ['IELTS-WR-020','Task 2 - Essay types','Problem-solution essays',ns],
    ['IELTS-WR-021','Task 2 - Essay types','Advantages-disadvantages essays',ns],
    ['IELTS-WR-022','Task 2 - Essay types','Two-part questions (direct question essays)',ns],
    ['IELTS-WR-023','Task 2 - Structure','Introduction (general statement + thesis)',ns],
    ['IELTS-WR-024','Task 2 - Structure','Body paragraph (topic sentence + support + example)',ns],
    ['IELTS-WR-025','Task 2 - Structure','Conclusion (restatement + final thought)',ns],
    ['IELTS-WR-026','Task 2 - Language','Complex sentence structures (subordination, conditional)',ns],
    ['IELTS-WR-027','Task 2 - Language','Cohesive devices (however, moreover, consequently)',ns],
    ['IELTS-WR-028','Task 2 - Language','Hedging and qualification (tend to, often, in many cases)',ns],
    ['IELTS-WR-029','Task 2 - Language','Formal academic register (no contractions or slang)',ns],
    ['IELTS-WR-030','Task 2 - Topic vocab','Education topics',ns],
    ['IELTS-WR-031','Task 2 - Topic vocab','Environment and climate change',ns],
    ['IELTS-WR-032','Task 2 - Topic vocab','Technology and society',ns],
    ['IELTS-WR-033','Task 2 - Topic vocab','Health and lifestyle',ns],
    ['IELTS-WR-034','Task 2 - Topic vocab','Work and careers',ns],
    ['IELTS-WR-035','Task 2 - Topic vocab','Government and policy',ns],
    ['IELTS-WR-036','Task 2 - Topic vocab','Crime and punishment',ns],
    ['IELTS-WR-037','Task 2 - Topic vocab','Globalisation and culture',ns],
    ['IELTS-WR-038','Task 2 - Topic vocab','Media and communication',ns],
    ['IELTS-WR-039','Task 2 - Topic vocab','Family and society',ns],
    ['IELTS-WR-040','Task 2 - Strategy','Planning before writing (5-min plan)',ns],
    ['IELTS-WR-041','Task 2 - Strategy','Idea generation (drawing on examples)',ns],
    ['IELTS-WR-042','Task 2 - Strategy','Hitting 250+ words efficiently',ns],
    ['IELTS-WR-043','Task 2 - Strategy','Time management (40 min total)',ns],
    ['IELTS-WR-044','Assessment criteria','Task Achievement / Response',ns],
    ['IELTS-WR-045','Assessment criteria','Coherence and Cohesion',ns],
    ['IELTS-WR-046','Assessment criteria','Lexical Resource',ns],
    ['IELTS-WR-047','Assessment criteria','Grammatical Range and Accuracy',ns],
    ['IELTS-WR-048','Common errors','Article use (a, an, the)',ns],
    ['IELTS-WR-049','Common errors','Subject-verb agreement',ns],
    ['IELTS-WR-050','Common errors','Word form errors (noun vs adjective vs verb)',ns],
    ['IELTS-WR-051','Common errors','Preposition use',ns],
    // Speaking
    ['IELTS-SP-001','Part 1 - Topics','Home / accommodation',ns],
    ['IELTS-SP-002','Part 1 - Topics','Work or studies',ns],
    ['IELTS-SP-003','Part 1 - Topics','Hometown',ns],
    ['IELTS-SP-004','Part 1 - Topics','Hobbies and free time',ns],
    ['IELTS-SP-005','Part 1 - Topics','Food and cooking',ns],
    ['IELTS-SP-006','Part 1 - Topics','Travel and holidays',ns],
    ['IELTS-SP-007','Part 1 - Topics','Daily routines',ns],
    ['IELTS-SP-008','Part 1 - Topics','Family and friends',ns],
    ['IELTS-SP-009','Part 1 - Strategy','Extending short answers (avoiding one-word responses)',ns],
    ['IELTS-SP-010','Part 1 - Strategy','Sounding natural, not memorised',ns],
    ['IELTS-SP-011','Part 2 - Cue card types','Describe a person',ns],
    ['IELTS-SP-012','Part 2 - Cue card types','Describe a place',ns],
    ['IELTS-SP-013','Part 2 - Cue card types','Describe an object or possession',ns],
    ['IELTS-SP-014','Part 2 - Cue card types','Describe an event or experience',ns],
    ['IELTS-SP-015','Part 2 - Cue card types','Describe a habit or activity',ns],
    ['IELTS-SP-016','Part 2 - Cue card types','Describe a piece of media (book, film, song)',ns],
    ['IELTS-SP-017','Part 2 - Structure','Using the 1-minute prep effectively',ns],
    ['IELTS-SP-018','Part 2 - Structure','Covering all bullet points on the cue card',ns],
    ['IELTS-SP-019','Part 2 - Structure','Speaking for the full 2 minutes',ns],
    ['IELTS-SP-020','Part 2 - Structure','Telling a story with beginning, middle, end',ns],
    ['IELTS-SP-021','Part 3 - Discussion','Expressing and supporting opinions',ns],
    ['IELTS-SP-022','Part 3 - Discussion','Comparing past and present',ns],
    ['IELTS-SP-023','Part 3 - Discussion','Speculating about the future',ns],
    ['IELTS-SP-024','Part 3 - Discussion','Discussing causes and effects',ns],
    ['IELTS-SP-025','Part 3 - Discussion','Considering both sides of an argument',ns],
    ['IELTS-SP-026','Part 3 - Discussion','Hedging and being tentative (might, perhaps, it depends)',ns],
    ['IELTS-SP-027','Assessment criteria','Fluency and coherence',ns],
    ['IELTS-SP-028','Assessment criteria','Lexical resource (range and precision)',ns],
    ['IELTS-SP-029','Assessment criteria','Grammatical range and accuracy',ns],
    ['IELTS-SP-030','Assessment criteria','Pronunciation (segmental and prosodic features)',ns],
    ['IELTS-SP-031','Pronunciation','Word stress in multi-syllable words',ns],
    ['IELTS-SP-032','Pronunciation','Sentence stress (content vs function words)',ns],
    ['IELTS-SP-033','Pronunciation','Intonation (question vs statement)',ns],
    ['IELTS-SP-034','Pronunciation','Connected speech (linking, weak forms)',ns],
    ['IELTS-SP-035','Pronunciation','Sounds Nepali speakers find difficult (/v/ vs /w/, /θ/, /ð/, final consonants)',ns],
    ['IELTS-SP-036','Fluency','Reducing hesitation and filler words',ns],
    ['IELTS-SP-037','Fluency','Time-buying expressions (that\'s interesting, let me think…)',ns],
    ['IELTS-SP-038','Strategy','Handling unfamiliar topics in Part 3',ns],
    ['IELTS-SP-039','Strategy','Self-correction without panic',ns],
    ['IELTS-SP-040','Strategy','Engaging with the examiner (eye contact, body language)',ns],
  ];

  rows.forEach(([id, cat, topic, status]) => {
    sheet.appendRow([id, cat, topic, status, '', '', '', '', '', '', '', email, now]);
  });

  const msg = `Seeded ${rows.length} IELTS topics.`;
  console.log(msg);
  return msg;
}