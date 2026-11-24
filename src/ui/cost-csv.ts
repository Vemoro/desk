import { costInput, type CostEntry } from '../server/contracts';
import { money } from './client';

export const csvCostSource='haben-export';

type RecordLine = { line:number; values:string[]; problem:string };
export type CostPreviewRow = {
  line:number;
  reference:string;
  name:string;
  problems:string[];
  entry?:CostEntry;
};

function readRecords(text:string,delimiter:string) {
  const records:RecordLine[]=[];
  let line=1;
  let startLine=1;
  let values:string[]=[];
  let field='';
  let quoted=false;
  let closedQuote=false;
  let problem='';

  function finishField() {
    values.push(field);
    field='';
    closedQuote=false;
  }

  function finishRecord() {
    finishField();
    if(problem || values.length>1 || values[0].trim()) records.push({line:startLine,values,problem});
    values=[];
    problem='';
  }

  for(let index=0;index<text.length;index++){
    const char=text[index];
    if(quoted){
      if(char==='"'){
        if(text[index+1]==='"'){field+='"';index++;}
        else {quoted=false;closedQuote=true;}
      } else {
        field+=char;
        if(char==='\n') line++;
      }
    } else if(char===delimiter){
      finishField();
    } else if(char==='\n'){
      finishRecord();
      startLine=++line;
    } else if(char==='"' && !field && !closedQuote){
      quoted=true;
    } else {
      if(char==='"' || (closedQuote && char!==' ' && char!=='\t')) problem='Ungültige Anführungszeichen.';
      field+=char;
    }
  }
  if(quoted) problem='Nicht geschlossenes Anführungszeichen.';
  finishRecord();
  return records;
}

export function parseCostCsv(text:string):CostPreviewRow[] {
  const input=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const firstLine=input.split('\n').find((line)=>line.trim()) ?? '';
  const delimiter=firstLine.replace(/"[^"]*"/g,'').includes(';')?';':',';
  const [header,...records]=readRecords(input,delimiter);
  const columns=header?.values.map((value)=>value.trim()) ?? [];
  if(!header || header.problem || columns.some((column)=>!column) || new Set(columns).size!==columns.length
    || ['reference','name','amount'].some((field)=>!columns.includes(field))) {
    throw new Error('Ungültige CSV-Kopfzeile. Erforderlich sind reference, name und amount. cost_center ist optional.');
  }

  const references=new Map<string,number>();
  const position=columns.indexOf('reference');
  for(const record of records){
    const reference=record.values[position]?.trim();
    if(reference && !record.problem) references.set(reference,(references.get(reference) ?? 0)+1);
  }

  return records.map((record)=>{
    const row=Object.fromEntries(columns.map((column,index)=>[column,record.values[index]?.trim() ?? '']));
    const problems:string[]=[];
    if(record.problem) problems.push(`CSV: ${record.problem}`);
    if(record.values.length>columns.length) problems.push('CSV: Mehr Felder als in der Kopfzeile.');
    if((references.get(row.reference) ?? 0)>1) problems.push('reference: Doppelte Belegreferenz.');
    let cents:number|undefined;
    try { cents=money(row.amount); }
    catch { problems.push('amount: Betrag mit höchstens zwei Nachkommastellen eingeben.'); }
    const parsed=costInput.safeParse({source:csvCostSource,reference:row.reference,name:row.name,cost_center:row.cost_center ?? '',cents});
    if(!parsed.success){
      for(const issue of parsed.error.issues){
        const field=issue.path[0];
        if(field==='cents'){
          if(cents!==undefined) problems.push('amount: Betrag liegt außerhalb des zulässigen Bereichs.');
        } else if(field==='cost_center'){
          problems.push('cost_center: Höchstens 250 Zeichen eingeben.');
        } else {
          problems.push(`${String(field)}: Zwischen 1 und 160 Zeichen eingeben.`);
        }
      }
    }
    return {
      line:record.line,reference:row.reference,name:row.name,problems,
      entry:parsed.success && !problems.length ? parsed.data : undefined,
    };
  });
}
