import { useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import * as api from '../../api/tauri';
import type { TKey } from '../../i18n';
import { useMotherAgent } from './context';
import { FRONTEND_HINTS } from './frontendHints';
import type { MotherHint } from './types';

// Quick-command chips for the Mother Agent right panel. Each chip drops a
// self-contained prompt into the chat input (the user edits, then sends).
// Hints come from the bundled registry (getMotherHints) with EchoBird's own
// FRONTEND_HINTS prepended; a hint with no localized label renders nothing,
// which is how locale-specific chips (e.g. the Claude Chinese patch) hide
// themselves outside zh-Hans / zh-Hant.
export function QuickCommandChips() {
  const { t } = useI18n();
  const { setChatInput, selectedServerId } = useMotherAgent();
  const [hints, setHints] = useState<MotherHint[]>([]);

  useEffect(() => {
    api
      .getMotherHints()
      .then((s) => {
        try {
          const data = JSON.parse(s);
          setHints([...FRONTEND_HINTS, ...(data.hints || [])]);
        } catch {
          setHints([...FRONTEND_HINTS]);
        }
      })
      .catch(() => setHints([...FRONTEND_HINTS]));
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {hints.map((hint, i) => {
        // showSpecs swaps to a local-machine wording when 127.0.0.1 is
        // selected — otherwise the agent often refuses, treating "server"
        // prompts as a remote/privileged operation.
        const isLocalShowSpecs = hint.action === 'showSpecs' && selectedServerId === 'local';
        const i18nKey = (isLocalShowSpecs
          ? 'mother.hintShowSpecsLocal'
          : `mother.hint${hint.action[0].toUpperCase()}${hint.action.slice(1)}`) as unknown as TKey;
        const label = t(i18nKey).replace('{agent}', hint.agent || '');
        // Skip hints with no translation (label falls back to the raw key).
        if (label === i18nKey) return null;
        return (
          <button
            key={i}
            // The chat textarea lives in MotherAgentMain with a local ref we
            // can't reach from here; setting the shared input value is enough —
            // the text appears and the user takes it from there.
            onClick={() => setChatInput(label)}
            className="px-3 py-1.5 text-xs rounded-lg bg-cyber-surface border border-cyber-border text-cyber-text-secondary hover:bg-cyber-elevated hover:text-cyber-text hover:border-cyber-text-muted/50 transition-colors cursor-pointer"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
