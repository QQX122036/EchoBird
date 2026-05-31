import type { MotherHint } from './types';

// Quick-phrase hints supplied by the frontend, in addition to the bundled
// `hints.json` registry fetched via `getMotherHints()`. Kept in this small
// module — not inline in MotherAgentMain — so new frontend hints stay additive
// here and the component doesn't accumulate. Each hint's localized chip text
// (which is also the prompt sent to the agent) lives in i18n under
// `mother.hint<Action>`, so it follows EchoBird's own UI language.
export const FRONTEND_HINTS: MotherHint[] = [
  // Localize Claude Desktop to Chinese — text: `mother.hintSetClaudeLocale`.
  // Shown only for zh-Hans / zh-Hant (hidden elsewhere via an empty en label,
  // since the upstream patch only ships Simplified/Traditional Chinese).
  { action: 'setClaudeLocale' },
  // Set Codex Desktop UI language — text: `mother.hintSetCodexLocale`.
  { action: 'setCodexLocale' },
];
