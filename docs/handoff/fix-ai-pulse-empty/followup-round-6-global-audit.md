# Round 6 — 全局 IPC stub shape 审计 + 8 个新 bug 修复

## 范围

在 Round 1-5 修完 6 个 stub 错配后,系统性地对照**所有前端 `api/*.ts` invoke 调用**与**后端 `commands/*.rs` stub 实现**,找出剩下所有 shape/arg-list 错配。

## 找到的 8 个新 bug (L1-L8)

| # | 位置 | 前端期望 | 后端原实现 | 现象 |
|---|------|----------|-----------|------|
| **L1** | `get_llm_default_command` | `LlamaCommand { exe, args[] }` | `String` ("llama-server -m {model} --port {port}") | "自定义命令" 弹窗打开时 `def.exe` / `def.args` 是 `undefined` |
| **L2** | `set_llm_custom_command` | `(exe, args[])` | `(command: String)` | 保存自定义命令 IPC 报"missing required argument exe" |
| **L3a** | `add_models_dir` | `()` (0 args) | `(path: String)` | "添加模型目录" 按钮报"missing required argument path",`handleAddDir` 静默吞错 |
| **L3b** | `remove_models_dir` | `string[]` 返回 | `()` 返回 | `setLocalDirs(undefined)`,state 错位 |
| **L4** | `start_llm_server` | `(modelPath, port, gpuLayers, contextSize, runtime)` | `()` (0 args) | 用户点 Start,IPC 报"function takes 0 arguments, got 5" |
| **L5** | `set_download_dir` | `()` (0 args),返回 string | `(_path: String)`,返回 `()` | "选择下载目录" 弹窗报错,`setDownloadDir(undefined)` |
| **L6** | `ssh_test_connection` | `(host, port, username, password)`,返回 `{success, message}` | `(_id: String)`,返回 Value | MotherAgent 点 "Test connection" 报"function takes 1 argument, got 4" |
| **L7a** | `parasite_abort` | `(agentId)`,返回 `bool` | `()`,返回 `()` | MotherAgent 切 Connect 模式后,Abort 报"unexpected argument agentId" |
| **L7b** | `parasite_reset` | `(agentId)` | `()` | 同上,Clear 按钮 broken |
| **L8** | `get_system_info` | `{os, arch, hasNvidiaGpu, hasAmdGpu, gpuName, gpuVramGb}` | `{os, arch}` | LocalServer 页面 "Runtime options" (vLLM / SGLang) 永远不显示,因为 `hasNvidiaGpu` 是 `undefined` → 走 default → 没 GPU 选项 |

## 修复

### 后端 (echobird_core-local)

- `src/commands/local_server.rs`:
  - L1: `get_llm_default_command` 返回 `LlmCustomCommand`
  - L2: `set_llm_custom_command(exe, args)` 接受 2 args,`CUSTOM_COMMAND` 改为存 `Option<LlmCustomCommand>`
  - L3: `add_models_dir` / `remove_models_dir` 改为无 path / 返回 `Vec<String>`,加 `current_models_dirs()` helper
  - L4: `start_llm_server` 接受 5 args,仍返回 `not_implemented`
  - L5: `set_download_dir` 接受 0 args,返回 `Option<String>` (home/Downloads 兜底)
- `src/commands/ssh.rs`: L6 接受 4 args,返回 shape-compatible 对象
- `src/commands/parasite.rs`: L7 接受 `agent_id`,abort 返回 `bool`
- `src/commands/app.rs`: L8 `sysinfo()` 加全 6 字段(含 macOS / linux / windows 字符串映射)

### 前端 (EchoBird)

- `src/pages/MotherAgent/MotherAgentProvider.tsx`: 5 个关键 catch 改为 `console.error` 让 dev 模式可见(不改变 UI 行为)
  - `loadSSHServers` / `removeSSHServerFromDisk` / `resetAgent` / `parasiteReset` / `parasiteAbort` / `abortAgent`

## 回归测试

**新增 2 个 test 文件,10 个 test**:
- `tests/local_server_command_shape.rs` — 6 test 锁 L1-L5
- `tests/command_signature_shape.rs` — 4 test 锁 L6-L8

**测试矩阵**:
- 之前 52 → 现在 **62 pass, 0 fail**
  - 33 unit + 1 category + 2 pulse_fetch_e2e + 2 pulse_fetch_smoke
  - 1 pulse_ipc + 1 scan_tools + 3 tauri_command_route + 3 token_limit_e2e
  - 3 ai_career_stub_shape + 3 local_engine_stub_shape
  - 6 local_server_command_shape + 4 command_signature_shape

## 部署

`pnpm exec tauri build --bundles app` (22.3s)
→ `/Applications/EchoBird.app` 5.3.4 @ Jun 21 04:55:00

## 静态检查

- `pnpm exec tsc --noEmit` — **0 error**
- `pnpm exec eslint src/` — **0 error, 42 warning**(全 upstream `any` 警告,在预算内)
