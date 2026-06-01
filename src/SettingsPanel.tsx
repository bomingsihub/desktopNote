import { chooseNotesDirectory } from "./api";
import type { AppConfig, ThemeOption, ViewMode } from "./types";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <b>
        {value}
        {suffix}
      </b>
    </label>
  );
}

export function SettingsPanel({
  config,
  onChange,
  onClose,
}: {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <aside className="settings-panel">
      <header>
        <h2>应用设置</h2>
        <button onClick={onClose}>×</button>
      </header>
      <section>
        <label>主题</label>
        <div className="segmented">
          {(["light", "dark", "system"] as ThemeOption[]).map((theme) => (
            <button
              key={theme}
              className={config.theme === theme ? "active" : ""}
              onClick={() => set("theme", theme)}
            >
              {theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统"}
            </button>
          ))}
        </div>
      </section>
      <section>
        <label>笔记目录</label>
        <div className="path-row">
          <input value={config.notesDir} readOnly />
          <button
            onClick={async () => {
              const dir = await chooseNotesDirectory();
              if (dir) set("notesDir", dir);
            }}
          >
            选择
          </button>
        </div>
      </section>
      <section className="settings-grid">
        <Toggle label="关闭到托盘" checked={config.closeToTray} onChange={(v) => set("closeToTray", v)} />
        <Toggle label="开机自启" checked={config.autostart} onChange={(v) => set("autostart", v)} />
        <Toggle label="自动保存笔记" checked={config.noteAutoSave} onChange={(v) => set("noteAutoSave", v)} />
        <Toggle
          label="小窗笔记自动保存"
          checked={config.noteSurfaceAutoSave}
          onChange={(v) => set("noteSurfaceAutoSave", v)}
        />
        <Toggle
          label="外部文件自动保存"
          checked={config.externalFileAutoSave}
          onChange={(v) => set("externalFileAutoSave", v)}
        />
        <Toggle
          label="磁贴渲染 Markdown"
          checked={config.tileRenderMarkdown}
          onChange={(v) => set("tileRenderMarkdown", v)}
        />
        <Toggle
          label="允许 HTML 标签渲染"
          checked={config.renderHtmlMarkdown}
          onChange={(v) => set("renderHtmlMarkdown", v)}
        />
        <Toggle
          label="快捷键打开时跟随鼠标位置"
          checked={config.openAtCursor}
          onChange={(v) => set("openAtCursor", v)}
        />
      </section>
      <section>
        <label>默认视图</label>
        <div className="segmented">
          {(["edit", "split", "preview"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={config.defaultViewMode === mode ? "active" : ""}
              onClick={() => set("defaultViewMode", mode)}
            >
              {mode === "edit" ? "编辑" : mode === "split" ? "分栏" : "预览"}
            </button>
          ))}
        </div>
      </section>
      <section>
        <label>快捷键</label>
        <input
          value={config.globalShortcut}
          onChange={(event) => set("globalShortcut", event.target.value)}
          placeholder="Ctrl+Space"
        />
        <input
          value={config.toggleVisibilityShortcut}
          onChange={(event) => set("toggleVisibilityShortcut", event.target.value)}
          placeholder="Ctrl+Alt+N"
        />
      </section>
      <section>
        <Range label="编辑器字号" value={config.fontSize} min={8} max={30} suffix="px" onChange={(v) => set("fontSize", v)} />
        <Range
          label="小窗/磁贴字号"
          value={config.surfaceFontSize}
          min={8}
          max={30}
          suffix="px"
          onChange={(v) => set("surfaceFontSize", v)}
        />
        <Range label="Tab 缩进" value={config.tabIndentSize} min={1} max={8} onChange={(v) => set("tabIndentSize", v)} />
      </section>
      <section>
        <label>磁贴颜色</label>
        <div className="color-row">
          <select value={config.tileColorMode} onChange={(event) => set("tileColorMode", event.target.value as "system" | "custom")}>
            <option value="system">跟随主题</option>
            <option value="custom">自定义</option>
          </select>
          <input type="color" value={config.tileColor} onChange={(event) => set("tileColor", event.target.value)} />
          <input value={config.tileColor} onChange={(event) => set("tileColor", event.target.value)} />
        </div>
      </section>
      <section>
        <label>背景图片</label>
        <input
          value={config.backgroundImagePath ?? ""}
          onChange={(event) => set("backgroundImagePath", event.target.value)}
          placeholder="图片路径"
        />
        <div className="segmented">
          {(["cover", "contain", "repeat"] as const).map((fit) => (
            <button
              key={fit}
              className={config.backgroundFit === fit ? "active" : ""}
              onClick={() => set("backgroundFit", fit)}
            >
              {fit === "cover" ? "填充" : fit === "contain" ? "完整" : "平铺"}
            </button>
          ))}
        </div>
        <Range label="遮罩" value={Math.round(config.backgroundDim * 100)} min={0} max={100} suffix="%" onChange={(v) => set("backgroundDim", v / 100)} />
        <Range label="模糊" value={config.backgroundBlur} min={0} max={20} suffix="px" onChange={(v) => set("backgroundBlur", v)} />
        <Range label="缩放" value={Math.round(config.backgroundScale * 100)} min={50} max={200} suffix="%" onChange={(v) => set("backgroundScale", v / 100)} />
      </section>
    </aside>
  );
}
