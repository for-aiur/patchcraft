import CoreMIDI
import CoreFoundation
import Foundation

private let endpointName = "Patchcraft"

private func fail(_ message: String, status: OSStatus? = nil) -> Never {
    if let status {
        fputs("Patchcraft MIDI: \(message) (Core MIDI status \(status))\n", stderr)
    } else {
        fputs("Patchcraft MIDI: \(message)\n", stderr)
    }
    exit(EXIT_FAILURE)
}

var client = MIDIClientRef()
let clientStatus = MIDIClientCreate("Patchcraft MIDI" as CFString, nil, nil, &client)
guard clientStatus == noErr else { fail("Could not create MIDI client.", status: clientStatus) }

var source = MIDIEndpointRef()
let sourceStatus = MIDISourceCreate(client, "Patchcraft" as CFString, &source)
guard sourceStatus == noErr else {
    MIDIClientDispose(client)
    fail("Could not create the DAW-visible MIDI input.", status: sourceStatus)
}

let sourceReference = UnsafeMutablePointer<MIDIEndpointRef>.allocate(capacity: 1)
sourceReference.initialize(to: source)
var destination = MIDIEndpointRef()
let destinationStatus = MIDIDestinationCreate(
    client,
    "Patchcraft" as CFString,
    { packetList, reference, _ in
        guard let packetList, let reference else { return }
        let source = reference.assumingMemoryBound(to: MIDIEndpointRef.self).pointee
        // Forward Web MIDI 1.0 packets into the Core MIDI source visible to the DAW.
        _ = MIDIReceived(source, packetList)
    },
    UnsafeMutableRawPointer(sourceReference),
    &destination
)
guard destinationStatus == noErr else {
    sourceReference.deinitialize(count: 1)
    sourceReference.deallocate()
    MIDIEndpointDispose(source)
    MIDIClientDispose(client)
    fail("Could not create the browser-visible MIDI output.", status: destinationStatus)
}

signal(SIGINT) { _ in exit(EXIT_SUCCESS) }
signal(SIGTERM) { _ in exit(EXIT_SUCCESS) }
print("Patchcraft MIDI is ready. Select ‘Patchcraft’ in the browser and as a MIDI input in your DAW.")
print("Keep this process running while you use the virtual MIDI route. Press Ctrl-C to stop.")
RunLoop.main.run()
