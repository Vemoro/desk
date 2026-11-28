import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from './client';
import { Field, fieldError, invalidFormFields } from './field';
import { ObjectChoice, type ObjectOption } from './object-choice';

type FormFieldDefinition = {
  name:string; label:string; type?:string; placeholder?:string; value?:string|number;
  required?:boolean; choices?:{value:string;label:string}[]; min?:number; max?:number; autoComplete?:string; onChange?:(value:string)=>void; describedBy?:string;
  minLength?:number; maxLength?:number; hint?:string; validate?:(value:string)=>string|undefined;
  searchChoices?:ObjectOption[]; emptyChoiceLabel?:string;
};

type Fields = Record<string,string>;
type Attempt = {key:string; values:Fields; prepared?:Fields};
type ClearedAttempt = {storageKey:string; key:string};
type FormControl = HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
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

function FormField({field,disabled,error,recheck,choiceValue,setChoice}:{
  field:FormFieldDefinition; disabled:boolean; error?:string;
  recheck:(control:FormControl,selected?:string)=>void;choiceValue?:string;setChoice:(value:string)=>void;
}) {
  if(field.searchChoices) return <ObjectChoice label={field.label} name={field.name} value={choiceValue??''}
    required={field.required} disabled={disabled} choices={field.searchChoices} error={error} hint={field.hint}
    emptyLabel={field.emptyChoiceLabel} describedBy={field.describedBy} onChoose={(value,input)=>{setChoice(value);recheck(input,value);}}/>;
  return <Field label={field.label} describedBy={field.describedBy} hint={field.hint} error={error} className={field.type==='textarea'?'wide':undefined}>
    {labels=>{
      const common={...labels,name:field.name,disabled,required:field.required};
      if(field.choices) return <select {...common} value={field.onChange ? field.value ?? '' : undefined}
        defaultValue={field.onChange ? undefined : field.value ?? ''} onChange={event=>{
          field.onChange?.(event.currentTarget.value);
          recheck(event.currentTarget);
        }}>
        <option value="">Auswählen</option>
        {field.choices.map(choice=><option value={choice.value} key={choice.value}>{choice.label}</option>)}
      </select>;
      if(field.type==='textarea') return <textarea {...common} defaultValue={field.value}
        minLength={field.minLength} maxLength={field.maxLength} placeholder={field.placeholder} onChange={event=>recheck(event.currentTarget)}/>;
      return <input {...common} type={field.type ?? 'text'} defaultValue={field.value} placeholder={field.placeholder}
        min={field.min} max={field.max} minLength={field.minLength} maxLength={field.maxLength}
        autoComplete={field.autoComplete} onChange={event=>recheck(event.currentTarget)}/>;
    }}
  </Field>;
}

function useFormAttempt(storageKey:string|undefined,fields:FormFieldDefinition[],saveChoice:(name:string,value:string)=>void) {
  const [pending,setPending]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  const attempt=useRef<Attempt|undefined>(undefined);

  const restoreFields=useEffectEvent((values:Fields)=>{
    for(const [name,value] of Object.entries(values)){
      const definition=fields.find((field)=>field.name===name);
      if(definition?.searchChoices) {
        saveChoice(name,value);
        continue;
      }
      const onChange=definition?.onChange;
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


  return {pending,setPending,formRef,attempt,clearAttempt};
}

function formValues(form:HTMLFormElement) {
  const values=Object.fromEntries(Array.from(new FormData(form),([key,value])=>[key,String(value)]));
  for(const input of form.querySelectorAll<HTMLInputElement>('input[data-choice-value]')) {
    if(input.name && Object.hasOwn(values,input.name)) values[input.name]=input.dataset.choiceValue??'';
  }
  return values;
}

function validateFormControl(control:FormControl,definition:FormFieldDefinition|undefined,selected?:string) {
  if(!definition?.searchChoices) return fieldError(control) ?? definition?.validate?.(control.value);
  if(control.disabled) return undefined;
  const value=selected??control.dataset.choiceValue??'';
  if(definition.required && !value) return 'Wähle einen Eintrag.';
  return definition.validate?.(value);
}

export function Form({fields,caption,submit,children,className='form-grid',retryScope,prepare,retryNote,busyCaption='Wird gespeichert …',disabled=false}:{
  fields:FormFieldDefinition[]; caption:string; submit:(values:Fields,requestKey?:string)=>Promise<unknown>;
  children?:ReactNode; className?:string; retryScope?:string; prepare?:(values:Fields)=>Fields; retryNote?:string; busyCaption?:string; disabled?:boolean;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [choices,setChoices]=useState<Fields>({});
  const submitting=useRef(false);
  const storageKey=retryScope && `desk-pending-write:${retryScope}`;
  function saveChoice(name:string,value:string) {
    setChoices(current=>({...current,[name]:value}));
  }
  const {pending,setPending,formRef,attempt,clearAttempt}=useFormAttempt(storageKey,fields,saveChoice);
  const fieldsLocked=disabled || Boolean(storageKey && (busy || pending));
  function validateField(control:FormControl,selected?:string) {
    return validateFormControl(control,fields.find(field=>field.name===control.name),selected);
  }

  async function onSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(disabled || submitting.current) return;
    const {errors,first}=invalidFormFields(event.currentTarget,validateField);
    setFieldErrors(errors);
    if(first) {
      setError('');
      first.focus();
      return;
    }
    const values=formValues(event.currentTarget);
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
  function recheck(control:FormControl,selected?:string) {
    if(!Object.hasOwn(fieldErrors,control.name)) return;
    const error=validateField(control,selected);
    setFieldErrors(current=>{
      const next={...current};
      if(error) next[control.name]=error;
      else delete next[control.name];
      return next;
    });
  }
  return <form ref={formRef} className={className} onSubmit={onSubmit} noValidate>
    {fields.map(field=><FormField key={field.name} field={field} disabled={fieldsLocked} error={fieldErrors[field.name]}
      recheck={recheck} choiceValue={choices[field.name]??String(field.value??'')} setChoice={value=>saveChoice(field.name,value)}/>)}
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
