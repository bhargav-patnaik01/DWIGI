'use client';

import { useMemo } from 'react';
import { CopyButton } from './CopyButton';

/**
 * Minimal markdown renderer.
 *
 * Deliberately hand-written rather than pulling in a full parser. The advisor's
 * output vocabulary is known and narrow — headings, bold, italic, inline code,
 * fenced code, lists, blockquotes, tables, rules. A general parser would add a
 * large dependency and an HTML sanitisation problem for a superset of what is
 * ever produced.
 *
 * Nothing here interprets *content*. It maps syntax to elements. Text is escaped
 * before any tag is introduced, and no raw HTML from the model is ever injected.
 */

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' };

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline formatting, applied only after escaping. */
function inline(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-elevated px-[0.3em] py-[0.1em] font-mono text-[0.9em] text-ink">$1</code>'
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em class="italic">$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del class="text-faint">$1</del>');
  return s;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    // Fenced code: consume verbatim until the closing fence.
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      flush();
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      blocks.push({ type: 'code', lang, code: body.join('\n') });
      continue;
    }

    if (/^\s*$/.test(line)) {
      flush();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: 'h',
        level: (heading[1]?.length ?? 1) as 1 | 2 | 3,
        text: heading[2] ?? '',
      });
      continue;
    }

    // Table: header row followed by a separator row.
    if (line.includes('|') && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      flush();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? '').includes('|')) {
        rows.push(splitRow(lines[i] ?? ''));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? '')) {
        quoted.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'quote', lines: quoted });
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

function Html({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parse(source), [source]);

  return (
    <div className="space-y-3 text-[13.5px] leading-[1.65] text-ink/90">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h': {
            const size =
              block.level === 1
                ? 'text-[15px] mt-5'
                : block.level === 2
                  ? 'text-[14px] mt-4'
                  : 'text-[13.5px] mt-3';
            return (
              <h3 key={index} className={`font-semibold text-ink ${size} first:mt-0`}>
                <Html html={inline(block.text)} />
              </h3>
            );
          }
          case 'code':
            return <CodeBlock key={index} lang={block.lang} code={block.code} />;
          case 'ul':
            return (
              <ul key={index} className="space-y-1.5 pl-4">
                {block.items.map((item, j) => (
                  <li key={j} className="relative">
                    <span className="absolute -left-4 top-[0.55em] h-1 w-1 rounded-full bg-faint" />
                    <Html html={inline(item)} />
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index} className="space-y-1.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j} className="list-decimal">
                    <Html html={inline(item)} />
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={index}
                className="border-l-2 border-line pl-3 text-muted"
              >
                {block.lines.map((line, j) => (
                  <p key={j}>
                    <Html html={inline(line)} />
                  </p>
                ))}
              </blockquote>
            );
          case 'table':
            return (
              <div key={index} className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-surface">
                      {block.header.map((cell, j) => (
                        <th key={j} className="px-3 py-2 text-left font-medium text-muted">
                          <Html html={inline(cell)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b border-line last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-2 align-top tabular">
                            <Html html={inline(cell)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={index} className="border-line" />;
          default:
            return (
              <p key={index}>
                <Html html={inline(block.text)} />
              </p>
            );
        }
      })}
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex h-8 items-center justify-between border-b border-line px-3">
        <span className="font-mono text-2xs text-faint">{lang || 'text'}</span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto px-3 py-2.5">
        <code className="font-mono text-[12.5px] leading-relaxed text-ink/90">{code}</code>
      </pre>
    </div>
  );
}
