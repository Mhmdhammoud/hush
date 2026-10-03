import SwiftUI
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
struct HushApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

  var body: some Scene {
    MenuBarExtra {
      ReactNativeView(rootView: appDelegate.rootView)
        .frame(width: 360, height: 560)
    } label: {
      MenuBarIcon(state: appDelegate.menu)
    }
    .menuBarExtraStyle(.window)
  }
}

/// JS reports "anc:<0-10>" or "disconnected" via HushSystem.setMenuState.
final class MenuState: ObservableObject {
  @Published var value = "disconnected"
  init() {
    NotificationCenter.default.addObserver(forName: Notification.Name("HushMenuStateChanged"), object: nil, queue: .main) {
      [weak self] note in self?.value = note.object as? String ?? "disconnected"
    }
  }
}

struct MenuBarIcon: View {
  @ObservedObject var state: MenuState
  var body: some View {
    Image(nsImage: MenuBarGlyph.image(for: state.value))
  }
}

/// Template glyph drawn in code: the app icon's disc with a wave whose amplitude tracks
/// noise cancelling ("anc:0" choppy … "anc:10" flat). "disconnected" adds a slash.
enum MenuBarGlyph {
  static func image(for state: String) -> NSImage {
    let level = state.hasPrefix("anc:") ? Double(state.dropFirst(4)) ?? 0 : 0
    let calm = min(max(level / 10, 0), 1)
    let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { _ in
      NSColor.black.setStroke()
      let ring = NSBezierPath(ovalIn: NSRect(x: 1.75, y: 1.75, width: 14.5, height: 14.5))
      ring.lineWidth = 1.5
      ring.stroke()

      if state == "disconnected" {
        let slash = NSBezierPath()
        slash.move(to: NSPoint(x: 4.6, y: 13.4))
        slash.line(to: NSPoint(x: 13.4, y: 4.6))
        slash.lineWidth = 1.5
        slash.lineCapStyle = .round
        slash.stroke()
        return true
      }

      // Wave across the disc: amplitude decays left→right, and shrinks overall as ANC rises.
      let wave = NSBezierPath()
      let amp = 3.6 * (1 - calm) + 0.15
      let x0 = 4.5, x1 = 13.5, cy = 9.0
      for i in 0...60 {
        let t = Double(i) / 60
        let env = amp * pow(1 - min(t / 0.75, 1), 1.3)
        let p = NSPoint(x: x0 + (x1 - x0) * t, y: cy - env * sin(2 * .pi * 2.2 * t))
        i == 0 ? wave.move(to: p) : wave.line(to: p)
      }
      wave.lineWidth = 1.5
      wave.lineCapStyle = .round
      wave.lineJoinStyle = .round
      wave.stroke()
      return true
    }
    img.isTemplate = true
    return img
  }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
  private let reactNativeDelegate: ReactNativeDelegate
  let reactNativeFactory: RCTReactNativeFactory
  let menu = MenuState()
  // Created once: MenuBarExtra rebuilds its content on every open, and a fresh
  // root view would reconnect to the headset each time.
  lazy var rootView: NSView = reactNativeFactory.rootViewFactory.view(withModuleName: "Hush")

  override init() {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    _ = rootView // start JS now so the headset connects before the first click
    HushShortcuts.updateAppShortcutParameters() // refresh "Switch Hush to <device>" phrases
  }

  // hush://anc/10, hush://switch/iphone, ... (Raycast, Shortcuts, the `hush` CLI)
  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls {
      NotificationCenter.default.post(name: Notification.Name("HushCommand"), object: url.absoluteString)
    }
  }
}

// MARK: - React Native Delegate

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

// MARK: - React Native SwiftUI View

struct ReactNativeView: NSViewRepresentable {
  let rootView: NSView

  func makeNSView(context: Context) -> NSView {
    rootView.removeFromSuperview()
    return rootView
  }

  func updateNSView(_ nsView: NSView, context: Context) {}
}
