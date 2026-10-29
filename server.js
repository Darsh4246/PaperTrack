require('dotenv').config();
const express = require('express');
const path    = require('path');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ── Ollama config ──────────────────────────────────
const OLLAMA_URL   = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const AI_CACHE_MIN = parseInt(process.env.AI_CACHE_MINUTES) || 30;

// ── Separate in-memory AI caches ───────────────────
const aiCaches = {
  coach: null,
  predictions: null,
  patterns: null,
  planner: null,
};

function clearAiCaches() {
  aiCaches.coach = null;
  aiCaches.predictions = null;
  aiCaches.patterns = null;
  aiCaches.planner = null;
}

// ── DB pool ───────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────

/**
 * Parse JSON with an auto-repair fallback for common LLM output issues:
 *  - Truncated arrays/objects (model hit token limit mid-output)
 *  - Trailing commas before } or ]
 *  - Unescaped quotes inside strings
 */
function safeParseJSON(str) {
  // 1. First try clean parse
  try { return JSON.parse(str); } catch (_) {}

  // 2. Strip trailing commas before ] or }
  let fixed = str.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(fixed); } catch (_) {}

  // 3. If truncated mid-array or mid-object, close all open brackets
  fixed = repairTruncatedJSON(fixed);
  try { return JSON.parse(fixed); } catch (e) {
    throw new Error(`AI JSON is malformed and could not be repaired: ${e.message}. First 300 chars: ${str.slice(0, 300)}`);
  }
}

/**
 * Close any unclosed [ or { brackets at the end of a truncated JSON string.
 */
function repairTruncatedJSON(str) {
  const stack = [];
  let inString = false;
  let escape   = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    if (ch === '}' || ch === ']') stack.pop();
  }

  // Remove trailing comma before we append closers
  let result = str.replace(/,\s*$/, '');
  // Close all open structures in reverse order
  while (stack.length) result += stack.pop();
  return result;
}

// ─────────────────────────────────────────────────
// GET /api/attempts  — list all with optional filters
// ─────────────────────────────────────────────────
app.get('/api/attempts', async (req, res) => {
  try {
    const { subject, paper_type, date_from, date_to } = req.query;
    let query = 'SELECT * FROM paper_attempts WHERE 1=1';
    const params = [];
    let idx = 1;

    if (subject)    { query += ` AND subject = $${idx++}`;         params.push(subject); }
    if (paper_type) { query += ` AND paper_type = $${idx++}`;      params.push(paper_type); }
    if (date_from)  { query += ` AND date_attempted >= $${idx++}`; params.push(date_from); }
    if (date_to)    { query += ` AND date_attempted <= $${idx++}`; params.push(date_to); }

    query += ' ORDER BY date_attempted DESC, id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────
// GET /api/attempts/:id  — single record
// ─────────────────────────────────────────────────
app.get('/api/attempts/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM paper_attempts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────
// POST /api/attempts  — insert
// ─────────────────────────────────────────────────
app.post('/api/attempts', async (req, res) => {
  try {
    const { subject, paper_type, paper_number, date_attempted, marks_obtained, comments } = req.body;
    const result = await pool.query(
      `INSERT INTO paper_attempts (subject, paper_type, paper_number, date_attempted, marks_obtained, comments)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [subject, paper_type, paper_number, date_attempted, marks_obtained, comments || null]
    );
    // Invalidate AI caches on new data
    clearAiCaches();
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────
// PUT /api/attempts/:id  — update
// ─────────────────────────────────────────────────
app.put('/api/attempts/:id', async (req, res) => {
  try {
    const { subject, paper_type, paper_number, date_attempted, marks_obtained, comments } = req.body;
    const result = await pool.query(
      `UPDATE paper_attempts
         SET subject=$1, paper_type=$2, paper_number=$3,
             date_attempted=$4, marks_obtained=$5, comments=$6
       WHERE id=$7 RETURNING *`,
      [subject, paper_type, paper_number, date_attempted, marks_obtained, comments || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    clearAiCaches();
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────
// DELETE /api/attempts/:id  — delete
// ─────────────────────────────────────────────────
app.delete('/api/attempts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM paper_attempts WHERE id = $1', [req.params.id]);
    clearAiCaches();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────
// GET /api/metrics  — aggregated data for charts
// ─────────────────────────────────────────────────
app.get('/api/metrics', async (req, res) => {
  try {
    const subjectAvg = await pool.query(
      `SELECT subject,
              ROUND(AVG(marks_obtained), 2) AS avg_marks,
              ROUND(AVG(percentage), 2)     AS avg_percentage,
              COUNT(*) AS attempts
       FROM paper_attempts GROUP BY subject ORDER BY subject`
    );

    const trend = await pool.query(
      `SELECT id, subject, date_attempted, marks_obtained, percentage, paper_type, paper_number
       FROM paper_attempts ORDER BY date_attempted ASC, id ASC`
    );

    const byPaperType = await pool.query(
      `SELECT paper_type,
              ROUND(AVG(marks_obtained), 2) AS avg_marks,
              ROUND(AVG(percentage), 2)     AS avg_percentage,
              COUNT(*) AS attempts
       FROM paper_attempts GROUP BY paper_type`
    );

    const recent = await pool.query(
      `SELECT * FROM paper_attempts ORDER BY date_attempted DESC, id DESC LIMIT 5`
    );

    const best  = await pool.query(`SELECT * FROM paper_attempts ORDER BY marks_obtained DESC LIMIT 1`);
    const worst = await pool.query(`SELECT * FROM paper_attempts ORDER BY marks_obtained ASC  LIMIT 1`);
    const total = await pool.query(`SELECT COUNT(*) AS total FROM paper_attempts`);

    res.json({
      subjectAvg:    subjectAvg.rows,
      trend:         trend.rows,
      byPaperType:   byPaperType.rows,
      recent:        recent.rows,
      best:          best.rows[0]  || null,
      worst:         worst.rows[0] || null,
      totalAttempts: parseInt(total.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────
// SHARED AI DATA & HELPERS
// ─────────────────────────────────────────────────

async function getStudentPerformanceContext() {
  const [attemptsRes, subjectAvgRes] = await Promise.all([
    pool.query(
      `SELECT subject, paper_type, paper_number, date_attempted,
              marks_obtained, percentage, comments
       FROM paper_attempts
       ORDER BY date_attempted ASC, id ASC`
    ),
    pool.query(
      `SELECT subject,
              ROUND(AVG(marks_obtained), 2) AS avg_marks,
              ROUND(AVG(percentage), 2)     AS avg_pct,
              COUNT(*) AS attempts,
              ROUND(MIN(marks_obtained), 2) AS min_marks,
              ROUND(MAX(marks_obtained), 2) AS max_marks,
              ROUND(AVG(CASE WHEN id <= (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY id)
                                        FROM paper_attempts pa2
                                        WHERE pa2.subject = pa.subject)
                             THEN marks_obtained END), 2) AS early_avg,
              ROUND(AVG(CASE WHEN id >  (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY id)
                                        FROM paper_attempts pa2
                                        WHERE pa2.subject = pa.subject)
                             THEN marks_obtained END), 2) AS recent_avg
       FROM paper_attempts pa
       GROUP BY subject
       ORDER BY subject`
    ),
  ]);

  const attempts = attemptsRes.rows;
  const subjectAvg = subjectAvgRes.rows;
  if (!attempts.length) return null;

  const attemptsTimeline = attempts.map(a =>
    `- [${a.date_attempted?.toString().slice(0, 10)}] ${a.subject} | ${a.paper_type} #${a.paper_number}: ${a.marks_obtained}/80 (${a.percentage ?? ((a.marks_obtained/80)*100).toFixed(1)}%) | Notes/Comments: ${a.comments || '(none)'}`
  ).join('\n');

  const subjectSummaries = subjectAvg.map(s => {
    const trend = s.recent_avg && s.early_avg
      ? (parseFloat(s.recent_avg) > parseFloat(s.early_avg) ? 'improving' : 'declining')
      : 'not enough data';

    const comments = attempts
      .filter(a => a.subject === s.subject && a.comments && a.comments.trim())
      .map(a => `[${a.paper_type} #${a.paper_number} on ${a.date_attempted?.toString().slice(0,10)}]: "${a.comments.trim()}"`)
      .join('\n');

    return `Subject: ${s.subject}
Attempts: ${s.attempts} | Avg: ${s.avg_marks}/80 (${s.avg_pct}%) | Min: ${s.min_marks} | Max: ${s.max_marks}
Trend: ${trend} (early avg: ${s.early_avg ?? 'N/A'}, recent avg: ${s.recent_avg ?? 'N/A'})
Student comments on these papers:
${comments || '(no comments recorded)'}`;
  }).join('\n\n');

  return { attempts, subjectAvg, attemptsTimeline, subjectSummaries };
}

async function callOllamaJSON(prompt, numPredict = 2000) {
  console.log(`🤖 Calling Ollama (${OLLAMA_MODEL})…`);

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: numPredict,
      },
    }),
  });

  if (!ollamaRes.ok) {
    const errText = await ollamaRes.text();
    throw new Error(`Ollama error ${ollamaRes.status}: ${errText}`);
  }

  const ollamaData = await ollamaRes.json();
  const rawText = ollamaData.response || '';

  // Strip <think>...</think> blocks from reasoning models
  const cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences
  const fenceStripped = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // Extract outermost JSON object
  const jsonMatch = fenceStripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned no valid JSON. Raw: ' + fenceStripped.slice(0, 300));

  return safeParseJSON(jsonMatch[0]);
}

function checkCache(cacheKey, force) {
  if (!force && aiCaches[cacheKey]) {
    const ageMs = Date.now() - aiCaches[cacheKey].timestamp;
    if (ageMs < AI_CACHE_MIN * 60 * 1000) {
      return aiCaches[cacheKey].data;
    }
  }
  return null;
}

function setCache(cacheKey, data) {
  aiCaches[cacheKey] = {
    data: { ...data, status: 'ok', model: OLLAMA_MODEL, cached: false },
    timestamp: Date.now(),
  };
}

// ─────────────────────────────────────────────────
// 1. GET /api/ai/coach  — General Coaching & Diagnostics
// ─────────────────────────────────────────────────
app.get(['/api/ai/coach', '/api/ai-insights'], async (req, res) => {
  const force = req.query.force === '1';
  const cached = checkCache('coach', force);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const ctx = await getStudentPerformanceContext();
    if (!ctx) {
      return res.json({
        status: 'no_data',
        message: 'Add some paper attempts first to get AI insights.',
        subjects: {},
        overall: null,
      });
    }

    const prompt = `You are an academic coach for a CBSE Class 10 student (Total marks: 80 per paper).
Grading: ≥72 = A1, ≥64 = A2, ≥56 = B1, ≥48 = B2, <48 = Needs Work.

Student Performance Summary:
${ctx.subjectSummaries}

Produce raw JSON with EXACTLY this structure (no markdown, no extra text):
{
  "overall": {
    "headline": "<one encouraging sentence about overall performance>",
    "praise": "<specific thing the student is doing well>",
    "improvement_trend": "<are they improving overall? cite scores/numbers>",
    "top_priority": "<the single most important thing to focus on right now>"
  },
  "subjects": {
    "<SubjectName>": {
      "grade": "<A1/A2/B1/B2/Needs Work based on avg>",
      "summary": "<2-sentence summary of performance in this subject>",
      "weak_spots": ["<specific weak topic from comments>", "..."],
      "strengths": ["<specific strength>", "..."],
      "advice": "<concrete, actionable advice for this subject in 1-2 sentences>",
      "trend_emoji": "<one of: 📈 📉 ➡️>"
    }
  }
}
Only include attempted subjects.`;

    const data = await callOllamaJSON(prompt, 1800);
    setCache('coach', data);
    res.json(aiCaches.coach.data);
  } catch (err) {
    console.error('Coach AI error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─────────────────────────────────────────────────
// 2. GET /api/ai/predictions  — Score Predictor
// ─────────────────────────────────────────────────
app.get('/api/ai/predictions', async (req, res) => {
  const force = req.query.force === '1';
  const cached = checkCache('predictions', force);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const ctx = await getStudentPerformanceContext();
    if (!ctx) {
      return res.json({ status: 'no_data', message: 'No attempts to project scores.', predictions: {} });
    }

    const prompt = `You are an expert CBSE Class 10 exam statistician.
Analyze the student's attempt curve, considering paper types (Educart vs PYQ) and difficulty progression.

Attempt Timeline:
${ctx.attemptsTimeline}

Subject Averages:
${ctx.subjectSummaries}

Predict the student's final CBSE Board Exam score (out of 80) for each attempted subject.
Produce raw JSON with EXACTLY this structure (no markdown, no extra text):
{
  "predictions": {
    "<SubjectName>": {
      "predicted_score": "<e.g. 71 - 75 / 80>",
      "predicted_grade": "<A1 | A2 | B1 | B2 | Needs Work>",
      "trajectory": "<Rising | Stable | Inconsistent | Needs Push>",
      "analysis": "<1-2 sentence projection based on attempts and paper difficulty>",
      "next_tier_target": "<concrete action to gain +3 to +5 marks and secure the next grade>"
    }
  },
  "overall_projected_percentage": "<e.g. 88 - 92%>",
  "board_readiness_verdict": "<1-sentence summary of readiness for CBSE board exams>"
}
Ensure each attempted subject has an entry.`;

    const data = await callOllamaJSON(prompt, 1500);
    setCache('predictions', data);
    res.json(aiCaches.predictions.data);
  } catch (err) {
    console.error('Predictions AI error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─────────────────────────────────────────────────
// 3. GET /api/ai/patterns  — Recurring Mistake Pattern Detector
// ─────────────────────────────────────────────────
app.get('/api/ai/patterns', async (req, res) => {
  const force = req.query.force === '1';
  const cached = checkCache('patterns', force);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const ctx = await getStudentPerformanceContext();
    if (!ctx) {
      return res.json({ status: 'no_data', message: 'No attempts recorded.', patterns: [] });
    }

    const prompt = `You are an academic diagnostic analyzer for a CBSE Class 10 student.
Your task is to detect recurring blind spots, persistent error patterns, and repeat mistakes by cross-referencing all paper comments and weaknesses.

Attempts & Notes:
${ctx.attemptsTimeline}

Subject Details & Comments:
${ctx.subjectSummaries}

Produce raw JSON with EXACTLY this structure (no markdown, no extra text):
{
  "patterns": [
    {
      "subject": "<SubjectName>",
      "pattern_title": "<e.g. Balancing Chemical Equations>",
      "frequency_note": "<e.g. Repeated across 2 Educart papers>",
      "category": "<Conceptual | Calculation | Time Pressure | Presentation>",
      "remedy": "<specific corrective action or drill to eliminate this repeat mistake>"
    }
  ],
  "top_blind_spot": "<the #1 most damaging recurring mistake across all subjects>"
}
Provide 3 to 5 realistic, high-impact recurring patterns.`;

    const data = await callOllamaJSON(prompt, 1600);
    setCache('patterns', data);
    res.json(aiCaches.patterns.data);
  } catch (err) {
    console.error('Patterns AI error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─────────────────────────────────────────────────
// 4. GET /api/ai/planner  — 7-Day Adaptive AI Study Plan
// ─────────────────────────────────────────────────
app.get('/api/ai/planner', async (req, res) => {
  const force = req.query.force === '1';
  const cached = checkCache('planner', force);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const ctx = await getStudentPerformanceContext();
    if (!ctx) {
      return res.json({ status: 'no_data', message: 'No attempts recorded.', planner: [] });
    }

    const prompt = `You are a study schedule planner for a CBSE Class 10 student preparing for board exams.
Create a focused 7-day adaptive revision timetable that prioritizes the student's weakest subjects and topics identified from their attempts.

Attempts & Notes:
${ctx.attemptsTimeline}

Subject Averages & Notes:
${ctx.subjectSummaries}

Produce raw JSON with EXACTLY this structure (no markdown, no extra text):
{
  "planner": [
    {
      "day": "<e.g. Day 1 (Monday)>",
      "subject": "<SubjectName>",
      "duration": "<e.g. 50 mins>",
      "focus_topic": "<specific topic based on student weak spots>",
      "tasks": [
        "<Actionable task 1>",
        "<Actionable task 2>"
      ],
      "priority": "<High | Medium>"
    }
  ],
  "weekly_goal": "<one clear objective for the upcoming 7 days>"
}
Generate 5 to 7 daily sessions. Keep tasks concrete and actionable.`;

    const data = await callOllamaJSON(prompt, 1800);
    setCache('planner', data);
    res.json(aiCaches.planner.data);
  } catch (err) {
    console.error('Planner AI error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Serve index.html for all other routes ─────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Paper Attempts tracker running at http://localhost:${PORT}`);
  console.log(`🌐 Network accessible at http://${HOST}:${PORT}`);
  console.log(`🤖 AI model: ${OLLAMA_MODEL} via ${OLLAMA_URL}`);
});
