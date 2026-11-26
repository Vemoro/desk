import { Field } from './field';
import type { ReactNode } from 'react';
import { PasskeyLogin } from './passkeys';
import { OidcLogin } from './oidc-login';
import { useState } from 'react';
import { api, calendarDate, euros, name, projectStages } from './client';
import type { Data } from './projects';
import { Form, Panel, Pill, Table } from './widgets';
import { useLocalDay } from './local-day';

export function BuildInfo() {
  const [copyStatus,setCopyStatus]=useState('');
  const commit=__DESK_BUILD_COMMIT__ ? `Git-Commit ${__DESK_BUILD_COMMIT__}` : 'Stand unbekannt';
  const value=`Desk ${__DESK_VERSION__} · ${commit}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('Kopiert.');
    } catch {
      setCopyStatus('Angabe im Feld auswählen und kopieren.');
    }
  }

  return <Panel title="Desk-Version">
    <div className="panel-body">
      <Field label="Version und Git-Commit">{props=><textarea {...props} rows={2} readOnly value={value} onFocus={(event)=>event.currentTarget.select()}/>}</Field>
      <div className="actions">
        <button type="button" onClick={copy}>Kopieren</button>
        <SourceLink/>
        {copyStatus && <small role="status">{copyStatus}</small>}
      </div>
    </div>
  </Panel>;
}

function SourceLink() {
  return __DESK_SOURCE_URL__
    ? <a href={__DESK_SOURCE_URL__} target="_blank" rel="noreferrer">Desk-Quellcode</a>
    : null;
}

export function Dashboard({data,select,open}:{data:Data;select:(id:string)=>void;open:()=>void}) {
  const active=data.projects.filter((project)=>!['complete','cancelled'].includes(project.stage));
  const today=useLocalDay();
  const activeIds=new Set(active.map((project)=>project.id));
  const dueTasks=data.tasks
    .filter((task)=>task.status!=='done' && task.due && activeIds.has(task.project_id))
    .map((task)=>({task,due:task.due.slice(0,10)}))
    .sort((first,second)=>first.due.localeCompare(second.due)
      || first.task.name.localeCompare(second.task.name,'de')
      || first.task.id.localeCompare(second.task.id))
    .slice(0,10);
  const metrics=[
    ['Aktive Projekte',active.length],['Offene Aufgaben',data.tasks.filter((task)=>task.status!=='done').length],
    ['Feste Reservierungen',data.reservations.filter((entry)=>entry.status==='firm').length],['Kosten ohne Zuordnung',data.costs.filter((entry)=>!entry.project_id).length],
  ];
  return <>
    <div className="metrics">{metrics.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <Panel title="Aktive Projekte" action={<button className="primary" onClick={open}>Alle Projekte</button>}>
      <Table headers={['Projekt','Kontakt','Status','Termin']} rows={active.map((row)=>({key:row.id,cells:[
        <button className="text-button" onClick={()=>select(row.id)}>{row.name}</button>,name(data.contacts,row.contact_id),<Pill label={projectStages[row.stage]} tone="accent"/>,calendarDate(row.due),
      ]}))}/>
    </Panel>
    <Panel title="Fällige Aufgaben">
      {dueTasks.length ? <Table headers={['Aufgabe','Projekt','Verantwortlich','Termin']} rows={dueTasks.map(({task,due})=>({
        key:task.id,cells:[task.name,<button className="text-button" onClick={()=>select(task.project_id)}>{name(data.projects,task.project_id)}</button>,
          name(data.users,task.assignee_id),<div className="actions">{calendarDate(due)}
            {due<=today && <Pill label={due<today?'Überfällig':'Heute'} tone="accent"/>}
          </div>],
      }))}/> : <p className="empty">Keine offenen Aufgaben mit Termin.</p>}
    </Panel>
  </>;
}


export function DeskLogin({alert,themeButton,signIn}:{alert:ReactNode;themeButton:ReactNode;signIn:(authenticate:()=>Promise<unknown>)=>Promise<void>}) {
  return <main className="login">
    <div className="login-box"><div className="login-brand"><img className="mark" src="/desk-bildmarke.svg" alt=""/><strong>Desk</strong>{themeButton}</div>
      <h1>Anmelden</h1>{alert}
      <Form caption="Anmelden" fields={[
        {name:'email',label:'E-Mail',type:'email',required:true,autoComplete:'username'},
        {name:'password',label:'Passwort',type:'password',required:true,autoComplete:'current-password'},
      ]} submit={(input)=>signIn(()=>api('login','POST',input))}/>
      <PasskeyLogin onSignIn={signIn}/>
      <OidcLogin/>
      <SourceLink/>
    </div></main>;
}
