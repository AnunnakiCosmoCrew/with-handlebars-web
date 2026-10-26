import AVFoundation
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    // MARK: - Audio session

    /// Declare the app's audio intent: playback, because a fretboard is an
    /// instrument and has to sound with the ring/silent switch on (ADR-0003).
    ///
    /// This is a declaration, not the mechanism. The notes are played by Web
    /// Audio inside the WKWebView, which runs its own audio session and has
    /// ignored the host app's category since 2017 (webkit.org/b/167788) — the
    /// page asks for the same thing itself via `navigator.audioSession`, in
    /// `src/audio/session.ts`. Keep the two in step.
    ///
    /// Deliberately no `setActive(true)` here: activating is what interrupts
    /// other apps, and at launch the user has not asked for a note yet. WebKit
    /// activates when audio actually starts.
    private func configureAudioSession() {
        applyPlaybackCategory()

        let center = NotificationCenter.default
        center.addObserver(self,
                           selector: #selector(handleInterruption(_:)),
                           name: AVAudioSession.interruptionNotification,
                           object: nil)
        // After a media services reset the session is gone entirely, category
        // and all; it has to be asked for again.
        center.addObserver(self,
                           selector: #selector(handleMediaServicesReset(_:)),
                           name: AVAudioSession.mediaServicesWereResetNotification,
                           object: nil)
    }

    private func applyPlaybackCategory() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        } catch {
            // Never block launch over this: the app is still usable, and on a
            // device that refused the category the page simply stays quiet
            // under the silent switch.
            NSLog("Handlebars: could not set the playback audio category: \(error)")
        }
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .ended
        else { return }
        applyPlaybackCategory()
    }

    @objc private func handleMediaServicesReset(_: Notification) {
        applyPlaybackCategory()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
