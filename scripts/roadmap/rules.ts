// Ablauf nach Haben, scripts/board/uebernahme.ts. Herkunft und Änderungen stehen in docs/roadmap.md.
export type Command = 'übernehmen' | 'freigeben';
export const marker = (kind: 'claim' | 'reminder', login: string) => '<!-- desk-roadmap:' + kind + ':' + login + ' -->';
const day = 86_400_000;

function prose(text: string) {
  let fence = '';
  const markdown = text.split(/\r?\n/).filter(line => {
    const codeFence = /^ {0,3}(\x60{3,}|~{3,})/.exec(line)?.[1];
    if (codeFence) {
      if (!fence) fence = codeFence;
      else if (codeFence.startsWith(fence) && !line.trim().slice(codeFence.length).trim()) fence = '';
      return false;
    }
    return !fence && !/^( {4}|\t|\s*>)/.test(line);
  }).join('\n');
  return markdown.replace(/<(?:pre|code)\b[^>]*>[\s\S]*?(?:<\/(?:pre|code)\s*>|$)|<!--[\s\S]*?(?:-->|$)/gi,
    block => block.replace(/[^\r\n]/g, ' '));
}

export function command(text: string): Command | null {
  for (const line of prose(text).split('\n')) {
    const word = line.trim().split(/\s+/, 1)[0]?.toLowerCase();
    if (word === '/übernehmen' || word === '/uebernehmen') return 'übernehmen';
    if (word === '/freigeben') return 'freigeben';
  }
  return null;
}

export function ticketReferences(body: string): number[] {
  return Array.from(prose(body).matchAll(/(?:^|\s)(?:Refs|Umgesetzt|Closes|Fixes|Resolves)\s+(#\d+(?:\s*,\s*#\d+)*)/gim))
    .flatMap(match => Array.from(match[1].matchAll(/#(\d+)/g), number => Number(number[1])));
}

export function reminderAction(input: {
  assignedAt: number; claimedAt?: number; activityAt: number; remindedAt?: number; linked: boolean; now: number;
}): 'remind' | 'release' | null {
  if (input.linked || input.claimedAt === undefined || input.claimedAt < input.assignedAt) return null;
  const lastActivity = Math.max(input.assignedAt, input.claimedAt, input.activityAt);
  if (input.remindedAt !== undefined && input.remindedAt > lastActivity) {
    return input.now - input.remindedAt >= 7 * day ? 'release' : null;
  }
  return input.now - lastActivity >= 14 * day ? 'remind' : null;
}
