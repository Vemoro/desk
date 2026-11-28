import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { calendarDate, inventoryLabel, type Row } from './client';
import { Field } from './field';
import { Icon } from './icons';
import './object-choice.css';

export type ObjectOption = {value:string;label:string;detail?:string};

export function contactChoices(contacts:Row[]):ObjectOption[] {
  return contacts.map(contact=>({value:contact.id,label:contact.name,detail:[contact.email,contact.phone].filter(Boolean).join(' · ')}));
}

export function articleChoices(items:Row[]):ObjectOption[] {
  return items.map(item=>({value:item.id,label:inventoryLabel(item),detail:item.code}));
}

export function projectChoices(projects:Row[],contacts:Row[]):ObjectOption[] {
  const names=new Map(contacts.map(contact=>[contact.id,contact.name]));
  return projects.map(project=>({value:project.id,label:project.name,
    detail:[names.get(project.contact_id),project.cost_center,project.due&&calendarDate(project.due)].filter(Boolean).join(' · ')}));
}

export function ObjectChoice({label,name,value,choices,required,disabled,busy,error,hint,describedBy,emptyLabel='Ohne Auswahl',hideLabel,onChoose,onFocus,onBlur}:{
  label:string;name?:string;value:string;choices:ObjectOption[];required?:boolean;disabled?:boolean;busy?:boolean;
  error?:string;hint?:string;describedBy?:string;emptyLabel?:string;hideLabel?:boolean;
  onChoose:(value:string,input:HTMLInputElement)=>void;
  onFocus?:(event:FocusEvent<HTMLInputElement>)=>void;onBlur?:(event:FocusEvent<HTMLInputElement>)=>void;
}) {
  const [open,setOpen]=useState(false);
  const target=useRef<HTMLInputElement>(null);
  const dialogId=useId();
  const selected=choices.find(choice=>choice.value===value);
  const ambiguous=selected && choices.some(choice=>choice.value!==value && choice.label===selected.label);
  const duplicate=selected && choices.some(choice=>choice.value!==value && optionKey(choice)===optionKey(selected));
  const display=selected
    ? [selected.label,ambiguous?optionDetail(selected,!!duplicate):undefined].filter(Boolean).join(' · ')
    : value?'Auswahl nicht verfügbar':'';
  function openChoice() {
    if(!disabled && !busy) setOpen(true);
  }
  function close(next?:string) {
    setOpen(false);
    const input=target.current;
    if(!input) return;
    input.focus();
    if(next!==undefined && next!==value) onChoose(next,input);
  }

  return <>
    <Field label={label} error={error} hint={hint} describedBy={describedBy} visuallyHiddenLabel={hideLabel}>
      {props=><input {...props} className="object-choice-control" ref={target} type="text" role="combobox" name={name} value={display}
        placeholder={required?'Auswählen':emptyLabel} data-choice-value={value} readOnly disabled={disabled}
        aria-haspopup="dialog" aria-controls={open?dialogId:undefined} aria-expanded={open} aria-required={required} aria-disabled={busy||undefined}
        onClick={openChoice} onFocus={onFocus} onBlur={onBlur} onKeyDown={event=>{
          if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)) {event.preventDefault();if(!event.repeat) openChoice();}
        }}/>}
    </Field>
    {open && createPortal(<ObjectChoiceDialog id={dialogId} label={label} choices={choices} value={value}
      emptyLabel={required?undefined:emptyLabel} close={close}/>,document.body)}
  </>;
}

function ObjectChoiceDialog({id,label,choices,value,emptyLabel,close}:{
  id:string;label:string;choices:ObjectOption[];value:string;emptyLabel?:string;close:(value?:string)=>void;
}) {
  const [query,setQuery]=useState('');
  const [limit,setLimit]=useState(60);
  const modal=useRef<HTMLDialogElement>(null);
  const search=useRef<HTMLInputElement>(null);
  const results=useRef<HTMLUListElement>(null);
  const focusNext=useRef<number|null>(null);
  const options=emptyLabel?[{value:'',label:emptyLabel},...choices]:choices;
  const counts=new Map<string,number>();
  for(const item of options) counts.set(optionKey(item),(counts.get(optionKey(item))??0)+1);
  const term=query.trim().toLocaleLowerCase('de');
  const details=new Map(options.map(item=>[item.value,optionDetail(item,(counts.get(optionKey(item))??0)>1)]));
  const found=options.filter(item=>`${item.label} ${details.get(item.value)}`.toLocaleLowerCase('de').includes(term));
  const visible=found.slice(0,limit);
  useEffect(()=>{
    const dialog=modal.current;
    dialog?.showModal();
    search.current?.focus();
    return ()=>dialog?.close();
  },[]);

  useEffect(()=>{
    if(focusNext.current===null) return;
    results.current?.querySelectorAll('button')[focusNext.current]?.focus();
    focusNext.current=null;
  },[limit]);

  function dismiss(next?:string) {
    modal.current?.close();
    close(next);
  }

  function keydown(event:KeyboardEvent<HTMLDialogElement>) {
    if(event.nativeEvent.isComposing) return;
    if(event.key==='Escape') {event.preventDefault();dismiss();return;}
    if(event.key==='Tab') {
      const controls=event.currentTarget.querySelectorAll<HTMLElement>('button,input');
      const first=controls[0];
      const last=controls[controls.length-1];
      if(event.target===(event.shiftKey?first:last)) {event.preventDefault();(event.shiftKey?last:first)?.focus();}
      return;
    }
    if(event.target===search.current && event.key==='Enter') {
      event.preventDefault();
      if(!event.repeat && visible[0]) dismiss(visible[0].value);
      return;
    }
    if(event.key!=='ArrowDown' && event.key!=='ArrowUp') return;
    const buttons=Array.from(results.current?.querySelectorAll('button')??[]);
    const index=buttons.findIndex(button=>button===event.target);
    if(index<0 && event.target!==search.current) return;
    const next=event.key==='ArrowDown'?buttons[index+1]:buttons[index-1]??(index===0?search.current:buttons.at(-1));
    if(next) {event.preventDefault();next.focus();}
  }

  return <dialog ref={modal} id={id} className="confirm-dialog form-dialog object-choice-dialog" aria-labelledby={`${id}-label`}
    onCancel={event=>{event.preventDefault();dismiss();}} onKeyDown={keydown}>
    <header className="form-dialog-head"><h2 id={`${id}-label`}>{label} wählen</h2>
      <button type="button" aria-label="Auswahl schließen" onClick={()=>dismiss()}><Icon name="close"/></button></header>
    <div className="dialog-content">
      <Field label="Einträge suchen">{props=><input {...props} ref={search} type="search" value={query}
        onChange={event=>{setQuery(event.currentTarget.value);setLimit(60);}}/>}</Field>
      {!visible.length ? <p role="status" className="subtle">Keine passenden Einträge.</p> :
        <ul className="object-choice-results" aria-label="Einträge" ref={results}>{visible.map(item=><li key={item.value}>
          <button type="button" aria-current={item.value===value?'true':undefined} onClick={()=>dismiss(item.value)}>
            <strong>{item.label}</strong>
            {details.get(item.value) && <small>{details.get(item.value)}</small>}
          </button>
        </li>)}</ul>}
      {found.length>visible.length && <button type="button" onClick={()=>{focusNext.current=limit;setLimit(limit+60);}}>Weitere Einträge anzeigen</button>}
    </div>
  </dialog>;
}

function optionKey(item:ObjectOption) {return `${item.label}\n${item.detail??''}`;}

function optionDetail(item:ObjectOption,duplicate:boolean) {
  return [item.detail,duplicate?item.value:undefined].filter(Boolean).join(' · ');
}
