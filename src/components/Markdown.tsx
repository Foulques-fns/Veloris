"use client";

import { isValidElement, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import { CopyButton } from "./ui";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) return extractText((node.props as { children?: ReactNode }).children);
  return "";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function CodeBlock({ language, raw }: { language: string; raw: string }) {
  const html = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) return hljs.highlight(raw, { language }).value;
      return escapeHtml(raw);
    } catch {
      return escapeHtml(raw);
    }
  }, [language, raw]);
  return (
    <pre>
      <div className="code-head">
        <span>{language || "code"}</span>
        <CopyButton text={raw} />
      </div>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

const components: Components = {
  pre({ children }) {
    const el = Array.isArray(children) ? children[0] : children;
    if (isValidElement(el)) {
      const props = el.props as { className?: string; children?: ReactNode };
      const lang = /language-([\w-]+)/.exec(props.className ?? "")?.[1] ?? "";
      return <CodeBlock language={lang} raw={extractText(props.children).replace(/\n$/, "")} />;
    }
    return <pre>{children}</pre>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={String(src ?? "")} alt={alt ?? "image"} className="rounded-xl max-w-full border border-[var(--border)]" />;
  },
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
