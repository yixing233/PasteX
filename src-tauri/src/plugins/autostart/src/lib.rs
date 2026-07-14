use tauri::{
    generate_handler,
    plugin::{Builder, TauriPlugin},
    Runtime,
};

mod commands;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pastex-autostart")
        .invoke_handler(generate_handler![commands::is_autostart])
        .build()
}
