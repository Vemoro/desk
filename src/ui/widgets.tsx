import { useState, type FormEvent, type ReactNode } from 'react';
import type { Row } from './client';

export type Run = (operation:()=>Promise<unknown>, feedback?:string, kind?:'read'|'write')=>Promise<boolean>;
type Field = {
  name:string; label:string; type?:string; placeholder?:string; value?:string|number;
  required?:boolean; choices?:{value:string;label:string}[]; min?:number; max?:number; autoComplete?:string;
};

export function options(records:Row[]) {
  return records.map((record)=>({value:record.id,label:record.name ?? record.label ?? record.id}));
}

export function Form({fields,caption,submit,children,className='form-grid'}:{
  fields:Field[]; caption:string; submit:(values:Record<string,string>)=>Promise<unknown>; children?:ReactNode; className?:string;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function onSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form=event.currentTarget;
    const values=Object.fromEntries(Array.from(new FormData(form),([key,value])=>[key,String(value)]));
    setBusy(true);
    try { await submit(values); }
    catch(error) { setError(error instanceof Error ? error.message : 'Die Eingabe konnte nicht gespeichert werden.'); }
    finally { setBusy(false); }
  }
  return <form className={className} onSubmit={onSubmit}>
    {fields.map((field)=><label key={field.name} className={field.type==='textarea'?'wide':''}>
      <span>{field.label}</span>
      {field.choices ? <select name={field.name} defaultValue={field.value ?? ''} required={field.required}><option value="">Auswählen</option>
        {field.choices.map((choice)=><option value={choice.value} key={choice.value}>{choice.label}</option>)}</select>
      : field.type==='textarea' ? <textarea name={field.name} defaultValue={field.value} required={field.required} placeholder={field.placeholder}/>
      : <input name={field.name} type={field.type ?? 'text'} defaultValue={field.value} required={field.required}
          placeholder={field.placeholder} min={field.min} max={field.max} autoComplete={field.autoComplete}/>}
    </label>)}
    {children}
    {error && <p role="alert" className="inline-error wide">{error}</p>}
    <div className="form-action"><button className="primary" disabled={busy}>{busy?'Wird gespeichert …':caption}</button></div>
  </form>;
}

export function Panel({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}) {
  return <section className="panel"><header className="panel-head"><h2>{title}</h2>{action}</header>{children}</section>;
}

export function Expand({title,children}:{title:string;children:ReactNode}) {
  return <details className="expand"><summary>{title}</summary><div className="expand-body">{children}</div></details>;
}

export function Table({headers,rows}:{headers:string[];rows:{key:string;cells:ReactNode[]}[]}) {
  if (!rows.length) return <p className="empty">Noch keine Einträge.</p>;
  return <div className="table-wrap"><table><thead><tr>{headers.map((header)=><th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows.map((row)=><tr key={row.key}>{row.cells.map((cell,index)=><td key={index} data-label={headers[index]}><div>{cell}</div></td>)}</tr>)}</tbody>
  </table></div>;
}

export function Pill({label,tone='neutral'}:{label:string;tone?:string}) {
  return <span className={`pill ${tone}`}>{label}</span>;
}
