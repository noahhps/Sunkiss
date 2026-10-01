import FileProvider

/// The Sunkiss File Provider: the server's files in Finder's sidebar, under Locations, the way
/// iCloud Drive and Dropbox appear. Each file shows as a placeholder that takes no space;
/// opening one downloads it into place, and macOS can remove the download again when it needs
/// the space. Read-only for now.
final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
    required init(domain: NSFileProviderDomain) {
        super.init()
    }

    func invalidate() {}

    func item(
        for identifier: NSFileProviderItemIdentifier,
        request: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void
    ) -> Progress {
        if identifier == .rootContainer {
            completionHandler(RootItem(), nil)
            return Progress()
        }
        Task {
            do {
                completionHandler(FileItem(try await Server.file(named: identifier.rawValue)), nil)
            } catch {
                completionHandler(nil, error)
            }
        }
        return Progress()
    }

    func fetchContents(
        for itemIdentifier: NSFileProviderItemIdentifier,
        version requestedVersion: NSFileProviderItemVersion?,
        request: NSFileProviderRequest,
        completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void
    ) -> Progress {
        Task {
            do {
                let file = try await Server.file(named: itemIdentifier.rawValue)
                completionHandler(try await Server.download(file), FileItem(file), nil)
            } catch {
                completionHandler(nil, nil, error)
            }
        }
        return Progress()
    }

    func enumerator(
        for containerItemIdentifier: NSFileProviderItemIdentifier,
        request: NSFileProviderRequest
    ) throws -> NSFileProviderEnumerator {
        guard containerItemIdentifier == .rootContainer || containerItemIdentifier == .workingSet else {
            throw NSError.fileProviderErrorForNonExistentItem(withIdentifier: containerItemIdentifier)
        }
        return Enumerator()
    }

    // Read-only: nothing can be created, changed or deleted from Finder yet.

    func createItem(
        basedOn itemTemplate: NSFileProviderItem,
        fields: NSFileProviderItemFields,
        contents url: URL?,
        options: NSFileProviderCreateItemOptions = [],
        request: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void
    ) -> Progress {
        completionHandler(nil, [], false, readOnly)
        return Progress()
    }

    func modifyItem(
        _ item: NSFileProviderItem,
        baseVersion version: NSFileProviderItemVersion,
        changedFields: NSFileProviderItemFields,
        contents newContents: URL?,
        options: NSFileProviderModifyItemOptions = [],
        request: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void
    ) -> Progress {
        completionHandler(nil, [], false, readOnly)
        return Progress()
    }

    func deleteItem(
        identifier: NSFileProviderItemIdentifier,
        baseVersion version: NSFileProviderItemVersion,
        options: NSFileProviderDeleteItemOptions = [],
        request: NSFileProviderRequest,
        completionHandler: @escaping (Error?) -> Void
    ) -> Progress {
        completionHandler(readOnly)
        return Progress()
    }
}

private let readOnly = NSError(
    domain: NSCocoaErrorDomain,
    code: NSFeatureUnsupportedError,
    userInfo: [NSLocalizedDescriptionKey: "Files in Sunkiss can't be changed from Finder yet."]
)
