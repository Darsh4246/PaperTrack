---
name: evaluate-paper
description: >-
  Evaluate a CBSE Class 10 exam paper shared by the user (photo, PDF, or text),
  determine the marks scored, and automatically record the attempt in PaperTrack
  using the papertrack MCP tools. Activated when the user shares a paper and asks
  to record it, evaluate it, or log the attempt.
---

# Evaluate Paper & Record Attempt

Use this skill when the user shares a CBSE Class 10 paper (image, PDF, or typed answers) and wants to record or evaluate it.

---

## Predefined Categories — Use EXACTLY These Values

### Subject (pick one)
| Value | Use for |
|-------|---------|
| `Science` | Physics / Chemistry / Biology combined paper |
| `Math` | Mathematics / Basic Maths |
| `SST` | Social Science (History, Geography, Civics, Economics) |
| `English` | English Language & Literature |
| `Hindi` | Hindi A or Hindi B |

### Paper Type (pick one)
| Value | Use for |
|-------|---------|
| `Educart Sample Paper` | Papers from Educart books/series |
| `PYQ` | Official CBSE Previous Year Question papers |

### Paper Number format
| Paper Type | Format | Examples |
|------------|--------|---------|
| `Educart Sample Paper` | Plain number string | `"1"`, `"2"`, `"10"` |
| `PYQ` | CBSE set code | `"30/2/1"`, `"42/4/1"`, `"10/3/1"` |

> ⚠️ Never invent new values for subject or paper_type. Always use exactly the values above.

---

## Step-by-Step Workflow

### 1. Gather Context
Call `get_performance_summary` to understand the student's current performance level in this subject. This helps you write more relevant, personalised feedback.

### 2. Evaluate the Paper
Examine the shared paper/answers carefully. Extract:
- **Subject** — from the predefined list above
- **Paper Type** — `Educart Sample Paper` or `PYQ`
- **Paper Number** — as per the format table above
- **Date Attempted** — ask user if not shown; default to today in `YYYY-MM-DD`
- **Marks Obtained** — total out of 80 (decimals allowed e.g. `67.5`)

> Do NOT enter or ask for percentage — the database calculates it automatically.

### 3. Write Structured Comments

Split your observations into two lists:

#### STRENGTHS — things done well
Each item must:
- Name the specific topic, chapter, or question type
- State what was correct or well-executed
- Be concrete, not vague

✅ Good: `"Electricity (Ch.12) — all 3 numericals correct, Ohm's Law applied properly"`
❌ Bad: `"Physics was good"`

#### WEAKNESSES — areas where marks were lost
Each item must:
- Name the specific topic/chapter
- State how many marks were lost (if identifiable)
- State the **type of error**: conceptual misunderstanding | calculation mistake | skipped | incomplete answer | time pressure

✅ Good: `"Heredity (Ch.9) — lost 4 marks, confused dominant/recessive terminology (conceptual error)"`
✅ Good: `"Trigonometry identities — 2 questions skipped due to time pressure"`
❌ Bad: `"Messed up some questions"`

> Minimum: **1 strength** and **1 weakness** are required.
> These are fed to the AI coach to generate your personalised dashboard insights.

---

### 4. Confirm Before Saving

Show the user a summary before calling the tool:

```
📋 Ready to record:
  Subject:    Science
  Type:       Educart Sample Paper
  Paper #:    3
  Date:       2026-10-28
  Marks:      61 / 80

  STRENGTHS:
    • Electricity numericals — all solved correctly
    • Chemical equations — balanced accurately, no errors

  WEAKNESSES:
    • Heredity (Ch.9) — lost 4 marks, confused dominant/recessive alleles (conceptual)
    • Carbon compounds — lost 3 marks on IUPAC naming (conceptual error)

Shall I save this? ✅
```

### 5. Record the Attempt
Call `record_paper_attempt` with all fields. The `strengths` and `weaknesses` are separate arrays — the tool formats them automatically.

### 6. Give Feedback After Saving
After the tool confirms success, tell the user:
- Their grade (see table below)
- Top 2–3 topics to revise urgently
- One thing they should be proud of

---

## Grade Reference (out of 80)

| Marks | Grade | % |
|-------|-------|---|
| 72–80 | **A1** — Excellent | ≥90% |
| 64–71 | **A2** — Very Good | 80–89% |
| 56–63 | **B1** — Good | 70–79% |
| 48–55 | **B2** — Average | 60–69% |
| below 48 | **Needs Work** | <60% |

---

## Tool Reference

| Tool | When to use |
|------|-------------|
| `record_paper_attempt` | Save a new attempt with strengths + weaknesses arrays |
| `get_paper_attempts` | Check recent history for a subject before evaluating |
| `get_performance_summary` | Get overall stats snapshot across all subjects |
