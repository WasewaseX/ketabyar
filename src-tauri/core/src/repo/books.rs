//! Books & copies — public API port of the Books section of library.ts.

use super::*;
use crate::{exec, now_iso, one, select, uid, Result};
use rusqlite::Connection;
use serde_json::{json, Value as Json};

pub fn books(conn: &Connection, query: &str, item_type: &str) -> Result<Vec<Json>> {
    let filter_type = if !item_type.is_empty() && item_type != "All Items" && item_type != "All" {
        item_type
    } else {
        ""
    };
    let term = query.trim();
    let mut clauses: Vec<String> = vec!["archived_at IS NULL".into()];
    let mut params: Vec<Json> = Vec::new();
    if !filter_type.is_empty() {
        clauses.push("item_type = ?".into());
        params.push(json!(filter_type));
    }
    if !term.is_empty() {
        clauses.push("(title LIKE ? OR arabic_title LIKE ? OR subtitle LIKE ? OR isbn13 LIKE ? OR isbn10 LIKE ? OR author LIKE ?)".into());
        let like = format!("%{}%", term);
        for _ in 0..6 {
            params.push(json!(like));
        }
    }
    let rows = select(
        conn,
        &format!(
            "SELECT * FROM book_catalog WHERE {} ORDER BY title COLLATE NOCASE",
            clauses.join(" AND ")
        ),
        &params,
    )?;
    Ok(rows
        .into_iter()
        .map(|mut r| {
            let tags = r.get("tag_list").cloned().unwrap_or(Json::Null);
            if let Some(obj) = r.as_object_mut() {
                obj.insert("tags".into(), tags);
            }
            r
        })
        .collect())
}

pub fn save_book(conn: &Connection, actor: &str, input: &Json) -> Result<()> {
    let title = clean_text(jstr(input, "title").as_deref().unwrap_or(""));
    let item_type = jstr(input, "item_type")
        .map(|v| clean_text(&v))
        .unwrap_or_else(|| "book".into());
    let subtitle = jstr(input, "subtitle")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let arabic_title = jstr(input, "arabic_title")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let author = jstr(input, "author")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let publisher = jstr(input, "publisher")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let category = jstr(input, "category")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let barcode = jstr(input, "barcode")
        .filter(|s| !s.is_empty())
        .map(|s| clean_barcode(&s));
    let accession = jstr(input, "accession")
        .filter(|s| !s.is_empty())
        .map(|s| clean_accession(&s));
    let description = jstr(input, "description")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let tags = jstr(input, "tags")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let isbn10 = jstr(input, "isbn10")
        .filter(|s| !s.is_empty())
        .map(|s| normalize_isbn(&s));
    let isbn13 = jstr(input, "isbn13")
        .filter(|s| !s.is_empty())
        .map(|s| normalize_isbn(&s));
    let language = clean_text(jstr(input, "language").as_deref().unwrap_or(""));
    let call_number = jstr(input, "call_number")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let dewey_code = jstr(input, "dewey_code")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));

    let publisher_id = match &publisher {
        Some(p) => Some(upsert_by_name(conn, "publishers", p, &[])?),
        None => None,
    };
    let category_id = match &category {
        Some(c) => Some(upsert_by_name(conn, "categories", c, &[])?),
        None => None,
    };

    let book_id = uid();
    let metadata = match input.get("metadata") {
        None | Some(Json::Null) => Json::Null,
        Some(Json::String(s)) => json!(s),
        Some(other) => json!(other.to_string()),
    };
    exec(
        conn,
        "INSERT INTO books (id, item_type, isbn10, isbn13, title, subtitle, arabic_title, description, language, \
         publisher_id, category_id, call_number, dewey_code, cover_path, cover_url, source, metadata, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        &[json!(book_id), json!(item_type),
          isbn10.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          isbn13.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          json!(title),
          subtitle.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          arabic_title.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          description.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          json!(language),
          publisher_id.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          category_id.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          call_number.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          dewey_code.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
          input.get("cover_path").cloned().unwrap_or(Json::Null),
          input.get("cover_url").cloned().unwrap_or(Json::Null),
          json!("manual"),
          metadata, json!(now_iso()), json!(now_iso())],
    )?;

    if let Some(a) = &author {
        let author_id = upsert_by_name(
            conn,
            "authors",
            a,
            &[("normalized_name", json!(a.to_lowercase()))],
        )?;
        exec(
            conn,
            "INSERT OR IGNORE INTO book_authors (book_id, author_id, author_order) VALUES (?,?,0)",
            &[json!(book_id), json!(author_id)],
        )?;
    }

    if barcode.is_some() || accession.is_some() {
        let final_accession = ensure_unique_accession(conn, accession.as_deref(), None)?;
        let final_barcode =
            ensure_unique_barcode(conn, barcode.as_deref(), Some(&final_accession), None)?;
        exec(
            conn,
            "INSERT INTO copies (id, book_id, accession_number, barcode, status, condition, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            &[json!(uid()), json!(book_id), json!(final_accession), json!(final_barcode), json!("available"), json!("good"), json!(now_iso()), json!(now_iso())],
        )?;
    }

    if let Some(t) = &tags {
        for tag_name in split_tags(t) {
            let tag_id = upsert_by_name(
                conn,
                "tags",
                &tag_name,
                &[("color", json!(random_tag_color()))],
            )?;
            exec(
                conn,
                "INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?,?)",
                &[json!(book_id), json!(tag_id)],
            )?;
        }
    }

    audit(
        conn,
        actor,
        "create",
        "book",
        &book_id,
        json!({ "title": title }),
    )?;
    Ok(())
}

pub fn update_book(conn: &Connection, actor: &str, book_id: &str, input: &Json) -> Result<()> {
    let mut patch: Vec<(String, Json)> = Vec::new();
    if let Some(v) = input.get("title") {
        patch.push(("title".into(), json!(clean_text(v.as_str().unwrap_or("")))));
    }
    if let Some(v) = input.get("item_type") {
        patch.push((
            "item_type".into(),
            json!(clean_text(v.as_str().unwrap_or(""))),
        ));
    }
    if let Some(v) = input.get("subtitle") {
        patch.push((
            "subtitle".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("arabic_title") {
        patch.push((
            "arabic_title".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("description") {
        patch.push((
            "description".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("language") {
        patch.push((
            "language".into(),
            json!(clean_text(v.as_str().unwrap_or(""))),
        ));
    }
    if let Some(v) = input.get("publication_year") {
        patch.push(("publication_year".into(), v.clone()));
    }
    if let Some(v) = input.get("call_number") {
        patch.push((
            "call_number".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("dewey_code") {
        patch.push((
            "dewey_code".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("isbn10") {
        patch.push((
            "isbn10".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(normalize_isbn(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("isbn13") {
        patch.push((
            "isbn13".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(normalize_isbn(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("cover_path") {
        patch.push(("cover_path".into(), v.clone()));
    }
    if let Some(v) = input.get("cover_url") {
        patch.push(("cover_url".into(), v.clone()));
    }
    if let Some(v) = input.get("metadata") {
        patch.push((
            "metadata".into(),
            match v {
                Json::String(s) => json!(s),
                other => json!(other.to_string()),
            },
        ));
    }
    if let Some(v) = input.get("publisher") {
        let id = v
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| upsert_by_name(conn, "publishers", &clean_text(s), &[]))
            .transpose()?;
        patch.push((
            "publisher_id".into(),
            id.map(|i| json!(i)).unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = input.get("category") {
        let id = v
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| upsert_by_name(conn, "categories", &clean_text(s), &[]))
            .transpose()?;
        patch.push((
            "category_id".into(),
            id.map(|i| json!(i)).unwrap_or(Json::Null),
        ));
    }

    if !patch.is_empty() {
        let sets: Vec<String> = patch.iter().map(|(k, _)| format!("{} = ?", k)).collect();
        let mut params: Vec<Json> = patch.iter().map(|(_, v)| v.clone()).collect();
        params.push(json!(now_iso()));
        params.push(json!(book_id));
        exec(
            conn,
            &format!(
                "UPDATE books SET {}, updated_at = ? WHERE id = ?",
                sets.join(", ")
            ),
            &params,
        )?;
    }

    if let Some(v) = input.get("author") {
        exec(
            conn,
            "DELETE FROM book_authors WHERE book_id = ?",
            &[json!(book_id)],
        )?;
        let clean_auth = v.as_str().map(str::trim).unwrap_or("");
        if !clean_auth.is_empty() {
            let cleaned = clean_text(clean_auth);
            let author_id = upsert_by_name(
                conn,
                "authors",
                &cleaned,
                &[("normalized_name", json!(cleaned.to_lowercase()))],
            )?;
            exec(
                conn,
                "INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?,?,0)",
                &[json!(book_id), json!(author_id)],
            )?;
        }
    }

    if let Some(v) = input.get("tags") {
        exec(
            conn,
            "DELETE FROM book_tags WHERE book_id = ?",
            &[json!(book_id)],
        )?;
        let raw = v.as_str().map(str::trim).unwrap_or("");
        if !raw.is_empty() {
            for tag_name in split_tags(&clean_text(raw)) {
                let tag_id = upsert_by_name(
                    conn,
                    "tags",
                    &tag_name,
                    &[("color", json!(random_tag_color()))],
                )?;
                exec(
                    conn,
                    "INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?,?)",
                    &[json!(book_id), json!(tag_id)],
                )?;
            }
        }
    }

    audit(conn, actor, "update", "book", book_id, input.clone())?;
    Ok(())
}

pub fn delete_book(conn: &Connection, actor: &str, book_id: &str) -> Result<()> {
    let book = one(
        conn,
        "SELECT title FROM books WHERE id = ?",
        &[json!(book_id)],
    )?;
    let open = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM loans l JOIN copies c ON c.id = l.copy_id WHERE c.book_id = ? AND l.returned_at IS NULL",
        &[json!(book_id)], "n",
    )?;
    if open > 0 {
        return Err(CommandError { message: "این عنوان نسخه‌های امانت‌داری‌شده دارد. پیش از بایگانی، همهٔ نسخه‌ها باید بازگردانده شوند.".into() });
    }
    exec(
        conn,
        "UPDATE books SET archived_at = ?, updated_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(now_iso()), json!(book_id)],
    )?;
    exec(conn, "UPDATE copies SET status = 'archived', updated_at = ? WHERE book_id = ? AND status != 'archived'", &[json!(now_iso()), json!(book_id)])?;
    audit(
        conn,
        actor,
        "archive_book",
        "book",
        book_id,
        json!({ "title": book.get("title").cloned().unwrap_or(Json::Null) }),
    )?;
    Ok(())
}

pub fn get_copies_for_book(conn: &Connection, book_id: &str) -> Result<Vec<Json>> {
    select(
        conn,
        "SELECT * FROM copy_catalog WHERE book_id = ? AND status != 'archived'",
        &[json!(book_id)],
    )
}

pub fn add_copy(
    conn: &Connection,
    actor: &str,
    book_id: &str,
    barcode: &str,
    accession_number: &str,
    condition: &str,
    shelf_id: Option<&str>,
) -> Result<()> {
    let final_accession = ensure_unique_accession(conn, Some(accession_number), None)?;
    let final_barcode = ensure_unique_barcode(conn, Some(barcode), Some(&final_accession), None)?;
    let copy_id = uid();
    exec(
        conn,
        "INSERT INTO copies (id, book_id, accession_number, barcode, shelf_id, status, condition, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        &[json!(copy_id), json!(book_id), json!(final_accession), json!(final_barcode),
          shelf_id.map(|s| json!(s)).unwrap_or(Json::Null), json!("available"), json!(condition), json!(now_iso()), json!(now_iso())],
    )?;
    let book = one(
        conn,
        "SELECT title FROM books WHERE id = ?",
        &[json!(book_id)],
    )?;
    audit(
        conn,
        actor,
        "add_copy",
        "copy",
        &copy_id,
        json!({
            "book_title": book.get("title").cloned().unwrap_or(Json::Null),
            "barcode": final_barcode, "accession": final_accession, "condition": condition,
        }),
    )?;
    Ok(())
}

pub fn update_copy(conn: &Connection, actor: &str, copy_id: &str, updates: &Json) -> Result<()> {
    let mut patch: Vec<(String, Json)> = Vec::new();
    if let Some(v) = updates.get("status") {
        if !v.is_null() {
            patch.push(("status".into(), v.clone()));
        }
    }
    if let Some(v) = updates.get("condition") {
        if !v.is_null() {
            patch.push(("condition".into(), v.clone()));
        }
    }
    if let Some(v) = updates.get("barcode") {
        if let Some(s) = v.as_str() {
            if !s.is_empty() {
                patch.push((
                    "barcode".into(),
                    json!(ensure_unique_barcode(conn, Some(s), None, Some(copy_id))?),
                ));
            }
        }
    }
    if let Some(v) = updates.get("accession_number") {
        if let Some(s) = v.as_str() {
            if !s.is_empty() {
                patch.push((
                    "accession_number".into(),
                    json!(ensure_unique_accession(conn, Some(s), Some(copy_id))?),
                ));
            }
        }
    }
    if let Some(v) = updates.get("shelfId") {
        patch.push(("shelf_id".into(), v.clone()));
    }
    if !patch.is_empty() {
        let sets: Vec<String> = patch.iter().map(|(k, _)| format!("{} = ?", k)).collect();
        let mut params: Vec<Json> = patch.iter().map(|(_, v)| v.clone()).collect();
        params.push(json!(now_iso()));
        params.push(json!(copy_id));
        exec(
            conn,
            &format!(
                "UPDATE copies SET {}, updated_at = ? WHERE id = ?",
                sets.join(", ")
            ),
            &params,
        )?;
    }
    audit(conn, actor, "update_copy", "copy", copy_id, updates.clone())?;
    Ok(())
}

pub fn delete_copy(conn: &Connection, actor: &str, copy_id: &str) -> Result<()> {
    let copy = one(
        conn,
        "SELECT barcode, accession_number FROM copies WHERE id = ?",
        &[json!(copy_id)],
    )?;
    let open = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM loans WHERE copy_id = ? AND returned_at IS NULL",
        &[json!(copy_id)],
        "n",
    )?;
    if open > 0 {
        return Err(CommandError {
            message: "این نسخه در حال حاضر امانت است. پیش از بایگانی باید بازگردانده شود.".into(),
        });
    }
    exec(
        conn,
        "UPDATE copies SET status = 'archived', updated_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(copy_id)],
    )?;
    audit(
        conn,
        actor,
        "delete_copy",
        "copy",
        copy_id,
        json!({
            "barcode": copy.get("barcode").cloned().unwrap_or(Json::Null),
            "accession": copy.get("accession_number").cloned().unwrap_or(Json::Null),
        }),
    )?;
    Ok(())
}

pub fn copies(conn: &Connection, query: &str) -> Result<Vec<Json>> {
    let term = query.trim();
    if term.is_empty() {
        return select(
            conn,
            "SELECT * FROM copy_catalog ORDER BY title COLLATE NOCASE",
            &[],
        );
    }
    let like = format!("%{}%", term);
    select(
        conn,
        "SELECT * FROM copy_catalog WHERE barcode LIKE ? OR accession_number LIKE ? OR title LIKE ? ORDER BY title COLLATE NOCASE",
        &[json!(like), json!(like), json!(like)],
    )
}
