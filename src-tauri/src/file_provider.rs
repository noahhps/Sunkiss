//! Sunkiss in Finder's sidebar, under Locations: registers the File Provider extension
//! (file-provider/ at the top of the project) with macOS. The extension shows the server's
//! files as placeholders that take no space, and downloads one when it's opened.
//!
//! macOS only runs a File Provider from a packaged app signed with a real Apple identity (a
//! team ID). In `tauri dev`, or signed ad hoc, this says why in the log and does nothing
//! else. The Sunkiss drive (drive.rs) works either way.

/// Asks macOS to show Sunkiss in Finder's sidebar.
#[cfg(target_os = "macos")]
pub fn register() {
    let packaged = std::env::current_exe().is_ok_and(|exe| exe.to_string_lossy().contains(".app/Contents/MacOS/"));
    if !packaged {
        eprintln!("[file provider] only in the packaged app (npm run tauri build)");
        return;
    }

    use block2::RcBlock;
    use objc2::AllocAnyThread;
    use objc2_file_provider::{NSFileProviderDomain, NSFileProviderManager};
    use objc2_foundation::{NSError, NSString};

    let domain = unsafe {
        NSFileProviderDomain::initWithIdentifier_displayName(
            NSFileProviderDomain::alloc(),
            &NSString::from_str("sunkiss"),
            &NSString::from_str("Sunkiss"),
        )
    };
    let done = RcBlock::new(|error: *mut NSError| match unsafe { error.as_ref() } {
        // Signed ad hoc, this is "The application cannot be used right now."
        Some(error) => eprintln!("[file provider] macOS didn't add it: {}", error.localizedDescription()),
        None => eprintln!("[file provider] Sunkiss is in Finder's sidebar"),
    });
    unsafe { NSFileProviderManager::addDomain_completionHandler(&domain, &done) };
}

#[cfg(not(target_os = "macos"))]
pub fn register() {}
