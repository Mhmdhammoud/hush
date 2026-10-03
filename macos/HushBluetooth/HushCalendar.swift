import EventKit
import Foundation
import React

/// Read-only EventKit access for meeting prep: upcoming events that look like meetings.
@objc(HushCalendar)
class HushCalendar: NSObject {
  private let store = EKEventStore()
  private static let videoHosts = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "webex.com", "facetime.apple.com"]

  @objc static func requiresMainQueueSetup() -> Bool { false }

  private static func statusString() -> String {
    switch EKEventStore.authorizationStatus(for: .event) {
    case .fullAccess: return "granted"
    case .writeOnly: return "writeOnly"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }

  @objc func authorizationStatus(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(Self.statusString())
  }

  @objc func requestAccess(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    store.requestFullAccessToEvents { granted, error in
      if let error { reject("calendar", error.localizedDescription, error) } else { resolve(granted) }
    }
  }

  @objc func upcomingMeetings(_ withinMinutes: Double, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { return resolve([]) }
    let now = Date()
    // Include events already underway so a late poll still sees a meeting that just started.
    let pred = store.predicateForEvents(withStart: now.addingTimeInterval(-3600), end: now.addingTimeInterval(withinMinutes * 60), calendars: nil)
    let iso = ISO8601DateFormatter()
    let out: [[String: Any]] = store.events(matching: pred).compactMap { e in
      guard !e.isAllDay, e.availability != .free, e.status != .canceled, e.endDate > now else { return nil }
      if e.attendees?.first(where: { $0.isCurrentUser })?.participantStatus == .declined { return nil }
      let text = [e.url?.absoluteString, e.location, e.notes].compactMap { $0 }.joined(separator: " ").lowercased()
      return [
        "id": (e.eventIdentifier ?? e.calendarItemIdentifier) + "@" + String(e.startDate.timeIntervalSince1970),
        "title": e.title ?? "Meeting",
        "start": iso.string(from: e.startDate),
        "end": iso.string(from: e.endDate),
        "hasVideoLink": Self.videoHosts.contains { text.contains($0) },
        "attendeeCount": e.attendees?.count ?? 0,
      ]
    }
    resolve(out)
  }
}
