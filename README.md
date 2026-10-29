# 📚 Paper Attempts Tracker — CBSE Class 10

A Node.js web application to log, manage and analyse your CBSE Class 10 paper attempts with rich charts and metrics.

## 🚀 Setup

### 1. Configure the database connection

Copy `.env.example` to `.env` and fill in your PostgreSQL details:

```bash
cp .env.example .env
```

Edit `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=DPS_Student_Details
PORT=3000
```

### 2. Start the server

```bash
npm start
```

Open your browser at: **http://localhost:3000**

---

## 📋 Database Table

The app expects this table in `DPS_Student_Details`:

```sql
CREATE TABLE paper_attempts (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  subject         VARCHAR(50),
  paper_type      VARCHAR(100),
  paper_number    VARCHAR(20),
  date_attempted  DATE,
  marks_obtained  NUMERIC(5,2),
  percentage      NUMERIC(5,2),  -- auto-calculated by DB trigger
  comments        TEXT
);
```

---

## ✨ Features

| Feature | Details |
|---------|---------|
| **Add Attempt** | Form with subject, paper type (Educart / PYQ), paper number, date, marks |
| **Edit & Delete** | Full CRUD on all records |
| **Dashboard** | Stats cards, trend line chart, radar chart, bar chart, doughnut, progress bars |
| **Records Tab** | Filterable table by subject, type, and date range |
| **Auto Theme** | Follows system light/dark preference; toggleable |
| **Live Preview** | Shows auto-calculated % as you type marks |

---

## 📊 Subjects

- Science
- Math
- SST
- English
- Hindi

Total marks per paper: **80**
