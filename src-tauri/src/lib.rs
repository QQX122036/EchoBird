//! EchoBird thin shell.
//!
//! All business logic lives in the private `echobird_core` crate. This
//! file is intentionally minimal because three things MUST be expanded
//! at compile time inside the public binary crate, where the
//! CARGO_MANIFEST_DIR points at this directory:
//!
//!   * `tauri::generate_context!()` resolves `tauri.conf.json`.
//!   * `include_bytes!("../icons/tray-icon.png")` reads the tray icon.
//!   * The `include_str!` calls that pull every PUBLIC install JSON
//!     into the binary at compile time. These files live under
//!     `../../docs/api/tools/install/` because they also feed
//!     echobird.ai/api/tools/install/.... Internal-only assets (the
//!     Mother Agent prompt and hints, the Quick-Action task scripts)
//!     are NOT bundled here — they live inside the private
//!     `echobird_core` crate and are inaccessible from this repository
//!     or the public site.
//!
//! Once those compile-time expansions happen here we register the
//! bundled-asset table with `echobird_core` and call `echobird_core::run`,
//! which contains every other line of EchoBird's Rust code.

use echobird_core::services::bundled_assets::BundledAssets;

static BUNDLED: BundledAssets = BundledAssets {
    install_index_json: include_str!("../../docs/api/tools/install/index.json"),
    install_refs: &[
        (
            "claudecode",
            include_str!("../../docs/api/tools/install/claudecode.json"),
        ),
        (
            "codex",
            include_str!("../../docs/api/tools/install/codex.json"),
        ),
        (
            "qwencode",
            include_str!("../../docs/api/tools/install/qwencode.json"),
        ),
        (
            "aider",
            include_str!("../../docs/api/tools/install/aider.json"),
        ),
        ("pi", include_str!("../../docs/api/tools/install/pi.json")),
        (
            "hermes",
            include_str!("../../docs/api/tools/install/hermes.json"),
        ),
        (
            "nanobot",
            include_str!("../../docs/api/tools/install/nanobot.json"),
        ),
        (
            "openclaw",
            include_str!("../../docs/api/tools/install/openclaw.json"),
        ),
        (
            "opencode",
            include_str!("../../docs/api/tools/install/opencode.json"),
        ),
        (
            "mimocode",
            include_str!("../../docs/api/tools/install/mimocode.json"),
        ),
        (
            "openfang",
            include_str!("../../docs/api/tools/install/openfang.json"),
        ),
        (
            "picoclaw",
            include_str!("../../docs/api/tools/install/picoclaw.json"),
        ),
        (
            "zeroclaw",
            include_str!("../../docs/api/tools/install/zeroclaw.json"),
        ),
        (
            "claudedesktop",
            include_str!("../../docs/api/tools/install/claudedesktop.json"),
        ),
        (
            "codexdesktop",
            include_str!("../../docs/api/tools/install/codexdesktop.json"),
        ),
        (
            "geminidesktop",
            include_str!("../../docs/api/tools/install/geminidesktop.json"),
        ),
        (
            "opencodedesktop",
            include_str!("../../docs/api/tools/install/opencodedesktop.json"),
        ),
        (
            "coffeecli",
            include_str!("../../docs/api/tools/install/coffeecli.json"),
        ),
        (
            "vscode",
            include_str!("../../docs/api/tools/install/vscode.json"),
        ),
        (
            "cursor",
            include_str!("../../docs/api/tools/install/cursor.json"),
        ),
        (
            "windsurf",
            include_str!("../../docs/api/tools/install/windsurf.json"),
        ),
        (
            "trae",
            include_str!("../../docs/api/tools/install/trae.json"),
        ),
        (
            "traecn",
            include_str!("../../docs/api/tools/install/traecn.json"),
        ),
        (
            "grok",
            include_str!("../../docs/api/tools/install/grok.json"),
        ),
        (
            "vibe-trading",
            include_str!("../../docs/api/tools/install/vibe-trading.json"),
        ),
        (
            "workbuddy",
            include_str!("../../docs/api/tools/install/workbuddy.json"),
        ),
        (
            "zcode",
            include_str!("../../docs/api/tools/install/zcode.json"),
        ),
    ],
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let tray_icon_bytes: &'static [u8] = include_bytes!("../icons/tray-icon.png");

    echobird_core::services::bundled_assets::register(&BUNDLED);
    echobird_core::run(context, tray_icon_bytes);
}
