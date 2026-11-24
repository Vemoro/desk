export const projectViews = {
  overview:'Überblick',
  tasks:'Kanban',
  planning:'Ressourcen & Kalkulation',
  finance:'Controlling',
  communication:'Kommunikation',
} as const;

export type ProjectView=keyof typeof projectViews;

export function projectView(value:string|undefined):ProjectView {
  return value && Object.hasOwn(projectViews,value) ? value as ProjectView : 'overview';
}

export function projectHash(id:string, view:ProjectView='overview') {
  return view==='overview' ? `#projects/${id}` : `#projects/${id}/${view}`;
}
