// ═══════════════════════════════════════════════════════════════════════════════
// 11_VocabRepository.js — Vocabulary CRUD + LLM enrichment
// ═══════════════════════════════════════════════════════════════════════════════

// ── Public API (exposed to client via google.script.run) ─────────────────────

/**
 * Add a new vocab word. Saves immediately, then enriches via LLM.
 * Returns the full word object including enrichment (or enrichment_status='failed').
 */
function addVocabWord(params) {
  const word  = String(params.word || '').trim();
  const track = String(params.track || '');
  if (!word)  throw new Error('Word is required.');
  if (!track) throw new Error('Track is required.');

  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_VOCABULARY);
  if (!sheet) throw new Error('Vocabulary sheet not found. Run runSetup() first.');

  // Check for duplicate
  if (_vocabWordExists_(sheet, word, track)) {
    throw new Error('"' + word + '" already exists in ' + track + '.');
  }

  const id    = _nextVocabId_(sheet);
  const email = _vocabUserEmail_();
  const now   = new Date().toISOString();

  // Write the row immediately (enrichment may take a moment)
  const row = _emptyVocabRow_();
  row[COL_VOCAB.VOCAB_ID]          = id;
  row[COL_VOCAB.WORD]              = word;
  row[COL_VOCAB.TRACK]             = track;
  row[COL_VOCAB.SOURCE]            = params.source || 'manual';
  row[COL_VOCAB.STATUS]            = 'new';
  row[COL_VOCAB.NOTES]             = params.notes || '';
  row[COL_VOCAB.ENRICHMENT_STATUS] = 'pending';
  row[COL_VOCAB.ADDED_ON]          = now;
  row[COL_VOCAB.ADDED_BY]          = email;
  sheet.appendRow(row);

  // Attempt LLM enrichment
  const enriched = _enrichWord_(word, track, id);
  if (enriched) {
    const dataRow = _findVocabRowNum_(sheet, id);
    if (dataRow > 0) {
      sheet.getRange(dataRow, COL_VOCAB.MEANING + 1).setValue(enriched.meaning || '');
      sheet.getRange(dataRow, COL_VOCAB.SYNONYMS + 1).setValue(enriched.synonyms || '');
      sheet.getRange(dataRow, COL_VOCAB.ANTONYMS + 1).setValue(enriched.antonyms || '');
      sheet.getRange(dataRow, COL_VOCAB.EXAMPLE_SENTENCE + 1).setValue(enriched.example || '');
      sheet.getRange(dataRow, COL_VOCAB.ENRICHMENT_STATUS + 1).setValue('done');
    }
  }

  return _getVocabById_(sheet, id);
}

/**
 * Retry enrichment for a word whose enrichment_status is 'failed' or 'pending'.
 */
function retryEnrichment(vocabId) {
  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_VOCABULARY);
  if (!sheet) throw new Error('Vocabulary sheet not found.');

  const rowNum = _findVocabRowNum_(sheet, vocabId);
  if (rowNum < 2) throw new Error('Word not found: ' + vocabId);

  const rowData = sheet.getRange(rowNum, 1, 1, HDR_VOCABULARY.length).getValues()[0];
  const word    = String(rowData[COL_VOCAB.WORD]);
  const track   = String(rowData[COL_VOCAB.TRACK]);

  const enriched = _enrichWord_(word, track, vocabId);
  if (enriched) {
    sheet.getRange(rowNum, COL_VOCAB.MEANING + 1).setValue(enriched.meaning || '');
    sheet.getRange(rowNum, COL_VOCAB.SYNONYMS + 1).setValue(enriched.synonyms || '');
    sheet.getRange(rowNum, COL_VOCAB.ANTONYMS + 1).setValue(enriched.antonyms || '');
    sheet.getRange(rowNum, COL_VOCAB.EXAMPLE_SENTENCE + 1).setValue(enriched.example || '');
    sheet.getRange(rowNum, COL_VOCAB.ENRICHMENT_STATUS + 1).setValue('done');
    return _getVocabById_(sheet, vocabId);
  }
  throw new Error('Enrichment failed. Check your AI config in Settings.');
}

/**
 * Get recent vocab words, optionally filtered by tracks array.
 * Returns newest first. Used by the vocab page right-column list.
 */
function getRecentVocab(limit, tracks) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_VOCABULARY);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const all = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_VOCABULARY.length).getValues();
  let filtered = all;
  if (tracks && tracks.length > 0) {
    filtered = all.filter(r => tracks.indexOf(String(r[COL_VOCAB.TRACK])) >= 0);
  }

  return filtered
    .sort((a, b) => new Date(b[COL_VOCAB.ADDED_ON]) - new Date(a[COL_VOCAB.ADDED_ON]))
    .slice(0, limit || 20)
    .map(_rowToVocabObj_);
}

/**
 * Update a vocab word's status or notes.
 */
function updateVocabWord(vocabId, updates) {
  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_VOCABULARY);
  if (!sheet) throw new Error('Vocabulary sheet not found.');

  const rowNum = _findVocabRowNum_(sheet, vocabId);
  if (rowNum < 2) throw new Error('Word not found: ' + vocabId);

  if (updates.status !== undefined) {
    if (VOCAB_STATUSES.indexOf(updates.status) < 0) {
      throw new Error('Invalid status: ' + updates.status);
    }
    sheet.getRange(rowNum, COL_VOCAB.STATUS + 1).setValue(updates.status);
  }
  if (updates.notes !== undefined) {
    sheet.getRange(rowNum, COL_VOCAB.NOTES + 1).setValue(updates.notes);
  }

  return _getVocabById_(sheet, vocabId);
}

/**
 * Search vocab words by query string. Used by global search.
 */
function searchVocab(query) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_VOCABULARY);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const q   = String(query).toLowerCase();
  const all = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_VOCABULARY.length).getValues();

  return all
    .filter(r => {
      const word    = String(r[COL_VOCAB.WORD]).toLowerCase();
      const meaning = String(r[COL_VOCAB.MEANING]).toLowerCase();
      return word.indexOf(q) >= 0 || meaning.indexOf(q) >= 0;
    })
    .slice(0, 10)
    .map(_rowToVocabObj_);
}

/**
 * Get vocab stats: counts by track family, today count, total.
 */
function getVocabStats(tracks) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_VOCABULARY);
  if (!sheet || sheet.getLastRow() < 2) {
    return { total: 0, german: 0, ielts: 0, today: 0, byStatus: { 'new': 0, reviewed: 0, known: 0 } };
  }

  const all   = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_VOCABULARY.length).getValues();
  const today = new Date().toISOString().split('T')[0];

  const stats = { total: all.length, german: 0, ielts: 0, today: 0, byStatus: { 'new': 0, reviewed: 0, known: 0 } };

  all.forEach(r => {
    const track  = String(r[COL_VOCAB.TRACK]);
    const status = String(r[COL_VOCAB.STATUS]);
    const added  = String(r[COL_VOCAB.ADDED_ON]).split('T')[0];

    if (track.indexOf('German') === 0) stats.german++;
    if (track.indexOf('IELTS') === 0)  stats.ielts++;
    if (added === today)               stats.today++;
    if (stats.byStatus.hasOwnProperty(status)) stats.byStatus[status]++;
  });

  return stats;
}

/**
 * Ask LLM to suggest words for a given track. Excludes words already in the sheet.
 */
function suggestWords(track, count) {
  const n = Math.min(parseInt(count, 10) || 5, 10);

  // Get existing words to exclude
  const sheet    = SpreadsheetApp.getActive().getSheetByName(SHEET_VOCABULARY);
  const existing = new Set();
  if (sheet && sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_VOCABULARY.length).getValues()
      .forEach(r => existing.add(String(r[COL_VOCAB.WORD]).toLowerCase()));
  }

  const isGerman = track.indexOf('German') === 0;
  const level    = isGerman ? track.replace('German ', '') : '';

  let prompt;
  if (isGerman) {
    prompt = 'Suggest ' + n + ' useful German vocabulary words for a student at CEFR level ' + level + '. ' +
      'For each word give ONLY the German word. ' +
      'Do NOT include any of these words: ' + Array.from(existing).slice(0, 50).join(', ') + '. ' +
      'Respond ONLY with a JSON array of strings, no explanation. Example: ["Wort1","Wort2"]';
  } else {
    prompt = 'Suggest ' + n + ' academic English vocabulary words useful for IELTS Academic exam preparation. ' +
      'Choose words that are commonly tested in IELTS ' + track.replace('IELTS ', '') + '. ' +
      'Do NOT include any of these words: ' + Array.from(existing).slice(0, 50).join(', ') + '. ' +
      'Respond ONLY with a JSON array of strings, no explanation. Example: ["word1","word2"]';
  }

  const result = _callLLM_(prompt, 'suggest');
  if (!result || !result.text) return [];

  try {
    const cleaned = result.text.replace(/```json|```/g, '').trim();
    const words   = JSON.parse(cleaned);
    if (Array.isArray(words)) return words.slice(0, n);
  } catch (e) {
    // Try to extract words from non-JSON response
    const matches = result.text.match(/"([^"]+)"/g);
    if (matches) return matches.map(m => m.replace(/"/g, '')).slice(0, n);
  }

  return [];
}

/**
 * Get LLM usage stats for the current month.
 */
function getLLMUsageStats() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_LLM_LOG);
  if (!sheet || sheet.getLastRow() < 2) {
    return { totalRequests: 0, successful: 0, failed: 0, topModel: '-', avgLatency: 0 };
  }

  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const all       = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_LLM_LOG.length).getValues();
  const thisMonth = all.filter(r => String(r[COL_LLM.TIMESTAMP]) >= monthStart);

  const successful = thisMonth.filter(r => String(r[COL_LLM.STATUS]) === 'ok').length;
  const failed     = thisMonth.filter(r => String(r[COL_LLM.STATUS]) !== 'ok').length;

  // Most-used model
  const modelCounts = {};
  thisMonth.forEach(r => {
    const m = String(r[COL_LLM.MODEL]);
    modelCounts[m] = (modelCounts[m] || 0) + 1;
  });
  const topModel = Object.keys(modelCounts).sort((a, b) => modelCounts[b] - modelCounts[a])[0] || '-';

  // Average latency
  const latencies = thisMonth.map(r => parseInt(r[COL_LLM.LATENCY_MS], 10) || 0).filter(l => l > 0);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  return {
    totalRequests: thisMonth.length,
    successful,
    failed,
    topModel,
    avgLatency,
  };
}

/**
 * Test LLM connection with a simple prompt. Returns success/error info.
 */
function testLLMConnection() {
  const start  = Date.now();
  const result = _callLLM_('Respond with exactly: OK', 'test');
  const ms     = Date.now() - start;

  if (result && result.text) {
    return { ok: true, model: getConfig('llm_model'), latency: ms, response: result.text.slice(0, 50) };
  }
  return { ok: false, error: result ? result.error : 'No response', model: getConfig('llm_model') };
}


// ── Private: LLM call layer ──────────────────────────────────────────────────

function _callLLM_(prompt, vocabIdOrTag) {
  const provider = getConfig('llm_provider') || 'openrouter';
  const apiKey   = getConfig('llm_api_key');
  const model    = getConfig('llm_model') || 'meta-llama/llama-3.1-8b-instruct:free';
  const baseUrl  = getConfig('llm_base_url') || 'https://openrouter.ai/api/v1/chat/completions';

  if (!apiKey) return { text: null, error: 'No API key configured' };

  const startMs = Date.now();

  // Build request based on provider
  let url, headers, body;

  if (provider === 'gemini') {
    // Gemini uses a different format
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
    headers = { 'Content-Type': 'application/json' };
    body = { contents: [{ parts: [{ text: prompt }] }] };
  } else {
    // OpenRouter / OpenAI / Custom — all OpenAI-compatible
    url = baseUrl;
    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    };
if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://docs.google.com/spreadsheets';
      headers['X-Title']      = 'Snova Study Tracker';
    } else if (provider === 'groq') {
      // Groq uses standard OpenAI format, no extra headers needed
    }
    body = {
      model: model,
      messages: [
        { role: 'system', content: 'You are a concise vocabulary assistant. Always respond with valid JSON when asked.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    };
  }

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const code    = resp.getResponseCode();
    const respObj = JSON.parse(resp.getContentText());
    const latency = Date.now() - startMs;

    if (code < 200 || code >= 300) {
      const errMsg = respObj.error ? (respObj.error.message || JSON.stringify(respObj.error)) : 'HTTP ' + code;
      _writeLLMLog_(vocabIdOrTag, model, provider, 0, 0, 'error', latency, errMsg);
      return { text: null, error: errMsg };
    }

    // Extract text and token counts based on provider
    let text, promptTokens, completionTokens;

    if (provider === 'gemini') {
      text = respObj.candidates && respObj.candidates[0] && respObj.candidates[0].content
        ? respObj.candidates[0].content.parts[0].text : '';
      promptTokens     = respObj.usageMetadata ? respObj.usageMetadata.promptTokenCount     : 0;
      completionTokens = respObj.usageMetadata ? respObj.usageMetadata.candidatesTokenCount  : 0;
    } else {
      text = respObj.choices && respObj.choices[0] ? respObj.choices[0].message.content : '';
      promptTokens     = respObj.usage ? respObj.usage.prompt_tokens     : 0;
      completionTokens = respObj.usage ? respObj.usage.completion_tokens : 0;
    }

    _writeLLMLog_(vocabIdOrTag, model, provider, promptTokens, completionTokens, 'ok', latency, '');
    return { text: text.trim(), promptTokens, completionTokens, latency };

  } catch (e) {
    const latency = Date.now() - startMs;
    _writeLLMLog_(vocabIdOrTag, model, provider, 0, 0, 'error', latency, e.message);
    return { text: null, error: e.message };
  }
}

function _writeLLMLog_(vocabId, model, provider, promptTokens, completionTokens, status, latencyMs, errorDetail) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_LLM_LOG);
    if (!sheet) return;
    sheet.appendRow([
      new Date().toISOString(),
      vocabId || '',
      model || '',
      provider || '',
      promptTokens || 0,
      completionTokens || 0,
      status || 'unknown',
      latencyMs || 0,
      errorDetail || '',
    ]);
  } catch (e) { /* silent — log failure shouldn't break enrichment */ }
}


// ── Private: Enrichment prompt builder ───────────────────────────────────────

function _enrichWord_(word, track, vocabId) {
  const isGerman = track.indexOf('German') === 0;

  let prompt;
  if (isGerman) {
    prompt = 'For the German word "' + word + '":\n' +
      '1. Provide the English translation/meaning (1-2 sentences).\n' +
      '2. List 2-4 German synonyms.\n' +
      '3. List 1-3 German antonyms (if applicable, otherwise empty array).\n' +
      '4. Write one example sentence in German with English translation.\n\n' +
      'Respond ONLY with this JSON (no markdown, no backticks):\n' +
      '{"meaning":"...","synonyms":"syn1, syn2","antonyms":"ant1, ant2","example":"German sentence — English translation"}';
  } else {
    prompt = 'For the English word "' + word + '" in an academic/IELTS context:\n' +
      '1. Define it in 1-2 sentences, suitable for an IELTS Academic student.\n' +
      '2. List 3-5 synonyms.\n' +
      '3. List 2-3 antonyms (if applicable, otherwise empty array).\n' +
      '4. Write one example sentence suitable for IELTS Academic writing.\n\n' +
      'Respond ONLY with this JSON (no markdown, no backticks):\n' +
      '{"meaning":"...","synonyms":"syn1, syn2, syn3","antonyms":"ant1, ant2","example":"..."}';
  }

  const result = _callLLM_(prompt, vocabId);
  if (!result || !result.text) return null;

  try {
    const cleaned = result.text.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    return {
      meaning:  String(parsed.meaning  || ''),
      synonyms: String(parsed.synonyms || ''),
      antonyms: String(parsed.antonyms || ''),
      example:  String(parsed.example  || ''),
      model:    getConfig('llm_model'),
      latency:  result.latency,
    };
  } catch (e) {
    // If JSON parsing fails, try to salvage plain text as meaning
    return {
      meaning:  result.text.slice(0, 300),
      synonyms: '',
      antonyms: '',
      example:  '',
      model:    getConfig('llm_model'),
      latency:  result.latency,
    };
  }
}


// ── Private: Sheet helpers ───────────────────────────────────────────────────

function _emptyVocabRow_() {
  return new Array(HDR_VOCABULARY.length).fill('');
}

function _nextVocabId_(sheet) {
  if (sheet.getLastRow() < 2) return 'VOC-00001';
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .map(r => String(r[0]))
    .filter(id => id.indexOf('VOC-') === 0)
    .map(id => parseInt(id.replace('VOC-', ''), 10) || 0);
  const max = ids.length > 0 ? Math.max.apply(null, ids) : 0;
  return 'VOC-' + String(max + 1).padStart(5, '0');
}

function _findVocabRowNum_(sheet, vocabId) {
  if (sheet.getLastRow() < 2) return -1;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === vocabId) return i + 2;
  }
  return -1;
}

function _getVocabById_(sheet, vocabId) {
  const rowNum = _findVocabRowNum_(sheet, vocabId);
  if (rowNum < 2) return null;
  const row = sheet.getRange(rowNum, 1, 1, HDR_VOCABULARY.length).getValues()[0];
  return _rowToVocabObj_(row);
}

function _vocabWordExists_(sheet, word, track) {
  if (sheet.getLastRow() < 2) return false;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, HDR_VOCABULARY.length).getValues();
  const w = word.toLowerCase();
  return data.some(r =>
    String(r[COL_VOCAB.WORD]).toLowerCase() === w && String(r[COL_VOCAB.TRACK]) === track
  );
}

function _rowToVocabObj_(row) {
  return {
    vocabId:          String(row[COL_VOCAB.VOCAB_ID]),
    word:             String(row[COL_VOCAB.WORD]),
    track:            String(row[COL_VOCAB.TRACK]),
    meaning:          String(row[COL_VOCAB.MEANING]),
    synonyms:         String(row[COL_VOCAB.SYNONYMS]),
    antonyms:         String(row[COL_VOCAB.ANTONYMS]),
    exampleSentence:  String(row[COL_VOCAB.EXAMPLE_SENTENCE]),
    source:           String(row[COL_VOCAB.SOURCE]),
    status:           String(row[COL_VOCAB.STATUS]),
    notes:            String(row[COL_VOCAB.NOTES]),
    enrichmentStatus: String(row[COL_VOCAB.ENRICHMENT_STATUS]),
    addedOn:          String(row[COL_VOCAB.ADDED_ON]),
    addedBy:          String(row[COL_VOCAB.ADDED_BY]),
  };
}

function _vocabUserEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}