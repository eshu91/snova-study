# snova-study


## Deployment steps

1. **Create the Apps Script project** — open Snova's spreadsheet → Extensions → Apps Script
2. **Set up clasp** — in your local repo: `clasp login`, then `clasp clone <scriptId>` from the script's project settings
3. **Create all 15 files** in the repo with exactly the names above (`.gs` and `.html` extensions)
4. **Push** — `clasp push`
5. **Run `runSetup()`** from the Apps Script editor (Run → `runSetup`) — this creates all sheets and seeds German A1
6. **Run `populateIELTSSyllabus()`** from the editor — seeds all 140 IELTS topics
7. **Deploy as web app** — Deploy → New deployment → Web app → Execute as: **Me** → Who has access: **Anyone with Google account** → Deploy
8. **Set emails** — open the web app, go to Settings, fill in owner and collaborator emails
9. **Bookmark the URL** on Snova's phone home screen

The next step after this is `03_SyllabusRepository.gs` — the CRUD layer that makes the Syllabus page actually read/write from the sheets. The topic list in `page_syllabus.html` currently shows static placeholder cards; wiring it to real data is Milestone 1.


e:/codes/projects/snova-study/
├── .clasp.json
├── .claspignore
├── 00_Setup.js
├── 01_Constants.js
├── 02_Config.js
├── 03_SyllabusRepository.js
├── 04_Sessions.js
├── 05_DailyLog.js
├── 06_AuditLog.js
├── 07_Triggers.js
├── 08_Email.js
├── 09_WebApp.js
├── 10_Stats.js
├── appsscript.json
├── index.html
├── page_settings.html
├── page_stats.html
├── page_syllabus.html
├── page_today.html
├── partial_nav.html
├── README.md
├── script_api.html
├── script_app.html
└── style_base.html
