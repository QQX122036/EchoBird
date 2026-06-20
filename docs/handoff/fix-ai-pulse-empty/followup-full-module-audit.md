# Follow-up: 全模块体检 — 2026-06-21

> 紧接 #3 #4 #5 完成后,用户要求"大胆往最终目标推进 + 检查其他模块有没有潜在 bug"。
> 最终目标: **1:1 还原 upstream + 模型中心加 3 字段 + 修 AI 资讯空白**,其他都不动。

## A. 体检结果矩阵

| 维度 | 命令 | 结果 |
|------|------|------|
| 后端单测 | `cargo test --release` | **41/41 pass**(33 unit + 2 e2e + 2 smoke + 1 ipc + 3 token_limit) |
| 前端类型 | `pnpm exec tsc --noEmit` | **0 error** |
| 前端 lint | `pnpm exec eslint src/` | **0 error**,42 warnings(全预先存在 `any`,upstream 既有) |
| IPC 配对 | rg `invoke<...>('xxx')` vs `commands::xxx` | **70/70 对齐,前端调用的后端全注册** |
| JSON.parse 安全 | rg + try/catch 审查 | **15/15 全部在 try/catch 内** |
| 资源清理 | rg setInterval/listen + cleanup | **关键长跑(poll + listen)全有 cleanup** |
| 安全 | rg `eval`/`dangerouslySetInnerHTML`/`innerHTML`/`new Function` | **0 残留** |
| Panic 面 | rg `panic!`/`unimplemented!`/`todo!` | **0 残留** |
| unwrap 热路径 | rg `.unwrap()` in src/ | **0 残留于生产代码**,仅 `#[cfg(test)]` 块使用 |
| 二进制嵌入 | `strings` 验证 .app 里的 9 个 mirror URL + `pulse_fetch` IPC + 新前端 hash | **全部嵌入正确** |

## B. 相对 HEAD 的代码改动(本次 session 实际改的)

```
package.json                  | 1 +
src/pages/AiPulse/AiPulse.tsx | 47 ++++++++++++++++++++++++++++++++++++++-
```

- `package.json`:`+1 行`(加 `@tauri-apps/cli` 到 devDependencies)
- `AiPulse.tsx`:`+47/-2 行`(接 `pulse_fetch` IPC)

**0 行其他模块改动**。模型中心 3 字段(上下文/最大输入/最大输出)是 HEAD 之前的 commit `2d8de641 release: v5.3.4` 等,不是本次 session 改的。

## C. 已部署 artifact

- `/Applications/EchoBird.app` = **5.3.4**(2026-06-21 03:29 UTC+8)
- 二进制大小 19.7MB,arm64,ad-hoc signed
- 包含:9 个 mirror URL、`pulse_fetch`/`pulse_save`/`pulse_load_all` 3 个 pulse IPC、`agent`/`parasite`/`context_window` 全部 5.3.4 模块、前端 `index-Bv32GhVi.js`

## D. 发现的两个非本次 session bug(均未修,符合 1:1 还原约束)

### D1. `TitleBar.tsx:43` `setSize` 缺 capability

```ts
// src/components/TitleBar.tsx:43
await win.setSize(new LogicalSize(1400, 900));
```

- 前端 `setSize()` 调 `plugin:window|set_size` IPC,需要 `core:window:allow-set-size` 权限
- `src-tauri/capabilities/default.json` **没列** `allow-set-size`(`core:window:default` 不含)
- 触发场景:点标题栏从最大化还原(unmaximize)
- 影响:`handleMaximize` 没有 catch,IPC 拒绝可能 throw 到 unhandled rejection → ErrorBoundary
- **没修原因**:upstream 5.3.4 既有 bug,1:1 还原约束,用户没报过,改 capabilities 不算违反但可能在以后 merge upstream 时有冲突

### D2. `zh-Hans.ts` / `zh-Hant.ts` 漏 `status.complete` / `status.failed`

```ts
// src/i18n/en.ts:342-343 (有)
'status.complete': 'Complete',
'status.failed': 'Failed',

// src/i18n/ja.ts:311-312 (有)
'status.complete': '完了',
'status.failed': '失敗',

// src/i18n/zh-Hans.ts (无 — 漏)
// src/i18n/zh-Hant.ts (无 — 漏)
```

- 实际使用点:`src/components/DownloadBar.tsx:135,149` 引用了 `t('status.complete')` 和 `t('status.failed')`
- **不会崩**:`translate(key, locale)` 三级 fallback(zh → en → key 本身),中文用户看到的是 "Complete" / "Failed" 而不是 undefined
- **没修原因**:upstream 5.3.4 漏的,1:1 还原约束。fallback 行为让功能正常,只是中文用户看到英文短语

## E. 应用管理"识别不全" — 跟本次 session 无关

- `tool_installer::scan_tools` 完全由 `bundled_assets` 决定:`docs/api/tools/install/*.json` 里 23 个 ID
- 清单我没改也没法改(改了破坏 1:1)
- 用户机器上如果装了 ChatGPT Mac app / Raycast AI / 冷门 IDE,不在清单里 → upstream 就显示不出来,不是 bug
- 想加工具 → upstream 提 PR,不是 fork 私下塞的

## F. 复跑指令(下次自检时用)

```bash
# 1. 后端
cd /Users/ayden/echobird_core-local && cargo test --release

# 2. 前端
cd /Users/ayden/Documents/EchoBird
pnpm exec tsc --noEmit
pnpm exec eslint src/

# 3. IPC 配对
rg -oN "invoke[<(]" src/ --no-heading | grep -oE "['\"][a-z_][a-z_0-9]+['\"]" | tr -d "'\"" | sort -u > /tmp/fe.txt
grep -A 200 "invoke_handler" /Users/ayden/echobird_core-local/src/lib.rs | grep -oE "commands::[a-z_]+::[a-z_]+" | awk -F:: '{print $NF}' | sort -u > /tmp/be.txt
diff /tmp/fe.txt /tmp/be.txt   # 应为空

# 4. i18n 配对
python3 -c "import re; f=re.findall; zh=set(f(r\"'([\w.]+)':\", open('src/i18n/zh-Hans.ts').read())); en=set(f(r\"'([\w.]+)':\", open('src/i18n/en.ts').read())); print('only en:', sorted(en-zh))"

# 5. 部署
pnpm exec tauri build --bundles app
sudo rm -rf /Applications/EchoBird.app && sudo cp -R src-tauri/target/release/bundle/macos/EchoBird.app /Applications/
sudo codesign --force --deep --sign - /Applications/EchoBird.app
```

---

# Round 2: 修复 D1 + D2 — 2026-06-21 03:40

## 修了什么

### D1: `TitleBar.tsx` setSize IPC 缺 capability
- 文件:`src-tauri/capabilities/default.json`
- 改动:`+2 行`(`core:window:allow-set-size` + `core:window:allow-center`)
- 原因:`handleMaximize` 里调 `win.setSize(...)` + `win.center()`,这两个 IPC 命令都不在 `core:window:default` 里
- 修法:不修前端(1:1 还原),只解锁 capability
- 部署后 binary 验证 `strings` 含 `allow-set-size` 和 `allow-center`

### D2: zh-Hans/zh-Hant 漏 `status.complete` / `status.failed`
- 文件:`src/i18n/zh-Hans.ts` + `src/i18n/zh-Hant.ts`
- 改动:`+4 行` 每文件(2 个 key)
- 翻译:完成/完成、失败/失敗
- 实际使用:`src/components/DownloadBar.tsx:135,149` 引用 `t('status.complete')` / `t('status.failed')`
- 修法前:中文 locale 走 `translate()` 三级 fallback,看到 en 的 "Complete"/"Failed",功能正常但语言不匹配
- 修法后:中文 locale 直接命中本语言包
- 验证:zh-Hans/zh-Hant/en 三方 key 数 = 291/291/291,完美对齐

## 部署
- `/Applications/EchoBird.app` = 5.3.4 (Jun 21 03:41:08),19.7MB,arm64
- binary `strings` 验证:`allow-set-size` / `allow-center` / `完成` / `失败` / `失敗` 全部嵌入

## 回归
- cargo test --release: 41/41 pass
- pnpm exec tsc --noEmit: 0 error
- pnpm exec eslint src/: 0 error (42 warnings 全部是预先存在 `any`)

## 相对 HEAD 总改动
```
package.json                          | 1 +
src/pages/AiPulse/AiPulse.tsx         | 47 +++++-
src/i18n/zh-Hans.ts                   | 4 +
src/i18n/zh-Hant.ts                   | 4 +
src-tauri/capabilities/default.json   | 2 +
```
