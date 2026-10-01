import FileProvider

/// Lists the Sunkiss folder for Finder. (Also the "working set": everything macOS should keep
/// track of, which here is the same files.)
final class Enumerator: NSObject, NSFileProviderEnumerator {
    func invalidate() {}

    func enumerateItems(for observer: NSFileProviderEnumerationObserver, startingAt page: NSFileProviderPage) {
        Task {
            do {
                observer.didEnumerate(try await Server.files().map(FileItem.init))
                observer.finishEnumerating(upTo: nil)
            } catch {
                observer.finishEnumeratingWithError(error)
            }
        }
    }

    // What changed since `anchor`. An anchor here records every file and its version, so
    // anything new or saved again is reported as updated, and anything missing as deleted.
    func enumerateChanges(for observer: NSFileProviderChangeObserver, from anchor: NSFileProviderSyncAnchor) {
        Task {
            do {
                let files = try await Server.files()
                guard let before = try? JSONDecoder().decode([String: String].self, from: anchor.rawValue) else {
                    throw NSFileProviderError(.syncAnchorExpired) // macOS lists everything again instead
                }
                let changed = files.filter { before[$0.name] != $0.etag }
                let names = Set(files.map(\.name))
                let gone = before.keys.filter { !names.contains($0) }.map { NSFileProviderItemIdentifier($0) }
                if !changed.isEmpty { observer.didUpdate(changed.map(FileItem.init)) }
                if !gone.isEmpty { observer.didDeleteItems(withIdentifiers: gone) }
                observer.finishEnumeratingChanges(upTo: syncAnchor(for: files), moreComing: false)
            } catch {
                observer.finishEnumeratingWithError(error)
            }
        }
    }

    func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
        Task {
            completionHandler((try? await Server.files()).map(syncAnchor(for:)))
        }
    }
}

/// Every file's name and version, as an anchor. Sorted, so the same files make the same anchor.
func syncAnchor(for files: [ServerFile]) -> NSFileProviderSyncAnchor {
    let versions = Dictionary(files.map { ($0.name, $0.etag) }, uniquingKeysWith: { first, _ in first })
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    return NSFileProviderSyncAnchor((try? encoder.encode(versions)) ?? Data())
}
