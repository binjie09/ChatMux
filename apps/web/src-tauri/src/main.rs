use std::fs;
use std::sync::Mutex;

use keyring::Entry;
use tauri::{Manager, Runtime};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const KEYRING_SERVICE: &str = "site.binjie.chatmux";
const GATEWAY_TOKEN_ACCOUNT: &str = "gateway-access-token";

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
        .invoke_handler(tauri::generate_handler![
            clear_gateway_access_token,
            load_gateway_access_token,
            save_gateway_access_token
        ])
        .setup(start_gateway_sidecar)
        .run(tauri::generate_context!())
        .expect("failed to run chatmux desktop app");
}

#[tauri::command]
fn load_gateway_access_token() -> Result<String, String> {
    match gateway_token_entry()?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(keyring_error(error)),
    }
}

#[tauri::command]
fn save_gateway_access_token(token: String) -> Result<(), String> {
    gateway_token_entry()?
        .set_password(&token)
        .map_err(keyring_error)
}

#[tauri::command]
fn clear_gateway_access_token() -> Result<(), String> {
    match gateway_token_entry()?.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(keyring_error(error)),
    }
}

fn gateway_token_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, GATEWAY_TOKEN_ACCOUNT).map_err(keyring_error)
}

fn keyring_error(error: keyring::Error) -> String {
    format!("desktop secure storage: {error}")
}

fn start_gateway_sidecar<R: Runtime>(
    app: &mut tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("chatmux.db");
    let db_value = db_path.to_string_lossy().to_string();
    let (mut events, child) = app
        .shell()
        .sidecar("chatmux-gateway")?
        .env("CHATMUX_ADDR", "127.0.0.1:19327")
        .env("CHATMUX_DB", db_value)
        .spawn()?;

    app.manage(GatewaySidecar(Mutex::new(Some(child))));
    tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
    Ok(())
}
