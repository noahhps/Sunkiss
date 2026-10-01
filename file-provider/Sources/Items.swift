import FileProvider
import UniformTypeIdentifiers

/// A file on the server, as Finder shows it.
final class FileItem: NSObject, NSFileProviderItem {
    let file: ServerFile

    init(_ file: ServerFile) {
        self.file = file
    }

    var itemIdentifier: NSFileProviderItemIdentifier { NSFileProviderItemIdentifier(file.name) }
    var parentItemIdentifier: NSFileProviderItemIdentifier { .rootContainer }
    var filename: String { file.name }
    var contentType: UTType {
        UTType(filenameExtension: (file.name as NSString).pathExtension) ?? UTType(mimeType: file.type) ?? .data
    }
    var documentSize: NSNumber? { NSNumber(value: file.size) }
    var contentModificationDate: Date? { date(file.modified) }
    var creationDate: Date? { date(file.modified) }
    var itemVersion: NSFileProviderItemVersion {
        let version = Data(file.etag.utf8)
        return NSFileProviderItemVersion(contentVersion: version, metadataVersion: version)
    }
    /// Read-only for now: files can be opened from Finder, not changed.
    var capabilities: NSFileProviderItemCapabilities { [.allowsReading] }
}

/// The Sunkiss folder itself.
final class RootItem: NSObject, NSFileProviderItem {
    var itemIdentifier: NSFileProviderItemIdentifier { .rootContainer }
    var parentItemIdentifier: NSFileProviderItemIdentifier { .rootContainer }
    var filename: String { "Sunkiss" }
    var contentType: UTType { .folder }
    var capabilities: NSFileProviderItemCapabilities { [.allowsReading, .allowsContentEnumerating] }
    var itemVersion: NSFileProviderItemVersion { NSFileProviderItemVersion(contentVersion: Data(), metadataVersion: Data()) }
}

/// A date from the server ("2026-09-14T07:21:06.380Z").
private func date(_ iso: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: iso)
}
