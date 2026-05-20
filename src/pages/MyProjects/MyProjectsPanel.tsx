// MyProjects right panel + bottom bar — parallel to AppManagerPanel /
// AppManagerBottom but operates on user-authored project state.
//
// What's shared: the right panel's model list is the SAME ModelListSection
// AppManager renders (reused as-is via a synthetic LocalTool). The bottom
// row's launch button + checkboxes are visually identical (intentional —
// the user explicitly asked for "same flow as App Manager").
//
// What's different: launch goes through Tauri's shell:open (system default
// handler) instead of the bundled launch_game WebView; model apply writes
// directly to the user's models.json-declared configFile path. Every
// failure is silent — no error toast, no log to UI — because user projects
// are user code; broken models.json / unreachable configFile / spawn
// errors are the user's problem to debug. We just try.
import React, { useState } from 'react';
import { Server as ServerIcon, Box as BoxIcon } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useMyProjectsStore } from '../../stores/myProjectsStore';
import { useAppManager } from '../AppManager/context';
import * as api from '../../api/tauri';
import type { LocalTool } from '../../api/types';
import { ModelListSection } from '../AppManager/AppManagerComponents';

/// Build a synthetic LocalTool from a user project so the existing
/// ModelListSection can render its model list without any
/// user-project-specific code path. Declared single-protocol (`openai`)
/// solely to suppress ModelListSection's OpenAI⇄Anthropic toggle —
/// `apply_user_project_model` writes all 4 fields (modelId / baseUrl /
/// anthropicUrl / apiKey) flat regardless, so the toggle would be a
/// no-op cosmetic widget here. Cards still fall back to anthropicUrl
/// when baseUrl is empty, so Anthropic-only models display correctly.
const synthesiseToolFromProject = (id: string, name: string): LocalTool => ({
  id,
  name,
  category: 'Utility',
  installed: true,
  apiProtocol: ['openai'],
  noModelConfig: false,
});

export const MyProjectsPanel: React.FC = () => {
  const { t } = useI18n();
  const selectedUserProjectId = useMyProjectsStore((s) => s.selectedUserProjectId);
  const projects = useMyProjectsStore((s) => s.projects);
  const builtinDirs = useMyProjectsStore((s) => s.builtinDirs);
  const hiddenBuiltins = useMyProjectsStore((s) => s.hiddenBuiltins);
  const userProjectModelChoice = useMyProjectsStore((s) => s.userProjectModelChoice);
  const setUserProjectModelChoice = useMyProjectsStore((s) => s.setUserProjectModelChoice);
  const { userModels } = useAppManager();

  // Per-session protocol toggle state — same shape AppManager uses. Doesn't
  // need to persist; the next session restart of EchoBird resets to default.
  const [modelProtocolSelection, setModelProtocolSelection] = useState<
    Record<string, 'openai' | 'anthropic'>
  >({});

  // Resolve the project record. Built-ins are computed (id "builtin-<id>"),
  // user projects come from the store list. If id doesn't match either we
  // treat it as "nothing selected" — the panel shows the placeholder.
  const project = (() => {
    if (!selectedUserProjectId) return null;
    if (selectedUserProjectId.startsWith('builtin-')) {
      const toolId = selectedUserProjectId.replace('builtin-', '');
      if (hiddenBuiltins.includes(toolId as never)) return null;
      const dir = builtinDirs[toolId as never];
      if (!dir) return null;
      return { id: selectedUserProjectId, name: toolId };
    }
    return projects.find((p) => p.id === selectedUserProjectId) || null;
  })();

  const handleSelectModel = (_toolId: string, modelInternalId: string) => {
    if (!project) return;
    setUserProjectModelChoice(project.id, modelInternalId);
  };

  const syntheticTool = project ? synthesiseToolFromProject(project.id, project.name) : null;
  const toolModelConfig: Record<string, string | null> = userProjectModelChoice;

  return (
    <>
      {/* Header (no relay-toggle row — user projects don't have an upstream
          relay concept; that's a Codex / Claude Desktop affordance only). */}
      <div className="p-2 flex items-center justify-between bg-transparent">
        <div className="flex gap-1">
          <span className="px-3 py-1.5 text-xs font-bold text-cyber-text">
            {t('agent.modelsTab')}
          </span>
        </div>
        {syntheticTool && <span className="text-[10px] text-cyber-text">{syntheticTool.name}</span>}
      </div>

      <div className="flex-1 p-2 overflow-y-auto">
        {syntheticTool ? (
          <div className="space-y-2 h-full">
            <ModelListSection
              selectedToolData={syntheticTool}
              userModels={userModels}
              toolModelConfig={toolModelConfig}
              selectedTool={syntheticTool.id}
              handleSelectModel={handleSelectModel}
              modelProtocolSelection={modelProtocolSelection}
              setModelProtocolSelection={setModelProtocolSelection}
              t={t}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-cyber-text-secondary">
            <BoxIcon size={28} className="opacity-25" />
            <p className="text-[12px] font-mono leading-relaxed">{t('agent.selectTool')}</p>
          </div>
        )}
      </div>
    </>
  );
};

export const MyProjectsBottom: React.FC = () => {
  const { t } = useI18n();
  const selectedUserProjectId = useMyProjectsStore((s) => s.selectedUserProjectId);
  const projects = useMyProjectsStore((s) => s.projects);
  const userProjectModelChoice = useMyProjectsStore((s) => s.userProjectModelChoice);
  const launchAfterApply = useMyProjectsStore((s) => s.userProjectLaunchAfterApply);
  const setLaunchAfterApply = useMyProjectsStore((s) => s.setUserProjectLaunchAfterApply);
  const agreedConfigPolicy = useMyProjectsStore((s) => s.userProjectAgreedConfigPolicy);
  const setAgreedConfigPolicy = useMyProjectsStore((s) => s.setUserProjectAgreedConfigPolicy);
  const setLastAppliedModel = useMyProjectsStore((s) => s.setLastAppliedModel);
  const { userModels } = useAppManager();

  const [isLaunching, setIsLaunching] = useState(false);

  // Resolve current project's launcher + models.json paths.
  const project = (() => {
    if (!selectedUserProjectId) return null;
    if (selectedUserProjectId.startsWith('builtin-')) {
      // Built-ins should be handled by AppManager's flow — this bottom bar
      // only fires for user-added projects. Just defensive null here.
      return null;
    }
    return projects.find((p) => p.id === selectedUserProjectId) || null;
  })();

  const chosenModelId = project ? userProjectModelChoice[project.id] : null;
  const hasModelSelected = !!chosenModelId;
  const willApply = agreedConfigPolicy && hasModelSelected;
  const willLaunch = launchAfterApply;
  // Page semantic: 我的AI项目 exists for model management. A user only
  // bothers registering a project here (name + icon + launcher +
  // models.json path — 4 fields of effort) BECAUSE they want EchoBird
  // to swap models for it. Pure-launcher shortcuts have OS-level
  // alternatives (double-click, taskbar pin, etc.) — we should NOT
  // degrade this page into a generic launcher. So gate every action on
  // having a model picked. AppManager differs (it surfaces auto-detected
  // tools, some of which legitimately have no model concept), so that
  // page's loose gate stays as-is.
  const buttonDisabled =
    !project || !hasModelSelected || (!willApply && !willLaunch) || isLaunching;

  const handleLaunch = async () => {
    if (!project || isLaunching) return;
    setIsLaunching(true);

    // Optimistic card update — mirror AppManager's pattern but fire on
    // click (before await), not on success. Apply silently fails by spec,
    // so we can't condition the card on outcome; the user's click IS the
    // intent, the card should reflect it. Built-in cards still flow
    // through AppManager and pick up their own optimistic update there.
    if (chosenModelId) {
      setLastAppliedModel(project.id, chosenModelId);
    }

    try {
      // 1) Optionally write the 4 model fields flat into the project's
      //    models.json. Silent on every failure — spec; we hand the user
      //    a knife and they decide where to point it.
      if (willApply) {
        const model = userModels.find((m) => m.internalId === chosenModelId!);
        if (model && project.modelsJsonPath) {
          try {
            await api.applyUserProjectModel(project.modelsJsonPath, {
              model: model.modelId,
              baseUrl: model.baseUrl,
              apiKey: model.apiKey,
              anthropicUrl: model.anthropicUrl,
            });
          } catch (e) {
            console.error('[MyProjects] apply model failed:', e);
            /* silent */
          }
        }
      }
      // 2) Optionally launch via system default handler.
      if (willLaunch && project.launcherPath) {
        try {
          await api.launchUserProject(project.launcherPath);
        } catch (e) {
          console.error('[MyProjects] launch failed:', e);
          /* silent */
        }
      }
    } finally {
      // Brief debounce — same UX guard AppManager has, prevents a
      // double-tap from double-applying / double-spawning.
      setTimeout(() => setIsLaunching(false), 800);
    }
  };

  // Reuse the AppManager bottom's hint (page-aware copy already lands the
  // Vibe-Coding instructional text on this page; see PageAwareHint).
  return (
    <div className="flex-shrink-0 flex flex-col mt-2">
      <div className="mx-2 border-t border-cyber-border"></div>
      <div className="flex items-center justify-end gap-8 px-6 py-5">
        <div className="flex-1 text-[15px] font-medium text-cyber-accent">
          {t('hint.myProjects')}
        </div>
        <button
          onClick={handleLaunch}
          disabled={buttonDisabled}
          className={`w-64 h-14 text-lg font-bold font-mono tracking-widest transition-colors flex-shrink-0 rounded-lg cjk-btn border shadow-lg ${
            buttonDisabled
              ? 'bg-cyber-border text-cyber-text-secondary border-transparent shadow-none cursor-not-allowed'
              : 'bg-cyber-accent text-white border-cyber-accent hover:bg-cyber-accent-secondary hover:border-cyber-accent-secondary shadow-cyber-accent/30'
          }`}
        >
          {willLaunch ? t('btn.launchApp') : t('btn.modifyOnly')}
        </button>
        <div className="flex flex-col gap-2">
          <Checkbox
            checked={launchAfterApply}
            onChange={() => setLaunchAfterApply(!launchAfterApply)}
            label={t('agent.applyAndLaunch')}
          />
          <Checkbox
            checked={agreedConfigPolicy}
            onChange={() => setAgreedConfigPolicy(!agreedConfigPolicy)}
            label={t('agent.appliedVia')}
          />
        </div>
      </div>
    </div>
  );
};

// Compact reproduction of the bottom-bar checkbox style used by
// AppManagerBottom. Local copy keeps MyProjects self-contained without
// having to refactor that component just to extract a 25-line widget.
const Checkbox: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 select-none cursor-pointer" onClick={onChange}>
    <div
      className={`w-3.5 h-3.5 border flex items-center justify-center transition-all flex-shrink-0 ${
        checked
          ? 'border-cyber-border bg-cyber-text/20'
          : 'border-cyber-border hover:border-cyber-text-muted'
      }`}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className="text-cyber-text">
          <path
            d="M2 5L4 7L8 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
    <span
      className={`text-xs font-mono transition-colors ${
        checked ? 'text-cyber-text' : 'text-cyber-text-secondary'
      }`}
    >
      {label}
    </span>
  </label>
);

// Suppress unused-import lint via reference (ServerIcon kept for parity in
// case we re-add the relay-style hint glyph later).
void ServerIcon;
