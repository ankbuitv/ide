// ide.ankb - SQLite Database Module
// Stores submission history, problems, test cases

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static DB: Mutex<Option<Connection>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Submission {
    pub id: Option<i64>,
    pub code: String,
    pub language: String,
    pub problem: String,
    pub verdict: String,
    pub time_ms: f64,
    pub memory_kb: u64,
    pub created_at: String,
}

fn get_db_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ide-ankb")
        .join("cpide.db")
}

pub fn init_db() -> Result<(), String> {
    let db_path = get_db_path();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("DB open failed: {}", e))?;

    // Create tables
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'cpp',
            problem TEXT NOT NULL DEFAULT '',
            verdict TEXT NOT NULL DEFAULT '',
            time_ms REAL NOT NULL DEFAULT 0,
            memory_kb INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            difficulty TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS test_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            problem_id INTEGER,
            input TEXT NOT NULL DEFAULT '',
            expected TEXT NOT NULL DEFAULT '',
            actual TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'idle',
            FOREIGN KEY (problem_id) REFERENCES problems(id)
        );

        CREATE TABLE IF NOT EXISTS snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'cpp',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_submissions_problem ON submissions(problem);
        CREATE INDEX IF NOT EXISTS idx_submissions_verdict ON submissions(verdict);
        CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
    ").map_err(|e| format!("DB schema failed: {}", e))?;

    if let Ok(mut db) = DB.lock() {
        *db = Some(conn);
    }

    Ok(())
}

#[tauri::command]
pub async fn save_submission(
    code: String,
    language: String,
    problem: String,
    verdict: String,
    time_ms: f64,
    memory_kb: u64,
) -> Result<i64, String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    conn.execute(
        "INSERT INTO submissions (code, language, problem, verdict, time_ms, memory_kb) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![code, language, problem, verdict, time_ms, memory_kb],
    ).map_err(|e| format!("Save failed: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn get_submissions(
    limit: Option<i64>,
    problem: Option<String>,
) -> Result<Vec<Submission>, String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    let limit = limit.unwrap_or(50);
    let mut stmt = if let Some(prob) = problem {
        let mut s = conn.prepare(
            "SELECT id, code, language, problem, verdict, time_ms, memory_kb, created_at FROM submissions WHERE problem = ?1 ORDER BY created_at DESC LIMIT ?2"
        ).map_err(|e| e.to_string())?;
        let rows = s.query_map(params![prob, limit], |row| {
            Ok(Submission {
                id: Some(row.get(0)?),
                code: row.get(1)?,
                language: row.get(2)?,
                problem: row.get(3)?,
                verdict: row.get(4)?,
                time_ms: row.get(5)?,
                memory_kb: row.get(6)?,
                created_at: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;
        return Ok(rows.filter_map(|r| r.ok()).collect());
    } else {
        conn.prepare(
            "SELECT id, code, language, problem, verdict, time_ms, memory_kb, created_at FROM submissions ORDER BY created_at DESC LIMIT ?1"
        ).map_err(|e| e.to_string())?
    };

    let rows = stmt.query_map(params![limit], |row| {
        Ok(Submission {
            id: Some(row.get(0)?),
            code: row.get(1)?,
            language: row.get(2)?,
            problem: row.get(3)?,
            verdict: row.get(4)?,
            time_ms: row.get(5)?,
            memory_kb: row.get(6)?,
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}
