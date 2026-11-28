import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { calendarDate, type Row } from './client';
import { Field } from './field';
import { Icon } from './icons';
import { sections, type Section } from './navigation-targets';

export type SearchTarget = {section:Section;id?:string};
type SearchItem = SearchTarget & {label:string;detail:string};

function searchItems(allowed:Section[],projects:Row[],contacts:Row[]) {
  const names=new Map(contacts.map(contact=>[contact.id,contact.name]));
  const items:SearchItem[]=allowed.map(section=>({section,label:sections[section][0],detail:'Arbeitsbereich'}));
  items.push(...projects.map(project=>({section:'projects' as const,id:project.id,label:project.name,
    detail:['Projekt',names.get(project.contact_id),project.cost_center,project.offer_ref,
      project.due && calendarDate(project.due)].filter(Boolean).join(' · ')})));
  items.push(...contacts.map(contact=>({section:'contacts' as const,id:contact.id,label:contact.name,
    detail:['Kontakt',contact.email,contact.phone].filter(Boolean).join(' · ')})));
  const counts=new Map<string,number>();
  for(const item of items) {
    const key=`${item.label}\n${item.detail}`;
    counts.set(key,(counts.get(key)??0)+1);
  }
  return items.map(item=>(counts.get(`${item.label}\n${item.detail}`)??0)>1
    ? {...item,detail:`${item.detail} · ${item.id}`} : item);
}

export function GlobalSearch({allowed,projects,contacts,stale,dismiss,select}:{
  allowed:Section[];projects:Row[];contacts:Row[];stale:boolean;dismiss:()=>void;select:(target:SearchTarget)=>void;
}) {
  const title=useId();
  const modal=useRef<HTMLDialogElement>(null);
  const search=useRef<HTMLInputElement>(null);
  const resultList=useRef<HTMLUListElement>(null);
  const [query,setQuery]=useState('');
  const term=query.trim().toLocaleLowerCase('de');
  const matches=searchItems(allowed,term?projects:[],term?contacts:[]).filter(item=>
    `${item.label} ${item.detail}`.toLocaleLowerCase('de').includes(term));
  const visible=matches.slice(0,40);

  useEffect(()=>{
    const dialog=modal.current;
    dialog?.showModal();
    search.current?.focus();
    return ()=>dialog?.close();
  },[]);

  function selectItem(target:SearchTarget) {
    modal.current?.close();
    select(target);
  }

  function handleKeys(event:KeyboardEvent<HTMLDialogElement>) {
    if(event.nativeEvent.isComposing) return;
    if(event.key==='Escape') {
      event.preventDefault();
      modal.current?.close();
      dismiss();
      return;
    }
    const buttons=Array.from(resultList.current?.querySelectorAll('button')??[]);
    const focused=event.currentTarget.ownerDocument.activeElement;
    if(event.key==='Tab') {
      const first=event.currentTarget.querySelector('button');
      const last=buttons.at(-1)??search.current;
      const boundary=event.shiftKey?first:last;
      if(focused===boundary) {event.preventDefault();(event.shiftKey?last:first)?.focus();}
      return;
    }
    if(focused===search.current && event.key==='Enter' && visible[0]) {
      event.preventDefault();
      selectItem(visible[0]);
      return;
    }
    const index=buttons.findIndex(button=>button===focused);
    if((event.key!=='ArrowDown' && event.key!=='ArrowUp') || (focused!==search.current && index<0)) return;
    const target=event.key==='ArrowDown'?buttons[index+1]:buttons[index-1]??(index===0?search.current:buttons.at(-1));
    if(!target) return;
    event.preventDefault();
    target.focus();
  }

  return <dialog ref={modal} className="global-search confirm-dialog form-dialog" aria-labelledby={title}
    onCancel={event=>{event.preventDefault();modal.current?.close();dismiss();}} onKeyDown={handleKeys}>
    <header className="form-dialog-head"><h2 id={title}>Desk durchsuchen</h2>
      <button type="button" aria-label="Suche schließen" onClick={()=>{modal.current?.close();dismiss();}}><Icon name="close"/></button>
    </header>
    <div className="dialog-content global-search-content">
      <Field label="Projekte, Kontakte und Bereiche suchen">{props=><input {...props} ref={search} type="search"
        value={query} onChange={event=>setQuery(event.target.value)}/>}</Field>
      {stale && <p role="status" className="subtle">Der angezeigte Stand konnte nicht aktualisiert werden.</p>}
      {!visible.length ? <p role="status" className="subtle">Keine passenden Treffer.</p> :
        <ul ref={resultList} className="global-search-results" aria-label="Suchtreffer">{visible.map(item=><li key={`${item.section}/${item.id??''}`}>
          <button type="button" onClick={()=>selectItem(item)}><Icon name={sections[item.section][1]}/>
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
          </button>
        </li>)}</ul>}
      {matches.length>visible.length && <p className="subtle">Verfeinere die Suche, um weitere Treffer einzugrenzen.</p>}
    </div>
  </dialog>;
}
