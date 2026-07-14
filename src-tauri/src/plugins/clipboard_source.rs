use serde::Serialize;
use tauri::command;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSource {
    pub name: String,
    pub path: Option<String>,
}

impl ClipboardSource {
    fn unknown() -> Self {
        Self {
            name: "Unknown".to_string(),
            path: None,
        }
    }
}

#[cfg(target_os = "windows")]
use windows::core::PWSTR;

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::CloseHandle,
    System::{
        DataExchange::GetClipboardOwner,
        Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
    },
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};

fn detect_clipboard_source() -> ClipboardSource {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut hwnd = GetClipboardOwner();

        if hwnd.0 == 0 {
            hwnd = GetForegroundWindow();
        }

        if hwnd.0 == 0 {
            return ClipboardSource::unknown();
        }

        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));

        if process_id == 0 {
            return ClipboardSource::unknown();
        }

        let process_handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
        {
            Ok(handle) => handle,
            Err(_) => return ClipboardSource::unknown(),
        };

        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            process_handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR::from_raw(buffer.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(process_handle);

        if result.is_err() {
            return ClipboardSource::unknown();
        }

        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        let name = std::path::Path::new(&path)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Unknown")
            .to_string();

        ClipboardSource {
            name,
            path: Some(path),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        ClipboardSource {
            name: "Unsupported".to_string(),
            path: None,
        }
    }
}

#[command]
pub fn get_clipboard_source() -> String {
    detect_clipboard_source().name
}

#[command]
pub fn get_clipboard_source_detail() -> ClipboardSource {
    detect_clipboard_source()
}
