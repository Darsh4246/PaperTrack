-- Initial database schema for PaperTrack
CREATE TABLE IF NOT EXISTS paper_attempts (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  subject         VARCHAR(50) NOT NULL,
  paper_type      VARCHAR(100) NOT NULL,
  paper_number    VARCHAR(20) NOT NULL,
  date_attempted  DATE NOT NULL,
  marks_obtained  NUMERIC(5,2) NOT NULL,
  percentage      NUMERIC(5,2) GENERATED ALWAYS AS (ROUND((marks_obtained / 80.0) * 100, 2)) STORED,
  comments        TEXT
);

