// GitHub-Zugriff nach Haben, scripts/board/github.ts. Ausschließlich Vemoro/desk und Desk Roadmap.
export const repository = 'Vemoro/desk';
export const roadmap = 'https://github.com/orgs/Vemoro/projects/2';
const projectId = 'PVT_kwDOEpPjwM4Bs7kV';
const api = 'https://api.github.com';
const repoPath = '/repos/' + repository;

export type User = { login: string; type: string };
export type Issue = { number: number; state: string; assignees: User[]; pull_request?: unknown };
export type Comment = { body: string; created_at: string; user: User };
type Assignment = { event: string; created_at: string; assignee?: User };
type Status = 'Geplant' | 'In Arbeit';
type Card = { id: string; status: string | null; isArchived: boolean };

export function github(issueToken: string, roadmapToken: string) {
  async function request(path: string, options: RequestInit = {}, token = issueToken) {
    return await fetch(api + path, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json',
        'x-github-api-version': '2022-11-28', 'user-agent': 'desk-roadmap' },
    });
  }

  async function json<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
    const response = await request(path, options, token);
    if (!response.ok) throw new Error(`GitHub ${options?.method ?? 'GET'} ${path}: HTTP ${response.status}`);
    return await response.json() as T;
  }

  async function list<T>(path: string, query = ''): Promise<T[]> {
    const result: T[] = [];
    for (let page = 1; ; page++) {
      const part = await json<T[]>(`${path}?per_page=100&page=${page}${query}`);
      result.push(...part);
      if (part.length < 100) return result;
    }
  }

  async function graph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await json<{ data?: T; errors?: unknown[] }>('/graphql', {
      method: 'POST', body: JSON.stringify({ query, variables }),
    }, roadmapToken);
    if (result.errors?.length || !result.data) throw new Error('GitHub GraphQL: Roadmap-Abfrage oder Änderung fehlgeschlagen.');
    return result.data;
  }

  async function board() {
    const result = await graph<{
      node: { number: number; owner: { login: string }; field: { id: string; options: { name: string; id: string }[] } | null } | null;
    }>('query($id:ID!){node(id:$id){... on ProjectV2{number owner{... on Organization{login}} field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}}',{id:projectId});
    const project = result.node;
    if (project?.owner.login !== 'Vemoro' || project.number !== 2 || !project.field) throw new Error('Desk Roadmap nicht verfügbar.');
    const { field } = project;
    const options = new Map(field.options.map(option => [option.name, option.id]));
    if (!options.has('Geplant') || !options.has('In Arbeit')) throw new Error('Statusoptionen der Desk Roadmap fehlen.');
    return {
      async card(number: number): Promise<Card | null> {
        type Item = { id: string; project: { id: string }; isArchived: boolean; fieldValueByName: { name: string } | null };
        let cursor: string | null = null;
        do {
          const result: { repository: { issue: { projectItems: { nodes: Item[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } } } | null } } =
            await graph('query($number:Int!,$cursor:String){repository(owner:"Vemoro",name:"desk"){issue(number:$number){projectItems(first:50,after:$cursor){nodes{id isArchived project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}} pageInfo{endCursor hasNextPage}}}}}', { number, cursor });
          const items = result.repository.issue?.projectItems;
          if (!items) return null;
          const item = items.nodes.find(candidate => candidate.project.id === projectId);
          if (item) return { id: item.id, status: item.fieldValueByName?.name ?? null, isArchived: item.isArchived };
          cursor = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null;
        } while (cursor);
        return null;
      },
      async set(card: Card, status: Status) {
        await graph('mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}', {
          project: projectId, item: card.id, field: field.id, option: options.get(status),
        });
      },
    };
  }

  async function changeAssignment(number: number, login: string, method: 'POST' | 'DELETE') {
    return await json<Issue>(`${repoPath}/issues/${number}/assignees`, {
      method, body: JSON.stringify({ assignees: [login] }),
    });
  }

  return {
    board,
    issue: (number: number) => json<Issue>(`${repoPath}/issues/${number}`),
    assignedIssues: () => list<Issue>(repoPath + '/issues', '&state=open&assignee=*'),
    pulls: () => list<{ body: string | null }>(repoPath + '/pulls', '&state=open'),
    comments: (number: number) => list<Comment>(`${repoPath}/issues/${number}/comments`),
    assignments: (number: number) => list<Assignment>(`${repoPath}/issues/${number}/events`),
    add: (number: number, login: string) => changeAssignment(number, login, 'POST'),
    remove: (number: number, login: string) => changeAssignment(number, login, 'DELETE'),
    async comment(number: number, body: string) {
      await json(`${repoPath}/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    },
    async collaborator(login: string) {
      const response = await request(`${repoPath}/collaborators/${encodeURIComponent(login)}`);
      if (response.status === 204) return true;
      if (response.status === 404) return false;
      throw new Error(`GitHub: Mitarbeitendenstatus konnte nicht geprüft werden (HTTP ${response.status}).`);
    },
  };
}
