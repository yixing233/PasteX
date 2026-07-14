use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use warp::Filter;
use local_ip_address::{local_ip, list_afinet_netifas};
use serde::{Deserialize, Serialize};
use serde_json::json;

pub struct LanServerState {
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl LanServerState {
    pub fn new() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
        }
    }
}

#[derive(Deserialize, Serialize)]
struct ClipboardPayload {
    content: String,
    // Optional type for future use (e.g. "text", "image")
    #[serde(default)]
    r#type: String, 
}

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri::plugin::Builder::new("lan")
    .setup(|app, _| {
      app.manage(LanServerState::new());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![start_lan_server, stop_lan_server])
    .build()
}

#[tauri::command]
pub async fn start_lan_server<R: Runtime>(
    app: AppHandle<R>,
    port: u16,
    state: tauri::State<'_, LanServerState>,
) -> Result<String, String> {
    let mut tx_guard = state.shutdown_tx.lock().map_err(|e| e.to_string())?;
    
    // If already running, return current IP info? Or error?
    // Let's restart if called again, or just return success.
    if tx_guard.is_some() {
        // Already running. Stop it first? Or just return?
        // Let's assume the user wants to restart if port changed, but here we just return existing.
        // For simplicity, return error or success.
         let ip = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
         return Ok(format!("http://{}:{}", ip, port));
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    *tx_guard = Some(tx);

    // Define the route
    let app_latest = app.clone();
    let latest_route = warp::path("latest")
        .and(warp::get())
        .then(move || {
            let app = app_latest.clone();
            async move {
                let (tx, rx) = tokio::sync::oneshot::channel();
                
                // Dispatch to main thread to safely access clipboard
                let _ = app.run_on_main_thread(move || {
                    let mut clipboard = match arboard::Clipboard::new() {
                        Ok(c) => c,
                        Err(e) => {
                             let _ = tx.send(Err(e.to_string()));
                             return;
                        }
                    };

                    let content = match clipboard.get_text() {
                        Ok(text) => Ok(text),
                        Err(e) => Err(e.to_string()),
                    };
                    let _ = tx.send(content);
                });

                match rx.await {
                     Ok(Ok(text)) => {
                         let json = json!({
                             "type": "text",
                             "content": text
                         });
                         warp::reply::json(&json)
                     },
                     Ok(Err(e)) => {
                         let json = json!({
                             "error": e
                         });
                         warp::reply::json(&json)
                     },
                     Err(_) => {
                         let json = json!({
                             "error": "Failed to receive clipboard content"
                         });
                         warp::reply::json(&json)
                     }
                }
            }
        });
        
    // CORS
    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "OPTIONS"])
        .allow_headers(vec!["Content-Type", "User-Agent", "Start-Time"]);

    let app_push = app.clone();
    let push_route = warp::path("push")
        .and(warp::post())
        .and(warp::body::json())
        .then(move |payload: ClipboardPayload| {
            let app = app_push.clone();
            async move {
                let (tx, rx) = tokio::sync::oneshot::channel();
                
                let _ = app.run_on_main_thread(move || {
                    let mut clipboard = match arboard::Clipboard::new() {
                         Ok(c) => c,
                         Err(e) => {
                             let _ = tx.send(Err(e.to_string()));
                             return;
                         }
                    };
                    
                    let res = clipboard.set_text(payload.content);
                     let _ = tx.send(res.map_err(|e| e.to_string()));
                });

                match rx.await {
                    Ok(Ok(())) => warp::reply::json(&json!({"success": true})),
                    Ok(Err(e)) => warp::reply::json(&json!({"success": false, "error": e})),
                    Err(_) => warp::reply::json(&json!({"success": false, "error": "Internal error"}))
                }
            }
        });

    let routes = latest_route.or(push_route).with(cors);

    let (_addr, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(([0, 0, 0, 0], port), async {
            rx.await.ok();
        });

    println!("[PasteX] LAN Sync Server started on 0.0.0.0:{}", port);
    
    tauri::async_runtime::spawn(server);

    // Get local IP
    let ip = get_lan_ip();
    
    Ok(format!("http://{}:{}", ip, port))
}

fn get_lan_ip() -> String {
    if let Ok(interfaces) = list_afinet_netifas() {
        // Priority 1: 192.168.x.x (Common Home/Office)
        if let Some((_, ip)) = interfaces.iter().find(|(_, ip)| {
             ip.is_ipv4() && ip.to_string().starts_with("192.168.")
        }) {
            return ip.to_string();
        }
        
        // Priority 2: 10.x.x.x (Enterprise LAN)
        if let Some((_, ip)) = interfaces.iter().find(|(_, ip)| {
             ip.is_ipv4() && ip.to_string().starts_with("10.")
        }) {
            return ip.to_string();
        }
        
        // Priority 3: 172.16.x.x - 172.31.x.x
        if let Some((_, ip)) = interfaces.iter().find(|(_, ip)| {
             let s = ip.to_string();
             ip.is_ipv4() && s.starts_with("172.")
        }) {
            return ip.to_string();
        }

        // Priority 4: Any other non-loopback IPv4, excluding 198.18.x.x (Benchmarks/Virtual)
        if let Some((_, ip)) = interfaces.iter().find(|(_, ip)| {
             let s = ip.to_string();
             ip.is_ipv4() && !ip.is_loopback() && !s.starts_with("198.18.")
        }) {
            return ip.to_string();
        }
    }
    
    // Fallback
    local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[tauri::command]
pub async fn stop_lan_server(state: tauri::State<'_, LanServerState>) -> Result<(), String> {
    let mut tx_guard = state.shutdown_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = tx_guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}
