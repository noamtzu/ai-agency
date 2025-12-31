from __future__ import annotations

from sqlmodel import SQLModel, create_engine

from .settings import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)


def _sqlite_column_names(conn, table: str) -> set[str]:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    # PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
    return {r[1] for r in rows}


def _sqlite_add_column_if_missing(conn, table: str, column: str, ddl: str) -> None:
    cols = _sqlite_column_names(conn, table)
    if column in cols:
        return
    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def _migrate_sqlite(conn) -> None:
    # NOTE: SQLite can't ALTER column types or add constraints easily.
    # We only do additive migrations for local/dev convenience.
    try:
        _sqlite_add_column_if_missing(conn, "model", "project_id", "project_id VARCHAR")
        _sqlite_add_column_if_missing(conn, "model", "tags_json", "tags_json TEXT DEFAULT '[]'")
        _sqlite_add_column_if_missing(conn, "model", "notes", "notes TEXT")
        _sqlite_add_column_if_missing(conn, "model", "archived_at", "archived_at DATETIME")

        _sqlite_add_column_if_missing(conn, "generationjob", "source", "source VARCHAR DEFAULT 'api'")
        _sqlite_add_column_if_missing(conn, "generationjob", "prompt_template_id", "prompt_template_id VARCHAR")
        _sqlite_add_column_if_missing(conn, "generationjob", "params_json", "params_json TEXT DEFAULT '{}'")
    except Exception:
        # Best-effort; create_all already ran. If migration fails, app still boots.
        return


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    if settings.database_url.startswith("sqlite"):
        with engine.begin() as conn:
            _migrate_sqlite(conn)
