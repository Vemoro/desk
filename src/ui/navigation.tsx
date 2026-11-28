import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Row } from './client';
import { GlobalSearch, type SearchTarget } from './global-search';
import { allowedSections, sections, type Person, type Section } from './navigation-targets';
import './navigation.css';

export { sections, type Person, type Section } from './navigation-targets';

const workSections = [
  {label:'Projektarbeit', sections:['projects','planning','contacts']},
  {label:'Bestände und Kosten', sections:['warehouse','costs']},
] as const;

function revealActiveSection(panel:HTMLDivElement|null) {
  const active=panel?.querySelector<HTMLElement>('nav [aria-current="page"]');
  if(!panel || !active?.getClientRects().length) return;
  const area=panel.getBoundingClientRect();
  const item=active.getBoundingClientRect();
  if(item.top<area.top) panel.scrollTop+=item.top-area.top;
  else if(item.bottom>area.bottom) panel.scrollTop+=item.bottom-area.bottom;
}

function SidebarAccount({person,themeButton,children,onLogout}:{
  person:Person; themeButton:ReactNode; children:ReactNode; onLogout:()=>Promise<void>;
}) {
  return <div className="sidebar-foot" role="group" aria-label="Konto und Hilfe">
    <div className="account">
      <span className="avatar" aria-hidden="true">{person.name.slice(0,1)}</span>
      <div><strong>{person.name}</strong><small>{person.role==='admin'?'Administration':'Mitarbeit'}</small></div>
      {themeButton}
    </div>
    {children}
    <a href="https://vemoro.de/desk/dokumentation/" target="_blank" rel="noreferrer" aria-label="Dokumentation" title="Dokumentation">
      <Icon name="docs"/><span className="sidebar-label">Dokumentation</span></a>
    <a href={__DESK_SOURCE_URL__ || 'https://github.com/Vemoro/desk'} target="_blank" rel="noreferrer"
      aria-label={__DESK_SOURCE_URL__?'Quellcode':'Desk-Projekt auf GitHub'} title={__DESK_SOURCE_URL__?'Quellcode':'Desk-Projekt auf GitHub'}>
      <Icon name="code"/><span className="sidebar-label">{__DESK_SOURCE_URL__ ? 'Quellcode' : 'Desk-Projekt auf GitHub'}</span>
    </a>
    <button type="button" aria-label="Abmelden" title="Abmelden" onClick={()=>void onLogout()}><Icon name="logout"/><span className="sidebar-label">Abmelden</span></button>
    <small className="sidebar-version">Desk {__DESK_VERSION__}</small>
  </div>;
}

function useMobileNavigation(section:Section) {
  const [open,setOpen]=useState(false);
  const toggle=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);

  useEffect(()=>{revealActiveSection(panel.current);},[open,section]);

  useEffect(()=>{
    if (!open) return;
    function onEscape(event:KeyboardEvent) {
      if(event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
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
        if(panel.current?.contains(focused) || focused?.matches('.sidebar-compact-toggle')) toggle.current?.focus();
        return;
      }
      setOpen(false);
      if(focused===toggle.current) panel.current?.querySelector<HTMLButtonElement>('nav [aria-current="page"]')?.focus();
      revealActiveSection(panel.current);
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

  return {open,setOpen,toggle,panel};
}

function useNavigationPreferences() {
  const [compact,setCompact]=useState(false);
  const [mac,setMac]=useState(false);
  const [searching,setSearching]=useState(false);
  useEffect(()=>{
    setCompact(localStorage.getItem('desk-compact-sidebar')==='true');
    setMac(navigator.platform.startsWith('Mac'));
  },[]);
  useEffect(()=>{
    function shortcut(event:KeyboardEvent) {
      const edited=event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable=true]');
      if(event.defaultPrevented || event.repeat || event.shiftKey || event.altKey || edited || document.querySelector('dialog[open]')) return;
      if(event.key.toLowerCase()!=='k' || !(mac?event.metaKey:event.ctrlKey)) return;
      event.preventDefault();
      setSearching(true);
    }
    window.addEventListener('keydown',shortcut);
    return ()=>window.removeEventListener('keydown',shortcut);
  },[mac]);
  function toggleCompact() {
    localStorage.setItem('desk-compact-sidebar',String(!compact));
    setCompact(!compact);
  }
  return {mac,compact,toggleCompact,searching,setSearching};
}

export function Navigation({person,section,themeButton,onNavigate,onLogout,onSearch,projects,contacts,stale}:{
  person:Person;section:Section;themeButton:ReactNode;
  onNavigate:(section:Section)=>void;onLogout:()=>Promise<void>;onSearch:(target:SearchTarget)=>void;
  projects:Row[];contacts:Row[];stale:boolean;
}) {
  const {open,setOpen,toggle,panel}=useMobileNavigation(section);
  const {mac,compact,toggleCompact,searching,setSearching}=useNavigationPreferences();
  const searchTrigger=useRef<HTMLButtonElement>(null);
  const allowed=allowedSections(person.role);

  function choose(next:Section) {
    onNavigate(next);
    if (!open) return;
    setOpen(false);
    document.getElementById('desk-main')?.focus();
  }

  function sectionButton(key:Section) {
    const [label,icon]=sections[key];
    return <button type="button" key={key} aria-current={section===key?'page':undefined}
      aria-label={label} title={label} onClick={()=>choose(key)}><Icon name={icon}/><span className="sidebar-label">{label}</span></button>;
  }

  return <aside className="sidebar" data-menu-open={open || undefined} data-compact={compact || undefined}>
    <div className="sidebar-bar">
      <div className="brand"><img className="mark" src="/desk-bildmarke.svg" alt=""/><strong className="sidebar-label">Desk</strong></div>
      <button className="sidebar-compact-toggle" type="button" aria-expanded={!compact}
        aria-label={compact?'Seitenleiste ausklappen':'Seitenleiste einklappen'} onClick={toggleCompact}>
        <Icon name={compact?'expand':'collapse'}/></button>
      <button className="sidebar-search" ref={searchTrigger} type="button" aria-label="Suchen in Desk"
        aria-haspopup="dialog" aria-keyshortcuts={mac?'Meta+K':'Control+K'} title={mac?'Desk durchsuchen (⌘ K)':'Desk durchsuchen (Strg+K)'}
        onClick={()=>setSearching(true)}><Icon name="search"/><span className="sidebar-label">Suchen</span><kbd aria-hidden="true">{mac?'⌘ K':'Strg+K'}</kbd></button>
      <button className="sidebar-toggle" type="button" ref={toggle} onClick={()=>setOpen(!open)}
        aria-expanded={open} aria-controls="desk-navigation">
        <Icon name={open?'close':'menu'}/> Menü
      </button>
    </div>
    <div className="sidebar-panel" id="desk-navigation" ref={panel}>
      <nav aria-label="Hauptnavigation">
        <div className="sidebar-work">
          {sectionButton('dashboard')}
          {workSections.map(group=><div key={group.label} className="sidebar-group" role="group" aria-label={group.label}>
            <span aria-hidden="true">{group.label}</span>
            {group.sections.filter(key=>allowed.includes(key)).map(sectionButton)}
          </div>)}
        </div>
        <SidebarAccount person={person} themeButton={themeButton} onLogout={onLogout}>
          {sectionButton('account')}
          {allowed.includes('settings') && sectionButton('settings')}
        </SidebarAccount>
      </nav>
    </div>
    {searching && <GlobalSearch projects={projects} contacts={contacts} stale={stale} allowed={allowed}
      dismiss={()=>{setSearching(false);searchTrigger.current?.focus();}}
      select={target=>{setSearching(false);setOpen(false);onSearch(target);}}/>}
  </aside>;
}
