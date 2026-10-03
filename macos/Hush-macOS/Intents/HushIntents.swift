import AppIntents
import AppKit

// MARK: - Bridge to the JS layer (HushCommand in, state.json out)

struct HushState: Decodable {
  struct Anc: Decodable { let level: Int; let enabled: Bool }
  struct Eq: Codable { let bass: Int; let mid: Int; let treble: Int }
  struct Device: Decodable { let mac: String; let name: String; let connected: Bool; let isHost: Bool }
  let status: String
  let name: String?
  let anc: Anc?
  let battery: Int?
  let hoursRemaining: Double?
  let eq: Eq?
  let selfVoice: String?
  let devices: [Device]
}

struct HushError: Error, CustomLocalizedStringResourceConvertible {
  let localizedStringResource: LocalizedStringResource
  init(_ message: LocalizedStringResource) { localizedStringResource = message }
  static let notConnected = HushError("Your headphones aren't connected to Hush.")
}

enum Hush {
  static let stateURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("Hush/state.json")

  /// Last state.json on disk, whatever its age.
  static func read() -> HushState? {
    guard let data = try? Data(contentsOf: stateURL) else { return nil }
    return try? JSONDecoder().decode(HushState.self, from: data)
  }

  /// Waits (up to `timeout`) for a state.json written by *this* run of the app with the headset
  /// connected and read. Covers the case where the intent launched Hush and JS is still booting.
  static func connectedState(timeout: Duration = .seconds(10)) async throws -> HushState {
    let launched = NSRunningApplication.current.launchDate ?? .distantPast
    let deadline = ContinuousClock.now + timeout
    while true {
      let modified = (try? stateURL.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
      if let modified, modified >= launched, let s = read(), s.status == "connected", s.anc != nil {
        return s
      }
      if ContinuousClock.now >= deadline { throw HushError.notConnected }
      try await Task.sleep(for: .milliseconds(200))
    }
  }

  /// Runs a hush:// command through the same pipeline as the URL scheme and the CLI.
  static func send(_ path: String) {
    NotificationCenter.default.post(name: Notification.Name("HushCommand"), object: "hush://\(path)")
  }
}

// MARK: - Enums & entities

enum EqBand: String, AppEnum {
  case bass, mid, treble
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "EQ Band"
  static let caseDisplayRepresentations: [EqBand: DisplayRepresentation] = [
    .bass: "Bass", .mid: "Mid", .treble: "Treble",
  ]
}

enum SelfVoiceMode: String, AppEnum {
  case off, low, medium, high
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Self Voice"
  static let caseDisplayRepresentations: [SelfVoiceMode: DisplayRepresentation] = [
    .off: "Off", .low: "Low", .medium: "Medium", .high: "High",
  ]
}

struct HeadphoneDevice: AppEntity {
  let id: String // MAC address
  let name: String
  let connected: Bool

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Paired Device"
  static let defaultQuery = HeadphoneDeviceQuery()
  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: connected ? "Connected" : nil)
  }
}

/// Paired devices as last reported by the app in state.json.
struct HeadphoneDeviceQuery: EntityStringQuery {
  private func all() -> [HeadphoneDevice] {
    (Hush.read()?.devices ?? []).map { HeadphoneDevice(id: $0.mac, name: $0.name, connected: $0.connected) }
  }
  func entities(for identifiers: [String]) async throws -> [HeadphoneDevice] {
    all().filter { identifiers.contains($0.id) }
  }
  func entities(matching string: String) async throws -> [HeadphoneDevice] {
    all().filter { $0.name.localizedCaseInsensitiveContains(string) }
  }
  func suggestedEntities() async throws -> [HeadphoneDevice] { all() }
}

// MARK: - Intents

struct SetNoiseCancellingIntent: AppIntent {
  static let title: LocalizedStringResource = "Set Noise Cancelling"
  static let description = IntentDescription("Sets the headphones' noise cancelling level (0 = off, 10 = max).")

  @Parameter(title: "Level", default: 10, inclusiveRange: (0, 10))
  var level: Int

  static var parameterSummary: some ParameterSummary { Summary("Set noise cancelling to \(\.$level)") }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    _ = try await Hush.connectedState()
    Hush.send("anc/\(level)")
    return .result(dialog: "Noise cancelling set to \(level).")
  }
}

struct SetEqIntent: AppIntent {
  static let title: LocalizedStringResource = "Set EQ"
  static let description = IntentDescription("Sets one EQ band on the headphones (-10 to 10).")

  @Parameter(title: "Band") var band: EqBand
  @Parameter(title: "Value", default: 0, inclusiveRange: (-10, 10)) var value: Int

  static var parameterSummary: some ParameterSummary { Summary("Set \(\.$band) to \(\.$value)") }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    _ = try await Hush.connectedState()
    Hush.send("eq/\(band.rawValue)/\(value)")
    return .result(dialog: "\(band.rawValue.capitalized) set to \(value).")
  }
}

struct SetSelfVoiceIntent: AppIntent {
  static let title: LocalizedStringResource = "Set Self Voice"
  static let description = IntentDescription("Sets how much of your own voice you hear on calls.")

  @Parameter(title: "Mode") var mode: SelfVoiceMode

  static var parameterSummary: some ParameterSummary { Summary("Set self voice to \(\.$mode)") }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    _ = try await Hush.connectedState()
    Hush.send("selfvoice/\(mode.rawValue)")
    return .result(dialog: "Self voice set to \(mode.rawValue).")
  }
}

struct SwitchHeadphonesIntent: AppIntent {
  static let title: LocalizedStringResource = "Switch Headphones"
  static let description = IntentDescription("Connects the headphones to another paired device.")

  @Parameter(title: "Device") var device: HeadphoneDevice

  static var parameterSummary: some ParameterSummary { Summary("Switch headphones to \(\.$device)") }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    _ = try await Hush.connectedState()
    // ponytail: commands.ts matches by name substring; two devices sharing a name prefix pick the first.
    Hush.send("switch/\(device.name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(["/"])) ?? device.name)")
    return .result(dialog: "Switching to \(device.name).")
  }
}

struct GetBatteryIntent: AppIntent {
  static let title: LocalizedStringResource = "Get Headphone Battery"
  static let description = IntentDescription("Returns the headphones' battery percentage.")

  func perform() async throws -> some IntentResult & ReturnsValue<Int> & ProvidesDialog {
    let s = try await Hush.connectedState()
    guard let battery = s.battery else { throw HushError.notConnected }
    let left = s.hoursRemaining.map { h in
      h >= 1 ? ", about \(Int(h.rounded())) hours left" : ", about \(Int((h * 60).rounded())) minutes left"
    } ?? ""
    return .result(value: battery, dialog: "\(s.name ?? "Headphones") at \(battery)%\(left).")
  }
}

// MARK: - Siri / Spotlight phrases

struct HushShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: GetBatteryIntent(),
      phrases: ["What's my \(.applicationName) battery", "\(.applicationName) battery", "Headphone battery in \(.applicationName)"],
      shortTitle: "Battery", systemImageName: "battery.75percent")
    AppShortcut(
      intent: SwitchHeadphonesIntent(),
      phrases: ["Switch \(.applicationName) to \(\.$device)", "Move \(.applicationName) to \(\.$device)", "Switch \(.applicationName) headphones"],
      shortTitle: "Switch Device", systemImageName: "arrow.left.arrow.right")
    AppShortcut(
      intent: SetNoiseCancellingIntent(),
      phrases: ["Set \(.applicationName) noise cancelling", "Change noise cancelling in \(.applicationName)"],
      shortTitle: "Noise Cancelling", systemImageName: "headphones")
    AppShortcut(
      intent: SetSelfVoiceIntent(),
      phrases: ["Set \(.applicationName) self voice to \(\.$mode)", "Set \(.applicationName) self voice"],
      shortTitle: "Self Voice", systemImageName: "person.wave.2")
    AppShortcut(
      intent: SetEqIntent(),
      phrases: ["Set \(.applicationName) \(\.$band)", "Change \(.applicationName) EQ"],
      shortTitle: "EQ", systemImageName: "slider.vertical.3")
  }
}
