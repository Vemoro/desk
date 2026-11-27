export type Row = { id: string; [key: string]: any };

export const projectStages: Record<string,string> = {
  inquiry:'Anfrage', planning:'Planung', offered:'Angebot', confirmed:'Bestätigt',
  running:'In Durchführung', complete:'Abgerechnet', cancelled:'Abgesagt',
};
export const taskStages: Record<string,string> = {todo:'Offen',doing:'In Arbeit',review:'Prüfung',done:'Erledigt'};
export const reservationStages: Record<string,string> = {tentative:'Vorgemerkt',firm:'Fest reserviert',released:'Freigegeben'};
export const movementStages: Record<string,string> = {
  receive:'Wareneingang',issue:'Ausgabe',return:'Rückgabe',consume:'Verbrauch',
  correct_receive:'Korrektur Wareneingang',correct_consume:'Korrektur Verbrauch',
};
export const euros = (cents:number) => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents / 100);
export const date = (value?:string) => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium'}).format(new Date(value)) : '–';
export const calendarDate = (value?:string|null) => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)) : '–';
export const moment = (value?:string) => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '–';
export const name = (collection:Row[], id?:string) => collection.find((row)=>row.id===id)?.name ?? '–';

export function inventoryLabel(item:Row):string {
  const articleName=item.name ?? '–';
  return item.inventory_number ? `${articleName} (${item.inventory_number})` : articleName;
}

export function inventoryName(items:Row[], id:string) {
  const item=items.find(row=>row.id===id);
  return item ? inventoryLabel(item) : '–';
}

export class ApiError extends Error {
  constructor(public status:number,message:string,public code?:string) { super(message); }
}

export async function api<T = any>(path:string,method='GET',input?:unknown,requestKey?:string):Promise<T> {
  const headers=new Headers();
  if(input!==undefined) headers.set('Content-Type','application/json');
  if(requestKey!==undefined) headers.set('Idempotency-Key',requestKey);
  const response = await fetch(`/api/v1/${path}`,{
    method, headers,
    body:input === undefined ? undefined : JSON.stringify(input),
  });
  let result:unknown;
  try {
    result=await response.json();
  } catch {
    if(response.ok) throw new Error('Desk hat keine gültige JSON-Antwort erhalten.');
  }
  if(!response.ok) {
    const problem=result && typeof result==='object' ? result as Record<string,unknown> : undefined;
    const message=problem?.error;
    const code=typeof problem?.code==='string' ? problem.code : undefined;
    throw new ApiError(response.status,typeof message==='string' && message.trim()
      ? message : `Die Aktion konnte nicht abgeschlossen werden (HTTP ${response.status}).`,code);
  }
  return result as T;
}

export async function all<T extends Row=Row>(path:string):Promise<T[]> {
  const result:T[] = [];
  const separator=path.includes('?')?'&':'?';
  for(let offset=0; ; offset+=200) {
    const page=await api<T[]>(`${path}${separator}limit=200&offset=${offset}`);
    result.push(...page);
    if (page.length < 200) return result;
  }
}

export function money(value:string) {
  const normalized=value.trim().replace(',','.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Betrag mit höchstens zwei Nachkommastellen eingeben.');
  return Math.round(Number(normalized)*100);
}

export type OfferPosition = { name:string; quantity:number; unit_cents:number };

export function downloadPositions(project:Pick<Row,'id'>, rows:OfferPosition[]) {
  const encode=(value:unknown)=>{
    const string=String(value);
    return '"'+(/^[=+\-@\t\r]/.test(string) ? "'"+string : string).replaceAll('"','""')+'"';
  };
  const csv=['Position;Menge;Einzelpreis EUR',...rows.map((row)=>[encode(row.name), row.quantity, (row.unit_cents/100).toFixed(2).replace('.',',')].join(';'))].join('\r\n');
  downloadBlob(`angebotspositionen-${project.id.slice(0,8)}.csv`,new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
}

export function downloadBlob(filename:string,blob:Blob) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
