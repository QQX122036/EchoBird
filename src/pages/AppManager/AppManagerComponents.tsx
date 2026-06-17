import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Server as ServerIcon, Box as BoxIcon, Copy, Check } from 'lucide-react';
import { ToolCard, getModelIcon } from '../../components';
import { useI18n } from '../../hooks/useI18n';
import type { ModelConfig, LocalTool } from '../../api/types';
import { useAppManager, toolCategories } from './context';
import { useNavigationStore } from '../../stores/navigationStore';
import {
  getOfficialEndpoint,
  officialModelSentinel,
  type OfficialEndpoint,
} from '../../data/officialEndpoints';

// ===== Main Content (tool cards grid) =====

export const AppManagerMain: React.FC = () => {
  const { t } = useI18n();
  const {
    detectedTools,
    isScanning,
    scanTools,
    activeToolCategory,
    setActiveToolCategory,
    selectedTool,
    setSelectedTool,
    onGoToMother,
    aiInstallableIds,
  } = useAppManager();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar - Fixed */}
      {/* Category tabs + Action buttons */}
      <div className="flex items-center justify-between flex-shrink-0 pb-4 mb-4">
        <div className="flex gap-1">
          {toolCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveToolCategory(cat)}
              className={`px-4 py-2.5 text-[14px] transition-colors outline-none ${
                activeToolCategory === cat
                  ? 'text-cyber-text font-bold border-b-2 border-cyber-border'
                  : 'text-cyber-text-secondary hover:text-cyber-text'
              }`}
            >
              {(() => {
                const catMap: Record<string, string> = {
                  ALL: 'toolCat.all',
                  IDE: 'toolCat.ide',
                  'CLI Code': 'toolCat.cli',
                  AutoTrading: 'toolCat.autoTrading',
                  Game: 'toolCat.game',
                  Desktop: 'toolCat.desktop',
                  Utility: 'toolCat.utility',
                };
                return t((catMap[cat] || cat) as any);
              })()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={scanTools}
            disabled={isScanning}
            className="text-xs border border-cyber-border text-cyber-text px-3 py-1 hover:bg-cyber-text/10 transition-colors rounded disabled:opacity-50 outline-none"
          >
            {isScanning ? t('status.scanning') : t('btn.refresh')}
          </button>
        </div>
      </div>
      {/* Tool cards - Scrolling */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isScanning && detectedTools.length === 0 ? (
            // Skeleton cards while scanning
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="relative p-5 border border-cyber-border rounded-card bg-cyber-surface flex flex-col animate-pulse"
                >
                  <div className="absolute top-4 right-4 w-10 h-10 rounded-lg bg-cyber-border/30" />
                  <div className="h-5 w-2/3 bg-cyber-border/40 rounded mb-4" />
                  <div className="space-y-2">
                    <div className="h-3 w-4/5 bg-cyber-border/30 rounded" />
                    <div className="h-3 w-3/5 bg-cyber-border/30 rounded" />
                    <div className="h-3 w-4/5 bg-cyber-border/30 rounded" />
                    <div className="h-3 w-2/5 bg-cyber-border/30 rounded" />
                  </div>
                </div>
              ))}
            </>
          ) : (
            detectedTools
              .filter(
                (tool) => activeToolCategory === 'ALL' || tool.category === activeToolCategory
              )
              .sort((a, b) => {
                // 1. Installed first
                if (a.installed !== b.installed) return a.installed ? -1 : 1;
                // 2. Within same install status: AI auto-installable (remote index) first
                const aHasRemote = aiInstallableIds.includes(a.id);
                const bHasRemote = aiInstallableIds.includes(b.id);
                if (aHasRemote !== bHasRemote) return aHasRemote ? -1 : 1;
                // 3. Then by category
                const categoryOrder: Record<string, number> = {
                  Desktop: 0,
                  IDE: 2,
                  'CLI Code': 3,
                  AutoTrading: 4,
                  Game: 5,
                  Utility: 6,
                };
                const catDiff =
                  (categoryOrder[a.category || ''] ?? 99) - (categoryOrder[b.category || ''] ?? 99);
                if (catDiff !== 0) return catDiff;
                // 4. Within Desktop: fixed display order (Coffee CLI last)
                if (a.category === 'Desktop' && b.category === 'Desktop') {
                  const desktopOrder: Record<string, number> = {
                    claudedesktop: 0,
                    codexdesktop: 1,
                    geminidesktop: 2,
                    coffeecli: 99,
                  };
                  return (desktopOrder[a.id] ?? 50) - (desktopOrder[b.id] ?? 50);
                }
                return 0;
              })
              .map((tool) => (
                <ToolCard
                  key={tool.id}
                  {...tool}
                  selected={selectedTool === tool.id}
                  onClick={() => setSelectedTool(tool.id)}
                  hasRemoteInstall={aiInstallableIds.includes(tool.id)}
                  onMotherAgentInstall={() => onGoToMother(tool.id, tool.displayName || tool.name)}
                />
              ))
          )}
        </div>
      </div>
    </div>
  );
};

// ===== Model List Section =====

interface ModelListSectionProps {
  selectedToolData: LocalTool;
  userModels: ModelConfig[];
  toolModelConfig: Record<string, string | null>;
  selectedTool: string | null;
  handleSelectModel: (toolId: string, modelId: string) => void;
  modelProtocolSelection: Record<string, 'openai' | 'anthropic'>;
  setModelProtocolSelection: React.Dispatch<
    React.SetStateAction<Record<string, 'openai' | 'anthropic'>>
  >;
  t: (key: any) => string;
}

export const ModelListSection: React.FC<ModelListSectionProps> = ({
  selectedToolData,
  userModels,
  toolModelConfig,
  selectedTool,
  handleSelectModel,
  modelProtocolSelection,
  setModelProtocolSelection,
  t,
}) => {
  const toolProtocols = selectedToolData.apiProtocol || ['openai', 'anthropic'];

  const { localModels, cloudModels } = useMemo(() => {
    const compatible = userModels.filter((model) => {
      const hasOpenAI = toolProtocols.includes('openai') && !!model.baseUrl;
      const hasAnthropic = toolProtocols.includes('anthropic') && !!model.anthropicUrl;
      return hasOpenAI || hasAnthropic;
    });
    return {
      localModels: compatible.filter((m) => m.internalId === 'local-server'),
      cloudModels: compatible.filter((m) => m.internalId !== 'local-server'),
    };
  }, [userModels, toolProtocols]);

  const renderModelCard = (model: (typeof userModels)[0]) => {
    const isSelected = selectedTool ? toolModelConfig[selectedTool] === model.internalId : false;
    const isLocalServer = model.internalId === 'local-server';

    const modelHasBoth = !!(model.baseUrl && model.anthropicUrl);
    const toolSupportsBoth =
      toolProtocols.includes('openai') && toolProtocols.includes('anthropic');
    const showSwitcher = modelHasBoth && toolSupportsBoth;

    let currentProtocol = 'openai';
    if (toolSupportsBoth) {
      currentProtocol =
        modelProtocolSelection[model.internalId] ||
        (toolProtocols[0] === 'anthropic' ? 'anthropic' : 'openai');
    } else {
      currentProtocol = toolProtocols[0];
    }

    const displayUrl =
      currentProtocol === 'anthropic'
        ? model.anthropicUrl || model.baseUrl
        : model.baseUrl || model.anthropicUrl;
    const apiPath = (() => {
      try {
        const url = new URL(displayUrl || '');
        const path = url.pathname === '/' ? '' : url.pathname;
        return url.hostname + path;
      } catch {
        return displayUrl || 'No URL Configured';
      }
    })();

    const iconSrc = getModelIcon(model.name, model.modelId || '');

    return (
      <div
        key={model.internalId}
        className={`p-3 rounded cursor-pointer transition-colors mb-2 flex items-center gap-3 border bg-cyber-surface ${
          isSelected ? 'border-cyber-accent' : 'border-transparent hover:bg-cyber-elevated'
        }`}
        onClick={() => selectedTool && handleSelectModel(selectedTool, model.internalId)}
      >
        {/* Left: Radio + Icon */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div
            className={`w-4 h-4 rounded-full border-2 relative ${
              isSelected ? 'border-cyber-accent' : 'border-cyber-border'
            }`}
          >
            {isSelected && (
              <div className="w-2 h-2 rounded-full bg-cyber-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            )}
          </div>
          {iconSrc ? (
            <img
              src={iconSrc}
              alt=""
              className="w-6 h-6"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : isLocalServer ? (
            <div className="w-6 h-6 flex items-center justify-center text-cyber-accent">
              <ServerIcon size={22} />
            </div>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center text-cyber-text">
              <BoxIcon size={22} />
            </div>
          )}
        </div>

        {/* Right: Two-row layout */}
        <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[2.5rem] py-0.5">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold truncate leading-none flex-1 min-w-0">
              {model.name || 'Untitled Model'}
            </div>
            {showSwitcher && (
              <span
                className="text-[10px] font-mono cursor-pointer select-none flex-shrink-0 transition-colors text-cyber-text-muted/60 hover:text-cyber-text"
                onClick={(e) => {
                  e.stopPropagation();
                  const newProtocol = currentProtocol === 'openai' ? 'anthropic' : 'openai';
                  setModelProtocolSelection((prev) => ({
                    ...prev,
                    [model.internalId]: newProtocol,
                  }));
                }}
              >
                {currentProtocol === 'openai' ? 'OpenAI' : 'Anthropic'}{' '}
                <span className="text-[8px]">⇄</span>
              </span>
            )}
          </div>
          <div className="text-[10px] text-cyber-text-secondary truncate leading-tight mt-1 opacity-70">
            {apiPath}
          </div>
        </div>
      </div>
    );
  };

  // Official-endpoint card — first item, like cc-switch's "Claude Official"
  const official = selectedTool ? getOfficialEndpoint(selectedTool) : undefined;
  const officialSentinel = selectedTool ? officialModelSentinel(selectedTool) : '';
  const isOfficialPending = !!(selectedTool && toolModelConfig[selectedTool] === officialSentinel);

  const renderOfficialCard = (ep: OfficialEndpoint) => {
    const apiPath = (() => {
      try {
        const url = new URL(
          ep.protocol === 'anthropic' ? ep.anthropicUrl || ep.baseUrl : ep.baseUrl
        );
        const path = url.pathname === '/' ? '' : url.pathname;
        return url.hostname + path;
      } catch {
        return ep.baseUrl;
      }
    })();

    // Use provider icon (Claude/OpenAI etc.) based on official endpoint name
    const iconSrc = getModelIcon(ep.name, ep.modelId);

    return (
      <div
        className={`p-3 rounded cursor-pointer transition-colors mb-2 flex items-center gap-3 border bg-cyber-surface ${
          isOfficialPending ? 'border-cyber-accent' : 'border-transparent hover:bg-cyber-elevated'
        }`}
        onClick={() => selectedTool && handleSelectModel(selectedTool, officialSentinel)}
      >
        <div className="flex items-center gap-3 flex-shrink-0">
          <div
            className={`w-4 h-4 rounded-full border-2 relative ${
              isOfficialPending ? 'border-cyber-accent' : 'border-cyber-border'
            }`}
          >
            {isOfficialPending && (
              <div className="w-2 h-2 rounded-full bg-cyber-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            )}
          </div>
          {iconSrc ? (
            <img
              src={iconSrc}
              alt=""
              className="w-6 h-6"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-6 h-6 rounded bg-cyber-text/15 flex items-center justify-center text-cyber-text">
              <BoxIcon size={14} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[2.5rem] py-0.5">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold truncate leading-none flex-1 min-w-0">{ep.name}</div>
            <span className="text-xs font-mono text-cyber-text-secondary/60 flex-shrink-0 pointer-events-none select-none">
              {t('agent.restore')}
            </span>
          </div>
          <div className="text-[10px] text-cyber-text-secondary truncate leading-tight mt-1 opacity-70">
            {apiPath}
          </div>
        </div>
      </div>
    );
  };

  // Fully empty: no local models, no cloud models, no official endpoint.
  // Show only the centered placeholder — the "select model for X" heading
  // would be misleading when there's nothing to select anyway.
  const isEmpty = cloudModels.length === 0 && !official && localModels.length === 0;
  if (isEmpty) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <BoxIcon size={28} className="text-cyber-text opacity-25" />
        <p className="text-base text-cyber-text-secondary font-mono leading-relaxed">
          {t('agent.noModelsTitle')}
          <br />
          {t('agent.noModelsHintPre')}{' '}
          <span className="text-cyber-text font-bold">{t('nav.modelNexus')}</span>{' '}
          {t('agent.noModelsHintPost')}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Local models area */}
      {localModels.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-cyber-accent/80 mb-2">{t('agent.myLocalModel')}:</div>
          {localModels.map(renderModelCard)}
        </div>
      )}
      {/* Cloud models area — official endpoint goes first if registered */}
      <div className="space-y-2">
        {official && renderOfficialCard(official)}
        {cloudModels.map(renderModelCard)}
      </div>
    </>
  );
};

// A single routing toggle: label + switch + themed help glyph with an
// interactive tooltip. Used for the Codex / Claude-Desktop "API Router"
// toggle, the Codex-only "Responses" toggle, and the Claude 1M toggle. The
// tooltip stays open while the pointer is over the glyph OR the tooltip
// itself, so an optional one-click-copy command chip inside it is reachable.
interface RoutingToggleProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  // Optional command rendered inside the tooltip as a copyable chip (e.g. the
  // Claude Desktop `/model …[1m]` switch the user must paste in chat).
  copyCommand?: string;
}

function RoutingToggle({ label, hint, checked, onChange, copyCommand }: RoutingToggleProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending close timer on unmount so it can't fire after teardown.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const showTip = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // Small grace delay so moving the pointer from "?" across the gap into the
  // tooltip (to reach the copy button) doesn't dismiss it.
  const scheduleHide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  const handleCopy = async () => {
    if (!copyCommand) return;
    try {
      await navigator.clipboard.writeText(copyCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (permissions / webview) — fail silently.
    }
  };

  return (
    <div className="flex items-center">
      <span className="text-xs text-cyber-text-secondary mr-2 whitespace-nowrap">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyber-accent mr-2 ${
          checked ? 'bg-cyber-accent' : 'bg-cyber-border'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-all duration-200 ${
            checked ? 'translate-x-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.35)]' : 'translate-x-1'
          }`}
        />
      </button>
      {/* Help glyph — themed, interactive tooltip (not the native browser one).
          onMouseEnter/Leave on this wrapper covers both the glyph and the
          tooltip (a descendant), so the tooltip stays open while hovered. */}
      <span
        className="relative inline-flex items-center"
        onMouseEnter={showTip}
        onMouseLeave={scheduleHide}
      >
        <span
          aria-label={hint}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyber-elevated font-sans text-xs font-medium leading-none text-cyber-text-secondary cursor-help select-none hover:bg-cyber-accent/15 hover:text-cyber-accent transition-colors"
        >
          ?
        </span>
        <span
          role="tooltip"
          className={`absolute right-0 top-full z-[100] mt-1.5 w-72 rounded border border-cyber-accent/40 bg-cyber-elevated px-3 py-2 text-[11px] leading-relaxed text-cyber-text shadow-cyber-card backdrop-blur-sm transition-opacity ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {/* Caret — rotated square poking up out of the tooltip's top edge. */}
          <span
            aria-hidden="true"
            className="absolute -top-1 right-2 h-2 w-2 rotate-45 border-l border-t border-cyber-accent/40 bg-cyber-elevated"
          />
          {hint}
          {copyCommand && (
            <span className="mt-2 flex items-center gap-1.5 rounded border border-cyber-border bg-cyber-bg/60 px-1.5 py-1">
              <code className="flex-1 break-all font-mono text-[10.5px] text-cyber-accent">
                {copyCommand}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy command'}
                className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded text-cyber-text-secondary hover:bg-cyber-accent/15 hover:text-cyber-accent transition-colors"
              >
                {copied ? <Check size={13} className="text-cyber-accent" /> : <Copy size={13} />}
              </button>
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

// ===== Right Panel (config panel with tabs) =====

export const AppManagerPanel: React.FC = () => {
  const { t } = useI18n();
  const {
    selectedToolData,
    selectedTool,
    userModels,
    toolModelConfig,
    handleSelectModel,
    modelProtocolSelection,
    setModelProtocolSelection,
    codexRelayMode,
    setCodexRelayMode,
    codexResponsesPassthrough,
    setCodexResponsesPassthrough,
    claudeDesktopRelayMode,
    setClaudeDesktopRelayMode,
    claude1mMode,
    setClaude1mMode,
  } = useAppManager();

  // Relay-mode ("API Router") toggle: shown for Codex CLI / Codex Desktop
  // (shared ~/.codex/config.toml, single codexRelayMode flag) AND for Claude
  // Desktop (separate claudeDesktopRelayMode flag, different protocol and
  // relay-station compat). The toggle binds to whichever flag matches the
  // currently selected app; other apps render an empty fixed-height slot so
  // the model list below doesn't jitter on switch.
  //
  // The "Responses" passthrough toggle sits next to it but is Codex-only
  // (the Responses protocol is OpenAI-specific; Claude Desktop's analogous
  // passthrough is its default). The two are mutually exclusive — the
  // provider's setters auto-flip so at most one is ever on.
  const isCodexApp = selectedTool === 'codex' || selectedTool === 'codexdesktop';
  const isClaudeDesktopApp = selectedTool === 'claudedesktop';
  const showRelayToggle = isCodexApp || isClaudeDesktopApp;
  const showResponsesToggle = isCodexApp;
  const relayModeValue = isClaudeDesktopApp ? claudeDesktopRelayMode : codexRelayMode;
  const setRelayModeValue = isClaudeDesktopApp ? setClaudeDesktopRelayMode : setCodexRelayMode;
  // 1M-context toggle: Claude Desktop + Claude Code.
  const show1mToggle = isClaudeDesktopApp || selectedTool === 'claudecode';

  return (
    <>
      {/* Header */}
      <div className="p-2 flex items-center justify-between bg-transparent">
        <div className="flex gap-1">
          <span className="px-3 py-1.5 text-xs font-bold text-cyber-text">
            {t('agent.modelsTab')}
          </span>
        </div>
        {selectedToolData && (
          <span className="text-[10px] text-cyber-text">{selectedToolData.name}</span>
        )}
      </div>

      {/* Toggle row: mounted when ANY toggle applies — the API Router /
          Responses toggles (Codex, Claude Desktop) or the 1M toggle (Claude
          Desktop, Claude Code). Each toggle inside is INDIVIDUALLY gated, so
          e.g. Claude Code shows only 1M and never the API Router toggle
          (which would otherwise cross-wire to Codex's relay flag). For apps
          with no toggles nothing renders and the model list below claims the
          space — the user preferred no reserved gap when toggles are absent. */}
      {(showRelayToggle || show1mToggle) && (
        <div className="px-3 h-9 flex items-center gap-2">
          {showResponsesToggle && (
            <RoutingToggle
              label={t('agent.codexResponsesLabel')}
              hint={t('agent.codexResponsesHint')}
              checked={codexResponsesPassthrough}
              onChange={setCodexResponsesPassthrough}
            />
          )}
          {show1mToggle && (
            <RoutingToggle
              label="1M"
              hint={t('agent.claude1mHint')}
              copyCommand={isClaudeDesktopApp ? '/model claude-opus-4-8[1m]' : undefined}
              checked={claude1mMode}
              onChange={setClaude1mMode}
            />
          )}
          {showRelayToggle && (
            <RoutingToggle
              label={t('agent.codexRelayLabel')}
              hint={t('agent.codexRelayHint')}
              checked={relayModeValue}
              onChange={setRelayModeValue}
            />
          )}
        </div>
      )}

      <div className="flex-1 p-2 overflow-y-auto">
        {selectedToolData ? (
          selectedToolData.noModelConfig ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <BoxIcon size={28} className="text-cyber-text opacity-25" />
              <p className="text-base text-cyber-text-secondary font-mono leading-relaxed">
                {t('agent.noModelConfig')}
              </p>
            </div>
          ) : (
            <div className="space-y-2 h-full">
              <ModelListSection
                selectedToolData={selectedToolData}
                userModels={userModels}
                toolModelConfig={toolModelConfig}
                selectedTool={selectedTool}
                handleSelectModel={handleSelectModel}
                modelProtocolSelection={modelProtocolSelection}
                setModelProtocolSelection={setModelProtocolSelection}
                t={t}
              />
            </div>
          )
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-cyber-text-secondary text-center">{t('agent.selectTool')}</p>
          </div>
        )}
      </div>
    </>
  );
};

// ===== Bottom Bar (launch area) =====

export const AppManagerBottom: React.FC = () => {
  const { t } = useI18n();
  const {
    selectedTool,
    selectedToolData,
    toolModelConfig,
    launchAfterApply,
    setLaunchAfterApply,
    isLaunching,
    agreedConfigPolicy,
    setAgreedConfigPolicy,
    handleLaunch,
  } = useAppManager();

  const noModelConfig = !!selectedToolData?.noModelConfig;
  const hasModelSelected = !!(selectedTool && toolModelConfig[selectedTool]);
  // What will a click actually do?
  //  - "Apply" runs only when the user picked a model AND agreed to the config-write policy.
  //  - "Launch" runs whenever launchAfterApply is on, or unconditionally for desktop/no-config apps.
  // Many tools already work out of the box, so launching without picking a model must stay enabled —
  // forcing model selection just to start a CLI was the long-standing bug.
  const willApply = !noModelConfig && agreedConfigPolicy && hasModelSelected;
  const willLaunch = launchAfterApply || noModelConfig;
  const buttonDisabled = !selectedTool || (!willApply && !willLaunch) || isLaunching;

  return (
    <div className="flex-shrink-0 flex flex-col mt-2">
      <div className="mx-2 border-t border-cyber-border"></div>
      <div className="flex items-center justify-end gap-8 px-6 py-5">
        {/* Page-aware hint copy: AppManager warns against closing EchoBird mid-
            session (Codex / Claude config swap stays applied while we run);
            "我的AI项目" instead tells the user to crib from Reversi/Translator
            models.json when Vibe-Coding their own AI project. */}
        <PageAwareHint />
        {/* Launch button */}
        {/* Launch button */}
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
        {/* Checkboxes — for tools that don't support model config (desktop apps,
                    IDE plugins) the boxes stay visible but go gray + un-clickable, so the
                    layout doesn't shift and the user understands why the toggles are inert. */}
        <div
          className={`flex flex-col gap-2 ${noModelConfig ? 'opacity-40 pointer-events-none' : ''}`}
        >
          {/* Apply & Launch checkbox */}
          <label
            className={`flex items-center gap-2 select-none ${noModelConfig ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={() => {
              if (!noModelConfig) setLaunchAfterApply(!launchAfterApply);
            }}
          >
            <div
              className={`w-3.5 h-3.5 border flex items-center justify-center transition-all flex-shrink-0 ${
                launchAfterApply
                  ? 'border-cyber-border bg-cyber-text/20'
                  : 'border-cyber-border hover:border-cyber-text-muted'
              }`}
            >
              {launchAfterApply && (
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="text-cyber-text"
                >
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
              className={`text-xs font-mono transition-colors ${launchAfterApply ? 'text-cyber-text' : 'text-cyber-text-secondary'}`}
            >
              {t('agent.applyAndLaunch')}
            </span>
          </label>
          {/* Config policy agreement */}
          <label
            className={`flex items-center gap-2 select-none ${noModelConfig ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={() => {
              if (!noModelConfig) setAgreedConfigPolicy(!agreedConfigPolicy);
            }}
          >
            <div
              className={`w-3.5 h-3.5 border flex items-center justify-center transition-all flex-shrink-0 ${
                agreedConfigPolicy
                  ? 'border-cyber-border bg-cyber-text/20'
                  : 'border-cyber-border hover:border-cyber-text-muted'
              }`}
            >
              {agreedConfigPolicy && (
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="text-cyber-text"
                >
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
              className={`text-xs font-mono transition-colors ${agreedConfigPolicy ? 'text-cyber-text' : 'text-cyber-text-secondary'}`}
            >
              {t('agent.appliedVia')}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

// Orange instructional copy shown at the bottom-left of the launch row.
// Branches on activePage so the same AppManagerBottom can serve both
// "应用管理" and "我的AI项目" without duplicating the rest of the row.
const PageAwareHint: React.FC = () => {
  const { t } = useI18n();
  const activePage = useNavigationStore((s) => s.activePage);
  const key = activePage === 'myProjects' ? 'hint.myProjects' : 'hint.devInvite';
  return <div className="flex-1 text-[15px] font-medium text-cyber-accent">{t(key)}</div>;
};

// ===== Apply Error Modal =====

export const AppManagerErrorModal: React.FC = () => {
  const { t } = useI18n();
  const { applyError, setApplyError } = useAppManager();

  if (!applyError) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setApplyError(null)}
      />
      <div className="relative w-[360px] max-w-[90vw] border border-red-500/40 bg-cyber-surface shadow-2xl rounded-xl overflow-hidden">
        <div className="h-[2px] w-full bg-red-500/60" />
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-red-400 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-sm font-mono font-bold tracking-wider text-red-400">
            API Key Warning
          </span>
        </div>
        <div className="px-5 pb-5">
          <p className="text-xs text-cyber-text-secondary leading-relaxed font-mono">
            {applyError}
          </p>
        </div>
        <div className="flex border-t border-cyber-border">
          <button
            onClick={() => setApplyError(null)}
            className="flex-1 px-4 py-2.5 text-xs font-mono font-bold tracking-wider text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
