use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteMetadata {
    id: String,
    title: String,
    file_name: String,
    category: String,
    created_at: String,
    updated_at: String,
    word_count: usize,
    preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: String,
    title: String,
    file_name: String,
    category: String,
    created_at: String,
    updated_at: String,
    word_count: usize,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveNoteRequest {
    title: String,
    content: String,
    category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    locale: String,
    notes_dir: String,
    global_shortcut: String,
    toggle_visibility_shortcut: String,
    close_to_tray: bool,
    autostart: bool,
    default_view_mode: String,
    note_auto_save: bool,
    note_surface_auto_save: bool,
    tile_color: String,
    tile_color_mode: String,
    theme: String,
    font_size: u32,
    surface_font_size: u32,
    tab_indent_size: u32,
    external_file_auto_save: bool,
    remember_surface_size: bool,
    tile_ctrl_close: bool,
    tile_render_markdown: bool,
    render_html_markdown: bool,
    open_at_cursor: bool,
    background_image_path: Option<String>,
    background_fit: String,
    background_dim: f32,
    background_blur: u32,
    background_scale: f32,
    background_position_x: u32,
    background_position_y: u32,
    surface_width: Option<u32>,
    surface_height: Option<u32>,
}

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // Keep user data outside the repo so installed builds and dev builds share the same storage rule.
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn default_notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join("notes");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("config.json"))
}

fn categories_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("categories.json"))
}

fn metadata_path(notes_dir: &Path, id: &str) -> PathBuf {
    notes_dir.join(format!("{id}.json"))
}

fn markdown_path(notes_dir: &Path, id: &str) -> PathBuf {
    notes_dir.join(format!("{id}.md"))
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn strip_markdown(content: &str) -> String {
    let re = Regex::new(r"(?m)[#>*_`~\[\]()]").expect("valid regex");
    re.replace_all(content, "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn count_chars(content: &str) -> usize {
    content.chars().filter(|ch| !ch.is_whitespace()).count()
}

fn preview(content: &str) -> String {
    strip_markdown(content).chars().take(120).collect()
}

fn safe_file_stem(value: &str) -> String {
    let mut stem = value
        .trim()
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
                || ch.is_control()
            {
                '_'
            } else if ch.is_whitespace() {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>();
    while stem.contains("__") {
        stem = stem.replace("__", "_");
    }
    stem.trim_matches('_').chars().take(80).collect()
}

fn normalize_title(title: &str, content: &str) -> String {
    let explicit = title.trim();
    if !explicit.is_empty() {
        return explicit.chars().take(80).collect();
    }
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("无标题笔记")
        .trim_start_matches('#')
        .trim()
        .chars()
        .take(80)
        .collect()
}

fn read_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if path.exists() {
        let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&text).map_err(|error| error.to_string())
    } else {
        // First launch creates a complete config file, including the default notes directory.
        let notes_dir = default_notes_dir(app)?;
        let config = AppConfig {
            locale: "zh-CN".to_string(),
            notes_dir: notes_dir.to_string_lossy().to_string(),
            global_shortcut: "Ctrl+Space".to_string(),
            toggle_visibility_shortcut: "Ctrl+Alt+N".to_string(),
            close_to_tray: true,
            autostart: false,
            default_view_mode: "split".to_string(),
            note_auto_save: true,
            note_surface_auto_save: true,
            tile_color: "#f7f3e8".to_string(),
            tile_color_mode: "system".to_string(),
            theme: "light".to_string(),
            font_size: 15,
            surface_font_size: 14,
            tab_indent_size: 2,
            external_file_auto_save: false,
            remember_surface_size: true,
            tile_ctrl_close: true,
            tile_render_markdown: true,
            render_html_markdown: false,
            open_at_cursor: true,
            background_image_path: None,
            background_fit: "cover".to_string(),
            background_dim: 0.2,
            background_blur: 0,
            background_scale: 1.0,
            background_position_x: 50,
            background_position_y: 50,
            surface_width: Some(440),
            surface_height: Some(360),
        };
        write_config(app, config.clone())?;
        Ok(config)
    }
}

fn write_config(app: &AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    fs::create_dir_all(&config.notes_dir).map_err(|error| error.to_string())?;
    let path = config_path(app)?;
    let text = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())?;
    let _ = app.emit("config-changed", &config);
    Ok(config)
}

fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // The notes directory is configurable; every note command resolves it through config.
    let config = read_config(app)?;
    let dir = PathBuf::from(config.notes_dir);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn read_note_metadata(notes_dir: &Path, id: &str) -> Result<NoteMetadata, String> {
    let text = fs::read_to_string(metadata_path(notes_dir, id)).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn write_note(notes_dir: &Path, note: &Note) -> Result<(), String> {
    // Store the editable body as Markdown and keep searchable/list metadata beside it.
    fs::write(markdown_path(notes_dir, &note.id), &note.content).map_err(|error| error.to_string())?;
    let metadata = NoteMetadata {
        id: note.id.clone(),
        title: note.title.clone(),
        file_name: note.file_name.clone(),
        category: note.category.clone(),
        created_at: note.created_at.clone(),
        updated_at: note.updated_at.clone(),
        word_count: note.word_count,
        preview: preview(&note.content),
    };
    let text = serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?;
    fs::write(metadata_path(notes_dir, &note.id), text).map_err(|error| error.to_string())?;
    Ok(())
}

fn load_note(notes_dir: &Path, id: &str) -> Result<Note, String> {
    let metadata = read_note_metadata(notes_dir, id)?;
    let content = fs::read_to_string(markdown_path(notes_dir, id)).unwrap_or_default();
    Ok(Note {
        id: metadata.id,
        title: metadata.title,
        file_name: metadata.file_name,
        category: metadata.category,
        created_at: metadata.created_at,
        updated_at: metadata.updated_at,
        word_count: count_chars(&content),
        content,
    })
}

fn emit_notes_changed(app: &AppHandle) {
    // All windows listen for this event so sidebars and shortcut pads stay in sync.
    let _ = app.emit("notes-changed", ());
}

#[tauri::command]
fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    read_config(&app)
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    write_config(&app, config)
}

#[tauri::command]
fn list_notes(app: AppHandle) -> Result<Vec<NoteMetadata>, String> {
    let dir = notes_dir(&app)?;
    let mut notes = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
        if let Ok(note) = serde_json::from_str::<NoteMetadata>(&text) {
            notes.push(note);
        }
    }
    notes.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(notes)
}

#[tauri::command]
fn get_note(app: AppHandle, id: String) -> Result<Note, String> {
    load_note(&notes_dir(&app)?, &id)
}

#[tauri::command]
fn create_note(app: AppHandle, request: SaveNoteRequest) -> Result<Note, String> {
    let dir = notes_dir(&app)?;
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    let title = normalize_title(&request.title, &request.content);
    let file_name = format!("{}.md", safe_file_stem(&title));
    let note = Note {
        id,
        title,
        file_name,
        category: request.category.trim().to_string(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
        word_count: count_chars(&request.content),
        content: request.content,
    };
    write_note(&dir, &note)?;
    emit_notes_changed(&app);
    Ok(note)
}

#[tauri::command]
fn update_note(app: AppHandle, id: String, request: SaveNoteRequest) -> Result<Note, String> {
    let dir = notes_dir(&app)?;
    let existing = load_note(&dir, &id)?;
    let title = normalize_title(&request.title, &request.content);
    let note = Note {
        id,
        title: title.clone(),
        file_name: format!("{}.md", safe_file_stem(&title)),
        category: request.category.trim().to_string(),
        created_at: existing.created_at,
        updated_at: now(),
        word_count: count_chars(&request.content),
        content: request.content,
    };
    write_note(&dir, &note)?;
    emit_notes_changed(&app);
    Ok(note)
}

#[tauri::command]
fn delete_note(app: AppHandle, id: String) -> Result<(), String> {
    let dir = notes_dir(&app)?;
    let _ = fs::remove_file(markdown_path(&dir, &id));
    let _ = fs::remove_file(metadata_path(&dir, &id));
    emit_notes_changed(&app);
    Ok(())
}

#[tauri::command]
fn list_categories(app: AppHandle) -> Result<Vec<String>, String> {
    let path = categories_path(&app)?;
    if path.exists() {
        let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&text).map_err(|error| error.to_string())
    } else {
        Ok(Vec::new())
    }
}

fn write_categories(app: &AppHandle, categories: &[String]) -> Result<Vec<String>, String> {
    let mut unique = BTreeSet::new();
    for category in categories {
        let trimmed = category.trim();
        if !trimmed.is_empty() {
            unique.insert(trimmed.to_string());
        }
    }
    let categories = unique.into_iter().collect::<Vec<_>>();
    let text = serde_json::to_string_pretty(&categories).map_err(|error| error.to_string())?;
    fs::write(categories_path(app)?, text).map_err(|error| error.to_string())?;
    Ok(categories)
}

#[tauri::command]
fn create_category(app: AppHandle, category: String) -> Result<Vec<String>, String> {
    let mut categories = list_categories(app.clone())?;
    categories.push(category);
    write_categories(&app, &categories)
}

#[tauri::command]
fn rename_category(app: AppHandle, old_name: String, new_name: String) -> Result<Vec<String>, String> {
    let categories = list_categories(app.clone())?
        .into_iter()
        .map(|category| if category == old_name { new_name.clone() } else { category })
        .collect::<Vec<_>>();
    let dir = notes_dir(&app)?;
    // Category names live in metadata, so renaming must rewrite every affected note.
    for metadata in list_notes(app.clone())? {
        if metadata.category == old_name {
            let note = load_note(&dir, &metadata.id)?;
            write_note(
                &dir,
                &Note {
                    category: new_name.clone(),
                    ..note
                },
            )?;
        }
    }
    emit_notes_changed(&app);
    write_categories(&app, &categories)
}

#[tauri::command]
fn delete_category(app: AppHandle, category: String) -> Result<Vec<String>, String> {
    let categories = list_categories(app.clone())?
        .into_iter()
        .filter(|item| item != &category)
        .collect::<Vec<_>>();
    let dir = notes_dir(&app)?;
    for metadata in list_notes(app.clone())? {
        if metadata.category == category {
            let note = load_note(&dir, &metadata.id)?;
            write_note(
                &dir,
                &Note {
                    category: String::new(),
                    ..note
                },
            )?;
        }
    }
    emit_notes_changed(&app);
    write_categories(&app, &categories)
}

#[tauri::command]
fn move_note_category(app: AppHandle, id: String, category: String) -> Result<Note, String> {
    let dir = notes_dir(&app)?;
    let note = load_note(&dir, &id)?;
    let updated = Note {
        category,
        updated_at: now(),
        ..note
    };
    write_note(&dir, &updated)?;
    emit_notes_changed(&app);
    Ok(updated)
}

#[tauri::command]
fn notes_import_markdown(app: AppHandle, path: String, category: String) -> Result<Note, String> {
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let title = Path::new(&path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("无标题笔记")
        .to_string();
    create_note(app, SaveNoteRequest { title, content, category })
}

#[tauri::command]
fn notes_export_markdown(app: AppHandle, id: String, path: String) -> Result<(), String> {
    let note = load_note(&notes_dir(&app)?, &id)?;
    fs::write(path, note.content).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_external_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_external_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_file_modified_time(path: String) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .modified()
        .map_err(|error| error.to_string())?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_notepad_window(app: AppHandle) -> Result<(), String> {
    // Shortcut notes are independent windows; creating a new label allows multiple pads.
    let label = format!("notepad-{}", Uuid::new_v4());
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html?surface=pad".into()))
        .title("快捷便签")
        .inner_size(440.0, 360.0)
        .min_inner_size(320.0, 260.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_tile_window(app: AppHandle, id: String) -> Result<(), String> {
    let label = format!("tile-{id}");
    // A note should have only one tile window, so reuse the existing label when present.
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?surface=tile&id={id}").into()),
    )
    .title("桌面磁贴")
    .inner_size(360.0, 260.0)
    .min_inner_size(220.0, 160.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(true)
    .build()
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    if window.is_visible().map_err(|error| error.to_string())? {
        window.hide().map_err(|error| error.to_string())?;
    } else {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Tray is the main system integration point when close-to-tray is enabled.
    let show = MenuItem::with_id(app, "show", "显示/隐藏", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "快捷便签", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quick, &quit])?;
    let app_handle = app.handle().clone();
    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("花笺便签")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                let _ = toggle_main_window(app.clone());
            }
            "quick" => {
                let _ = open_notepad_window(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = toggle_main_window(app_handle.clone());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            list_notes,
            get_note,
            create_note,
            update_note,
            delete_note,
            list_categories,
            create_category,
            rename_category,
            delete_category,
            move_note_category,
            notes_import_markdown,
            notes_export_markdown,
            read_external_file,
            save_external_file,
            get_file_modified_time,
            open_notepad_window,
            open_tile_window,
            toggle_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
