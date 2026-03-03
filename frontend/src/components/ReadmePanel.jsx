function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInline(markdown) {
  let text = markdown;

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  return text;
}

function restoreSupportedHtml(html) {
  let output = html;

  output = output.replace(/<p>&lt;div align=&quot;(center|left|right)&quot;&gt;<\/p>/gi, (_, align) => `<div style="text-align:${align};">`);
  output = output.replace(/<p>&lt;\/div&gt;<\/p>/gi, "</div>");
  output = output.replace(/<p>&lt;center&gt;<\/p>/gi, '<div style="text-align:center;">');
  output = output.replace(/<p>&lt;\/center&gt;<\/p>/gi, "</div>");

  output = output.replace(/<p>&lt;(ol|ul|blockquote|pre|code)&gt;<\/p>/gi, "<$1>");
  output = output.replace(/<p>&lt;\/(ol|ul|blockquote|pre|code)&gt;<\/p>/gi, "</$1>");
  output = output.replace(/<p>&lt;li&gt;(.*?)&lt;\/li&gt;<\/p>/gi, "<li>$1</li>");
  output = output.replace(/<p>&lt;br\s*\/?&gt;<\/p>/gi, "<br />");
  output = output.replace(/&lt;br\s*\/?&gt;/gi, "<br />");

  output = output.replace(
    /<p>&lt;(h[1-6]|p) align=&quot;(center|left|right)&quot;&gt;(.*?)&lt;\/\1&gt;<\/p>/gi,
    (_, tag, align, content) => `<${tag} style="text-align:${align};">${content}</${tag}>`
  );

  return output;
}

function markdownToHtml(source) {
  const codeBlocks = [];
  let text = escapeHtml(source || "");

  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${lang || "text"}">${code.trimEnd()}</code></pre>`);
    return `@@CODE_BLOCK_${idx}@@`;
  });

  const lines = text.split("\n");
  const chunks = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      chunks.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      chunks.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    const codeMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (codeMatch) {
      closeLists();
      chunks.push(codeBlocks[Number(codeMatch[1])] || "");
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      chunks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeLists();
      chunks.push("<hr />");
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        chunks.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        chunks.push("<ul>");
        inUl = true;
      }
      chunks.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        chunks.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        chunks.push("<ol>");
        inOl = true;
      }
      chunks.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    if (trimmed.startsWith("&gt;")) {
      closeLists();
      chunks.push(`<blockquote>${renderInline(trimmed.replace(/^&gt;\s?/, ""))}</blockquote>`);
      continue;
    }

    closeLists();
    chunks.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeLists();
  return restoreSupportedHtml(chunks.join("\n"));
}

function ReadmePanel({ loading, blob }) {
  if (!loading && !blob) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-md border border-gh-border bg-gh-panel">
      <div className="border-b border-gh-border px-4 py-3 text-sm font-semibold text-gh-text">README</div>
      {loading ? (
        <div className="px-4 py-4 text-sm text-gh-muted">Rendering README...</div>
      ) : blob?.is_binary ? (
        <div className="px-4 py-4 text-sm text-gh-muted">README is binary and cannot be rendered.</div>
      ) : (
        <article className="markdown-body px-6 py-5" dangerouslySetInnerHTML={{ __html: markdownToHtml(blob?.content || "") }} />
      )}
      {blob?.truncated ? (
        <div className="border-t border-gh-border px-4 py-2 text-xs text-gh-muted">README preview is truncated for large file size.</div>
      ) : null}
    </section>
  );
}

export default ReadmePanel;
