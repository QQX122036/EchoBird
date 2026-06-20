# EchoBird Fork 修复交接包 — fix-ai-pulse-empty

> 上次 Codex 会话因 token 预算耗尽中断。此目录是给"重启后的新会话"准备的零成本接手说明。
> 目标:在不破坏其他功能的前提下,让 **AI 资讯 / 明星项目**真的能加载内容,而不是停在"暂无内容"。

## 1. 项目背景

- **本机仓库**:`/Users/ayden/Documents/EchoBird` — 公开 fork,基于 `QQX122036/EchoBird`,已加了 5.3.4 模型中心三字段(上下文/最大输入/最大输出 tokens),UI 验证 OK。
- **本机后端**:`/Users/ayden/echobird_core-local` — clean-room 复刻的 `echobird_core` 私有 crate(原仓库作者不开源)。`src-tauri/Cargo.toml` 用 `path = "/Users/ayden/echobird_core-local"` 链过去,**不要碰上游私有仓库**。
- **当前线上**:`/Applications/EchoBird.app` 是 5.3.4 构建(模型中心 OK,AI 资讯/明星项目**还是空**)。

## 2. 任务清单(请按顺序执行)

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| 1 | 模型中心三字段(上下文/最大输入/最大输出 tokens) | ✅ 已完成,已部署 | `src/api/types.ts`, `src/pages/ModelNexus/ModelNexus.tsx`, `src/i18n/{zh-Hans,en}.ts`, `src/pages/AppManager/AppManagerProvider.tsx` |
| 2 | clean-room 加 `pulse_save` / `pulse_load_all` 命令 | ✅ 已完成,4 单测过 | `echobird_core-local/src/services/pulse_archive.rs`, `commands/pulse.rs` |
| **3** | **后端加 `pulse_fetch` 命令(reqwest 拉 mirror chain JSON → 落盘)** | ❌ **未做(核心阻塞)** | `pulse_archive.rs` 加 `fetch_and_persist`, `commands/pulse.rs` 加 `pulse_fetch`, `lib.rs` invoke_handler 注册 |
| **4** | **前端 `AiPulse.tsx` 在 Provider mount 时调 `pulse_fetch`** | ❌ **未做** | `src/pages/AiPulse/AiPulse.tsx` |
| **5** | **重打 .app + 部署** | ❌ **未做** | 跑 `pnpm exec tauri build --bundles app`,然后 `sudo cp -R` 部署 |

#3 是当前阻塞点。一个回合的 token 就够修完。

## 3. 根因(已经诊断清楚,不要再花时间排查)

- 前端 `AiPulse.tsx` 用浏览器 `fetch` 走 mirror chain 拉 JSON — 这部分代码完整。
- **但**:后端 `pulse_archive` **完全没有网络层**。`pulse_load_all` 只读盘,所以启动时返回 `[]`,前端再调浏览器 fetch,但 WebView 在 `tauri://` origin 下 CORS 行为不稳定 + 用户没点刷新 → **停在"暂无内容"**。
- **正确架构**:后端用 `reqwest` 主动拉(已经在 `Cargo.toml` 依赖里),前端 mount 时调一次 `pulse_fetch`,把结果合并入 state。

## 4. 镜像链(已验证可用,200 OK, ~4-5MB JSON)

ZH 链:
1. `https://echobird.ai/pulse/latest-7d.json`
2. `https://ainew-1251534910.cos.ap-hongkong.myqcloud.com/latest-7d.json`
3. `https://suyxh.github.io/ai-news-aggregator/data/latest-7d.json`
4. `https://cdn.jsdelivr.net/gh/SuYxh/ai-news-aggregator@main/data/latest-7d.json`
5. `https://raw.githubusercontent.com/SuYxh/ai-news-aggregator/main/data/latest-7d.json`

EN 链(`latest-7d-en.json`,该文件在 `edison7009/EchoBird` 仓库的 `docs/pulse/` 下):
1. `https://echobird.ai/pulse/latest-7d-en.json`
2. `https://ainew-1251534910.cos.ap-hongkong.myqcloud.com/latest-7d-en.json`
3. `https://cdn.jsdelivr.net/gh/edison7009/EchoBird@main/docs/pulse/latest-7d-en.json`
4. `https://raw.githubusercontent.com/edison7009/EchoBird/main/docs/pulse/latest-7d-en.json`

每个 mirror 设 10s timeout,首个 200 + 非 HTML + JSON 解析成功就停,否则顺序 fallback。

## 5. JSON Schema(用于 Rust 端反序列化)

```json
{
  "generated_at": "ISO8601",
  "window_hours": 168,
  "total_items": 1234,
  "items": [
    {
      "id": "string",
      "site_id": "string?",
      "site_name": "string?",
      "source": "string",
      "title": "string",
      "url": "string",
      "published_at": "ISO8601?",
      "first_seen_at": "ISO8601?",
      "last_seen_at": "ISO8601?",
      "title_zh": "string?",
      "title_en": "string?"
    }
  ]
}
```

`PulseItem` 结构在 `echobird_core-local/src/services/pulse_archive.rs` 已经定义,直接复用。

## 6. 关键约束(不要再犯)

- **不要碰上游私有仓库**(用户没有权限)。
- **不要 `git commit` / push 未经允许** — 用户没明确要求。
- **不要重写整个后端** — 干净室是好的,只补 `pulse_fetch`。
- **不要改模型中心以外的 UI 文件** — 用户原话:"我要求你只改了模型中心,然后其他的功能全部保留原始的,就是改动之前的一个功能,要完整而且没有改动。"
- **不要用 `cargo build` 单独跑** — 那是给开发用的,不会嵌入前端。**必须用 `pnpm exec tauri build --bundles app`**。
- **.app 部署**:`sudo rm -rf /Applications/EchoBird.app && sudo cp -R src-tauri/target/release/bundle/macos/EchoBird.app /Applications/ && codesign --force --deep --sign - /Applications/EchoBird.app`

## 7. 重新启动会话时怎么用

新会话第一句:
> 继续 EchoBird fork 修复。读 `/Users/ayden/Documents/EchoBird/docs/handoff/fix-ai-pulse-empty/README.md`,做 #3 #4 #5。

## 8. 当前 git 状态

- `main` HEAD: `0872813a` (fork 本地,含模型中心三字段)
- clean-room `a7549a5` 在 `echobird_core-local`(没 push)
- `/Applications/EchoBird.app` = 5.3.4,模型中心 OK,AI 资讯/明星项目待修
