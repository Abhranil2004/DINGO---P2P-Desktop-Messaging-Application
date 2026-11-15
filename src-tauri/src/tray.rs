use std::sync::atomic::{AtomicBool, Ordering};

// Global state for notification mute (available on all platforms)
pub static NOTIFICATIONS_MUTED: AtomicBool = AtomicBool::new(false);

pub fn is_muted() -> bool {
    NOTIFICATIONS_MUTED.load(Ordering::SeqCst)
}

pub fn toggle_mute() -> bool {
    let current = NOTIFICATIONS_MUTED.load(Ordering::SeqCst);
    NOTIFICATIONS_MUTED.store(!current, Ordering::SeqCst);
    !current
}

// Desktop-only: system tray icon and window management
#[cfg(not(target_os = "android"))]
mod desktop {
    use super::NOTIFICATIONS_MUTED;
    use std::sync::atomic::Ordering;
    use tauri::{
        menu::{Menu, MenuItem, PredefinedMenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        AppHandle, Emitter, Manager, Runtime,
    };

    pub fn init_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
        let open_item = MenuItem::with_id(app, "open", "Open Dingo", true, None::<&str>)?;
        let mute_item = MenuItem::with_id(app, "mute", "Mute Notifications", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let exit_item = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

        let menu = Menu::with_items(app, &[&open_item, &mute_item, &separator, &exit_item])?;

        let _tray_icon = TrayIconBuilder::new()
            .icon(app.default_window_icon().unwrap().clone())
            .menu(&menu)
            .show_menu_on_left_click(false)
            .tooltip("Dingo - P2P Messaging")
            .on_menu_event(move |app, event| {
                match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "mute" => {
                        let current = NOTIFICATIONS_MUTED.load(Ordering::SeqCst);
                        NOTIFICATIONS_MUTED.store(!current, Ordering::SeqCst);
                        let _ = app.emit("notifications-muted", !current);
                    }
                    "exit" => {
                        app.exit(0);
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })
            .build(app)?;

        println!("System tray initialized successfully");
        Ok(())
    }

}

#[cfg(not(target_os = "android"))]
pub use desktop::init_tray;
