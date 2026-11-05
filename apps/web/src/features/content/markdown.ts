interface Node { type: string; text?: string; attrs?: { level?: number; href?: string }; marks?: { type: string; attrs?: { href?: string } }[]; content?: Node[] }
export function toMarkdown(node: Node): string {
  const children = () => (node.content ?? []).map(toMarkdown).join('');
  if (node.type === 'text') {
    let value = node.text ?? '';
    for (const character of ['\\', '`', '*', '_', '[', ']']) value = value.replaceAll(character, `\\${character}`);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = `**${value}**`;
      if (mark.type === 'italic') value = `*${value}*`;
      if (mark.type === 'strike') value = `~~${value}~~`;
      if (mark.type === 'code') value = `\`${value}\``;
      if (mark.type === 'link' && mark.attrs?.href?.startsWith('https://')) value = `[${value}](${mark.attrs.href})`;
    }
    return value;
  }
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'heading') return `${'#'.repeat(Math.min(3, Math.max(1, node.attrs?.level ?? 1)))} ${children()}\n\n`;
  if (node.type === 'paragraph') return `${children()}\n\n`;
  if (node.type === 'blockquote') return children().trimEnd().split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
  if (node.type === 'listItem') return children().trimEnd();
  if (node.type === 'bulletList' || node.type === 'orderedList') return (node.content ?? []).map((child, index) => `${node.type === 'bulletList' ? '-' : `${index + 1}.`} ${toMarkdown(child)}\n`).join('') + '\n';
  if (node.type === 'horizontalRule') return '---\n\n';
  if (node.type === 'codeBlock') return `\`\`\`\n${children().trimEnd()}\n\`\`\`\n\n`;
  return children().trimEnd();
}
