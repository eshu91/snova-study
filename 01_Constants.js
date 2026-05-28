// ── Sheet names ───────────────────────────────────────────────────────────────
const SHEET_CONFIG    = 'Config';
const SHEET_SESSIONS  = 'Sessions';
const SHEET_DAILY_LOG = 'DailyLog';
const SHEET_AUDIT_LOG = 'AuditLog';
const SHEET_SYS_LOG   = '_systemLog';
const SHEET_DASHBOARD = 'Dashboard';

const SYLLABUS_SHEETS = {
  A1:    'German_A1',
  A2:    'German_A2',
  B1:    'German_B1',
  B2:    'German_B2',
  IELTS: 'IELTS',
};

// ── Tracks ────────────────────────────────────────────────────────────────────
const ALL_TRACKS = [
  'German A1', 'German A2', 'German B1', 'German B2',
  'IELTS Reading', 'IELTS Writing', 'IELTS Listening', 'IELTS Speaking',
  'IELTS Mock',
];

const TRACK_TO_LEVEL = {
  'German A1': 'A1', 'German A2': 'A2', 'German B1': 'B1', 'German B2': 'B2',
  'IELTS Reading': 'IELTS', 'IELTS Writing': 'IELTS',
  'IELTS Listening': 'IELTS', 'IELTS Speaking': 'IELTS', 'IELTS Mock': 'IELTS',
};

// ── Session types ─────────────────────────────────────────────────────────────
const SESSION_TYPES = ['Study', 'Practice', 'Review', 'Watch/Listen', 'Test'];

// ── Topic statuses ────────────────────────────────────────────────────────────
const STATUS_NOT_STARTED = 'Not started';
const STATUS_LEARNING    = 'Learning';
const STATUS_MASTERED    = 'Mastered';
const STATUS_ARCHIVED    = 'Archived';
const TOPIC_STATUSES     = [STATUS_NOT_STARTED, STATUS_LEARNING, STATUS_MASTERED, STATUS_ARCHIVED];

// ── Phases ────────────────────────────────────────────────────────────────────
const PHASE_PRE_IELTS  = 'pre_ielts';
const PHASE_POST_IELTS = 'post_ielts_pre_germany';
const PHASE_IN_GERMANY = 'in_germany';

// ── Column indexes ────────────────────────────────────────────────────────────
const COL_CFG  = { KEY: 0, VALUE: 1, DESCRIPTION: 2 };

const COL_SYL = {
  ID: 0, CATEGORY: 1, TOPIC: 2, STATUS: 3,
  STARTED_ON: 4, MASTERED_ON: 5, LAST_REVIEWED: 6, NOTES: 7,
  RESOURCES: 8, PREREQUISITES: 9, COLLABORATOR_NOTE: 10,
  ADDED_BY: 11, ADDED_ON: 12,
};

const COL_SESS = {
  SESSION_ID: 0, START_TIME: 1, END_TIME: 2, DURATION_MIN: 3,
  TRACK: 4, TOPIC_IDS: 5, SESSION_TYPE: 6, QUALITY_RATING: 7,
  MINUTES_SELF_REPORTED: 8, NOTES: 9, STATUS: 10, CREATED_BY: 11,
};

const COL_LOG = {
  DATE: 0, TRACKS_STUDIED: 1, TOTAL_MINUTES: 2,
  ANKI_DONE: 3, MOOD: 4, NOTES: 5, CREATED_BY: 6,
};

const COL_AUDIT  = { TIMESTAMP: 0, USER_EMAIL: 1, ACTION: 2, SHEET: 3, ROW_ID: 4, FIELD: 5, BEFORE: 6, AFTER: 7 };
const COL_SYSLOG = { TIMESTAMP: 0, TRIGGER: 1, STATUS: 2, DETAIL: 3 };

// ── Sheet headers ─────────────────────────────────────────────────────────────
const HDR_CONFIG    = ['key', 'value', 'description'];
const HDR_SYLLABUS  = ['id','category','topic','status','started_on','mastered_on',
                       'last_reviewed','notes','resources','prerequisites',
                       'collaborator_note','added_by','added_on'];
const HDR_SESSIONS  = ['session_id','start_time','end_time','duration_min','track',
                       'topic_ids','session_type','quality_rating',
                       'minutes_self_reported','notes','status','created_by'];
const HDR_DAILY_LOG = ['date','tracks_studied','total_minutes','anki_done','mood','notes','created_by'];
const HDR_AUDIT_LOG = ['timestamp','user_email','action','sheet','row_id','field','before','after'];
const HDR_SYS_LOG   = ['timestamp','trigger','status','detail'];

// ── Config defaults ───────────────────────────────────────────────────────────
const CONFIG_DEFAULTS = {
  user_name:                'Snova',
  owner_email:              '',
  collaborator_email:       '',
  notification_email:       '',
  timezone:                 'Asia/Kathmandu',
  phase:                    PHASE_PRE_IELTS,
  ielts_test_date:          '2026-09-17',
  expected_arrival_germany: '',
  daily_check_hour:         '22',
  weekly_summary_day:       'Sunday',
  weekly_summary_hour:      '20',
  streak_grace_days:        '1',
  min_session_minutes:      '15',
  stale_session_hours:      '4',
  theme:                    'auto',
  web_app_version:          '2.0.0',
};