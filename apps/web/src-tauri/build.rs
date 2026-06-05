fn main() {
    let target = std::env::var("TARGET").expect("Cargo must set TARGET");
    println!("cargo:rustc-env=CHATMUX_TARGET_TRIPLE={target}");
    tauri_build::build()
}
