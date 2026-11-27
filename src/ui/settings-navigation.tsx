import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';

const areas = {
  team: {label:'Team', hint:'Konten, Rollen und Zugang'},
  api: {label:'API-Zugriff', hint:'Tokens und API-Dokumentation'},
  integrations: {label:'Integrationen', hint:'Haben und Zammad'},
} as const;

export type SettingsArea = keyof typeof areas;

export function settingsArea(value:string):SettingsArea|undefined {
  return Object.hasOwn(areas,value) ? value as SettingsArea : undefined;
}

function followArea(event:MouseEvent<HTMLAnchorElement>, next:SettingsArea, heading:HTMLHeadingElement|null, area?:SettingsArea) {
  if(event.button!==0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  if(area===next) {
    heading?.focus();
    return;
  }
  location.hash='settings/'+next;
  history.replaceState({...history.state,deskSettingsFromList:!area},'');
}

export function SettingsLayout({area,heading,children}:{
  area?:SettingsArea; heading:RefObject<HTMLHeadingElement|null>; children:ReactNode;
}) {
  const previousArea=useRef<SettingsArea|undefined>(undefined);
  const navigation=useRef<HTMLElement>(null);
  const content=useRef<HTMLDivElement>(null);
  const back=useRef<HTMLAnchorElement>(null);
  const [desktop,setDesktop]=useState(false);
  const selected=area ?? (desktop ? 'team' : undefined);

  useEffect(()=>{
    const mobile=window.matchMedia('(max-width: 900px)');
    let wasMobile=mobile.matches;
    let lastFocused=document.activeElement;
    setDesktop(!wasMobile);
    function trackFocus(event:FocusEvent) {
      if(event.target instanceof Element) lastFocused=event.target;
    }
    function clearFocus() {
      if(mobile.matches===wasMobile) lastFocused=null;
    }
    function sync(event:MediaQueryListEvent) {
      wasMobile=event.matches;
      setDesktop(!wasMobile);
      const focused=document.activeElement===document.body ? lastFocused : document.activeElement;
      if(wasMobile && !area && content.current?.contains(focused)) {
        navigation.current?.querySelector('a')?.focus();
      } else if((wasMobile && area && navigation.current?.contains(focused)) || (!wasMobile && back.current && focused===back.current)) {
        heading.current?.focus();
      }
    }
    mobile.addEventListener('change',sync);
    document.addEventListener('focusin',trackFocus);
    document.addEventListener('focusout',clearFocus);
    return ()=>{
      mobile.removeEventListener('change',sync);
      document.removeEventListener('focusin',trackFocus);
      document.removeEventListener('focusout',clearFocus);
    };
  },[area,heading]);

  useEffect(()=>{
    if(area) heading.current?.focus();
    else if(previousArea.current) {
      navigation.current?.querySelector<HTMLAnchorElement>(`a[href="#settings/${previousArea.current}"]`)?.focus();
    }
    previousArea.current=area;
  },[area,heading]);

  return <div className="settings-layout" data-detail={Boolean(area) || undefined}>
    <nav className="settings-nav" ref={navigation} aria-label="Einstellungsbereiche">
      {(Object.keys(areas) as SettingsArea[]).map(key=>
        <a key={key} href={'#settings/'+key} aria-current={key===selected?'page':undefined}
          onClick={event=>followArea(event,key,heading.current,area)}>
          <strong>{areas[key].label}</strong>{' '}
          <small>{areas[key].hint}</small>
        </a>
      )}
    </nav>
    <div className="settings-content" ref={content}>
      {area && <a className="settings-back" ref={back} href="#settings" onClick={event=>{
        if(event.button===0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
          history.state?.deskSettingsFromList) {
          event.preventDefault();
          history.back();
        }
      }}>Zurück zu Einstellungen</a>}
      {children}
    </div>
  </div>;
}
