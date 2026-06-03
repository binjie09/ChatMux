use std::fs;
use std::sync::Mutex;

use tauri::{Manager, Runtime};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct GatewaySidecar(Mutex<Option<CommandChild>>);

impl Drop for GatewaySidecar {
    fn drop(&mut self) {
        if let Ok(mut child) = self.0.lock() {
            if let Some(mut child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(start_gateway_sidecar)
        .run(tauri::generate_context!())
        .expect("failed to run muxchat desktop app");
}

fn start_gateway_sidecar<R: Runtime>(
    app: &mut tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("muxchat.db");
    let db_value = db_path.to_string_lossy().to_string();
    let (mut events, child) = app
        .shell()
        .sidecar("muxchat-gateway")?
        .env("MUXCHAT_ADDR", "127.0.0.1:19327")
        .env("MUXCHAT_DB", db_value)
        .spawn()?;

    app.manage(GatewaySidecar(Mutex::new(Some(child))));
    tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
    Ok(())
}
