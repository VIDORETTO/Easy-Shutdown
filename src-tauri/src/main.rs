#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let user = std::env::var("USERNAME").unwrap_or_default();
        let msg = format!(
            "[{}] PANIC: {}\n{}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            info,
            std::backtrace::Backtrace::force_capture()
        );
        let log_path = std::env::temp_dir()
            .join(format!("wise-auto-shutdown-panic-{}.log", user));
        let _ = std::fs::write(&log_path, &msg);
    }));

    wise_auto_shutdown_lib::run();
}
