// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PatchcraftMIDI",
    platforms: [.macOS(.v12)],
    products: [.executable(name: "patchcraft-midi", targets: ["PatchcraftMIDI"])],
    targets: [.executableTarget(name: "PatchcraftMIDI")]
)
