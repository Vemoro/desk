import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export const sections = {
  dashboard: ['Übersicht','overview'],
  projects: ['Projekte','projects'],
  planning: ['Wochenplanung','calendar'],
  contacts: ['Kontakte','contacts'],
  warehouse: ['Projektlager','warehouse'],
  costs: ['Ist-Kosten','costs'],
  account: ['Mein Konto','account'],
  settings: ['Einstellungen','settings'],
} as const;

export type Section = keyof typeof sections;
export type Person = { id:string; name:string; role:'admin'|'member' };

export function Navigation({person, section, themeButton, onNavigate, onLogout}:{
  person:Person; section:Section; themeButton:ReactNode;
  onNavigate:(section:Section)=>void; onLogout:()=>Promise<void>;
}) {
  const [open,setOpen]=useState(false);
  const toggle=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if (!open) return;
    function onEscape(event:KeyboardEvent) {
      if(event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    }
    window.addEventListener('keydown',onEscape);
    return ()=>window.removeEventListener('keydown',onEscape);
  },[open]);

  useEffect(()=>{
    const mobile=window.matchMedia('(max-width: 700px)');
    // When CSS hides a focused control, the browser may move focus to body before the media event.
    let lastFocused=document.activeElement;
    let wasMobile=mobile.matches;
    function recordFocus(event:FocusEvent) {
      if(event.target instanceof Element) lastFocused=event.target;
    }
    function clearFocus() {
      if(mobile.matches===wasMobile) lastFocused=null;
    }
    function onViewport(event:MediaQueryListEvent) {
      wasMobile=event.matches;
      const focused=document.activeElement===document.body ? lastFocused : document.activeElement;
      if(event.matches) {
        if(panel.current?.contains(focused)) toggle.current?.focus();
        return;
      }
      setOpen(false);
      if(focused===toggle.current) panel.current?.querySelector<HTMLButtonElement>('nav [aria-current="page"]')?.focus();
    }
    mobile.addEventListener('change',onViewport);
    document.addEventListener('focusin',recordFocus);
    document.addEventListener('focusout',clearFocus);
    return ()=>{
      mobile.removeEventListener('change',onViewport);
      document.removeEventListener('focusin',recordFocus);
      document.removeEventListener('focusout',clearFocus);
    };
  },[]);

  function choose(next:Section) {
    onNavigate(next);
    if (!open) return;
    setOpen(false);
    document.getElementById('desk-main')?.focus();
  }

  return <aside className="sidebar" data-menu-open={open || undefined}>
    <div className="sidebar-bar">
      <div className="brand"><img className="mark" src="/desk-bildmarke.svg" alt=""/><strong>Desk</strong></div>
      <button className="sidebar-toggle" type="button" ref={toggle} onClick={()=>setOpen(!open)}
        aria-expanded={open} aria-controls="desk-navigation">
        <Icon name={open?'close':'menu'}/> Menü
      </button>
    </div>
    <div className="sidebar-panel" id="desk-navigation" ref={panel}>
      <nav aria-label="Hauptnavigation">{(Object.keys(sections) as Section[]).map((key)=>{
        if(key==='settings' && person.role!=='admin') return null;
        const [label,icon]=sections[key];
        return <button type="button" key={key} aria-current={section===key?'page':undefined}
          onClick={()=>choose(key)}><Icon name={icon}/>{label}</button>;
      })}</nav>
      <footer className="sidebar-foot">
        <div className="account">
          <span className="avatar" aria-hidden="true">{person.name.slice(0,1)}</span>
          <div><strong>{person.name}</strong><small>{person.role==='admin'?'Administration':'Mitarbeit'}</small></div>
          {themeButton}
        </div>
        <button type="button" onClick={()=>void onLogout()}>Abmelden</button>
      </footer>
    </div>
  </aside>;
}
