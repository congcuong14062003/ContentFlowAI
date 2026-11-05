import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
const nodes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'hardBreak', 'horizontalRule', 'codeBlock']);
const marks = new Set(['bold', 'italic', 'strike', 'code', 'link']);
export function validateEditorDocument(value: unknown): Prisma.InputJsonValue {
  let count = 0;
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 16 || ++count > 10000 || !item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('Invalid editor document');
    const entry = item as Record<string, unknown>; const type = entry.type;
    if (typeof type !== 'string' || !nodes.has(type) || Object.keys(entry).some(key => !['type', 'text', 'content', 'marks', 'attrs'].includes(key))) throw new BadRequestException('Invalid editor node');
    const clean: Record<string, unknown> = { type };
    if (type === 'text') { if (typeof entry.text !== 'string' || entry.text.length > 100000 || entry.content !== undefined) throw new BadRequestException('Invalid editor text'); clean.text = entry.text; }
    else if (entry.text !== undefined) throw new BadRequestException('Invalid editor node text');
    if (entry.content !== undefined) { if (!Array.isArray(entry.content) || entry.content.length > 10000) throw new BadRequestException('Invalid editor content'); clean.content = entry.content.map(child => visit(child, depth + 1)); }
    if (entry.marks !== undefined) {
      if (type !== 'text' || !Array.isArray(entry.marks) || entry.marks.length > 8) throw new BadRequestException('Invalid editor marks');
      clean.marks = entry.marks.map(mark => { if (!mark || typeof mark !== 'object' || Array.isArray(mark)) throw new BadRequestException('Invalid editor mark'); const m = mark as Record<string, unknown>; if (typeof m.type !== 'string' || !marks.has(m.type) || Object.keys(m).some(key => !['type', 'attrs'].includes(key))) throw new BadRequestException('Invalid editor mark'); if (m.type === 'link') { const href = (m.attrs as Record<string, unknown> | undefined)?.href; if (typeof href !== 'string' || !/^https:\/\//i.test(href) || href.length > 2048) throw new BadRequestException('Invalid link'); return { type: 'link', attrs: { href } }; } if (m.attrs !== undefined) throw new BadRequestException('Invalid mark attributes'); return { type: m.type }; });
    }
    if (entry.attrs !== undefined) { if (type !== 'heading' || !entry.attrs || typeof entry.attrs !== 'object' || Array.isArray(entry.attrs) || ![1,2,3].includes((entry.attrs as Record<string, unknown>).level as number) || Object.keys(entry.attrs).some(key => key !== 'level')) throw new BadRequestException('Invalid node attributes'); clean.attrs = { level: (entry.attrs as Record<string, unknown>).level }; }
    return clean;
  };
  const root = visit(value, 0) as Record<string, unknown>;
  if (root.type !== 'doc' || !Array.isArray(root.content)) throw new BadRequestException('Invalid editor root');
  if (Buffer.byteLength(JSON.stringify(root), 'utf8') > 200000) throw new BadRequestException('Editor document too large');
  return root as Prisma.InputJsonValue;
}
export function editorDocumentText(value: Prisma.InputJsonValue): string {
  const visit = (node: unknown): string => {
    const entry = node as { type: string; text?: string; content?: unknown[] };
    if (entry.type === 'text') return entry.text ?? '';
    if (entry.type === 'hardBreak') return '\n';
    const inner = (entry.content ?? []).map(visit).join('');
    return ['paragraph','heading','listItem','blockquote','codeBlock'].includes(entry.type) ? `${inner}\n` : inner;
  };
  return visit(value).trim();
}
