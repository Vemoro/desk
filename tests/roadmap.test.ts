import { expect, test } from 'bun:test';
import { github, repository, type Comment, type Issue, type User } from '../scripts/roadmap/github';
import { command, marker, reminderAction, ticketReferences } from '../scripts/roadmap/rules';
import { runCommand, runReminders } from '../scripts/roadmap/run';

const day = 86_400_000;
const start = Date.UTC(2026, 0, 1);
const mira = { login: 'mira', type: 'User' };
const alex = { login: 'alex', type: 'User' };
const bot = { login: 'github-actions[bot]', type: 'Bot' };

function fixture() {
  const issue: Issue = { number: 123, state: 'open', assignees: [] };
  const card = { id: 'card', status: 'Geplant', isArchived: false };
  const comments: Comment[] = [];
  const otherIssues: Issue[] = [];
  const otherCards = new Map<number, typeof card>();
  function active(count: number) {
    for (let index = 1; index <= count; index++) {
      const number = 200 + index;
      otherIssues.push({ number, state: 'open', assignees: [mira] });
      otherCards.set(number, { id: String(number), status: 'In Arbeit', isArchived: false });
    }
  }
  const writes: string[] = [];
  const pulls: { body: string | null }[] = [];
  let accepted = true;
  let collaborator = false;
  let failRemoval = false;
  const confirm = (kind: 'claim' | 'reminder', when: number, author = bot) =>
    comments.push({ body: marker(kind, mira.login), user: author, created_at: new Date(when).toISOString() });
  const api: ReturnType<typeof github> = {
    board: async () => ({
      card: async number => number === issue.number ? { ...card } : otherCards.get(number) ?? null,
      set: async (_item, status) => { card.status = status; writes.push(status); },
    }),
    issue: async () => issue,
    assignedIssues: async () => [issue, ...otherIssues],
    pulls: async () => pulls,
    comments: async () => comments,
    assignments: async () => [{ event: 'assigned', assignee: mira, created_at: new Date(start).toISOString() }],
    add: async (_number, login) => {
      writes.push('+' + login);
      if (accepted) issue.assignees.push({ login, type: 'User' });
      return issue;
    },
    remove: async (_number, login) => {
      writes.push('-' + login);
      if (failRemoval) throw new Error('temporary failure');
      issue.assignees = issue.assignees.filter(user => user.login !== login);
      return issue;
    },
    collaborator: async () => collaborator,
    comment: async (_number, body) => {
      writes.push('comment');
      comments.push({ body, created_at: new Date(start).toISOString(), user: bot });
    },
  };
  const send = (body: string, user: User = mira, pull_request?: object) =>
    runCommand(api, { action: 'created', repository: { full_name: repository },
      issue: { number: issue.number, pull_request }, comment: { body, user } });
  return { issue, card, comments, writes, pulls, api, send, confirm, active, otherIssues, otherCards,
    rejectAssignment: () => { accepted = false; },
    exemptCollaborator: () => { collaborator = true; },
    failRemoval: () => { failRemoval = true; },
  };
}

test('parses direct commands and PR references while ignoring quoted or fenced text', () => {
  expect(command('/ÜBERNEHMEN')).toBe('übernehmen');
  expect(command('/uebernehmen')).toBe('übernehmen');
  expect(command('Danke!\n/freigeben')).toBe('freigeben');
  expect(command('> /übernehmen\n~~~bash\n/freigeben\n~~~\n    /uebernehmen')).toBeNull();
  expect(command('<pre>\n/übernehmen\n</pre>\n<!--\n/freigeben\n-->')).toBeNull();
  expect(command('~~~html\n<pre>\n~~~\n/übernehmen')).toBe('übernehmen');
  expect(ticketReferences('Refs #123, #45\n> Fixes #1234\nUmgesetzt #4')).toEqual([123, 45, 4]);
});

test('claims, retries without duplicate assignment and returns only the caller’s assignment', async () => {
  const f = fixture();
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['+mira', 'In Arbeit', 'comment']);
  await f.send('/uebernehmen');
  await f.send('/freigeben', alex);
  expect(f.writes.slice(3)).toEqual(['comment', 'comment']);
  await f.send('/freigeben');
  expect(f.writes.slice(5)).toEqual(['Geplant', '-mira', 'comment']);
  expect(f.issue.assignees).toEqual([]);
});

test('rejects an unavailable or occupied issue, and leaves the status untouched when GitHub declines', async () => {
  const f = fixture();
  f.issue.assignees = [alex];
  await f.send('/übernehmen');
  f.issue.assignees = [];
  f.card.status = 'Später';
  await f.send('/übernehmen');
  f.card.status = 'Geplant';
  f.rejectAssignment();
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['comment', 'comment', '+mira', 'comment']);
  expect(f.card.status).toBe('Geplant');
});

test('PR comments, bots, and closed issues have no side effects', async () => {
  const f = fixture();
  await f.send('/übernehmen', mira, {});
  await f.send('/übernehmen', bot);
  f.issue.state = 'closed';
  await f.send('/übernehmen');
  expect(f.writes).toEqual([]);
});

test('a failed removal restores the card for the next attempt', async () => {
  const f = fixture();
  f.card.status = 'In Arbeit';
  f.issue.assignees = [mira];
  f.failRemoval();
  await expect(f.send('/freigeben')).rejects.toThrow('temporary failure');
  expect(f.writes).toEqual(['Geplant', '-mira', 'In Arbeit']);
});

test('an existing claim leaves a later manual card status in place', async () => {
  const f = fixture();
  await f.send('/übernehmen');
  f.card.status = 'Geplant';
  f.writes.length = 0;
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['comment']);
  expect(f.card.status).toBe('Geplant');
});

test('releasing an archived card still removes the caller without moving the card', async () => {
  const f = fixture();
  f.issue.assignees = [mira];
  f.card.status = 'In Arbeit';
  f.card.isArchived = true;
  await f.send('/freigeben');
  expect(f.writes).toEqual(['-mira', 'comment']);
});

test('a concurrent assignee keeps the card in progress after the caller is removed', async () => {
  const f = fixture();
  f.issue.assignees = [mira];
  f.card.status = 'In Arbeit';
  const remove = f.api.remove;
  f.api.remove = async (number, login) => {
    f.issue.assignees.push(alex);
    return await remove(number, login);
  };
  await f.send('/freigeben');
  expect(f.issue.assignees).toEqual([alex]);
  expect(f.card.status).toBe('In Arbeit');
});

test('a failed confirmation can be retried without releasing the card again', async () => {
  const f = fixture();
  f.issue.assignees = [mira];
  f.card.status = 'In Arbeit';
  const comment = f.api.comment;
  f.api.comment = async () => { throw new Error('temporary comment failure'); };
  await expect(f.send('/freigeben')).rejects.toThrow('temporary comment failure');
  f.api.comment = comment;
  await f.send('/freigeben');
  expect(f.writes).toEqual(['Geplant', '-mira', 'comment']);
  expect(f.comments[0].body).toContain('das Issue ist bereits unbesetzt');
});

test('reminder clocks are inclusive at fourteen and seven days and reset on a new comment', () => {
  const state = { assignedAt: start, claimedAt: start, linked: false, activityAt: 0 };
  expect(reminderAction({ ...state, now: start + 14 * day - 1 })).toBeNull();
  expect(reminderAction({ ...state, now: start + 14 * day })).toBe('remind');
  const reminded = { ...state, remindedAt: start + 14 * day };
  expect(reminderAction({ ...reminded, now: start + 21 * day - 1 })).toBeNull();
  expect(reminderAction({ ...reminded, now: start + 21 * day })).toBe('release');
  expect(reminderAction({ ...reminded, now: start + 21 * day, activityAt: start + 15 * day })).toBeNull();
});

test('scheduled release recognizes only trusted markers and skips both probes and linked PRs', async () => {
  const f = fixture();
  f.card.status = 'In Arbeit';
  f.issue.assignees = [mira];
  f.confirm('claim', start, mira);
  f.confirm('reminder', start + 14 * day, mira);
  const now = start + 21 * day;
  await runReminders(f.api, false, now);
  f.comments.length = 0;
  f.confirm('claim', start);
  f.confirm('reminder', start + 14 * day);
  f.pulls.push({ body: 'Refs #123' });
  await runReminders(f.api, false, now);
  f.pulls.length = 0;
  await runReminders(f.api, true, now);
  expect(f.writes).toEqual([]);
  await runReminders(f.api, false, now);
  expect(f.writes).toEqual(['Geplant', '-mira', 'comment']);
});

test('scheduled reminder exempts repository collaborators', async () => {
  const f = fixture();
  f.card.status = 'In Arbeit';
  f.issue.assignees = [mira];
  f.confirm('claim', start);
  f.exemptCollaborator();
  await runReminders(f.api, false, start + 14 * day);
  expect(f.writes).toEqual([]);
});

test('a reply during the final open PR check keeps the assignment', async () => {
  const f = fixture();
  const now = start + 21 * day;
  f.card.status = 'In Arbeit';
  f.issue.assignees = [mira];
  f.confirm('claim', start);
  f.confirm('reminder', start + 14 * day);
  let pullsChecked = 0;
  f.api.pulls = async () => {
    if (++pullsChecked === 2) {
      f.comments.push({ user: mira, body: 'Ich arbeite weiter daran.', created_at: new Date(now).toISOString() });
    }
    return [];
  };
  await runReminders(f.api, false, now);
  expect(pullsChecked).toBe(2);
  expect(f.writes).toEqual([]);
});

test('the ninth active assignment allows one more, ignoring other cards and closed work', async () => {
  const f = fixture();
  f.active(9);
  f.otherIssues.push(
    { number: 301, state: 'open', assignees: [mira], pull_request: {} },
    { number: 302, state: 'closed', assignees: [mira] },
    { number: 303, state: 'open', assignees: [alex] },
    { number: 304, state: 'open', assignees: [mira] },
    { number: 305, state: 'open', assignees: [mira] },
    { number: 306, state: 'open', assignees: [mira] },
    f.otherIssues[0],
  );
  for (const number of [301, 302, 303]) f.otherCards.set(number, { id: String(number), status: 'In Arbeit', isArchived: false });
  f.otherCards.set(304, { id: '304', status: 'In Arbeit', isArchived: true });
  f.otherCards.set(305, { id: '305', status: 'Geplant', isArchived: false });
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['+mira', 'In Arbeit', 'comment']);
});

test('the tenth active assignment includes manually assigned and shared issues', async () => {
  const f = fixture();
  f.active(10);
  f.otherIssues[0].assignees.push(alex);
  f.card.status = 'In Arbeit';
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['comment']);
  expect(f.comments[0].body).toContain('höchstens 10');
  expect(f.issue.assignees).toEqual([]);
  expect(f.card.status).toBe('In Arbeit');

  f.otherCards.get(201)!.status = 'Geplant';
  await f.send('/übernehmen');
  expect(f.issue.assignees).toEqual([mira]);
});

test('the limit blocks promotion of an already assigned card outside active work', async () => {
  const f = fixture();
  f.active(10);
  f.issue.assignees = [mira];
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['comment']);
  expect(f.card.status).toBe('Geplant');
  expect(f.issue.assignees).toEqual([mira]);
});

test('confirmation and release of an active card work at the limit', async () => {
  const f = fixture();
  f.active(10);
  f.card.status = 'In Arbeit';
  f.issue.assignees = [mira];
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['comment']);
  expect(f.comments[0].body).toStartWith(marker('claim', mira.login));
  await f.send('/übernehmen');
  await f.send('/freigeben');
  expect(f.writes).toEqual(['comment', 'comment', 'Geplant', '-mira', 'comment']);
});

test('an unreadable active backlog leaves assignments and cards untouched', async () => {
  const f = fixture();
  f.api.assignedIssues = async () => { throw new Error('temporary read failure'); };
  await expect(f.send('/übernehmen')).rejects.toThrow('temporary read failure');
  expect(f.writes).toEqual([]);
  expect(f.card.status).toBe('Geplant');
  expect(f.issue.assignees).toEqual([]);
});

test('a card moved out of active work during takeover needs free capacity again', async () => {
  const f = fixture();
  f.active(10);
  const last = f.otherCards.get(210)!;
  last.status = 'Geplant';
  f.card.status = 'In Arbeit';
  f.issue.assignees = [mira];
  const board = await f.api.board();
  let targetReads = 0;
  f.api.board = async () => ({
    ...board,
    card: async number => {
      if (number === f.issue.number && ++targetReads === 2) {
        f.card.status = 'Geplant';
        last.status = 'In Arbeit';
      }
      return await board.card(number);
    },
  });
  await f.send('/übernehmen');
  expect(f.writes).toEqual(['comment']);
  expect(f.comments[0].body).toContain('höchstens 10');
  expect(f.card.status).toBe('Geplant');
  expect(f.issue.assignees).toEqual([mira]);
});
