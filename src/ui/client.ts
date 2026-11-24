export type Row = { id: string; [key: string]: any };

export const projectStages: Record<string,string> = {
  inquiry:'Anfrage', planning:'Planung', offered:'Angebot', confirmed:'Bestätigt',
  running:'In Durchführung', complete:'Abgerechnet', cancelled:'Abgesagt',
};
export const taskStages: Record<string,string> = {todo:'Offen',doing:'In Arbeit',review:'Prüfung',done:'Erledigt'};
export const reservationStages: Record<string,string> = {tentative:'Vorgemerkt',firm:'Fest reserviert',released:'Freigegeben'};
export const movementStages: Record<string,string> = {receive:'Wareneingang',issue:'Ausgabe',return:'Rückgabe',consume:'Verbrauch'};
export const euros = (cents:number) => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents / 100);
export const date = (value?:string) => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium'}).format(new Date(value)) : '–';
export const moment = (value?:string) => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '–';
export const name = (collection:Row[], id?:string) => collection.find((row)=>row.id===id)?.name ?? '–';

export class ApiError extends Error {
  constructor(public status:number,message:string) { super(message); }
}

export async function api<T = any>(path:string,method='GET',input?:unknown):Promise<T> {
  const response = await fetch(`/api/v1/${path}`,{
    method, headers:input === undefined ? undefined : {'Content-Type':'application/json'},
    body:input === undefined ? undefined : JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status,result.error ?? 'Die Aktion konnte nicht abgeschlossen werden.');
  return result;
}

export async function all(path:string):Promise<Row[]> {
  const result:Row[] = [];
  for(let offset=0; ; offset+=200) {
    const page=await api<Row[]>(`${path}?limit=200&offset=${offset}`);
    result.push(...page);
    if (page.length < 200) return result;
  }
}

export function money(value:string) {
  const normalized=value.trim().replace(',','.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Betrag mit höchstens zwei Nachkommastellen eingeben.');
  return Math.round(Number(normalized)*100);
}

export function compileCsv(text:string) {
  const input=text.replace(/^\uFEFF/,'').trim();
  const delimiter=input.slice(0,input.indexOf('\n')).includes(';') ? ';' : ',';
  const records:string[][]=[];
  let row:string[]=[];
  let field='';
  let quoted=false;
  for(let index=0;index<input.length;index++) {
    const char=input[index];
    if(char==='"') {
      if(quoted && input[index+1]==='"') {field+='"';index++;}
      else quoted=!quoted;
    } else if(!quoted && char===delimiter) {
      row.push(field); field='';
    } else if(!quoted && char==='\n') {
      row.push(field.replace(/\r$/,'')); records.push(row); row=[]; field='';
    } else field+=char;
  }
  if(quoted) throw new Error('Eine CSV-Zeile hat ein nicht geschlossenes Anführungszeichen.');
  row.push(field);
  records.push(row);
  const columns=records.shift() ?? [];
  for(const key of ['reference','name','amount']) {
    if(!columns.includes(key)) throw new Error('CSV benötigt die Spalten reference, name und amount. cost_center ist optional.');
  }
  return records.filter((parts)=>parts.some(Boolean)).map((parts)=>{
    const item=Object.fromEntries(columns.map((label,index)=>[label,parts[index] ?? '']));
    return {source:'haben-export',reference:item.reference,name:item.name,cents:money(item.amount),cost_center:item.cost_center ?? ''};
  });
}

export function csvText(value:string) {
  return '"'+(/^[=+\-@\t\r]/.test(value) ? "'"+value : value).replaceAll('"','""')+'"';
}

export function downloadCsv(filename:string,lines:string[]) {
  const url=URL.createObjectURL(new Blob(['\uFEFF',lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function downloadPositions(project:Row, rows:Row[]) {
  const lines=rows.map((row)=>[csvText(String(row.name)),row.quantity,(row.unit_cents/100).toFixed(2).replace('.',',')].join(';'));
  downloadCsv(`angebotspositionen-${project.id.slice(0,8)}.csv`,['Position;Menge;Einzelpreis EUR',...lines]);
}
