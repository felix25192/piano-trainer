// swift-tools-version: 5.9
import PackageDescription

// The package name has to be what the Capacitor CLI derives from the npm name
// "piano-trainer-midi-bridge": it writes exactly this into the app's
// CapApp-SPM package when `npx cap sync ios` runs.
let package = Package(
    name: "PianoTrainerMidiBridge",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "PianoTrainerMidiBridge", targets: ["MidiBridgePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "MidiBridgePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/MidiBridgePlugin"
        )
    ]
)
