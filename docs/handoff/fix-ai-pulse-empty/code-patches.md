# 给新会话的代码骨架(直接抄)

> 这些是已经设计好的代码片段,下次会话里照着落盘即可,不要重新设计。
> 所有 patch 都用 `cat > file <<'EOF' ... EOF` 或 `apply_patch`(如果有)写入。

---

## Patch 1: `pulse_archive.rs` 加 `fetch_and_persist`

在 `/Users/ayden/echobird_core-local/src/services/pulse_archive.rs` **文件底部**,在 `use std::path::Path;` 之后、`pub fn save` 之前,**追加**:

```rust
use std::time::Duration;
use once_cell::sync::Lazy;
static HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("EchoBird/5.3.4 (+https://echobird.ai)")
        .build()
        .expect("reqwest client")
});

const MIRRORS_ZH: &[(&str, &str)] = &[
    ("echobird",   "https://echobird.ai/pulse"),
    ("tencent-hk", "https://ainew-1251534910.cos.ap-hongkong.myqcloud.com"),
    ("pages",      "https://suyxh.github.io/ai-news-aggregator/data"),
    ("jsdelivr",   "https://cdn.jsdelivr.net/gh/SuYxh/ai-news-aggregator@main/data"),
    ("github-raw", "https://raw.githubusercontent.com/SuYxh/ai-news-aggregator/main/data"),
];
const MIRRORS_EN: &[(&str, &str)] = &[
    ("echobird",   "https://echobird.ai/pulse"),
    ("tencent-hk", "https://ainew-1251534910.cos.ap-hongkong.myqcloud.com"),
    ("jsdelivr",   "https://cdn.jsdelivr.net/gh/edison7009/EchoBird@main/docs/pulse"),
    ("github-raw", "https://raw.githubusercontent.com/edison7009/EchoBird/main/docs/pulse"),
];
const FILE_ZH: &str = "latest-7d.json";
const FILE_EN: &str = "latest-7d-en.json";

#[derive(Debug, Deserialize)]
struct RawFeed {
    #[serde(default)]
    items: Vec<PulseItem>,
}

pub async fn fetch_and_persist(lang: &str) -> CoreResult<Vec<PulseItem>> {
    let lang_norm = Lang::parse(lang)?;
    let mirrors: &[(&str, &str)] = match lang_norm {
        Lang::Zh => MIRRORS_ZH,
        Lang::En => MIRRORS_EN,
    };
    let file = match lang_norm {
        Lang::Zh => FILE_ZH,
        Lang::En => FILE_EN,
    };

    let mut last_err: Option<String> = None;
    for (name, base) in mirrors {
        let url = format!("{base}/{file}");
        let resp = HTTP.get(&url).send().await;
        let body = match resp {
            Ok(r) if r.status().is_success() => match r.text().await {
                Ok(t) => t,
                Err(e) => { last_err = Some(format!("{name}: {e}")); continue; }
            },
            Ok(r) => { last_err = Some(format!("{name} HTTP {}", r.status())); continue; }
            Err(e) => { last_err = Some(format!("{name}: {e}")); continue; }
        };
        // Reject HTML (some CDNs return index.html on 404)
        if body.trim_start().to_ascii_lowercase().starts_with("<!doctype")
            || body.trim_start().starts_with("<html")
        {
            last_err = Some(format!("{name} returned HTML"));
            continue;
        }
        let feed: RawFeed = match serde_json::from_str(&body) {
            Ok(f) => f,
            Err(e) => { last_err = Some(format!("{name} bad JSON: {e}")); continue; }
        };
        if feed.items.is_empty() {
            last_err = Some(format!("{name} empty feed"));
            continue;
        }
        // 落盘 + 重新 load_all 拿合并结果
        let _ = save(lang, &feed.items)?;
        return load_all(lang);
    }
    Err(Error::Network {
        message: last_err.unwrap_or_else(|| "all mirrors failed".into()),
    })
}
```

**注意**:`pulse_archive.rs` 已经 `use crate::error::{CoreResult, Error}`,但 `Error::Network` 变体需要先在 `error/mod.rs` 添加(若不存在),否则改成 `Error::Other { message: ... }` 或现有的变体。**先 `grep "Network" src/error/*.rs` 看一眼再写。**

---

## Patch 2: `commands/pulse.rs` 加 `pulse_fetch` 命令

在文件末尾追加:

```rust
/// `pulse_fetch` — 从公共镜像链拉 JSON,落盘,返回合并后的列表。
#[command]
pub async fn pulse_fetch(lang: String) -> Result<serde_json::Value, String> {
    ipc(pulse_archive::fetch_and_persist(&lang).await.map(|items| {
        serde_json::json!({ "items": items, "count": items.len() })
    }))
}
```

---

## Patch 3: `lib.rs` 注册命令

在 `commands::pulse::pulse_save` 之后加:

```rust
            commands::pulse::pulse_fetch,
```

---

## Patch 4: `AiPulse.tsx` 在 Provider mount 时调一次

打开 `src/pages/AiPulse/AiPulse.tsx`,找到 `AiPulseProvider` 里的 `useEffect`(或合适位置),加:

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const res = await invoke<{ items: NewsItem[]; count: number }>('pulse_fetch', { lang: feedSource });
      if (!cancelled && res?.items?.length) {
        // 合并到 state,去重,按 published_at desc
        const seen = new Set<string>();
        const merged: NewsItem[] = [];
        for (const it of res.items) {
          if (!seen.has(it.url)) { seen.add(it.url); merged.push(it); }
        }
        setItems(merged);
        setLastFetched(Date.now());
      }
    } catch (e) {
      console.warn('[pulse] pulse_fetch failed, will fall through to WebView fetch', e);
    }
  })();
  return () => { cancelled = true; };
}, [feedSource]);
```

具体 state 名字(`items` / `setItems` / `lastFetched` / `setLastFetched`)需要照着文件里现有代码定,这是参考骨架。

---

## Patch 5: 重新打包 + 部署

```bash
cd /Users/ayden/echobird_core-local && cargo build --release
cd /Users/ayden/Documents/EchoBird/src-tauri && cargo build --release
cd /Users/ayden/Documents/EchoBird && pnpm exec tauri build --bundles app
sudo rm -rf /Applications/EchoBird.app
sudo cp -R /Users/ayden/Documents/EchoBird/src-tauri/target/release/bundle/macos/EchoBird.app /Applications/
codesign --force --deep --sign - /Applications/EchoBird.app
open /Applications/EchoBird.app
```

打开后,点 **AI 资讯** → **刷新**,等 10 秒,应能看到 ~5000 条。
