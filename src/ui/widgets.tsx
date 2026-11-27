import { createContext, useContext, useEffect, useEffectEvent, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Row } from './client';

export const noWrite = Symbol('noWrite');

type RunOptions = { kind?:'read'|'write'; reportWriteRejection?:boolean; reportInlineError?:boolean };
export type Run = (operation:(isCurrent:()=>boolean)=>Promise<unknown>, feedback?:string, options?:RunOptions)=>Promise<boolean>;
export function options(records:Row[], label:(record:Row)=>string = record=>record.name ?? record.label ?? record.id) {
  return records.map(record=>({value:record.id,label:label(record)}));
}

export { Form, hasPendingWrite } from './form';

export function FormDialog({title,trigger,dismiss,children}:{
  title:string; trigger:HTMLButtonElement; dismiss:()=>void;
  children:(save:(action:()=>Promise<boolean>)=>Promise<boolean>)=>ReactNode;
}) {
  const titleId=useId();
  const dialog=useRef<HTMLDialogElement>(null);
  const busy=useRef(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    element?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return ()=>element?.close();
  },[]);

  function close() {
    dialog.current?.close();
    dismiss();
    if(trigger.isConnected) trigger.focus();
  }

  useEffect(()=>{
    if(saving) dialog.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  },[saving]);

  async function save(action:()=>Promise<boolean>) {
    if(busy.current) return false;
    busy.current=true;
    setSaving(true);
    try {
      const saved=await action();
      if(saved && dialog.current) close();
      return saved;
    } finally {
      busy.current=false;
      setSaving(false);
    }
  }

  return <dialog ref={dialog} className="confirm-dialog form-dialog" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();if(!busy.current) close();}}
    onKeyDown={event=>{
      if(event.key!=='Tab') return;
      const fields=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)');
      const first=fields[0];
      const last=fields[fields.length-1];
      const current=document.activeElement;
      if(!Array.from(fields).some(field=>field===current)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        return;
      }
      if(event.shiftKey && current===first) {
        event.preventDefault();
        last?.focus();
      } else if(!event.shiftKey && current===last) {
        event.preventDefault();
        first?.focus();
      }
    }}>
    <header className="form-dialog-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" disabled={saving} onClick={close}>Schließen</button>
    </header>
    <div className="dialog-content">{children(save)}</div>
  </dialog>;
}

export function Panel({title,subtitle,headingIcon,children,action,focusRef}:{title:string;subtitle?:string;headingIcon?:ReactNode;children:ReactNode;action?:ReactNode;focusRef?:RefObject<HTMLElement|null>}) {
  const titleId=useId();
  return <section className="panel" ref={focusRef} tabIndex={focusRef?-1:undefined} aria-labelledby={focusRef?titleId:undefined}>
    <header className="panel-head">
      {subtitle ? <div className="panel-heading">{headingIcon}<h2 id={focusRef?titleId:undefined} title={title}>{title}</h2><p className="subtle">{subtitle}</p></div>
        : <h2 id={focusRef?titleId:undefined}>{title}</h2>}
      {action}
    </header>{children}
  </section>;
}

export function Expand({title,children,detailsRef}:{title:string;children:ReactNode;detailsRef?:RefObject<HTMLDetailsElement|null>}) {
  return <details className="expand" ref={detailsRef}><summary>{title}</summary><div className="expand-body">{children}</div></details>;
}

export function Table({headers,rows,hidden,numeric=[]}:{
  headers:string[]; rows:{key:string;cells:ReactNode[];hidden?:boolean}[]; hidden?:boolean; numeric?:number[];
}) {
  if (!rows.length) return <p className="empty">Noch keine Einträge.</p>;
  return <div className="table-wrap" hidden={hidden}><table role="table"><thead role="rowgroup"><tr role="row">
    {headers.map((header,index)=><th key={header} scope="col" role="columnheader" data-numeric={numeric.includes(index)||undefined}>{header}</th>)}
  </tr></thead><tbody role="rowgroup">{rows.map((row)=><tr key={row.key} role="row" hidden={row.hidden}>
    {row.cells.map((cell,index)=><td key={index} role="cell" data-label={headers[index]} data-numeric={numeric.includes(index)||undefined}><div>{cell}</div></td>)}
  </tr>)}</tbody>
  </table></div>;
}

export function Pill({label,tone='neutral'}:{label:string;tone?:string}) {
  return <span className={`pill ${tone}`}>{label}</span>;
}

export const ConfirmationRequests = createContext(new Map<string,Promise<boolean>>());
const alreadyRunning = 'Diese Aktion läuft bereits.';

export type Confirmation = {
  actionKey:string;
  title:string;
  description:string;
  actionLabel:string;
  danger?:boolean;
  trigger:HTMLButtonElement;
  submit:(isCurrent:()=>boolean)=>Promise<unknown>;
  feedback?:string;
};

export function ConfirmDialog({confirmation,run,dismiss,fallbackFocus}:{
  confirmation:Confirmation;
  run:Run;
  dismiss:(confirmed:boolean)=>void;
  fallbackFocus:RefObject<HTMLElement|null>;
}) {
  const titleId=useId();
  const descriptionId=useId();
  const dialogRef=useRef<HTMLDialogElement>(null);
  const cancelRef=useRef<HTMLButtonElement>(null);
  const confirmRef=useRef<HTMLButtonElement>(null);
  const submitting=useRef(false);
  const requests=useContext(ConfirmationRequests);
  const [request,setRequest]=useState(()=>requests.get(confirmation.actionKey));
  const [problem,setProblem]=useState('');
  const pending=Boolean(request) && submitting.current;
  const message=problem || (request && !pending ? alreadyRunning : '');

  useEffect(()=>{
    const dialog=dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return ()=>dialog?.close();
  },[]);

  function close(confirmed=false) {
    if(submitting.current) return;
    dialogRef.current?.close();
    dismiss(confirmed);
    const target=confirmed || !confirmation.trigger.isConnected ? fallbackFocus.current : confirmation.trigger;
    target?.focus();
  }

  const finish=useEffectEvent((completed:boolean,problem='')=>{
    submitting.current=false;
    setRequest(undefined);
    if(completed) close(true);
    else setProblem(problem);
  });

  useEffect(()=>{
    if(!request) return;
    let observing=true;
    void request.then(
      completed=>{if(observing) finish(completed);},
      (error:unknown)=>{
        if(observing) finish(false,error instanceof Error ? error.message : 'Die Aktion konnte nicht abgeschlossen werden.');
      },
    );
    return ()=>{observing=false;};
  },[request]);

  function confirm() {
    if(request || problem) return;
    const key=confirmation.actionKey;
    const inFlight=requests.get(key);
    if(inFlight) {
      setRequest(inFlight);
      return;
    }
    submitting.current=true;
    const result=run(confirmation.submit,confirmation.feedback,{reportInlineError:true});
    requests.set(key,result);
    const clear=()=>{requests.delete(key);};
    void result.then(clear,clear);
    setRequest(result);
    cancelRef.current?.focus();
  }

  return <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event)=>{event.preventDefault();close();}}
    onKeyDown={(event)=>{
      if(event.key!=='Tab') return;
      const first=cancelRef.current;
      const last=confirmRef.current;
      if(request || problem || (event.shiftKey && document.activeElement===first) || (!event.shiftKey && document.activeElement===last)) {
        event.preventDefault();
        if(event.shiftKey && !request && !problem) last?.focus();
        else first?.focus();
      }
    }}>
    <header className="confirm-dialog-title"><h2 id={titleId}>{confirmation.title}</h2></header>
    <div className="dialog-content">
      <p id={descriptionId}>{confirmation.description}</p>
      {message && <p className="inline-error" role="alert">{message}</p>}
      <div className="actions">
        <button type="button" ref={cancelRef} aria-disabled={pending || undefined} onClick={()=>close()}>{message?'Schließen':'Abbrechen'}</button>
        <button type="button" ref={confirmRef} className={confirmation.danger?'primary destructive':'primary'} onClick={confirm} disabled={Boolean(request || problem)}>
          {pending?'Wird ausgeführt …':confirmation.actionLabel}
        </button>
      </div>
    </div>
  </dialog>;
}
