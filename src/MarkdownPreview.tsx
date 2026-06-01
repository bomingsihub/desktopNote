import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function MarkdownPreview({
  content,
  fontSize,
  renderHtml,
}: {
  content: string;
  fontSize: number;
  renderHtml: boolean;
}) {
  const rehypePlugins = renderHtml ? [rehypeRaw, rehypeKatex] : [rehypeSanitize, rehypeKatex];
  return (
    <div className="markdown-preview" style={{ fontSize }}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={rehypePlugins}>
        {content || " "}
      </ReactMarkdown>
    </div>
  );
}
