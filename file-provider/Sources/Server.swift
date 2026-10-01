import FileProvider

/// The Sunkiss server. Keep in sync with SERVER in src/api.ts and src-tauri/src/store.rs.
let server = URL(string: "http://localhost:8787")!

/// A file on the server, as GET /files describes it.
struct ServerFile: Decodable {
    let name: String
    let type: String
    let size: Int64
    let modified: String
    /// Changes with every save, so macOS can tell when its copy is out of date.
    let etag: String
}

enum Server {
    /// Every file on the server.
    static func files() async throws -> [ServerFile] {
        let (data, response) = try await reach { try await URLSession.shared.data(from: server.appending(path: "files")) }
        try check(response)
        return try JSONDecoder().decode([ServerFile].self, from: data)
    }

    /// One file, by name.
    static func file(named name: String) async throws -> ServerFile {
        guard let file = try await files().first(where: { $0.name == name }) else {
            throw NSError.fileProviderErrorForNonExistentItem(withIdentifier: NSFileProviderItemIdentifier(name))
        }
        return file
    }

    /// Downloads a whole file to a temporary file, which macOS then moves into place.
    static func download(_ file: ServerFile) async throws -> URL {
        let url = server.appending(path: "files").appending(path: file.name)
        let (downloaded, response) = try await reach { try await URLSession.shared.download(from: url) }
        try check(response)
        // Give it a name of its own, so nothing else tidies it away before macOS takes it.
        let kept = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.moveItem(at: downloaded, to: kept)
        return kept
    }

    /// Runs a request, turning "couldn't connect" into the error that makes Finder show the
    /// Sunkiss location as offline, rather than broken.
    private static func reach<T>(_ request: () async throws -> T) async throws -> T {
        do {
            return try await request()
        } catch is URLError {
            throw NSFileProviderError(.serverUnreachable)
        }
    }

    private static func check(_ response: URLResponse) throws {
        guard let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status) else {
            throw NSFileProviderError(.serverUnreachable)
        }
    }
}
