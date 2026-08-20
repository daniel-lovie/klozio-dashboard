"use client";
import { Fragment, type ReactNode } from "react";

/**
 * The small slice of Markdown the agent actually writes.
 *
 * Its answers arrived as raw source — "**anime-c2-v1** (ID:2289)" with the asterisks showing, nested
 * list items flattened into one wall of text. The model is writing Markdown because that is what models
 * write; the chat was simply printing it.
 *
 * Written here rather than pulled in: the app has six runtime dependencies and this needs to cover
 * bold, italic, inline code, fenced code, headings, links and two kinds of list — which is what the
 * agent emits and nothing more. It also never touches dangerouslySetInnerHTML, so model output cannot
 * become markup; every node below is a React element built from parsed text.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2">{blocks(text)}</div>;
}

function blocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // ``` fenced code — taken verbatim, including any Markdown inside it
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;                                                     // closing fence
      out.push(
        <pre key={key++} className="overflow-x-auto rounded border border-line bg-sunken p-2 text-[12px] leading-relaxed">
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // # heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const size = ["text-base", "text-[15px]", "text-sm", "text-sm"][h[1].length - 1];
      out.push(<p key={key++} className={`font-semibold ${size}`}>{inline(h[2])}</p>);
      i++;
      continue;
    }

    // - bullet / 1. numbered, with one level of indent kept as an indent rather than flattened
    if (isItem(line)) {
      const items: { depth: number; text: string; num: string | null }[] = [];
      while (i < lines.length && (isItem(lines[i]) || (items.length && !lines[i].trim() && isItem(lines[i + 1] ?? "")))) {
        if (!lines[i].trim()) { i++; continue; }
        const m = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i])!;
        items.push({ depth: Math.min(2, Math.floor(m[1].length / 2)), text: m[4], num: m[3] ?? null });
        i++;
      }
      out.push(
        <ul key={key++} className="space-y-0.5">
          {items.map((it, j) => (
            <li key={j} className="flex gap-1.5" style={{ paddingLeft: `${it.depth * 14}px` }}>
              <span className="select-none text-muted">{it.num ? `${it.num}.` : "•"}</span>
              <span className="min-w-0 flex-1">{inline(it.text)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // paragraph: consecutive non-blank lines that start nothing else
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isItem(lines[i])
           && !lines[i].trim().startsWith("```") && !/^#{1,4}\s/.test(lines[i])) {
      para.push(lines[i++]);
    }
    out.push(<p key={key++} className="whitespace-pre-wrap">{inline(para.join("\n"))}</p>);
  }
  return out;
}

function isItem(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line);
}

// Ordered so the greedier patterns win first; `code` before emphasis so **bold** inside backticks stays
// literal, which is what someone pasting a shell line expects.
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;

function inline(src: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(src))) {
    if (m.index > last) out.push(<Fragment key={key++}>{src.slice(last, m.index)}</Fragment>);
    const t = m[0];
    if (m[1]) {
      out.push(<code key={key++} className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">{t.slice(1, -1)}</code>);
    } else if (m[2] || m[3]) {
      out.push(<strong key={key++} className="font-semibold">{t.slice(2, -2)}</strong>);
    } else if (m[4]) {
      out.push(<em key={key++}>{t.slice(1, -1)}</em>);
    } else {
      const label = t.slice(1, t.indexOf("]"));
      out.push(
        <a key={key++} href={m[6]} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {label}
        </a>
      );
    }
    last = m.index + t.length;
  }
  if (last < src.length) out.push(<Fragment key={key++}>{src.slice(last)}</Fragment>);
  return out;
}
