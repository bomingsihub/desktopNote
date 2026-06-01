import { MarkdownPreview } from "./MarkdownPreview";

export function Tile({
  title,
  content,
  color,
  fontSize,
  renderMarkdown,
  onClose,
  onEdit,
  onCopy,
}: {
  title: string;
  content: string;
  color: string;
  fontSize: number;
  renderMarkdown: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
}) {
  return (
    <div className="tile" style={{ background: color }}>
      <div className="tile-header" data-tauri-drag-region>
        <strong>{title || "无标题笔记"}</strong>
        <div className="tile-actions">
          {onCopy && (
            <button title="复制" onClick={onCopy}>
              ⧉
            </button>
          )}
          {onEdit && (
            <button title="编辑" onClick={onEdit}>
              ✎
            </button>
          )}
          <button title="取消钉屏" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="tile-body" style={{ fontSize }}>
        {renderMarkdown ? (
          <MarkdownPreview content={content} fontSize={fontSize} renderHtml={false} />
        ) : (
          <pre>{content}</pre>
        )}
      </div>
    </div>
  );
}
