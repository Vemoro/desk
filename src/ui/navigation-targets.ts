export const sections = {
  dashboard: ['Übersicht','overview'],
  projects: ['Projekte','projects'],
  planning: ['Wochenplanung','calendar'],
  contacts: ['Kontakte','contacts'],
  warehouse: ['Projektlager','warehouse'],
  costs: ['Ist-Kosten','costs'],
  account: ['Mein Konto','account'],
  settings: ['Einstellungen','settings'],
} as const;

export type Section = keyof typeof sections;
export type Person = {id:string;name:string;role:'admin'|'member'};

export function allowedSections(role:Person['role']) {
  return (Object.keys(sections) as Section[]).filter(section=>section!=='settings'||role==='admin');
}
