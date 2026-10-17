import AppKit
import SwiftUI
import WebKit
import UniformTypeIdentifiers

// The desktop shell owns navigation and file dialogs. Project data and authorization
// remain in the shared application and its existing server boundaries.
@main
struct SteelBuildDesktopApp: App {
    @StateObject private var browser = DesktopBrowser()

    var body: some Scene {
        WindowGroup("SteelBuild Pro") {
            DesktopWebView(browser: browser)
                .frame(minWidth: 900, minHeight: 600)
                .onAppear { NSApplication.shared.activate(ignoringOtherApps: true) }
                .toolbar {
                    Button(action: browser.back) { Image(systemName: "chevron.left") }
                        .help("Back")
                    Button(action: browser.forward) { Image(systemName: "chevron.right") }
                        .help("Forward")
                    Button(action: browser.reload) { Image(systemName: "arrow.clockwise") }
                        .help("Reload")
                }
        }
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Reload", action: browser.reload).keyboardShortcut("r")
            }
        }
    }
}

struct DesktopWebView: NSViewRepresentable {
    @ObservedObject var browser: DesktopBrowser
    func makeNSView(context: Context) -> WKWebView { browser.webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}

final class BundledAssets: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root.resolvingSymlinksInPath(); super.init() }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == "steelbuild", url.host == "localhost" else {
            task.didFailWithError(URLError(.unsupportedURL)); return
        }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        var file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/") else {
            task.didFailWithError(URLError(.noPermissionsToReadFile)); return
        }
        // SPA routes resolve to index; missing assets must stay missing.
        if !FileManager.default.fileExists(atPath: file.path), file.pathExtension.isEmpty {
            file = root.appendingPathComponent("index.html")
        }
        do {
            let bytes = try Data(contentsOf: file)
            let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: bytes.count,
                                        textEncodingName: ["html", "js", "css", "json", "svg"].contains(file.pathExtension) ? "utf-8" : nil))
            task.didReceive(bytes)
            task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class DesktopBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let webView: WKWebView

    override init() {
        let config = WKWebViewConfiguration()
        let assets = Bundle.main.resourceURL!.appendingPathComponent("web")
        config.setURLSchemeHandler(BundledAssets(root: assets), forURLScheme: "steelbuild")
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: "steelbuild://localhost/Dashboard")!))
    }

    func back() { webView.goBack() }
    func forward() { webView.goForward() }
    func reload() { webView.reload() }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if url.scheme == "steelbuild", url.host == "localhost" { decisionHandler(.allow); return }
        if ["blob", "about"].contains(url.scheme ?? "") { decisionHandler(.allow); return }
        // Remote pages never inherit the bundled application's session or native delegates.
        if action.navigationType == .linkActivated, ["https", "http", "mailto", "tel"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.canCreateDirectories = true
        panel.begin { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        NSAlert(error: error).runModal()
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // CI-only launch receipt: no session tokens, project records, or page text are written.
        guard let index = CommandLine.arguments.firstIndex(of: "--validation-evidence"),
              CommandLine.arguments.indices.contains(index + 1) else { return }
        let destination = URL(fileURLWithPath: CommandLine.arguments[index + 1])
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
            webView.evaluateJavaScript("JSON.stringify({rendered:!!document.querySelector('#root')?.children.length, textLength:document.body.innerText.length, title:document.title,origin:location.origin,signInVisible:/sign in/i.test(document.body.innerText)})") { value, error in
                guard error == nil, let json = value as? String, let data = json.data(using: .utf8) else { return }
                try? data.write(to: destination, options: .atomic)
            }
        }
    }
}
