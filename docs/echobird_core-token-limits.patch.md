# `echobird_core` patch — context-window / max-input / max-output tokens

> This document describes the Rust changes needed in the private
> `echobird_core` crate to make the `maxContextTokens` /
> `maxInputTokens` / `maxOutputTokens` fields actually take effect at
> forwarding time. The public frontend already sends these fields
> (commit `e04710c4` for the form, this fork for the apply-model
> IPC); without these core changes, serde drops the new fields and
> the agent falls back to the hardcoded 128K-200K budget.

**Target audience:** someone with push access to the private
`EchoBird-secret-` GitHub repo (the source-of-truth for
`echobird_core`).

**Where to apply:** top-level working tree of the cloned
`echobird_core` repo, on a new branch like
`feat/per-model-token-limits`.

---

## 1. Database schema (migration `0042_model_token_limits.sql`)

Add three nullable columns to the `models` table. Use the project's
existing migration runner (look in `migrations/` for `0041_*.sql` to
match the file-naming convention).

```sql
ALTER TABLE models
    ADD COLUMN max_context_tokens INTEGER,
    ADD COLUMN max_input_tokens   INTEGER,
    ADD COLUMN max_output_tokens  INTEGER;

-- Sanity check constraints — match what the form enforces on the
-- frontend (positive integers, or NULL). A bad row here would let a
-- zero leak through and trip the upstream's max_tokens=0 → 400
-- response. 0 is treated identically to NULL by the Rust code below.
UPDATE models SET max_context_tokens = NULL WHERE max_context_tokens <= 0;
UPDATE models SET max_input_tokens   = NULL WHERE max_input_tokens   <= 0;
UPDATE models SET max_output_tokens  = NULL WHERE max_output_tokens  <= 0;
```

## 2. `add_model` / `update_model` IPC structs

Find the struct used as the deserialization target for the
`add_model` Tauri command (the public side passes an `input` object
with `name`, `baseUrl`, `apiKey`, `anthropicUrl`, `modelId`,
`maxContextTokens`, `maxInputTokens`, `maxOutputTokens` — see
`src/api/models.ts` in the public repo).

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddModelInput {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub anthropic_url: Option<String>,
    pub model_id: Option<String>,
    // NEW: token-limit metadata. Optional at the type level so older
    // frontends that don't send these still work. The `serde(default)`
    // is the safety net — without it, a struct using
    // `deny_unknown_fields` would reject the new fields even though
    // they're declared.
    #[serde(default)]
    pub max_context_tokens: Option<u64>,
    #[serde(default)]
    pub max_input_tokens: Option<u64>,
    #[serde(default)]
    pub max_output_tokens: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateModelInput {
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub anthropic_url: Option<Option<String>>,  // double-Option: None = no change, Some(None) = clear
    pub model_id: Option<String>,
    // NEW — same triple as AddModelInput.
    #[serde(default)]
    pub max_context_tokens: Option<Option<u64>>,
    #[serde(default)]
    pub max_input_tokens: Option<Option<u64>>,
    #[serde(default)]
    pub max_output_tokens: Option<Option<u64>>,
}
```

The `ModelRow` (DB-backed representation) gains the same three
fields, and `get_models` deserializes the row into a response struct
that also re-exports them under the camelCase names so the frontend's
`ModelConfig.maxContextTokens` etc. light up.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelResponse {
    pub internal_id: String,
    pub name: String,
    pub model_id: Option<String>,
    pub base_url: String,
    pub api_key: String,
    pub anthropic_url: Option<String>,
    pub model_type: Option<String>,
    // ... existing fields ...
    pub max_context_tokens: Option<u64>,
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
}
```

## 3. Apply-model IPC (`apply_model_to_tool`)

The public `ApplyModelInput` now also carries the three fields. Add
the matching struct to the backend:

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyModelToolInput {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub protocol: Option<String>,
    pub relay_mode: Option<bool>,
    pub responses_passthrough: Option<bool>,
    pub one_m_context: Option<bool>,
    // NEW
    pub max_context_tokens: Option<u64>,
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
}
```

When forwarding to a tool that writes its own config file
(`~/.claude/settings.json`, `~/.codex/config.toml`,
`~/.cursor/mcp.json`, etc.), pass the three values to the adapter so
the adapter can pre-bake the limit into the file when the tool
natively understands it. For now, **only** the Claude adapter should
honor the values — see step 4.

## 4. Agent-loop / forwarding-layer usage

The actual cap enforcement happens in the agent loop, not in the
DB. Locate the function that turns a `ModelResponse` into a runtime
client (the analog of `agent::Client::from_model`). The simplest
correct change is in the upstream-call wrapping layer.

### 4a. Cap `max_tokens` per request

```rust
// Before sending a Chat Completions or Anthropic Messages request,
// look up the per-model output cap and clamp the caller's
// `max_tokens` to it. If the model has no cap set, fall through to
// the existing default (which today is hardcoded — that's exactly
// the bug we're fixing).
fn clamp_max_tokens(
    requested: Option<u32>,
    model_cap: Option<u64>,
) -> Option<u32> {
    match (requested, model_cap) {
        (Some(r), Some(c)) => Some(r.min(c as u32)),
        (Some(r), None)     => Some(r),
        (None,     Some(c)) => Some(c as u32),
        (None,     None)    => None,
    }
}
```

### 4b. Truncate the input messages to `max_input_tokens`

The agent loop already does some form of token estimation. Add a
post-step after token counting that drops the oldest non-system
messages until the running total fits under `max_input_tokens`,
leaving a 5% safety margin so we don't ping-pong on the boundary:

```rust
fn enforce_input_cap(
    messages: &mut Vec<Message>,
    model_input_cap: Option<u64>,
) {
    let Some(cap) = model_input_cap else { return };
    let safety_cap = ((cap as f64) * 0.95) as u64;
    while estimate_tokens(messages) > safety_cap && messages.len() > 1 {
        // Drop from index 1 — index 0 is conventionally the system
        // prompt and must not be evicted. If the system prompt alone
        // exceeds the cap, log a warning and stop; the upstream will
        // return its own 400 and the user can fix the prompt.
        messages.remove(1);
    }
}
```

### 4c. Use `max_context_tokens` for the progress bar denominator

The Mother Agent UI already shows "上下文用量 X KB / Y KB" in
`mother.contextUsage`. Replace the hardcoded denominator with
`max_context_tokens` when present, falling back to the existing
constant. This is a 2-line change in whichever function renders
that string.

## 5. Claude tool adapter — bake `[1m]` and the env override

Claude Code / Claude Desktop already understand a 1M context via
the `[1m]` logical model variant. The `oneMContext` flag in
`ApplyModelToolInput` is what flips that. Extend the adapter so
that when `max_context_tokens >= 1_000_000` and the user hasn't
manually toggled the relay, we set `oneMContext = true`
automatically — saves the user a trip to the right panel.

```rust
fn claude_one_m_context(model: &ModelResponse, user_override: Option<bool>) -> bool {
    if let Some(v) = user_override { return v; }
    model.max_context_tokens.unwrap_or(0) >= 1_000_000
}
```

## 6. What you DON'T need to change

- **No changes to the public frontend.** This fork (commit
  `e04710c4` + this one) already passes the three fields on every
  IPC call site that exists today. Once the backend struct is
  updated to accept them, serde stops dropping them and the
  values flow through end-to-end.
- **No changes to the `ModelCard` rendering.** It reads the fields
  off the in-memory `ModelConfig` shape, which already declares
  them (`src/api/types.ts`).
- **No changes to the `localStorage` fallback.** It's now
  "backend-wins, localStorage fallback" (`hydrateModelsWithMeta` in
  `ModelNexus.tsx`), so the localStorage copy automatically becomes
  inert once the backend starts returning the fields.

## 7. Verification checklist

After applying the patch:

- [ ] `cargo test` passes (the new `Option<u64>` fields don't
      break existing fixtures)
- [ ] `add_model` accepts the new fields in the JSON payload
- [ ] `update_model` accepts the new fields, and clearing them
      (`{ "maxOutputTokens": null }`) actually sets the DB column
      back to NULL
- [ ] `get_models` returns the fields in the response
- [ ] Setting `max_output_tokens: 4096` and asking the agent to
      generate 8000 tokens results in a finish_reason=length
      response (not an upstream-side 400)
- [ ] Setting `max_input_tokens: 1024` and feeding a 5K-token
      prompt results in the oldest non-system messages being
      dropped before the request is sent
- [ ] The Mother Agent's context-usage bar now reports Y KB based
      on `max_context_tokens` when set, and the existing fallback
      when not
- [ ] On Claude Code, applying a model with
      `max_context_tokens = 1_000_000` automatically flips
      `oneMContext` on (step 5)

## 8. Suggested commit message

```
feat(core): honor per-model max_context_tokens / max_input_tokens / max_output_tokens

Adds three optional token-limit fields to the add_model /
update_model / apply_model_to_tool IPCs and propagates them to:

1. The `max_tokens` parameter of the upstream request, clamped to
   the smaller of the caller-requested value and the model cap.
2. A pre-flight message trim that drops oldest non-system messages
   until the running estimate fits under `max_input_tokens`
   (95% of the cap, to absorb estimation error).
3. The denominator used by the Mother Agent's context-usage bar
   (mother.contextUsage), so users see a real percentage instead
   of a hardcoded 128K/200K fallback.
4. The Claude tool adapter: when `max_context_tokens >= 1_000_000`,
   automatically set `oneMContext` so the Claude tool advertises
   the [1m] logical model variant.

DB migration 0042 adds the three nullable columns. Existing rows
keep the existing default behavior (no cap → use upstream default).
```
