import Foundation
// Weak-linked: FoundationModels only exists on macOS 26; the app still launches on 14/15.
@_weakLinked import FoundationModels
#if !HUSH_AI_STANDALONE
import React
#endif

/// Natural language -> hush:// commands, on-device (Apple Foundation Models). No network.
enum HushAICore {
  /// Same allow-list as src/ai.ts. Anything else the model says is dropped.
  static let allowed = try! NSRegularExpression(pattern:
    "^(anc/(10|[0-9]|up|down)|eq/(bass|mid|treble)/-?(10|[0-9])|eq/flat|selfvoice/(off|low|medium|high)"
    + "|switch/[^/%]{1,40}|callmode/(on|off)|conversation/(on|off))$")

  static func validate(_ cmds: [String]) -> [String] {
    cmds.map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { allowed.firstMatch(in: $0, range: NSRange($0.startIndex..., in: $0)) != nil }
  }

  static let instructions = """
    You control Bose NC700 headphones. Turn the user's request into commands. Only use:
    anc/<0-10> noise cancelling level (0 = hear everything, 10 = max quiet)
    eq/<bass|mid|treble>/<-10..10>, eq/flat (all bands 0)
    selfvoice/<off|low|medium|high> how much of your own voice you hear on calls
    conversation/<on|off> conversation mode (pauses and lets you hear people)
    callmode/<on|off> automatic max quiet + self voice during calls
    switch/<device name> connect to a paired device, use the exact name from the state
    Resolve relative requests ("quieter", "more bass") against the current state: quieter = higher anc, \
    "hear the room/door/people" = lower anc (2-4), "more bass" = bass +3 from current. Change only what was asked.
    Examples (current anc 5, bass 0):
    "max quiet for focus" -> ["anc/10"]
    "quieter but let me hear the door" -> ["anc/7"]
    "flat EQ, more bass" -> ["eq/flat", "eq/bass/3"]
    "call mode on and switch to my iPad" -> ["callmode/on", "switch/Alex's iPad"]
    Summary: one short line like "Noise cancelling 7 · bass +3".
    """
}

@available(macOS 26.0, *)
@Generable
struct HushPlan {
  @Guide(description: "hush commands, in order, e.g. anc/7 or eq/bass/3", .maximumCount(6))
  var commands: [String]
  @Guide(description: "One short line describing the result, e.g. Noise cancelling 7 · self voice low")
  var summary: String
}

@available(macOS 26.0, *)
extension HushAICore {
  static func availability() -> [String: Any] {
    switch SystemLanguageModel.default.availability {
    case .available: return ["available": true]
    case .unavailable(let r): return ["available": false, "reason": "\(r)"]
    }
  }

  static func interpret(_ text: String, state: String, timeout: Double = 10) async throws -> (commands: [String], summary: String) {
    let session = LanguageModelSession(instructions: instructions)
    let prompt = "Current state: \(state)\nRequest: \(text)"
    let plan = try await withThrowingTaskGroup(of: HushPlan.self) { g in
      g.addTask { try await session.respond(to: prompt, generating: HushPlan.self, options: GenerationOptions(temperature: 0)).content }
      g.addTask {
        try await Task.sleep(for: .seconds(timeout))
        throw NSError(domain: "HushAI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Took too long"])
      }
      defer { g.cancelAll() }
      return try await g.next()!
    }
    return (validate(plan.commands), plan.summary)
  }
}

#if !HUSH_AI_STANDALONE
@objc(HushAI)
class HushAI: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func available(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if #available(macOS 26.0, *) { resolve(HushAICore.availability()) }
    else { resolve(["available": false, "reason": "needs macOS 26"]) }
  }

  @objc func interpret(_ text: String, state: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(macOS 26.0, *) else { return reject("ai", "needs macOS 26", nil) }
    Task {
      do {
        let r = try await HushAICore.interpret(text, state: state)
        resolve(["commands": r.commands, "summary": r.summary])
      } catch {
        reject("ai", error.localizedDescription, error)
      }
    }
  }
}
#endif
