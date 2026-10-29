#!/usr/bin/env node
/**
 * PaperTrack MCP Server
 * ─────────────────────
 * Exposes tools so Claude can record and query paper attempts
 * directly from a conversation (e.g. after evaluating a scanned paper).
 *
 * Transport: stdio  (registered in mcp_config.json)
 * Communicates with the PaperTrack REST API running on localhost.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ── Config ────────────────────────────────────────
const API_BASE = process.env.PAPERTRACK_API || 'http://localhost:3000';

// ── Server ────────────────────────────────────────
const server = new McpServer({
  name:    'papertrack',
  version: '1.0.0',
});

// ── Helper ───────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// ══════════════════════════════════════════════════
// TOOL 1: record_paper_attempt
// Lets Claude insert a new paper attempt after evaluating a paper.
// ══════════════════════════════════════════════════
server.tool(
  'record_paper_attempt',
  {
    subject: z.enum(['Science', 'Math', 'SST', 'English', 'Hindi'])
      .describe('CBSE Class 10 subject. Must be exactly one of the allowed values.'),

    paper_type: z.enum(['Educart Sample Paper', 'PYQ'])
      .describe('Type of paper. Use "Educart Sample Paper" for Educart books; "PYQ" for official previous year CBSE papers.'),

    paper_number: z.string()
      .describe('Paper number or code. Use numeric string (e.g. "1", "2", "3") for Educart Sample Papers; use CBSE set code format (e.g. "30/2/1", "42/4/1") for PYQs.'),

    date_attempted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Date the paper was attempted in YYYY-MM-DD format. Use today\'s date if the user does not specify.'),

    marks_obtained: z.number().min(0).max(80)
      .describe('Total marks scored out of 80. Can be decimal (e.g. 67.5). Do NOT include percentage — it is auto-calculated by the database.'),

    strengths: z.array(z.string()).min(1)
      .describe('List of specific things the student did well. Each item should name a topic/concept/question type and explain what was correct. E.g. ["Electricity numericals — all 3 solved correctly", "Chemical equations — balanced accurately"]. At least 1 required.'),

    weaknesses: z.array(z.string()).min(1)
      .describe('List of specific weak areas where marks were lost. Each item must identify the topic, marks lost, and the type of error (conceptual/calculation/skipped/time). E.g. ["Heredity (Ch.9) — lost 4 marks, confused dominant/recessive alleles", "Trigonometry — skipped 2 questions due to time pressure"]. At least 1 required.'),
  },
  async ({ subject, paper_type, paper_number, date_attempted, marks_obtained, strengths, weaknesses }) => {
    // Format strengths + weaknesses into the comments field
    const comments = [
      'STRENGTHS:',
      ...strengths.map(s => `  • ${s}`),
      '',
      'WEAKNESSES:',
      ...weaknesses.map(w => `  • ${w}`),
    ].join('\n');

    try {
      const record = await apiFetch('/api/attempts', {
        method: 'POST',
        body: JSON.stringify({ subject, paper_type, paper_number, date_attempted, marks_obtained, comments }),
      });

      const pct = record.percentage != null ? `${record.percentage}%` : `${((marks_obtained / 80) * 100).toFixed(1)}%`;

      return {
        content: [{
          type: 'text',
          text: [
            `✅ Paper attempt recorded successfully!`,
            ``,
            `  ID:           ${record.id}`,
            `  Subject:      ${record.subject}`,
            `  Type:         ${record.paper_type}`,
            `  Paper #:      ${record.paper_number}`,
            `  Date:         ${record.date_attempted?.toString().slice(0, 10)}`,
            `  Marks:        ${record.marks_obtained} / 80`,
            `  Percentage:   ${pct}`,
            ``,
            `  STRENGTHS:`,
            ...strengths.map(s => `    • ${s}`),
            ``,
            `  WEAKNESSES:`,
            ...weaknesses.map(w => `    • ${w}`),
          ].join('\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to record attempt: ${err.message}\n\nMake sure the PaperTrack server is running (npm start in e:\\Darsh\\paper_attempts).`,
        }],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════════════════
// TOOL 2: get_paper_attempts
// Let Claude look up recent records for context before evaluating.
// ══════════════════════════════════════════════════
server.tool(
  'get_paper_attempts',
  {
    subject: z.enum(['Science', 'Math', 'SST', 'English', 'Hindi']).optional()
      .describe('Filter by subject (optional)'),
    limit: z.number().int().min(1).max(50).optional().default(10)
      .describe('Max number of records to return (default 10)'),
  },
  async ({ subject, limit }) => {
    try {
      const params = new URLSearchParams();
      if (subject) params.set('subject', subject);
      const rows = await apiFetch(`/api/attempts?${params}`);
      const top  = rows.slice(0, limit);

      if (!top.length) {
        return { content: [{ type: 'text', text: 'No paper attempts found.' }] };
      }

      const lines = top.map(r =>
        `[${r.id}] ${r.date_attempted?.toString().slice(0,10)} | ${r.subject} | ${r.paper_type} #${r.paper_number} | ${r.marks_obtained}/80 (${r.percentage ?? '?'}%) | ${r.comments || '—'}`
      );

      return {
        content: [{
          type: 'text',
          text: `Recent attempts (${top.length}):\n\n${lines.join('\n')}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════════════════
// TOOL 3: get_performance_summary
// Give Claude a quick stats snapshot per subject.
// ══════════════════════════════════════════════════
server.tool(
  'get_performance_summary',
  {},
  async () => {
    try {
      const metrics = await apiFetch('/api/metrics');
      const { subjectAvg, totalAttempts, best, worst } = metrics;

      const lines = subjectAvg.map(s =>
        `  ${s.subject.padEnd(10)} avg: ${s.avg_marks}/80 (${s.avg_percentage}%) over ${s.attempts} attempt(s)`
      );

      const summary = [
        `📊 PaperTrack Performance Summary`,
        `Total attempts: ${totalAttempts}`,
        ``,
        `Subject averages:`,
        ...lines,
        ``,
        best  ? `🏆 Best:  ${best.marks_obtained}/80  — ${best.subject} ${best.paper_type} #${best.paper_number}` : '',
        worst ? `📉 Worst: ${worst.marks_obtained}/80 — ${worst.subject} ${worst.paper_type} #${worst.paper_number}` : '',
      ].filter(l => l !== undefined).join('\n');

      return { content: [{ type: 'text', text: summary }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Start ─────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

