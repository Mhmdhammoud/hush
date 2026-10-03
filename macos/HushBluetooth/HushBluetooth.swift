import Foundation
import IOBluetooth
import React

/// Opens the headset's BMAP control channel ("SPP Dev" RFCOMM service) and
/// shuttles raw frames between JS and the device. Protocol parsing lives in JS.
@objc(HushBluetooth)
class HushBluetooth: RCTEventEmitter, IOBluetoothRFCOMMChannelDelegate {
  private var channel: IOBluetoothRFCOMMChannel?
  private var pending: (RCTPromiseResolveBlock, RCTPromiseRejectBlock)?
  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue { .main } // IOBluetooth delegates fire on the main run loop
  override func supportedEvents() -> [String] { ["data", "closed"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc func connect(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if let ch = channel, ch.isOpen() { return resolve(deviceInfo(ch.getDevice())) }
    let devices = (IOBluetoothDevice.pairedDevices() as? [IOBluetoothDevice] ?? []).filter { $0.isConnected() }
    for dev in devices {
      guard let rec = (dev.services as? [IOBluetoothSDPServiceRecord])?.first(where: { $0.getServiceName() == "SPP Dev" }) else { continue }
      var id: BluetoothRFCOMMChannelID = 0
      guard rec.getRFCOMMChannelID(&id) == kIOReturnSuccess else { continue }
      pending = (resolve, reject)
      var ch: IOBluetoothRFCOMMChannel?
      let r = dev.openRFCOMMChannelAsync(&ch, withChannelID: id, delegate: self)
      if r != kIOReturnSuccess { pending = nil; return reject("open", "RFCOMM open failed (\(r))", nil) }
      channel = ch
      return
    }
    reject("nodevice", "No connected headset exposing an SPP Dev channel", nil)
  }

  @objc func send(_ hex: String) {
    guard let ch = channel, ch.isOpen() else { return }
    var bytes = [UInt8]()
    var i = hex.startIndex
    while let j = hex.index(i, offsetBy: 2, limitedBy: hex.endIndex), i < hex.endIndex {
      if let b = UInt8(hex[i..<j], radix: 16) { bytes.append(b) }
      i = j
    }
    ch.writeAsync(&bytes, length: UInt16(bytes.count), refcon: nil)
  }

  @objc func disconnect() { channel?.close(); channel = nil }

  /// Bring the headset's audio connection to this Mac (baseband connect, like clicking it in Bluetooth settings).
  @objc func pullHeadset(_ address: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let dev = IOBluetoothDevice(addressString: address) else { return reject("addr", "bad address", nil) }
    if dev.isConnected() { return resolve(true) }
    DispatchQueue.global().async {
      let r = dev.openConnection() // blocking; can take a few seconds
      DispatchQueue.main.async { r == kIOReturnSuccess ? resolve(true) : reject("connect", "connect failed (\(r))", nil) }
    }
  }

  private func deviceInfo(_ dev: IOBluetoothDevice?) -> [String: Any] {
    ["name": dev?.name ?? "", "address": dev?.addressString ?? ""]
  }

  // MARK: IOBluetoothRFCOMMChannelDelegate

  func rfcommChannelOpenComplete(_ ch: IOBluetoothRFCOMMChannel!, status: IOReturn) {
    guard let (resolve, reject) = pending else { return }
    pending = nil
    if status == kIOReturnSuccess { resolve(deviceInfo(ch.getDevice())) }
    else { channel = nil; reject("open", "RFCOMM open failed (\(status))", nil) }
  }

  func rfcommChannelData(_ ch: IOBluetoothRFCOMMChannel!, data: UnsafeMutableRawPointer!, length: Int) {
    guard hasListeners else { return }
    let bytes = UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: length)
    sendEvent(withName: "data", body: bytes.map { String(format: "%02x", $0) }.joined())
  }

  func rfcommChannelClosed(_ ch: IOBluetoothRFCOMMChannel!) {
    channel = nil
    if hasListeners { sendEvent(withName: "closed", body: nil) }
  }
}
