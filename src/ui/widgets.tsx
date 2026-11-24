import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
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

export function Panel({title,children,action,focusRef}:{title:string;children:ReactNode;action?:ReactNode;focusRef?:RefObject<HTMLElement|null>}) {
  const titleId=useId();
  return <section className="panel" ref={focusRef} tabIndex={focusRef?-1:undefined} aria-labelledby={focusRef?titleId:undefined}>
    <header className="panel-head"><h2 id={focusRef?titleId:undefined}>{title}</h2>{action}</header>{children}
  </section>;
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

export type Confirmation = {
  title:string;
  description:string;
  actionLabel:string;
  trigger:HTMLButtonElement;
  submit:()=>Promise<unknown>;
  feedback?:string;
};

export function ConfirmDialog({confirmation,run,dismiss,fallbackFocus}:{
  confirmation:Confirmation;
  run:Run;
  dismiss:()=>void;
  fallbackFocus:RefObject<HTMLElement|null>;
}) {
  const titleId=useId();
  const descriptionId=useId();
  const dialogRef=useRef<HTMLDialogElement>(null);
  const cancelRef=useRef<HTMLButtonElement>(null);
  const confirmRef=useRef<HTMLButtonElement>(null);
  const submitting=useRef(false);
  const [pending,setPending]=useState(false);
  const [problem,setProblem]=useState('');

  useEffect(()=>{
    const dialog=dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return ()=>dialog?.close();
  },[]);

  function close(confirmed=false) {
    if(submitting.current) return;
    dialogRef.current?.close();
    dismiss();
    const target=confirmed || !confirmation.trigger.isConnected ? fallbackFocus.current : confirmation.trigger;
    target?.focus();
  }

  async function confirm() {
    if(submitting.current || problem) return;
    submitting.current=true;
    setPending(true);
    cancelRef.current?.focus();
    let message='Die Aktion konnte nicht abgeschlossen werden.';
    try {
      const completed=await run(async()=>{
        try {
          await confirmation.submit();
        } catch(error) {
          if(error instanceof Error) message=error.message;
          throw error;
        }
      },confirmation.feedback);
      submitting.current=false;
      if(completed) close(true);
      else setProblem(message);
    } finally {
      submitting.current=false;
      setPending(false);
    }
  }

  return <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event)=>{event.preventDefault();close();}}
    onKeyDown={(event)=>{
      if(event.key!=='Tab') return;
      const first=cancelRef.current;
      const last=confirmRef.current;
      if(pending || problem || (event.shiftKey && document.activeElement===first) || (!event.shiftKey && document.activeElement===last)) {
        event.preventDefault();
        if(event.shiftKey && !pending && !problem) last?.focus();
        else first?.focus();
      }
    }}>
    <h2 id={titleId}>{confirmation.title}</h2>
    <p id={descriptionId}>{confirmation.description}</p>
    {problem && <p className="inline-error" role="alert">{problem}</p>}
    <div className="actions">
      <button type="button" ref={cancelRef} aria-disabled={pending || undefined} onClick={()=>close()}>{problem?'Schließen':'Abbrechen'}</button>
      <button type="button" ref={confirmRef} className="primary" onClick={()=>void confirm()} disabled={pending || Boolean(problem)}>
        {pending?'Wird ausgeführt …':confirmation.actionLabel}
      </button>
    </div>
  </dialog>;
}
