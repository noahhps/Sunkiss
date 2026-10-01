mod drive;
mod file_provider;
mod finder;
mod store;

use std::sync::Arc;
use std::time::Duration;

use percent_encoding::percent_decode_str;
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent, Wry};
use tauri_plugin_opener::OpenerExt;

use store::{Problem, SessionFile, Store, SERVER};

/// The most one answer hands the webview. Tauri passes whole bodies, not streams, so a
/// video player asking for "everything from byte N" gets one slice of it; then it asks for
/// the next. Memory stays flat however big the file is.
const MAX_SLICE: u64 = 4 * 1024 * 1024;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// "Download" in the app: the whole file into Sunkiss's memory for the session (store.rs),
/// where the page and the Sunkiss drive can both read it. How it's going reaches the page as
/// "session-file" events.
#[tauri::command]
async fn keep_file(store: tauri::State<'_, Arc<Store>>, name: String) -> Result<(), String> {
    store.keep(&name).await;
    Ok(())
}

/// Lets go of a file downloaded for the session, or stops it downloading.
#[tauri::command]
fn forget_file(store: tauri::State<'_, Arc<Store>>, name: String) {
    store.forget(&name);
}

/// What's downloaded for the session, for the page to show when it loads.
#[tauri::command]
fn session_files(store: tauri::State<'_, Arc<Store>>) -> Vec<SessionFile> {
    store.session()
}

/// Frosted glass behind the page, the way Courier's windows do it: the window and the
/// webview are transparent, and a native macOS material is drawn behind them.
fn frost(window: &tauri::WebviewWindow) {
    // `transparent: true` in tauri.conf.json makes the window see-through, but the webview
    // still paints its own white background unless that's cleared too.
    if let Err(err) = window.set_background_color(None) {
        eprintln!("[glass] could not clear the webview background: {err}");
    }

    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        // HudWindow is the material Courier's QuickView uses. `Active` keeps it frosted
        // even when the window isn't focused, instead of going flat and grey.
        if let Err(err) = apply_vibrancy(
            window,
            NSVisualEffectMaterial::HudWindow,
            Some(NSVisualEffectState::Active),
            None,
        ) {
            eprintln!("[glass] vibrancy refused: {err}");
        }
    }

    // App.css only drops its fallback background once it knows it's in the app.
    // main.tsx sets this too; setting it here as well means the glass doesn't depend on that check.
    let _ = window.eval("document.documentElement.setAttribute('data-shell','tauri')");
}

/// What a Range header asks for, given the size of the file.
#[derive(Debug, PartialEq)]
enum Ask {
    Whole,
    Part(u64, u64),
    Unsatisfiable,
}

/// Reads a Range header the way the server does (parseRange in server/src/routes/files.ts):
/// "bytes=0-99", "bytes=100-" or "bytes=-100" (the last 100). Anything else, like several
/// ranges at once, gets the whole file, which HTTP allows.
fn parse_range(header: Option<&str>, size: u64) -> Ask {
    let Some(spec) = header.and_then(|header| header.strip_prefix("bytes=")) else { return Ask::Whole };
    let Some((from, to)) = spec.split_once('-') else { return Ask::Whole };
    if size == 0 || to.contains(',') {
        return Ask::Whole;
    }
    if from.is_empty() {
        return match to.parse::<u64>() {
            Ok(0) => Ask::Unsatisfiable,
            Ok(last) => Ask::Part(size.saturating_sub(last), size - 1),
            Err(_) => Ask::Whole,
        };
    }
    let Ok(start) = from.parse::<u64>() else { return Ask::Whole };
    let end = match to {
        "" => u64::MAX,
        to => match to.parse::<u64>() {
            Ok(end) if end >= start => end,
            _ => return Ask::Whole, // backwards, so not a real range
        },
    };
    if start >= size {
        return Ask::Unsatisfiable;
    }
    Ask::Part(start, end.min(size - 1))
}

/// Every answer to the page starts with these. The page's own address (localhost:1420 in
/// dev, tauri://localhost when packaged) isn't sunkiss://, so each answer says the page may
/// read it, Content-Range and ETag included.
fn answer() -> tauri::http::response::Builder {
    Response::builder()
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Range, ETag")
}

fn problem(problem: Problem) -> Response<Vec<u8>> {
    let status = match problem {
        Problem::NotFound => 404,
        Problem::Unreachable | Problem::Changed => 502, // what the page reads as "couldn't reach"
        Problem::Server(status) => status,
    };
    answer().status(status).body(problem.to_string().into_bytes()).unwrap()
}

/// Answers the page's sunkiss:// requests.
async fn serve_file(store: &Arc<Store>, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    // Before sending a Range header, the webview asks whether it may. It may.
    if request.method() == Method::OPTIONS {
        return answer()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD")
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
            .body(Vec::new())
            .unwrap();
    }
    // Only reads come through here so far; saving files (POST) will need adding.
    let is_head = request.method() == Method::HEAD;
    if request.method() != Method::GET && !is_head {
        return answer().status(StatusCode::METHOD_NOT_ALLOWED).body(Vec::new()).unwrap();
    }
    // Only the file routes: nothing else on the server can be reached this way.
    let path = request.uri().path();
    if path != "/files" && !path.starts_with("/files/") {
        return answer().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap();
    }
    // A file itself: answered from Sunkiss's memory, fetching only the blocks it doesn't have.
    if let Some(name) = file_name(path, request.uri().query()) {
        return serve_original(store, &name, &request, is_head).await;
    }
    // Anything else (the list, resized previews) goes on to the server as it is.
    pass_through(store, &request, is_head).await
}

/// The name in a /files/<name> address with no ?w= or ?h=: a request for the file itself.
fn file_name(path: &str, query: Option<&str>) -> Option<String> {
    if query.is_some_and(|query| !query.is_empty()) {
        return None;
    }
    let name = path.strip_prefix("/files/")?;
    if name.is_empty() || name.contains('/') {
        return None;
    }
    percent_decode_str(name).decode_utf8().ok().map(|name| name.into_owned())
}

async fn serve_original(store: &Arc<Store>, name: &str, request: &Request<Vec<u8>>, is_head: bool) -> Response<Vec<u8>> {
    let range = request.headers().get(header::RANGE).and_then(|range| range.to_str().ok());
    // A file can be saved again between looking it up and reading it. Then look again, once.
    for max_age in [Duration::from_secs(3), Duration::ZERO] {
        let info = match store.file(name, max_age).await {
            Ok(info) => info,
            Err(err) => return problem(err),
        };
        let (status, start, end) = match parse_range(range, info.size) {
            Ask::Whole => (StatusCode::OK, 0, info.size.saturating_sub(1)),
            // At most MAX_SLICE at once; a player asks for the rest afterwards.
            Ask::Part(start, end) => (StatusCode::PARTIAL_CONTENT, start, end.min(start + MAX_SLICE - 1)),
            Ask::Unsatisfiable => {
                return answer()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{}", info.size))
                    .body(Vec::new())
                    .unwrap()
            }
        };
        let length = if info.size == 0 { 0 } else { end - start + 1 };
        let mut builder = answer()
            .status(status)
            .header(header::CONTENT_TYPE, &info.kind)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::ETAG, &info.etag)
            .header(header::CONTENT_LENGTH, length);
        if status == StatusCode::PARTIAL_CONTENT {
            builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{}", info.size));
        }
        if is_head || length == 0 {
            return builder.body(Vec::new()).unwrap();
        }
        match store.read(&info, start, end).await {
            Ok(bytes) => return builder.body(bytes).unwrap(),
            Err(Problem::Changed) => continue,
            Err(err) => return problem(err),
        }
    }
    problem(Problem::Changed)
}

/// Asks the server for the same address and hands its answer to the page.
async fn pass_through(store: &Arc<Store>, request: &Request<Vec<u8>>, is_head: bool) -> Response<Vec<u8>> {
    let path = request.uri().path();
    let url = match request.uri().query() {
        Some(query) => format!("{SERVER}{path}?{query}"),
        None => format!("{SERVER}{path}"),
    };
    let mut upstream = store.client().request(request.method().clone(), url);
    if let Some(range) = request.headers().get(header::RANGE) {
        upstream = upstream.header(header::RANGE, range.clone());
    }

    let result = async {
        let reply = upstream.send().await?;
        let mut builder = answer().status(reply.status());
        for (name, value) in reply.headers() {
            // These describe the connection to the server, not the answer; and the length
            // is set below from what actually arrived (except for HEAD, which has no body).
            let skip = matches!(name.as_str(), "connection" | "keep-alive" | "transfer-encoding")
                || name.as_str().starts_with("access-control-")
                || (name == header::CONTENT_LENGTH && !is_head);
            if !skip {
                builder = builder.header(name, value);
            }
        }
        let body = if is_head { Vec::new() } else { reply.bytes().await?.to_vec() };
        if !is_head {
            builder = builder.header(header::CONTENT_LENGTH, body.len());
        }
        Ok::<_, reqwest::Error>(builder.body(body).unwrap())
    }
    .await;
    result.unwrap_or_else(|_| problem(Problem::Unreachable))
}

/// The Sunkiss menu bar item. Sunkiss keeps running there after its window closes, so the
/// drive stays in Finder. Returns the line that says where the drive is, and "Open Sunkiss
/// Folder", to update once the drive is mounted.
fn menu_bar(app: &tauri::App) -> tauri::Result<(MenuItem<Wry>, MenuItem<Wry>)> {
    let open_window = MenuItem::with_id(app, "window", "Open Sunkiss", true, None::<&str>)?;
    let open_folder = MenuItem::with_id(app, "folder", "Open Sunkiss Folder", false, None::<&str>)?;
    let status = MenuItem::with_id(app, "status", "Starting the Sunkiss drive…", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Sunkiss", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_window,
            &open_folder,
            &PredefinedMenuItem::separator(app)?,
            &status,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    TrayIconBuilder::with_id("sunkiss")
        .icon(tauri::include_image!("icons/tray.png"))
        .icon_as_template(true) // drawn in the menu bar's own colour, like the system's icons
        .tooltip("Sunkiss")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "window" => show_window(app),
            "folder" => {
                if let Some(folder) = drive::folder() {
                    let _ = app.opener().open_path(folder.to_string_lossy(), None::<&str>);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok((status, open_folder))
}

/// Brings the window back: from the menu bar, or by clicking Sunkiss in the Dock.
fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// "~/Sunkiss" rather than "/Users/someone/Sunkiss".
fn tilde(path: &std::path::Path) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    match path.strip_prefix(&home) {
        Ok(rest) if !home.is_empty() => format!("~/{}", rest.display()),
        _ => path.display().to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Sunkiss's memory of file bytes, shared by the page and the drive.
    let store = Store::new();
    let for_pages = store.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .manage(store.clone())
        // The page's address for files (see serve_file). Answered off the main thread, so a
        // slow server can't freeze the window.
        .register_asynchronous_uri_scheme_protocol("sunkiss", move |_ctx, request, responder| {
            let store = for_pages.clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(serve_file(&store, request).await);
            });
        })
        .setup(move |app| {
            if let Some(main) = app.get_webview_window("main") {
                frost(&main);
            }

            // The page shows session downloads, so it hears about every change to them.
            let handle = app.handle().clone();
            store.on_change(move |file| {
                let _ = handle.emit("session-file", file);
            });

            // Sunkiss in Finder's sidebar, in the packaged app (file_provider.rs).
            file_provider::register();

            // The Sunkiss drive in Finder (drive.rs). Once it's mounted, the menu bar says
            // where, and the page is told, so it can offer Show in Finder and Open in….
            let (status, open_folder) = menu_bar(app)?;
            let drive_store = store.clone();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match drive::start(drive_store).await {
                    Ok(path) => {
                        eprintln!("[drive] the server's files are in {}", path.display());
                        let _ = status.set_text(format!("Files are in {}", tilde(&path)));
                        let _ = open_folder.set_enabled(true);
                        let _ = handle.emit("drive-folder", path.to_string_lossy());
                    }
                    Err(err) => {
                        eprintln!("[drive] not mounted: {err}");
                        let _ = status.set_text("The Sunkiss drive isn't mounted");
                    }
                }
            });

            // Stopped from a terminal (Ctrl+C, or dev.sh stopping): quit properly, which
            // unmounts the drive. Otherwise ~/Sunkiss is left pointing at an app that's gone.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tokio::signal::unix::{signal, SignalKind};
                if let (Ok(mut term), Ok(mut interrupt)) = (signal(SignalKind::terminate()), signal(SignalKind::interrupt())) {
                    tokio::select! {
                        _ = term.recv() => {}
                        _ = interrupt.recv() => {}
                    }
                    handle.exit(0);
                }
            });
            Ok(())
        })
        // Closing the window leaves Sunkiss running in the menu bar, so the drive stays in
        // Finder. Quitting (⌘Q, or Quit Sunkiss in the menu bar) stops both.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            keep_file,
            forget_file,
            session_files,
            finder::drive_folder,
            finder::reveal_file,
            finder::open_file,
            finder::apps_for_file,
            finder::apps_for_kind
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::Exit => drive::stop(),
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_window(app), // Sunkiss clicked in the Dock
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{file_name, parse_range, Ask};

    #[test]
    fn reads_range_headers_like_the_server() {
        assert_eq!(parse_range(None, 1000), Ask::Whole);
        assert_eq!(parse_range(Some("bytes=0-99"), 1000), Ask::Part(0, 99));
        assert_eq!(parse_range(Some("bytes=900-"), 1000), Ask::Part(900, 999));
        assert_eq!(parse_range(Some("bytes=-100"), 1000), Ask::Part(900, 999));
        assert_eq!(parse_range(Some("bytes=-5000"), 1000), Ask::Part(0, 999));
        assert_eq!(parse_range(Some("bytes=990-5000"), 1000), Ask::Part(990, 999));
        assert_eq!(parse_range(Some("bytes=1000-"), 1000), Ask::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-0"), 1000), Ask::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=10-5"), 1000), Ask::Whole); // backwards
        assert_eq!(parse_range(Some("bytes=0-1,5-9"), 1000), Ask::Whole); // several at once
        assert_eq!(parse_range(Some("bytes=0-99"), 0), Ask::Whole); // an empty file
    }

    #[test]
    fn tells_files_from_other_addresses() {
        assert_eq!(file_name("/files/Bridge1.JPG", None).as_deref(), Some("Bridge1.JPG"));
        assert_eq!(file_name("/files/my%20photo.png", None).as_deref(), Some("my photo.png"));
        assert_eq!(file_name("/files/Bridge1.JPG", Some("w=400&h=400")), None); // a preview
        assert_eq!(file_name("/files/Bridge1.JPG/versions", None), None);
        assert_eq!(file_name("/files", None), None);
    }
}
