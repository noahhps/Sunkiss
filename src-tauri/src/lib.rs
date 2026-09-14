use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                frost(&main);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
