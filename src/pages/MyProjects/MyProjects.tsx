// MyProjects page — user-authored AI projects launchable via EchoBird.
//
// Mirrors the AppManager visual language (card grid + selected-tool detail)
// but with a localStorage-backed user project list instead of bundled tools.
// Cards show launcher + models.json path; the model id displayed in "模型: …"
// is filled in once we add the Rust read_active_model command for user
// projects (deferred to a follow-up turn — placeholder shows "—" for now).
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Folder, X } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../hooks/useI18n';
import {
  useMyProjectsStore,
  type MyProject,
  type MyProjectInput,
} from '../../stores/myProjectsStore';
import { useToolsStore } from '../../stores/toolsStore';
import { useAppManager } from '../AppManager/context';
import { ToolCard } from '../../components';
import { useConfirm } from '../../components/ConfirmDialog';

// Placeholder examples shown inside the file-picker fields when nothing's
// been chosen yet. Kept in English path style across all locales — the
// example values themselves are filesystem paths, not translatable copy.
const PLACEHOLDER_ICON = 'e.g: ~/YourProject/xxx.ico/svg/png';
const PLACEHOLDER_LAUNCHER = 'e.g: ~/YourProject/xxx.exe';
const PLACEHOLDER_MODELS = 'e.g: ~/YourProject/models.json';

// Convert any stored icon path into something the WebView can render.
// Three flavours of `iconPath` reach this component:
//   - Seeded built-ins: "./icons/tools/<id>.svg" — Vite-served, use as-is
//   - User-picked via plugin-dialog: absolute filesystem path — needs file://
//   - Empty string: caller falls back to a placeholder glyph
const iconSrcFor = (p: string): string => {
  if (!p) return '';
  if (p.startsWith('./') || p.startsWith('/') || /^https?:/.test(p) || p.startsWith('data:')) {
    return p;
  }
  return `file://${p.replace(/\\/g, '/')}`;
};

// ── Card grid + dialog wiring ──

export const MyProjectsMain: React.FC = () => {
  const { t, locale } = useI18n();
  const projects = useMyProjectsStore((s) => s.projects);
  const initStore = useMyProjectsStore((s) => s.init);
  const seedBuiltins = useMyProjectsStore((s) => s.seedBuiltins);
  const detectedTools = useToolsStore((s) => s.detectedTools);
  // Reuse AppManager's selection state. Seeded entries set their
  // linkedToolId so the right panel + launch button drive the existing
  // tool flow (just like App Manager). Pure user projects don't have a
  // linkedToolId yet — selecting them currently leaves the panel empty
  // until Phase D wires their dedicated launch path.
  const { selectedTool, setSelectedTool } = useAppManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    initStore();
  }, [initStore]);

  // Seed Reversi + AI Translator into the user's project list the first time
  // the page mounts with tool data available. Idempotent — the store tracks
  // a flag so we only inject once per device, after which they're real
  // entries the user can edit or delete.
  useEffect(() => {
    if (detectedTools.length > 0) seedBuiltins(detectedTools, locale);
  }, [detectedTools, locale, seedBuiltins]);

  const openAdd = () => {
    setEditingId(null);
    setDialogOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };
  const closeDialog = () => setDialogOpen(false);

  const handleSelect = (project: MyProject) => {
    if (project.linkedToolId) {
      // Seeded built-in — hand selection off to AppManager so the right panel
      // shows that tool's model list and the launch button runs the existing
      // bundled-tool flow.
      setSelectedTool(project.linkedToolId);
    } else {
      // User project — clear AppManager selection for now; Phase D will
      // synthesise a virtual tool from the project's models.json so the
      // right panel can show its models and the launch button can spawn
      // the user-provided exe.
      setSelectedTool(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectToolCard
              key={p.id}
              project={p}
              selected={!!p.linkedToolId && selectedTool === p.linkedToolId}
              onSelect={() => handleSelect(p)}
              onEdit={openEdit}
            />
          ))}
          {/* "+" empty card — always last */}
          <button
            onClick={openAdd}
            className="relative p-5 border border-dashed border-cyber-border rounded-card bg-cyber-surface/40 flex flex-col items-center justify-center min-h-[160px] text-cyber-text-secondary hover:text-cyber-text hover:border-cyber-text/40 hover:bg-cyber-surface transition-colors outline-none"
          >
            <Plus size={28} className="mb-2" />
            <span className="text-[14px] font-medium">{t('myProjects.empty.title')}</span>
            <span className="text-[12px] mt-1 text-cyber-text-muted">
              {t('myProjects.empty.hint')}
            </span>
          </button>
        </div>
      </div>

      {dialogOpen && <AddProjectDialog editingId={editingId} onClose={closeDialog} />}
    </div>
  );
};

// ── ProjectToolCard ──
// Thin adapter that maps a stored MyProject onto AppManager's ToolCard so
// every card on this page renders with the exact same visual treatment as
// the App Manager grid (title size, info-row colour, padding, hover state,
// selection border). The only page-specific bit is the `actions` slot,
// which fills the "版本: …" row with Edit / Delete buttons.

const ProjectToolCard: React.FC<{
  project: MyProject;
  selected: boolean;
  onSelect: () => void;
  onEdit: (id: string) => void;
}> = ({ project, selected, onSelect, onEdit }) => {
  const { t } = useI18n();
  const detectedTools = useToolsStore((s) => s.detectedTools);
  const deleteProject = useMyProjectsStore((s) => s.deleteProject);
  const confirm = useConfirm();

  // Seeded built-ins (linkedToolId set) read their live activeModel + icon
  // off the running tool scan, so swapping the model from the right panel
  // updates the card in place. User-only projects show a placeholder until
  // Phase D adds models.json read-back.
  const linked = project.linkedToolId
    ? detectedTools.find((tool) => tool.id === project.linkedToolId)
    : undefined;

  return (
    <ToolCard
      // Built-ins fall through to the bundled ./icons/tools/<id>.svg path by
      // their tool id; user projects pass their own iconSrc and keep the
      // project id (for whatever click handling needs it later).
      id={project.linkedToolId || project.id}
      iconSrc={project.linkedToolId ? undefined : iconSrcFor(project.iconPath)}
      name={project.name}
      installed
      detectedPath={project.launcherPath}
      configPath={project.modelsJsonPath}
      activeModel={linked?.activeModel}
      selected={selected}
      onClick={onSelect}
      actions={
        // Bracketed mono text — same visual treatment as ModelCard's
        // [delete] / [edit] in the Model Nexus, so the two pages feel
        // like part of the same product. Position stays in the version-
        // row slot (right-aligned at the bottom of the card).
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await confirm({
                title: t('myProjects.deleteTitle'),
                message: t('myProjects.deleteConfirm'),
                confirmText: t('btn.delete'),
                cancelText: t('btn.cancel'),
                type: 'danger',
              });
              if (ok) deleteProject(project.id);
            }}
            className="text-xs font-mono text-cyber-text-muted/70 hover:text-red-500 transition-colors"
          >
            [{t('btn.delete')}]
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project.id);
            }}
            className="text-xs font-mono text-cyber-text-muted/70 hover:text-cyber-text transition-colors"
          >
            [{t('btn.edit')}]
          </button>
        </div>
      }
    />
  );
};

// ── Add / Edit dialog ──

const AddProjectDialog: React.FC<{
  editingId: string | null;
  onClose: () => void;
}> = ({ editingId, onClose }) => {
  const { t } = useI18n();
  const projects = useMyProjectsStore((s) => s.projects);
  const addProject = useMyProjectsStore((s) => s.addProject);
  const updateProject = useMyProjectsStore((s) => s.updateProject);

  // Initial values: empty (Add) or existing project (Edit).
  const existing = editingId ? projects.find((p) => p.id === editingId) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [iconPath, setIconPath] = useState(existing?.iconPath ?? '');
  const [launcherPath, setLauncherPath] = useState(existing?.launcherPath ?? '');
  const [modelsJsonPath, setModelsJsonPath] = useState(existing?.modelsJsonPath ?? '');

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const pickFile = useCallback(
    async (filters: { name: string; extensions: string[] }[], setter: (v: string) => void) => {
      try {
        const result = await openDialog({ multiple: false, filters });
        if (typeof result === 'string') setter(result);
      } catch (e) {
        console.error('[MyProjects] file picker failed:', e);
      }
    },
    []
  );

  // Save is always allowed — a blank entry is a valid "I'll fill this in
  // later" draft (the user can come back via Edit). The only real
  // constraint is that an unnamed card looks empty in the list; we leave
  // that as the user's call, and Delete is one click away if they regret it.
  const handleSave = useCallback(() => {
    const input: MyProjectInput = {
      name: name.trim(),
      iconPath,
      launcherPath,
      modelsJsonPath,
    };
    if (editingId) {
      updateProject(editingId, input);
    } else {
      addProject(input);
    }
    onClose();
  }, [name, iconPath, launcherPath, modelsJsonPath, editingId, updateProject, addProject, onClose]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[480px] max-w-[92vw] border border-cyber-border/40 bg-cyber-surface shadow-2xl rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px w-full bg-cyber-border" />
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <span className="text-lg font-bold text-cyber-text font-mono">
            &gt;_ {t('myProjects.dialog.title')}
          </span>
          <button
            onClick={onClose}
            className="text-cyber-text-secondary hover:text-cyber-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <FieldLabel label={t('myProjects.field.name')}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('myProjects.placeholder.name')}
              className="w-full px-3 py-2 bg-cyber-input border border-cyber-border rounded text-[14px] text-cyber-text placeholder:text-cyber-text-muted focus:border-cyber-text/40 transition-colors outline-none"
            />
          </FieldLabel>

          <FieldLabel label={t('myProjects.field.icon')}>
            <FilePickerButton
              value={iconPath}
              placeholder={PLACEHOLDER_ICON}
              onClick={() =>
                pickFile([{ name: 'Icon', extensions: ['ico', 'svg', 'png'] }], setIconPath)
              }
            />
          </FieldLabel>

          <FieldLabel label={t('myProjects.field.launcher')}>
            <FilePickerButton
              value={launcherPath}
              placeholder={PLACEHOLDER_LAUNCHER}
              onClick={() =>
                pickFile(
                  // Windows: filter to exe. Other platforms: no filter (let user
                  // pick any executable — .app bundle on macOS is a directory
                  // and the dialog handles that natively).
                  navigator.platform.toLowerCase().includes('win')
                    ? [{ name: 'Executable', extensions: ['exe'] }]
                    : [],
                  setLauncherPath
                )
              }
            />
          </FieldLabel>

          <FieldLabel label={t('myProjects.field.models')}>
            <FilePickerButton
              value={modelsJsonPath}
              placeholder={PLACEHOLDER_MODELS}
              onClick={() =>
                pickFile([{ name: 'models.json', extensions: ['json'] }], setModelsJsonPath)
              }
            />
          </FieldLabel>
        </div>

        <div className="flex border-t border-cyber-border/40">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-[14px] text-cyber-text-secondary hover:text-cyber-text hover:bg-cyber-elevated transition-colors"
          >
            {t('btn.cancel')}
          </button>
          <div className="w-px bg-cyber-border/40" />
          <button
            onClick={handleSave}
            className="flex-1 px-6 py-3 text-[14px] text-cyber-text hover:bg-cyber-elevated transition-colors font-semibold"
          >
            {t('btn.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Small helpers ──

const FieldLabel: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="space-y-1.5">
    <div className="text-[13px] text-cyber-text-secondary font-medium">{label}</div>
    {children}
  </div>
);

// Visually a text input (matches the project-name field above) but acts as a
// file picker — clicking anywhere on the row opens the OS dialog. Placeholder
// shows the example path until the user picks something. No hover tooltip:
// the box itself is the only thing the user looks at.
const FilePickerButton: React.FC<{
  value: string;
  placeholder: string;
  onClick: () => void;
}> = ({ value, placeholder, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full px-3 py-2 bg-cyber-input border border-cyber-border rounded text-[14px] text-left flex items-center justify-between gap-2 hover:border-cyber-text/40 transition-colors outline-none"
  >
    <span className={`truncate ${value ? 'text-cyber-text' : 'text-cyber-text-muted'}`}>
      {value || placeholder}
    </span>
    <Folder size={14} className="flex-shrink-0 text-cyber-text-secondary" />
  </button>
);
