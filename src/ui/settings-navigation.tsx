import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';

const areas = {
  team: {label:'Team', hint:'Konten, Rollen und Zugang'},
  api: {label:'API-Zugriff', hint:'Tokens und API-Dokumentation'},
  integrations: {label:'Integrationen', hint:'Haben und Zammad'},
} as const;

export type SettingsArea = keyof typeof areas;

export function settingsArea(value:string):SettingsArea|undefined {
  return Object.hasOwn(areas,value) ? value as SettingsArea : undefined;
}

function followArea(event:MouseEvent<HTMLAnchorElement>, next:SettingsArea, area?:SettingsArea) {
  if(event.button!==0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || area===next) return;
  event.preventDefault();
  location.hash='settings/'+next;
  history.replaceState({...history.state,deskSettingsFromList:!area},'');
}

export function SettingsLayout({area,heading,children}:{
  area?:SettingsArea; heading:RefObject<HTMLHeadingElement|null>; children:ReactNode;
}) {
  const previousArea=useRef<SettingsArea|undefined>(undefined);
  const navigation=useRef<HTMLElement>(null);

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
        <a key={key} href={'#settings/'+key} aria-current={key===area?'page':undefined}
          onClick={event=>followArea(event,key,area)}>
          <strong>{areas[key].label}</strong>{' '}
          <small>{areas[key].hint}</small>
        </a>
      )}
    </nav>
    <div className="settings-content">
      {area && <a className="settings-back" href="#settings" onClick={event=>{
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
