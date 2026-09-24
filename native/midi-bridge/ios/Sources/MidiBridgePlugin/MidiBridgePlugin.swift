import Capacitor
import CoreAudioKit
import CoreMIDI
import Foundation
import UIKit

/// Hands every MIDI message the device receives to the app, as it came.
///
/// Safari and every iOS web view lack Web MIDI, so this is the only way a
/// keyboard's key presses reach the app on an iPad. It is deliberately thin —
/// an adapter, in the terms of the rest of the code. It decides nothing about
/// what a message means: the words go to JavaScript untouched, and
/// `src/core/midiMessages.ts` reads them, where the tests can reach.
///
/// It listens with the MIDI 1.0 protocol through the event-list API that came
/// with iOS 14. Every channel message then arrives as one 32-bit word, and a
/// chord struck at once arrives as several words in one delivery. The older
/// packet API packs several messages into one packet and leaves the splitting
/// to the reader — which is where a published plugin loses chord notes.
@objc(MidiBridgePlugin)
public class MidiBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MidiBridgePlugin"
    public let jsName = "MidiBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pairBluetooth", returnType: CAPPluginReturnPromise),
    ]

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var connected: [MIDIEndpointRef] = []
    private var listening = false

    /// Starts listening to every source there is, and to every one that appears later.
    @objc func start(_ call: CAPPluginCall) {
        if client == 0 {
            let status = MIDIClientCreateWithBlock("Piano Trainer" as CFString, &client) { [weak self] notification in
                // A keyboard switched on, plugged in or paired: listen to it too.
                if notification.pointee.messageID == .msgSetupChanged {
                    DispatchQueue.main.async { self?.connectAll() }
                }
            }
            guard status == noErr else {
                call.reject("CoreMIDI would not create a client (\(status)).")
                return
            }
        }

        if port == 0 {
            let status = MIDIInputPortCreateWithProtocol(
                client, "Piano Trainer input" as CFString, ._1_0, &port
            ) { [weak self] eventList, _ in
                self?.forward(eventList)
            }
            guard status == noErr else {
                call.reject("CoreMIDI would not create an input port (\(status)).")
                return
            }
        }

        listening = true
        connectAll()
        call.resolve(["sources": sourceNames()])
    }

    @objc func stop(_ call: CAPPluginCall) {
        listening = false
        disconnectAll()
        call.resolve()
    }

    /// Apple's own dialog for finding and pairing a Bluetooth MIDI keyboard.
    ///
    /// iOS does not connect Bluetooth MIDI devices by itself; an app has to
    /// offer this. Once paired, the keyboard is a source like any cable.
    @objc func pairBluetooth(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let central = CABTMIDICentralViewController()
            let navigation = UINavigationController(rootViewController: central)
            central.navigationItem.rightBarButtonItem = UIBarButtonItem(
                systemItem: .done,
                primaryAction: UIAction { [weak navigation] _ in
                    navigation?.dismiss(animated: true)
                }
            )
            self.bridge?.viewController?.present(navigation, animated: true)
            call.resolve()
        }
    }

    private func connectAll() {
        guard listening else { return }
        disconnectAll()
        for index in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            if source != 0 && MIDIPortConnectSource(port, source, nil) == noErr {
                connected.append(source)
            }
        }
    }

    private func disconnectAll() {
        for source in connected {
            MIDIPortDisconnectSource(port, source)
        }
        connected = []
    }

    private func sourceNames() -> [String] {
        connected.map { source in
            var name: Unmanaged<CFString>?
            if MIDIObjectGetStringProperty(source, kMIDIPropertyDisplayName, &name) == noErr,
               let value = name?.takeRetainedValue() {
                return value as String
            }
            return "MIDI"
        }
    }

    /// Runs on CoreMIDI's own thread; the words are copied out before it returns.
    private func forward(_ eventList: UnsafePointer<MIDIEventList>) {
        var words: [Int] = []
        for packet in eventList.unsafeSequence() {
            let count = Int(packet.pointee.wordCount)
            var storage = packet.pointee.words
            withUnsafeBytes(of: &storage) { raw in
                for word in raw.bindMemory(to: UInt32.self).prefix(count) {
                    words.append(Int(word))
                }
            }
        }
        guard !words.isEmpty else { return }
        DispatchQueue.main.async {
            self.notifyListeners("words", data: ["words": words])
        }
    }
}
