import { createContext, useContext, useEffect, useEffectEvent, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ApiError, type Row } from './client';

export const noWrite = Symbol('noWrite');

type RunOptions = { kind?:'read'|'write'; reportWriteRejection?:boolean; reportInlineError?:boolean };
export type Run = (operation:(isCurrent:()=>boolean)=>Promise<unknown>, feedback?:string, options?:RunOptions)=>Promise<boolean>;
type Field = {
  name:string; label:string; type?:string; placeholder?:string; value?:string|number;
  required?:boolean; choices?:{value:string;label:string}[]; min?:number; max?:number; autoComplete?:string; onChange?:(value:string)=>void; describedBy?:string;
};

export function options(records:Row[], label:(record:Row)=>string = record=>record.name ?? record.label ?? record.id) {
  return records.map(record=>({value:record.id,label:label(record)}));
}

type Fields = Record<string,string>;
type Attempt = {key:string; values:Fields; prepared?:Fields};
type ClearedAttempt = {storageKey:string; key:string};
const attemptCleared='desk-write-attempt-cleared';

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

export function hasPendingWrite(scope:string) {
  return Boolean(storedAttempt(`desk-pending-write:${scope}`));
}

export function Form({fields,caption,submit,children,className='form-grid',retryScope,prepare,retryNote,busyCaption='Wird gespeichert …',disabled=false}:{
  fields:Field[]; caption:string; submit:(values:Fields,requestKey?:string)=>Promise<unknown>;
  children?:ReactNode; className?:string; retryScope?:string; prepare?:(values:Fields)=>Fields; retryNote?:string; busyCaption?:string; disabled?:boolean;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  const attempt=useRef<Attempt|undefined>(undefined);
  const submitting=useRef(false);
  const storageKey=retryScope && `desk-pending-write:${retryScope}`;
  const fieldsLocked=disabled || Boolean(storageKey && (busy || pending));

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
    if(!storageKey) return;
    function reflectClearedAttempt(event:Event){
      const cleared=(event as CustomEvent<ClearedAttempt>).detail;
      if(cleared.storageKey!==storageKey || cleared.key!==attempt.current?.key) return;
      attempt.current=undefined;
      setPending(false);
    }
    window.addEventListener(attemptCleared,reflectClearedAttempt);
    return ()=>window.removeEventListener(attemptCleared,reflectClearedAttempt);
  },[storageKey]);

  function clearAttempt(key:string){
    if(storageKey && storedAttempt(storageKey)?.key===key){
      try {
        sessionStorage.removeItem(storageKey);
        window.dispatchEvent(new CustomEvent<ClearedAttempt>(attemptCleared,{detail:{storageKey,key}}));
      } catch {}
    }
    if(attempt.current?.key===key) {
      attempt.current=undefined;
      setPending(false);
    }
  }

  async function onSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(disabled) return;
    const values=Object.fromEntries(Array.from(new FormData(event.currentTarget),([key,value])=>[key,String(value)]));
    if(attempt.current && JSON.stringify(attempt.current.values)!==JSON.stringify(values)) {
      setError('Sende die bisherigen Angaben erneut oder beginne einen neuen Vorgang.');
      return;
    }
    await send(values);
  }

  async function send(values:Fields) {
    if(submitting.current) return;
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
          placeholder={field.placeholder} min={field.min} max={field.max} autoComplete={field.autoComplete} aria-describedby={field.describedBy}/>}
    </label>)}
    {children}
    {error && <p role="alert" className="inline-error wide">{error}</p>}
    {pending && <div className="wide">
      <p role="status">Der letzte Vorgang kann bereits gespeichert sein. Sende dieselben Angaben erneut, um ihn zu prüfen.{retryNote && <> {retryNote}</>}</p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={()=>{if(attempt.current) void send(attempt.current.values);}}>
          Letzten Vorgang erneut senden
        </button>
        <button type="button" disabled={busy} onClick={()=>{if(attempt.current) clearAttempt(attempt.current.key);setError('');}}>
          Neuen Vorgang beginnen
        </button>
      </div>
    </div>}
    <div className="form-action"><button className="primary" disabled={busy || fieldsLocked}>{busy?busyCaption:caption}</button></div>
  </form>;
}

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
    {children(save)}
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

export function Expand({title,children}:{title:string;children:ReactNode}) {
  return <details className="expand"><summary>{title}</summary><div className="expand-body">{children}</div></details>;
}

export function Table({headers,rows,hidden}:{headers:string[];rows:{key:string;cells:ReactNode[];hidden?:boolean}[];hidden?:boolean}) {
  if (!rows.length) return <p className="empty">Noch keine Einträge.</p>;
  return <div className="table-wrap" hidden={hidden}><table><thead><tr>{headers.map((header)=><th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows.map((row)=><tr key={row.key} hidden={row.hidden}>{row.cells.map((cell,index)=><td key={index} data-label={headers[index]}><div>{cell}</div></td>)}</tr>)}</tbody>
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
    <h2 id={titleId}>{confirmation.title}</h2>
    <p id={descriptionId}>{confirmation.description}</p>
    {message && <p className="inline-error" role="alert">{message}</p>}
    <div className="actions">
      <button type="button" ref={cancelRef} aria-disabled={pending || undefined} onClick={()=>close()}>{message?'Schließen':'Abbrechen'}</button>
      <button type="button" ref={confirmRef} className="primary" onClick={confirm} disabled={Boolean(request || problem)}>
        {pending?'Wird ausgeführt …':confirmation.actionLabel}
      </button>
    </div>
  </dialog>;
}
