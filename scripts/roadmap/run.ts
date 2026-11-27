import { github, repository, roadmap, type Comment, type Issue } from './github';
import { command, marker, reminderAction, ticketReferences } from './rules';

type GitHub = ReturnType<typeof github>;
type Board = Awaited<ReturnType<GitHub['board']>>;
type Card = NonNullable<Awaited<ReturnType<Board['card']>>>;
type Event = {
  action?: string;
  repository?: { full_name: string };
  issue?: { number: number; pull_request?: unknown };
  comment?: { body: string; user: { login: string; type: string } };
};

const bot = (comment: Comment) => comment.user.type === 'Bot' && comment.user.login === 'github-actions[bot]';
const stamp = (date: string) => new Date(date).getTime();
const latest = (dates: number[]) => dates.length ? Math.max(...dates) : undefined;
const hasAssignee = (issue: Issue, login: string) => issue.assignees.some(user => user.login === login);
const available = (card: Card) => !card.isArchived && (card.status === 'Geplant' || card.status === 'In Arbeit');

const activeIssueLimit = 10;
const issueLimitMessage = 'du kannst höchstens ' + activeIssueLimit +
  ' laufende Desk-Issues gleichzeitig bearbeiten. Schließe zuerst eine Aufgabe ab oder gib sie frei.';

async function hasReachedIssueLimit(api: GitHub, board: Board, login: string, target: number) {
  const counted = new Set<number>();
  for (const issue of await api.assignedIssues(login)) {
    if (issue.number === target || counted.has(issue.number) || issue.state !== 'open' ||
        issue.pull_request || !hasAssignee(issue, login)) continue;
    const card = await board.card(issue.number);
    if (card && !card.isArchived && card.status === 'In Arbeit') {
      counted.add(issue.number);
      if (counted.size >= activeIssueLimit) return true;
    }
  }
  return false;
}

function requestFrom(event: Event) {
  const { action, repository: repo, issue, comment } = event;
  if (action !== 'created' || repo?.full_name !== repository || !issue || issue.pull_request ||
      !Number.isSafeInteger(issue.number) || issue.number < 1 || comment?.user.type !== 'User' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(comment.user.login)) return null;
  const operation = command(comment.body);
  return operation ? { number: issue.number, login: comment.user.login, operation } : null;
}

async function giveBack(api: GitHub, board: Board, issue: Issue, card: Card, login: string) {
  const returned = !card.isArchived && issue.assignees.length === 1 && card.status === 'In Arbeit';
  if (returned) await board.set(card, 'Geplant');
  try {
    const result = await api.remove(issue.number, login);
    if (hasAssignee(result, login)) throw new Error('GitHub hat die Zuweisung nicht aufgehoben.');
    if (returned && result.assignees.length) {
      await restoreStatus(board, issue.number);
      return false;
    }
  } catch (error) {
    const current = await api.issue(issue.number);
    if (returned && current.assignees.length) await restoreStatus(board, issue.number);
    throw error;
  }
  return returned;
}

async function restoreStatus(board: Board, number: number) {
  const currentCard = await board.card(number);
  if (currentCard && !currentCard.isArchived && currentCard.status === 'Geplant') await board.set(currentCard, 'In Arbeit');
}

export async function runCommand(api: GitHub, event: Event) {
  const request = requestFrom(event);
  if (!request) return;
  const { number, login, operation } = request;
  const tell = (body: string) => api.comment(number, '@' + login + ' ' + body);
  const board = await api.board();
  const issue = await api.issue(number);
  if (issue.pull_request || issue.state !== 'open') return;
  const card = await board.card(number);
  if (!card) return await tell('dieses Issue hat keine Karte in der [Desk Roadmap](' + roadmap + ').');

  if (operation === 'freigeben') {
    if (!hasAssignee(issue, login)) {
      return await tell(issue.assignees.length ? 'das Issue ist dir nicht zugewiesen.' : 'das Issue ist bereits unbesetzt.');
    }
    const returned = await giveBack(api, board, issue, card, login);
    return await tell('deine Zuweisung ist aufgehoben.' + (returned ? ' Die Karte steht wieder unter „Geplant“.' : ''));
  }

  if (!available(card)) return await tell('diese Karte kann in ihrer aktuellen Spalte nicht übernommen werden.');
  if (issue.assignees.some(user => user.login !== login)) return await tell('dieses Issue ist bereits vergeben.');
  const alreadyAssigned = hasAssignee(issue, login);
  if (alreadyAssigned) {
    const assignedAt = await lastAssignment(api, number, login);
    const comments = await api.comments(number);
    if (assignedAt !== undefined && comments.some(c => bot(c) && stamp(c.created_at) >= assignedAt &&
        c.body.startsWith(marker('claim', login)))) {
      return await tell('dieses Issue ist dir bereits zugewiesen.');
    }
  }
  const wasInProgress = alreadyAssigned && card.status === 'In Arbeit';
  if (!wasInProgress && await hasReachedIssueLimit(api, board, login, number)) {
    return await tell(issueLimitMessage);
  }
  if (!alreadyAssigned) {
    const assigned = await api.add(number, login);
    if (!hasAssignee(assigned, login)) return await tell('GitHub hat die Zuweisung nicht bestätigt. Bitte wende dich an die Maintainer.');
    if (assigned.assignees.some(user => user.login !== login)) {
      await api.remove(number, login);
      return await tell('das Issue wurde zwischenzeitlich vergeben.');
    }
  }
  const currentCard = await board.card(number);
  if (!currentCard || !available(currentCard)) {
    if (!alreadyAssigned) await api.remove(number, login);
    return await tell('die Roadmap-Karte hat sich während der Zuweisung geändert.');
  }
  const current = await api.issue(number);
  if (current.state !== 'open' || current.assignees.length !== 1 || !hasAssignee(current, login)) {
    return await tell('die Zuweisung wurde zwischenzeitlich geändert.');
  }
  if (currentCard.status !== 'In Arbeit') {
    if (wasInProgress && await hasReachedIssueLimit(api, board, login, number)) return await tell(issueLimitMessage);
    await board.set(currentCard, 'In Arbeit');
  }
  await api.comment(number, marker('claim', login) + '\n@' + login +
    ' das Issue ist dir zugewiesen und steht unter „In Arbeit“. Mit \u0060/freigeben\u0060 kannst du es zurückgeben.');
}

export async function runReminders(api: GitHub, probe: boolean, now = Date.now()) {
  const board = await api.board();
  const linked = new Set((await api.pulls()).flatMap(pull => ticketReferences(pull.body ?? '')));
  for (const item of await api.assignedIssues()) {
    if (item.pull_request || item.assignees.length !== 1 || linked.has(item.number)) continue;
    const { number } = item;
    const login = item.assignees[0].login;
    const card = await board.card(number);
    if (!card || card.isArchived || card.status !== 'In Arbeit' || await api.collaborator(login)) continue;
    const operation = await pendingReminder(api, number, login, now);
    if (!operation) continue;
    console.log('#' + number + ': ' + operation + (probe ? ' (Probe)' : ''));
    if (probe) continue;
    const current = await api.issue(number);
    if (current.state !== 'open' || current.assignees.length !== 1 || !hasAssignee(current, login)) continue;
    const currentCard = await board.card(number);
    if (!currentCard || currentCard.isArchived || currentCard.status !== 'In Arbeit') continue;
    if (operation === 'release') {
      const recentPulls = await api.pulls();
      if (recentPulls.some(pull => ticketReferences(pull.body ?? '').includes(number))) continue;
    }
    if (await pendingReminder(api, number, login, now) !== operation) continue;
    if (operation === 'remind') {
      await api.comment(number, marker('reminder', login) + '\n@' + login +
        ' arbeitest du noch an diesem Issue? Ein kurzer Kommentar reicht. Nach sieben weiteren Tagen ohne Rückmeldung wird es wieder freigegeben.');
    } else {
      const returned = await giveBack(api, board, current, currentCard, login);
      await api.comment(number, '@' + login + ' deine Zuweisung ist nach der Erinnerung aufgehoben.' +
        (returned ? ' Das Issue steht wieder unter „Geplant“.' : ''));
    }
  }
}

async function pendingReminder(api: GitHub, number: number, login: string, now: number) {
  const comments = await api.comments(number);
  const claimedAt = latest(comments.filter(c => bot(c) && c.body.startsWith(marker('claim', login))).map(c => stamp(c.created_at)));
  if (claimedAt === undefined) return null;
  const assignedAt = await lastAssignment(api, number, login);
  if (assignedAt === undefined) return null;
  return reminderAction({
    assignedAt, claimedAt, linked: false, now,
    activityAt: latest(comments.filter(c => c.user.login === login).map(c => stamp(c.created_at))) ?? 0,
    remindedAt: latest(comments.filter(c => bot(c) && c.body.startsWith(marker('reminder', login))).map(c => stamp(c.created_at))),
  });
}

async function lastAssignment(api: GitHub, number: number, login: string) {
  return latest((await api.assignments(number))
    .filter(event => event.event === 'assigned' && event.assignee?.login === login)
    .map(event => stamp(event.created_at)));
}

if (import.meta.main) {
  const { GITHUB_REPOSITORY, GITHUB_REF, GITHUB_TOKEN, ROADMAP_TOKEN, GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, ROADMAP_PROBE } = process.env;
  if (GITHUB_REPOSITORY !== repository || GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Die Roadmap-Automatik läuft ausschließlich auf Vemoro/desk main.');
  }
  if (!GITHUB_TOKEN || !ROADMAP_TOKEN) {
    if (GITHUB_EVENT_NAME === 'workflow_dispatch') throw new Error('Die GitHub App für Desk Roadmap ist noch nicht eingerichtet.');
    console.log('::notice::Desk Roadmap: GitHub App und GITHUB_TOKEN sind für den Workflow erforderlich.');
  } else {
    const api = github(GITHUB_TOKEN, ROADMAP_TOKEN);
    if (GITHUB_EVENT_NAME === 'issue_comment' && GITHUB_EVENT_PATH) {
      await runCommand(api, JSON.parse(await Bun.file(GITHUB_EVENT_PATH).text()) as Event);
    } else if (GITHUB_EVENT_NAME === 'schedule' || GITHUB_EVENT_NAME === 'workflow_dispatch') {
      await runReminders(api, GITHUB_EVENT_NAME === 'workflow_dispatch' && ROADMAP_PROBE !== 'false');
    }
  }
}
