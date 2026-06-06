use std::fs;
#[cfg(target_os = "windows")]
use std::io;
#[cfg(target_os = "windows")]
use std::net::{SocketAddr, TcpStream};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::{self, Child, Command, Stdio};
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};

use keyring::Entry;
use tauri::{Manager, Runtime};
#[cfg(not(target_os = "windows"))]
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const KEYRING_SERVICE: &str = "site.binjie.chatmux";
const GATEWAY_TOKEN_ACCOUNT: &str = "gateway-access-token";
const GATEWAY_ADDR_ENV: &str = "CHATMUX_ADDR";
const GATEWAY_DB_ENV: &str = "CHATMUX_DB";
const GATEWAY_LOCAL_NO_AUTH_ENV: &str = "CHATMUX_LOCAL_NO_AUTH";
const GATEWAY_ADDR: &str = "127.0.0.1:19327";
const GATEWAY_LOCAL_NO_AUTH: &str = "1";
#[cfg(target_os = "windows")]
const GATEWAY_READY_TIMEOUT_MS: u64 = 5_000;
#[cfg(target_os = "windows")]
const GATEWAY_READY_POLL_MS: u64 = 100;
#[cfg(target_os = "windows")]
const GATEWAY_CONNECT_TIMEOUT_MS: u64 = 100;
#[cfg(target_os = "windows")]
const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
#[cfg(target_os = "windows")]
const FNV_PRIME: u64 = 0x100000001b3;
#[cfg(target_os = "windows")]
const GATEWAY_BINARY_DIR: &str = "gateway";
#[cfg(target_os = "windows")]
const GATEWAY_BINARY_PREFIX: &str = "chatmux-gateway";
#[cfg(target_os = "windows")]
const GATEWAY_BINARY_TEMP_SUFFIX: &str = "tmp";
#[cfg(target_os = "windows")]
const WINDOWS_CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const GATEWAY_BINARY: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/binaries/chatmux-gateway-",
    env!("CHATMUX_TARGET_TRIPLE"),
    ".exe"
));

#[cfg(target_os = "windows")]
type GatewayChild = Child;
#[cfg(not(target_os = "windows"))]
type GatewayChild = CommandChild;

struct GatewaySidecar(Mutex<Option<GatewayChild>>);

impl Drop for GatewaySidecar {
    fn drop(&mut self) {
        if let Ok(mut child) = self.0.lock() {
            if let Some(child) = child.take() {
                terminate_gateway_child(child);
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
    let child = spawn_gateway(app, &app_data_dir, db_value)?;

    app.manage(GatewaySidecar(Mutex::new(Some(child))));
    Ok(())
}

#[cfg(target_os = "windows")]
fn spawn_gateway<R: Runtime>(
    _app: &mut tauri::App<R>,
    app_data_dir: &Path,
    db_value: String,
) -> Result<GatewayChild, Box<dyn std::error::Error>> {
    let gateway_path = extract_gateway_binary(app_data_dir)?;
    let mut command = Command::new(gateway_path);
    command
        .env(GATEWAY_ADDR_ENV, GATEWAY_ADDR)
        .env(GATEWAY_DB_ENV, db_value)
        .env(GATEWAY_LOCAL_NO_AUTH_ENV, GATEWAY_LOCAL_NO_AUTH)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(WINDOWS_CREATE_NO_WINDOW);

    let mut child = command.spawn()?;
    wait_gateway_ready(&mut child)?;
    Ok(child)
}

#[cfg(not(target_os = "windows"))]
fn spawn_gateway<R: Runtime>(
    app: &mut tauri::App<R>,
    _app_data_dir: &Path,
    db_value: String,
) -> Result<GatewayChild, Box<dyn std::error::Error>> {
    let (mut events, child) = app
        .shell()
        .sidecar("chatmux-gateway")?
        .env(GATEWAY_ADDR_ENV, GATEWAY_ADDR)
        .env(GATEWAY_DB_ENV, db_value)
        .env(GATEWAY_LOCAL_NO_AUTH_ENV, GATEWAY_LOCAL_NO_AUTH)
        .spawn()?;

    tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
    Ok(child)
}

#[cfg(target_os = "windows")]
fn extract_gateway_binary(app_data_dir: &Path) -> io::Result<PathBuf> {
    let gateway_path = gateway_binary_path(app_data_dir);
    if gateway_path.exists() && fs::read(&gateway_path)? == GATEWAY_BINARY {
        return Ok(gateway_path);
    }

    if let Some(parent) = gateway_path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_gateway_binary(&gateway_path)?;
    Ok(gateway_path)
}

#[cfg(target_os = "windows")]
fn gateway_binary_path(app_data_dir: &Path) -> PathBuf {
    let file_name = format!(
        "{GATEWAY_BINARY_PREFIX}-{}.exe",
        gateway_binary_fingerprint()
    );
    app_data_dir.join(GATEWAY_BINARY_DIR).join(file_name)
}

#[cfg(target_os = "windows")]
fn gateway_binary_fingerprint() -> String {
    let hash = GATEWAY_BINARY.iter().fold(FNV_OFFSET_BASIS, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME)
    });
    format!("{hash:016x}")
}

#[cfg(target_os = "windows")]
fn write_gateway_binary(gateway_path: &Path) -> io::Result<()> {
    let temp_path = gateway_temp_path(gateway_path);
    fs::write(&temp_path, GATEWAY_BINARY)?;
    if gateway_path.exists() {
        fs::remove_file(gateway_path)?;
    }
    fs::rename(temp_path, gateway_path)
}

#[cfg(target_os = "windows")]
fn gateway_temp_path(gateway_path: &Path) -> PathBuf {
    let file_name = gateway_path
        .file_name()
        .expect("gateway path must include a file name")
        .to_string_lossy();
    gateway_path.with_file_name(format!(
        "{file_name}.{}.{GATEWAY_BINARY_TEMP_SUFFIX}",
        process::id()
    ))
}

#[cfg(target_os = "windows")]
fn wait_gateway_ready(child: &mut GatewayChild) -> io::Result<()> {
    let gateway_addr = GATEWAY_ADDR
        .parse::<SocketAddr>()
        .map_err(io::Error::other)?;
    let deadline = Instant::now() + Duration::from_millis(GATEWAY_READY_TIMEOUT_MS);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            return Err(io::Error::other(format!(
                "gateway exited before listening: {status}"
            )));
        }
        if gateway_port_ready(gateway_addr) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(GATEWAY_READY_POLL_MS));
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "gateway did not start listening in time",
    ))
}

#[cfg(target_os = "windows")]
fn gateway_port_ready(gateway_addr: SocketAddr) -> bool {
    TcpStream::connect_timeout(
        &gateway_addr,
        Duration::from_millis(GATEWAY_CONNECT_TIMEOUT_MS),
    )
    .is_ok()
}

#[cfg(target_os = "windows")]
fn terminate_gateway_child(mut child: GatewayChild) {
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(not(target_os = "windows"))]
fn terminate_gateway_child(child: GatewayChild) {
    let _ = child.kill();
}
