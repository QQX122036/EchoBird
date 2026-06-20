# Round 4 + Round 5 — 我的AI生涯 & 本地大模型 stub shape 修复

## 范围

两个模块的 IPC stub shape 错配,导致前端 `for...of` / `.find()` 抛 TypeError,
被 `.catch` 吞掉,页面停留在 loading / 0 / "checking" 状态。

模块:
- 我的AI生涯 (`src/commands/ai_career.rs` + `src/pages/AiCareer/heatmapData.ts`)
- 本地大模型 (`src/commands/local_server.rs`)

## 关键 bug 表

| # | 位置 | 原 stub shape | 前端期望 shape | 现象 |
|---|------|---------------|---------------|------|
| 1 | `ai_career::ai_career_heatmap` | `{"days":[],"byFamily":{}}` | `Vec<Value>` | 热力图全空,4/5 统计卡 0 |
| 2 | `ai_career::ai_career_family_history` | `{"items":[]}` | `Vec<Value>` | 家族历史表格空 |
| 3 | `ai_career::ai_career_token_bytes` | `{"bytes":0}` | `u64` | "约累计 Token" 渲染 NaNB |
| 4 | `local_server::detect_gpu` | `{"available":false,"name":null,"vramGb":null}` | `{gpuName,gpuVramGb} \| null` | GPU 卡死 0GB,自动探测不触发 |
| 5 | `local_server::get_gpu_info` | `{"available":false}` | `{gpuName,gpuVramGb} \| null` | 同上 |
| 6 | `local_server::get_local_engine_status` | `{"installed":false,"version":null}` | `{engines:[]}` | Engine status 永远 "checking" |

## 修复

### 后端 (echobird_core-local)

**`src/commands/ai_career.rs`** — 3 个 stub 改 shape 匹配前端
**`src/commands/local_server.rs`** — 3 个 stub 改 shape 匹配前端
  - GPU 助手返回 `serde_json::Value::Null` 作为"未检测"信号
  - `get_local_engine_status` 返回 `{"engines": []}`

### 前端 (EchoBird)

**`src/pages/AiCareer/heatmapData.ts`** — `formatCompact` 加 `!Number.isFinite(n)` guard,
防止 `formatCompact(NaN) / 1_000_000_000` 渲染 "NaNB" 的二级 bug(双层防御)

## 回归测试

**新增**:
- `tests/ai_career_stub_shape.rs` — 3 个 test 锁 ai_career stub shape
- `tests/local_engine_stub_shape.rs` — 3 个 test 锁 local_server stub shape

**测试矩阵**:
- 之前 46 个 → 现在 **52 个 pass, 0 fail**
  - 33 unit + 1 category + 2 pulse_fetch_e2e + 2 pulse_fetch_smoke
  - 1 pulse_ipc + 1 scan_tools + 3 tauri_command_route + 3 token_limit_e2e
  - 3 ai_career_stub_shape + 3 local_engine_stub_shape

## 部署

`pnpm exec tauri build --bundles app` (21.5s)
→ `/Applications/EchoBird.app` 5.3.4 @ Jun 21 04:46:17
