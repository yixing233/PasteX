mod core;
mod plugins;

use core::{prevent_default, setup};
use plugins::{clipboard_source, lan};
use tauri::{generate_context, Builder, Manager, WindowEvent};
use std::path::PathBuf;


use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_pastex_window::{show_main_window, MAIN_WINDOW_LABEL, PREFERENCE_WINDOW_LABEL};
use tauri_plugin_log::{Target, TargetKind};

fn get_install_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|dir| dir.to_path_buf()))
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_dir = get_install_dir().join("logs");

    let mut builder = Builder::default()
        .setup(|app| {
            let app_handle = app.handle();



            let main_window = app.get_webview_window(MAIN_WINDOW_LABEL).unwrap();

            let preference_window = app.get_webview_window(PREFERENCE_WINDOW_LABEL).unwrap();

            setup::default(&app_handle, main_window.clone(), preference_window.clone());
            let _ = main_window.hide();
            let _ = preference_window.hide();

            // Initialize LAN server state
            app.manage(plugins::lan::LanServerState::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            clipboard_source::get_clipboard_source,
            clipboard_source::get_clipboard_source_detail,
            open_with,
            get_file_name,
            get_install_dir_cmd,
            get_default_app,
            get_app_list,
            play_sound,
            plugins::lan::start_lan_server,
            plugins::lan::stop_lan_server,
        ]);

    #[cfg(not(debug_assertions))]
    {
        // 生产环境保持单实例，避免重复进程。
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app_handle, _argv, _cwd| {
                show_main_window(app_handle);
            },
        ));
    }

    let app = builder
        // app 自启动：https://github.com/tauri-apps/tauri-plugin-autostart/tree/v2
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--auto-launch"]),
        ))
        // 数据库：https://github.com/tauri-apps/tauri-plugin-sql/tree/v2
        .plugin(tauri_plugin_sql::Builder::default().build())
        // 日志插件：https://github.com/tauri-apps/tauri-plugin-log/tree/v2
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Folder {
                        path: log_dir.clone(),
                        file_name: None,
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        // 快捷键插件: https://github.com/tauri-apps/tauri-plugin-global-shortcut
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 操作系统相关信息插件：https://github.com/tauri-apps/tauri-plugin-os
        .plugin(tauri_plugin_os::init())
        // 系统级别对话框插件：https://github.com/tauri-apps/tauri-plugin-dialog
        .plugin(tauri_plugin_dialog::init())
        // 访问文件系统插件：https://github.com/tauri-apps/tauri-plugin-fs
        .plugin(tauri_plugin_fs::init())
        // 更新插件：https://github.com/tauri-apps/tauri-plugin-updater
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 进程相关插件：https://github.com/tauri-apps/tauri-plugin-process
        .plugin(tauri_plugin_process::init())
        // 检查和请求 macos 系统权限：https://github.com/ayangweb/tauri-plugin-macos-permissions
        .plugin(tauri_plugin_macos_permissions::init())
        // 拓展了对文件和目录的操作：https://github.com/ayangweb/tauri-plugin-fs-pro
        .plugin(tauri_plugin_fs_pro::init())
        // 获取系统获取系统的区域设置：https://github.com/ayangweb/tauri-plugin-locale
        .plugin(tauri_plugin_locale::init())
        // 打开文件或者链接：https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/opener
        .plugin(tauri_plugin_opener::init())
        // 禁用 webview 的默认行为：https://github.com/ferreira-tb/tauri-plugin-prevent-default
        .plugin(prevent_default::init())
        // 剪贴板插件：https://github.com/ayangweb/tauri-plugin-clipboard-x
        .plugin(tauri_plugin_clipboard_x::init())
        // 自定义的窗口管理插件
        .plugin(tauri_plugin_pastex_window::init())
        // 自定义粘贴的插件
        .plugin(tauri_plugin_pastex_paste::init())
        // 自定义判断是否自动启动的插件
        .plugin(tauri_plugin_pastex_autostart::init())
        .on_window_event(|window, event| match event {
            // 让 app 保持在后台运行：https://tauri.app/v1/guides/features/system-tray/#preventing-the-app-from-closing
            WindowEvent::CloseRequested { api, .. } => {
                let label = window.label();
                let should_keep_alive =
                    label == MAIN_WINDOW_LABEL || label == PREFERENCE_WINDOW_LABEL;

                if should_keep_alive {
                    if let Err(error) = window.hide() {
                        eprintln!("failed to hide window `{}`: {}", label, error);
                    }

                    api.prevent_close();
                }
            }
            _ => {}
        })
        .build(generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if has_visible_windows {
                return;
            }

            tauri_plugin_pastex_window::show_preference_window(app_handle);
        }
        _ => {
            let _ = app_handle;
        }
    });
}

#[tauri::command]
fn open_with(path: String, app: Option<String>) -> Result<(), String> {
    if let Some(app) = app {
        if app.is_empty() {
             open::that(path).map_err(|e| e.to_string())
        } else {
             std::process::Command::new(app)
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())
                .map(|_| ())
        }
    } else {
        open::that(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_file_name(path: String) -> String {
    std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
fn get_install_dir_cmd() -> String {
    get_install_dir().to_string_lossy().to_string()
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_default_app(ext: String) -> String {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::UI::Shell::{
        AssocQueryStringW, ASSOCF_VERIFY, ASSOCSTR_EXECUTABLE, ASSOCSTR_FRIENDLYAPPNAME,
    };

    // Helper to query assoc string
    // We must ensure the ext starts with "."
    let ext_str = if ext.starts_with('.') {
        ext
    } else {
        format!(".{}", ext)
    };
    
    // Convert to wide string (UTF-16) + null terminator
    let ext_wide: Vec<u16> = OsStr::new(&ext_str)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        // First try to get the Friendly App Name (e.g. "Google Chrome")
        let mut len: u32 = 0;
        let _ = AssocQueryStringW(
            ASSOCF_VERIFY,
            ASSOCSTR_FRIENDLYAPPNAME,
            PCWSTR::from_raw(ext_wide.as_ptr()),
            PCWSTR::null(),
            PWSTR::null(),
            &mut len,
        );

        if len > 0 {
            let mut buf = vec![0u16; len as usize];
            if AssocQueryStringW(
                ASSOCF_VERIFY,
                ASSOCSTR_FRIENDLYAPPNAME,
                PCWSTR::from_raw(ext_wide.as_ptr()),
                PCWSTR::null(),
                PWSTR::from_raw(buf.as_mut_ptr()),
                &mut len,
            ).is_ok() {
                // Buffer might contain null terminator, trim it
                let s = String::from_utf16_lossy(&buf);
                let trimmed = s.trim_matches(char::from(0));
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
        
        // If failed, try to get the Executable path (e.g. "C:\...\chrome.exe")
        let mut len: u32 = 0;
        let _ = AssocQueryStringW(
            ASSOCF_VERIFY,
            ASSOCSTR_EXECUTABLE,
            PCWSTR::from_raw(ext_wide.as_ptr()),
            PCWSTR::null(),
            PWSTR::null(),
            &mut len,
        );

        if len > 0 {
            let mut buf = vec![0u16; len as usize];
            if AssocQueryStringW(
                ASSOCF_VERIFY,
                ASSOCSTR_EXECUTABLE,
                PCWSTR::from_raw(ext_wide.as_ptr()),
                PCWSTR::null(),
                PWSTR::from_raw(buf.as_mut_ptr()),
                &mut len,
            ).is_ok() {
                let path_str = String::from_utf16_lossy(&buf);
                let path_str = path_str.trim_matches(char::from(0));
                // Extract filename from path
                if let Some(stem) = std::path::Path::new(path_str).file_stem() {
                     return stem.to_string_lossy().to_string();
                }
            }
        }
    }
    
    String::new()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_default_app(_ext: String) -> String {
    String::new()
}

#[derive(serde::Serialize)]
struct AppInfo {
    name: String,
    path: String,
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_app_list(ext: String) -> Vec<AppInfo> {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        ASSOC_FILTER_RECOMMENDED, SHAssocEnumHandlers,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, CoTaskMemFree, COINIT_APARTMENTTHREADED};

    // Initialize COM library
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }

    let ext_str = if ext.starts_with('.') {
        ext
    } else {
        format!(".{}", ext)
    };
    
    let ext_wide: Vec<u16> = OsStr::new(&ext_str)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut apps = Vec::new();

    unsafe {
        if let Ok(enum_handlers) = SHAssocEnumHandlers(
            PCWSTR::from_raw(ext_wide.as_ptr()),
            ASSOC_FILTER_RECOMMENDED,
        ) {
            let mut handler = [None];
            let mut fetched = 0;
            while enum_handlers.Next(&mut handler, Some(&mut fetched)).is_ok() && fetched > 0 {
                if let Some(h) = &handler[0] {
                    let ui_name = if let Ok(name_ptr) = h.GetUIName() {
                            let s = name_ptr.to_string().unwrap_or_default();
                            CoTaskMemFree(Some(name_ptr.as_ptr() as _));
                            s
                    } else { String::new() };

                    let exe_path = if let Ok(path_ptr) = h.GetName() {
                            let s = path_ptr.to_string().unwrap_or_default();
                            CoTaskMemFree(Some(path_ptr.as_ptr() as _));
                            s
                    } else { String::new() };

                    if !ui_name.is_empty() && !exe_path.is_empty() {
                        apps.push(AppInfo {
                            name: ui_name,
                            path: exe_path,
                        });
                    }
                }
            }
        }
    }
    
    // Uninitialize COM
    unsafe {
        CoUninitialize();
    }
    
    apps
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_app_list(_ext: String) -> Vec<AppInfo> {
    Vec::new()
}

#[tauri::command]
fn play_sound(event: String, path: Option<String>) {
    std::thread::spawn(move || {
        let (_stream, stream_handle) = match rodio::OutputStream::try_default() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to get output stream: {}", e);
                return;
            }
        };

        let sink = match rodio::Sink::try_new(&stream_handle) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to create audio sink: {}", e);
                return;
            }
        };

        // Try playing custom file if path is provided
        if let Some(p) = path {
            if !p.is_empty() {
                if let Ok(file) = std::fs::File::open(&p) {
                    let reader = std::io::BufReader::new(file);
                    if let Ok(source) = rodio::Decoder::new(reader) {
                        sink.append(source);
                        sink.sleep_until_end();
                        // Prevent premature drop if duration is estimated incorrectly
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        return;
                    } else {
                        eprintln!("Failed to decode custom audio file: {}", p);
                    }
                } else {
                    eprintln!("Failed to open custom audio file: {}", p);
                }
            }
        }

        // Fallback to default embedded sounds
        if event != "copy" && event != "paste" {
            return;
        }

        let sound_data: &[u8] = match event.as_str() {
            "copy" => include_bytes!("../assets/copy.mp3"),
            "paste" => include_bytes!("../assets/paste.mp3"),
            _ => return,
        };

        if let Ok(source) = rodio::Decoder::new(std::io::Cursor::new(sound_data)) {
            sink.append(source);
            sink.sleep_until_end();
            std::thread::sleep(std::time::Duration::from_millis(500));
        } else {
            eprintln!("Failed to decode default audio");
        }
    });
}
