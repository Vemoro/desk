import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type Row } from './client';

type RunOptions = { kind?:'read'|'write'; reportWriteRejection?:boolean };
export type Run = (operation:()=>Promise<unknown>, feedback?:string, options?:RunOptions)=>Promise<boolean>;
type Field = {
  name:string; label:string; type?:string; placeholder?:string; value?:string|number;
  required?:boolean; choices?:{value:string;label:string}[]; min?:number; max?:number; autoComplete?:string; onChange?:(value:string)=>void; describedBy?:string;
};

export function options(records:Row[]) {
  return records.map((record)=>({value:record.id,label:record.name ?? record.label ?? record.id}));
}

type Fields = Record<string,string>;
type Attempt = {key:string; values:Fields; prepared?:Fields};

function isFields(value:unknown): value is Fields {
  return Boolean(value && typeof value==='object' && !Array.isArray(value) &&
    Object.values(value).every(field=>typeof field==='string'));
}

function storedAttempt(storageKey:string): Attempt | undefined {
  try {
    const value=JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if(typeof value?.key==='string' && isFields(value.values) &&
      (value.prepared===undefined || isFields(value.prepared))) return value;
  } catch {}
}

export function Form({fields,caption,submit,children,className='form-grid',retryScope,prepare}:{
  fields:Field[]; caption:string; submit:(values:Fields,requestKey?:string)=>Promise<unknown>;
  children?:ReactNode; className?:string; retryScope?:string; prepare?:(values:Fields)=>Fields;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  const attempt=useRef<Attempt|undefined>(undefined);
  const submitting=useRef(false);
  const storageKey=retryScope && `desk-pending-write:${retryScope}`;
  const fieldsLocked=Boolean(storageKey && (busy || pending));

  const restoreFields=useEffectEvent((values:Fields)=>{
    for(const [name,value] of Object.entries(values)){
      const onChange=fields.find((field)=>field.name===name)?.onChange;
      if(onChange){
        onChange(value);
        continue;
      }
      const field=formRef.current?.elements.namedItem(name);
      if(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement){
        field.value=value;
      }
    }
  });

  useEffect(()=>{
    attempt.current=storageKey ? storedAttempt(storageKey) : undefined;
    setPending(Boolean(attempt.current));
    if(attempt.current) restoreFields(attempt.current.values);
  },[storageKey]);

  function clearAttempt(key:string){
    if(storageKey && storedAttempt(storageKey)?.key===key){
      try { sessionStorage.removeItem(storageKey); } catch {}
    }
    if(attempt.current?.key===key) {
      attempt.current=undefined;
      setPending(false);
    }
  }

  async function onSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values=Object.fromEntries(Array.from(new FormData(event.currentTarget),([key,value])=>[key,String(value)]));
    if(attempt.current && JSON.stringify(attempt.current.values)!==JSON.stringify(values)) {
      setError('Sende die bisherigen Angaben erneut oder beginne einen neuen Vorgang.');
      return;
    }
    await send(values);
  }

  async function send(values:Fields) {
    if(storageKey && submitting.current) return;
    setError('');
    const retrying=Boolean(attempt.current);
    let key:string|undefined;
    submitting.current=true;
    setBusy(true);
    try {
      if(storageKey && !attempt.current) {
        attempt.current={key:crypto.randomUUID(),values,prepared:prepare?.(values)};
        try { sessionStorage.setItem(storageKey,JSON.stringify(attempt.current)); } catch {}
      }
      key=attempt.current?.key;
      const result=await submit(attempt.current?.prepared ?? values,key);
      if(key && result===true) clearAttempt(key);
      else if(key) setPending(true);
    }
    catch(error) {
      if(key && !retrying && error instanceof ApiError && [400,409].includes(error.status)) clearAttempt(key);
      else if(key) setPending(true);
      setError(error instanceof Error ? error.message : 'Die Eingabe konnte nicht gespeichert werden.');
    }
    finally {
      submitting.current=false;
      setBusy(false);
    }
  }
  return <form ref={formRef} className={className} onSubmit={onSubmit}>
    {fields.map((field)=><label key={field.name} className={field.type==='textarea'?'wide':''}>
      <span>{field.label}</span>
      {field.choices ? <select name={field.name} value={field.onChange ? field.value ?? '' : undefined} defaultValue={field.onChange ? undefined : field.value ?? ''}
        disabled={fieldsLocked} required={field.required} aria-describedby={field.describedBy} onChange={(event)=>field.onChange?.(event.target.value)}><option value="">Auswählen</option>
        {field.choices.map((choice)=><option value={choice.value} key={choice.value}>{choice.label}</option>)}</select>
      : field.type==='textarea' ? <textarea name={field.name} defaultValue={field.value} disabled={fieldsLocked} required={field.required} placeholder={field.placeholder}/>
      : <input name={field.name} type={field.type ?? 'text'} defaultValue={field.value} disabled={fieldsLocked} required={field.required}
          placeholder={field.placeholder} min={field.min} max={field.max} autoComplete={field.autoComplete}/>}
    </label>)}
    {children}
    {error && <p role="alert" className="inline-error wide">{error}</p>}
    {pending && <div className="wide">
      <p role="status">Der letzte Vorgang kann bereits gespeichert sein. Sende dieselben Angaben erneut, um ihn zu prüfen.</p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={()=>{if(attempt.current) void send(attempt.current.values);}}>
          Letzten Vorgang erneut senden
        </button>
        <button type="button" disabled={busy} onClick={()=>{if(attempt.current) clearAttempt(attempt.current.key);setError('');}}>
          Neuen Vorgang beginnen
        </button>
      </div>
    </div>}
    <div className="form-action"><button className="primary" disabled={busy || fieldsLocked}>{busy?'Wird gespeichert …':caption}</button></div>
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
