fn main() {
    let resource = std::path::Path::new("resources/Moraxterm_EmbeddedUnix_x64_0.1.24.tar.xz");
    if !resource.is_file() {
        panic!(
            "embedded Unix runtime is missing: {}. Stage it with `python scripts/prepare_embedded_runtime.py --archive <archive.tar.xz>` before building.",
            resource.display()
        );
    }
    tauri_build::build();
}
