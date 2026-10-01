//! The Sunkiss drive, from the rest of macOS: showing a file in Finder, opening it in another
//! app, and listing the apps that can open it ("Show in Finder" and "Open in…" in the app,
//! and the choice of app for images and videos in Settings).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::drive;

/// An app that can open a file.
#[derive(Serialize)]
pub struct App {
    name: String,
    path: String,
    /// The app macOS opens this kind of file with when it's double-clicked.
    default: bool,
}

/// A file in the drive, by name. Only plain names, so nothing outside the drive can be reached.
fn in_drive(name: &str) -> Result<PathBuf, String> {
    let folder = drive::folder().ok_or("The Sunkiss drive isn't mounted")?;
    if name.is_empty() || name == "." || name == ".." || name.contains('/') {
        return Err(format!("{name:?} isn't a file name"));
    }
    Ok(folder.join(name))
}

/// Where the drive is, or nothing while it isn't mounted.
#[tauri::command]
pub fn drive_folder() -> Option<String> {
    drive::folder().map(|folder| folder.to_string_lossy().into_owned())
}

/// Opens a Finder window with the file selected.
#[tauri::command]
pub fn reveal_file(app: AppHandle, name: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(in_drive(&name)?).map_err(|err| err.to_string())
}

/// Opens the file in an app (given by its path), or in its default app.
#[tauri::command]
pub fn open_file(app: AppHandle, name: String, with: Option<String>) -> Result<(), String> {
    let path = in_drive(&name)?;
    app.opener().open_path(path.to_string_lossy(), with).map_err(|err| err.to_string())
}

/// The apps that can open the file: its default app first, then the rest by name.
#[tauri::command]
pub fn apps_for_file(name: String) -> Result<Vec<App>, String> {
    Ok(apps_for(&in_drive(&name)?))
}

/// The apps that can open a kind of file, "image" or "video", for choosing one in Settings.
#[tauri::command]
pub fn apps_for_kind(kind: String) -> Vec<App> {
    // A few common types of each kind; an app that opens any of them is offered.
    let types: &[&str] = match kind.as_str() {
        "video" => &["com.apple.quicktime-movie", "public.mpeg-4"],
        _ => &["public.jpeg", "public.png", "com.adobe.photoshop-image"],
    };
    apps_for_types(types)
}

#[cfg(target_os = "macos")]
fn apps_for(path: &Path) -> Vec<App> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSString, NSURL};

    // macOS goes by the kind of file (its extension), the way Finder's "Open With" does.
    let workspace = NSWorkspace::sharedWorkspace();
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    let default = workspace.URLForApplicationToOpenURL(&url);
    tidy(workspace.URLsForApplicationsToOpenURL(&url).iter(), default)
}

#[cfg(target_os = "macos")]
fn apps_for_types(types: &[&str]) -> Vec<App> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;
    use objc2_uniform_type_identifiers::UTType;

    let workspace = NSWorkspace::sharedWorkspace();
    let types: Vec<_> = types.iter().filter_map(|id| UTType::typeWithIdentifier(&NSString::from_str(id))).collect();
    let default = types.first().and_then(|first| workspace.URLForApplicationToOpenContentType(first));
    tidy(types.iter().flat_map(|kind| workspace.URLsForApplicationsToOpenContentType(kind).to_vec()), default)
}

/// Names the apps, the default first and the rest by name, each app once (the same app can be
/// installed in two places, say /Applications and ~/Applications).
#[cfg(target_os = "macos")]
fn tidy(
    apps: impl Iterator<Item = objc2::rc::Retained<objc2_foundation::NSURL>>,
    default: Option<objc2::rc::Retained<objc2_foundation::NSURL>>,
) -> Vec<App> {
    use objc2_foundation::NSFileManager;

    let default = default.and_then(|app| app.path()).map(|path| path.to_string());
    let files = NSFileManager::defaultManager();
    let mut apps: Vec<App> = apps
        .filter_map(|app| app.path())
        .map(|path| {
            let name = files.displayNameAtPath(&path).to_string();
            let name = name.strip_suffix(".app").unwrap_or(&name).to_string();
            let path = path.to_string();
            App { default: default.as_ref() == Some(&path), name, path }
        })
        .collect();
    apps.sort_by(|a, b| b.default.cmp(&a.default).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    let mut seen = HashSet::new();
    apps.retain(|app| seen.insert(app.name.clone()));
    apps
}

#[cfg(not(target_os = "macos"))]
fn apps_for(_path: &Path) -> Vec<App> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
fn apps_for_types(_types: &[&str]) -> Vec<App> {
    Vec::new()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::apps_for;
    use std::path::Path;

    #[test]
    fn lists_apps_for_kinds_of_file() {
        for kind in ["image", "video"] {
            let apps = super::apps_for_kind(kind.to_string());
            let names: Vec<_> = apps.iter().map(|app| format!("{}{}", app.name, if app.default { " [default]" } else { "" })).collect();
            println!("{kind}: {}", names.join(", "));
            assert!(apps.first().is_some_and(|app| app.default), "the default app comes first");
        }
    }

    #[test]
    fn lists_apps_for_an_image_with_the_default_first() {
        let png = Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/icon.png");
        let apps = apps_for(&png);
        for app in &apps {
            println!("{}{}  ({})", app.name, if app.default { " [default]" } else { "" }, app.path);
        }
        assert!(apps.first().is_some_and(|app| app.default), "the default app comes first");
        assert!(apps.iter().any(|app| app.name == "Preview"), "every Mac has Preview");
        assert_eq!(apps.iter().filter(|app| app.default).count(), 1);
    }
}
