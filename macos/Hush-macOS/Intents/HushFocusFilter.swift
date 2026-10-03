import AppIntents
import Foundation

enum EqPreset: String, AppEnum {
  case keep, flat
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "EQ Preset"
  static let caseDisplayRepresentations: [EqPreset: DisplayRepresentation] = [.keep: "Keep current", .flat: "Flat"]
}

enum FocusSelfVoice: String, AppEnum {
  case keep, off, low, medium, high
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Self Voice"
  static let caseDisplayRepresentations: [FocusSelfVoice: DisplayRepresentation] = [
    .keep: "Keep current", .off: "Off", .low: "Low", .medium: "Medium", .high: "High",
  ]
}

/// Focus filter: applies a Hush profile while a Focus is on, restores the previous settings when it ends.
/// All parameters are optional, so the system calling perform() with defaults (= Focus ended) is all-nil.
struct HushFocusFilter: SetFocusFilterIntent {
  static let title: LocalizedStringResource = "Hush profile"
  static let description = IntentDescription("Sets noise cancelling, how much you hear yourself on calls, and EQ while this Focus is on.")

  @Parameter(title: "Noise cancelling", controlStyle: .slider, inclusiveRange: (0, 10)) var anc: Double?
  @Parameter(title: "Hear yourself on calls") var selfVoice: FocusSelfVoice?
  @Parameter(title: "EQ") var eq: EqPreset?

  var displayRepresentation: DisplayRepresentation {
    var parts: [String] = []
    if let anc { parts.append("noise cancelling \(Int(anc.rounded()))") }
    if let selfVoice, selfVoice != .keep { parts.append("self voice \(selfVoice.rawValue)") }
    if eq == .flat { parts.append("flat EQ") }
    return DisplayRepresentation(title: "Hush profile", subtitle: parts.isEmpty ? nil : "\(parts.joined(separator: ", "))")
  }

  struct Snapshot: Codable { let anc: Int; let selfVoice: String; let eq: HushState.Eq? }
  static let snapshotKey = "hush.focusSnapshot"

  func perform() async throws -> some IntentResult {
    let defaults = UserDefaults.standard
    let deactivated = anc == nil && selfVoice == nil && eq == nil

    if deactivated {
      guard let data = defaults.data(forKey: Self.snapshotKey),
            let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return .result() }
      _ = try await Hush.connectedState() // throws if disconnected; snapshot kept for the next end-of-Focus
      defaults.removeObject(forKey: Self.snapshotKey)
      Hush.send("anc/\(snap.anc)")
      Hush.send("selfvoice/\(snap.selfVoice)")
      if let e = snap.eq {
        Hush.send("eq/bass/\(e.bass)"); Hush.send("eq/mid/\(e.mid)"); Hush.send("eq/treble/\(e.treble)")
      }
      return .result()
    }

    let s = try await Hush.connectedState()
    // Keep the original snapshot when switching straight from one Hush-filtered Focus to another.
    if defaults.data(forKey: Self.snapshotKey) == nil, let level = s.anc?.level {
      let snap = Snapshot(anc: level, selfVoice: s.selfVoice ?? "off", eq: s.eq)
      defaults.set(try JSONEncoder().encode(snap), forKey: Self.snapshotKey)
    }
    if let anc { Hush.send("anc/\(Int(anc.rounded()))") }
    if let selfVoice, selfVoice != .keep { Hush.send("selfvoice/\(selfVoice.rawValue)") }
    if eq == .flat { Hush.send("eq/flat") }
    return .result()
  }
}
