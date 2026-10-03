import AppKit
import Carbon.HIToolbox
import CoreAudio
import Foundation
import React
import ServiceManagement
import UserNotifications

/// App-level services for the JS side: login item, global hotkey, notifications, menu-bar state.
@objc(HushSystem)
class HushSystem: RCTEventEmitter {
  static let menuStateChanged = Notification.Name("HushMenuStateChanged")
  private var hotKeyRef: EventHotKeyRef?
  private var hasListeners = false
  private static weak var shared: HushSystem?

  override static func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue { .main }
  override func supportedEvents() -> [String] { ["hotkey", "mic", "wheel", "command", "unlock", "frontApp", "visible"] }
  private var pendingCommands: [String] = []
  override func startObserving() {
    hasListeners = true
    pendingCommands.forEach { sendEvent(withName: "command", body: $0) } // URLs that launched us
    pendingCommands = []
  }
  override func stopObserving() { hasListeners = false }

  override init() {
    super.init()
    HushSystem.shared = self
    DispatchQueue.main.async { self.registerHotKey() }
    DispatchQueue.main.async { self.watchMic() }
    DistributedNotificationCenter.default().addObserver(forName: Notification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) {
      [weak self] _ in if let self, self.hasListeners { self.sendEvent(withName: "unlock", body: nil) }
    }
    // The popover's window is key while it's open: JS pauses its animations when it isn't.
    for (name, open) in [(NSWindow.didBecomeKeyNotification, true), (NSWindow.didResignKeyNotification, false)] {
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
        [weak self] _ in if let self, self.hasListeners { self.sendEvent(withName: "visible", body: open) }
      }
    }
    // Frontmost app (ignoring Hush itself) for per-app noise-cancelling rules.
    NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) {
      [weak self] note in
      guard let self, self.hasListeners,
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
            let id = app.bundleIdentifier, id != Bundle.main.bundleIdentifier else { return }
      self.sendEvent(withName: "frontApp", body: ["bundleId": id, "name": app.localizedName ?? id])
    }
    NotificationCenter.default.addObserver(forName: Notification.Name("HushCommand"), object: nil, queue: .main) {
      [weak self] note in
      guard let self, let url = note.object as? String else { return }
      if self.hasListeners { self.sendEvent(withName: "command", body: url) } else { self.pendingCommands.append(url) }
    }
    // RN macOS has no wheel event. Forward live scrolls (not momentum) with a physical sign:
    // positive = fingers/wheel moving up, regardless of the natural-scrolling setting.
    NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] e in
      guard let self, self.hasListeners, e.momentumPhase.isEmpty else { return e }
      let dy = e.isDirectionInvertedFromDevice ? -e.scrollingDeltaY : e.scrollingDeltaY
      if dy != 0 { self.sendEvent(withName: "wheel", body: ["dy": dy, "precise": e.hasPreciseScrollingDeltas]) }
      return e
    }
  }

  // MARK: microphone in use = "on a call" (any app, any input device: built-in, USB, headset, virtual)

  private var watchedInputs = Set<AudioObjectID>()
  private var lastMic = false

  private static func addr(_ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
  }

  private static func inputDevices() -> [AudioObjectID] {
    var a = addr(kAudioHardwarePropertyDevices)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &ids)
    return ids.filter { id in
      var s = addr(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput)
      var n: UInt32 = 0
      return AudioObjectGetPropertyDataSize(id, &s, 0, nil, &n) == noErr && n > 0
    }
  }

  private static func isRunning(_ dev: AudioObjectID) -> Bool {
    var running: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    var a = addr(kAudioDevicePropertyDeviceIsRunningSomewhere)
    return AudioObjectGetPropertyData(dev, &a, 0, nil, &size, &running) == noErr && running != 0
  }

  private func watchMic() {
    var devices = Self.addr(kAudioHardwarePropertyDevices)
    AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &devices, .main) { [weak self] _, _ in
      self?.attachInputs()
    }
    attachInputs()
  }

  private func attachInputs() {
    for id in Self.inputDevices() where !watchedInputs.contains(id) {
      watchedInputs.insert(id)
      var running = Self.addr(kAudioDevicePropertyDeviceIsRunningSomewhere)
      AudioObjectAddPropertyListenerBlock(id, &running, .main) { [weak self] _, _ in self?.emitMic() }
    }
    emitMic()
  }

  private func micActive() -> Bool { Self.inputDevices().contains(where: Self.isRunning) }

  private func emitMic() {
    let now = micActive()
    guard now != lastMic else { return }
    lastMic = now
    if hasListeners { sendEvent(withName: "mic", body: now) }
  }

  @objc func micInUse(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(micActive())
  }

  @objc func getPref(_ key: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(UserDefaults.standard.string(forKey: "hush." + key))
  }

  @objc func setPref(_ key: String, value: String) {
    UserDefaults.standard.set(value, forKey: "hush." + key)
  }

  // ⌥⌘N cycles noise cancelling (handled in JS).
  private func registerHotKey() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
      if let s = HushSystem.shared, s.hasListeners { s.sendEvent(withName: "hotkey", body: "cycleAnc") }
      return noErr
    }, 1, &spec, nil, nil)
    let id = EventHotKeyID(signature: OSType(0x48555348), id: 1) // 'HUSH'
    RegisterEventHotKey(UInt32(kVK_ANSI_N), UInt32(optionKey | cmdKey), id, GetApplicationEventTarget(), 0, &hotKeyRef)
  }

  @objc func launchAtLogin(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(SMAppService.mainApp.status == .enabled)
  }

  @objc func setLaunchAtLogin(_ on: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
      resolve(SMAppService.mainApp.status == .enabled)
    } catch {
      reject("login", error.localizedDescription, error)
    }
  }

  @objc func notify(_ title: String, body: String) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
      guard granted else { return }
      let c = UNMutableNotificationContent()
      c.title = title
      c.body = body
      center.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }
  }

  /// "anc:<0-10>" | "disconnected" — drives the menu-bar glyph.
  @objc func setMenuState(_ state: String) {
    NotificationCenter.default.post(name: HushSystem.menuStateChanged, object: state)
  }

  @objc func quit() { NSApp.terminate(nil) }

  /// Detent tick on Force Touch trackpads.
  @objc func haptic() {
    NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
  }

  /// Latest headset state for the `hush` CLI: <Application Support>/Hush/state.json (inside the container when sandboxed).
  @objc func publishState(_ json: String) {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Hush")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? json.write(to: dir.appendingPathComponent("state.json"), atomically: true, encoding: .utf8)
  }
}
