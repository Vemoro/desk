import { useEffect, useId, useRef, useState } from 'react';
import { api, calendarDate, downloadPositions, euros, inventoryLabel, inventoryName, moment, money, name, projectStages, reservationStages, taskStages, type Row } from './client';
import { ConfirmDialog, Expand, Form, options, Panel, Pill, Table, type Confirmation, type Run } from './widgets';
import { ProjectHistory } from './project-history';
import { Communication } from './communication';
import { projectHash, projectViews, type ProjectView } from './project-views';

export type Data = Record<'contacts'|'projects'|'tasks'|'users'|'lines'|'reservations'|'locations'|'items'|'movements'|'costs'|'stock',Row[]>;
type Flags = { haben:boolean; zammad:boolean };

const transitions:Record<string,string[]> = {
  inquiry:['planning','cancelled'], planning:['offered','cancelled'], offered:['planning','confirmed','cancelled'],
  confirmed:['running','cancelled'], running:['complete','cancelled'], complete:[],cancelled:[],
};
function reservationTimes(values:Record<string,string>) {
  const start=new Date(values.starts_at);
  const end=new Date(values.ends_at);
  if(!(end>start)) throw new Error('Das Ende muss nach dem Beginn liegen.');
  return {...values,starts_at:start.toISOString(),ends_at:end.toISOString()};
}

type ProjectFilters = { query:string; stage:string; due:string };
export const defaultProjectFilters:ProjectFilters = {query:'',stage:'all',due:'all'};

export function Projects({data,run,select,filters,onFilter}:{data:Data;run:Run;select:(id:string)=>void;
  filters:ProjectFilters;onFilter:(filters:ProjectFilters)=>void;
}) {
  const search=useRef<HTMLInputElement>(null);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    let timer:number;
    function updateDay() {
      window.clearTimeout(timer);
      const current=new Date();
      setNow(current);
      const nextDay=new Date(current.getFullYear(),current.getMonth(),current.getDate()+1);
      timer=window.setTimeout(updateDay,nextDay.getTime()-current.getTime());
    }
    updateDay();
    window.addEventListener('focus',updateDay);
    return ()=>{
      window.clearTimeout(timer);
      window.removeEventListener('focus',updateDay);
    };
  },[]);
  const today=[now.getFullYear(),now.getMonth()+1,now.getDate()].map(part=>String(part).padStart(2,'0')).join('-');
  const query=filters.query.trim().toLowerCase();
  const filtered=filters.query!=='' || filters.stage!=='all' || filters.due!=='all';
  const projects=data.projects.filter((project)=>{
    const matchesSearch=`${project.name} ${name(data.contacts,project.contact_id)}`.toLowerCase().includes(query);
    const matchesStage=filters.stage==='all' || (filters.stage==='open'
      ? !['complete','cancelled'].includes(project.stage)
      : project.stage===filters.stage);
    const dueDate=project.due?.slice(0,10);
    const matchesDue=filters.due==='all'
      || (filters.due==='overdue' && Boolean(dueDate) && dueDate<today)
      || (filters.due==='today' && dueDate===today)
      || (filters.due==='missing' && !dueDate);
    return matchesSearch && matchesStage && matchesDue;
  });
  return <>
    <Panel title="Projekte">
      <div className="panel-body">
        <div className="project-filters">
          <label><span>Projekte suchen</span><input ref={search} type="search" value={filters.query}
            onChange={(event)=>onFilter({...filters,query:event.target.value})}/></label>
          <label><span>Status</span><select value={filters.stage} onChange={(event)=>onFilter({...filters,stage:event.target.value})}>
            <option value="all">Alle</option><option value="open">Offen</option>
            {Object.entries(projectStages).map(([stage,label])=><option key={stage} value={stage}>{label}</option>)}
          </select></label>
          <label><span>Fälligkeit</span><select value={filters.due} onChange={(event)=>onFilter({...filters,due:event.target.value})}>
            <option value="all">Alle</option><option value="overdue">Überfällig</option>
            <option value="today">Heute</option><option value="missing">Ohne Termin</option>
          </select></label>
        </div>
        <div className="actions">
          <span className="subtle" role="status">{projects.length===1?'1 Projekt gefunden.':`${projects.length} Projekte gefunden.`}</span>
          <button type="button" disabled={!filtered} onClick={()=>{
            onFilter(defaultProjectFilters);
            search.current?.focus();
          }}>Filter zurücksetzen</button>
        </div>
        <Expand title="Projekt anlegen">
          <Form caption="Projekt speichern" fields={[
            { name:'name',label:'Projektname',required:true },
            { name:'contact_id',label:'Interessent',choices:options(data.contacts),required:true },
            { name:'due',label:'Termin',type:'date' },
            { name:'notes',label:'Notiz',type:'textarea' },
          ]} submit={(fields)=>run(async(isCurrent)=>{
            const project=await api('projects','POST',{...fields,due:fields.due||null});
            if(isCurrent()) select(project.id);
          },'Projekt angelegt.')}/>
        </Expand>
      </div>
      {filtered && !projects.length ? <p className="empty">Keine Projekte entsprechen den Filtern.</p>
      : <Table headers={['Projekt','Kontakt','Status','Termin']} rows={projects
        .map((project)=>({key:project.id,cells:[<button className="text-button" onClick={()=>select(project.id)}>{project.name}</button>,
          name(data.contacts,project.contact_id),<Pill label={projectStages[project.stage]} tone={project.stage==='confirmed'?'accent':'neutral'}/>,calendarDate(project.due)]}))}/>}
    </Panel>
  </>;
}

export function Project({project,data,run,flags,accountId,back,tab}:{project:Row;data:Data;run:Run;flags:Flags;accountId:string;back:()=>void;tab:ProjectView}) {
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{title.current?.focus();},[]);
  return <>
    <div className="breadcrumb"><button className="text-button" onClick={back}>Projekte</button><span>/</span>{project.name}</div>
    <div className="project-head"><div><h1 ref={title} tabIndex={-1}>{project.name}</h1><div className="subtle">{name(data.contacts,project.contact_id)} · Termin {calendarDate(project.due)}</div></div><Pill label={projectStages[project.stage]} tone="accent"/></div>
    <nav className="tabs" aria-label="Projektansichten">{(Object.keys(projectViews) as ProjectView[]).map((key)=>
      <a key={key} href={projectHash(project.id,key)} aria-current={tab===key?'page':undefined}>{projectViews[key]}</a>
    )}</nav>
    {tab==='overview' && <Overview project={project} data={data} run={run} haben={flags.haben}/>}
    {tab==='tasks' && <Kanban project={project} data={data} run={run}/>}
    {tab==='planning' && <Planning project={project} data={data} run={run} accountId={accountId}/>}
    {tab==='finance' && <Controlling project={project} data={data} run={run}/>}
    {tab==='communication' && <Communication project={project} zammad={flags.zammad} run={run}/>}
    {tab==='history' && <ProjectHistory projectId={project.id}/>}
  </>;
}

function Overview({project,data,run,haben}:{project:Row;data:Data;run:Run;haben:boolean}) {
  return <div className="two-col">
    <Panel title="Projektdaten"><div className="panel-body">
      <Form key={JSON.stringify([project.name,project.contact_id,project.due,project.notes,project.cost_center])} caption="Projektdaten speichern" fields={[
        { name:'name',label:'Projektname',value:project.name,required:true },
        { name:'contact_id',label:'Kontakt',choices:options(data.contacts),value:project.contact_id,required:true },
        { name:'due',label:'Termin',type:'date',value:project.due?.slice(0,10) },
        { name:'cost_center',label:'Kostenstelle',value:project.cost_center },
        { name:'notes',label:'Projektnotiz',type:'textarea',value:project.notes },
      ]} submit={(fields)=>run(()=>api(`projects/${project.id}`,'PATCH',{...fields,due:fields.due||null}),'Projekt gespeichert.')}/>
    </div></Panel>
    <Panel title="Auftrag und Abrechnung"><div className="panel-body">
      <Form key={`${project.offer_ref}-${project.invoice_ref}`} caption="Referenzen speichern" fields={[
        {name:'offer_ref',label:'Angebotsreferenz',value:project.offer_ref},
        {name:'invoice_ref',label:'Rechnungsreferenz',value:project.invoice_ref},
      ]} submit={(fields)=>run(()=>api(`projects/${project.id}`,'PATCH',fields),'Referenzen gespeichert.')}/>
      <div className="actions">
        {transitions[project.stage]?.map((stage)=><button key={stage} onClick={()=>run(()=>api(`projects/${project.id}/stage`,'PATCH',{stage}),`Projektstatus: ${projectStages[stage]}.`)}>{projectStages[stage]}</button>)}
      </div>
      {haben && <Expand title="Haben-Angebot">
        {project.haben_offer && <p><a href={project.haben_offer.url} target="_blank" rel="noreferrer">Angebot öffnen</a> · {project.haben_offer.status}</p>}
        <Form caption="Angebot abgleichen" fields={[{name:'id',label:'Haben-Angebots-ID',value:project.haben_offer_id ?? ''}]} submit={({id})=>run(()=>api(`projects/${project.id}/haben-offer`,'POST',id?{id}:{}),'Angebot abgeglichen.')}/>
      </Expand>}
    </div></Panel>
  </div>;
}

function Kanban({project,data,run}:{project:Row;data:Data;run:Run}) {
  const tasks=data.tasks.filter((task)=>task.project_id===project.id);
  const activePeople=options(data.users.filter(person=>!person.blocked));
  function assigneeChoices(id:string | null) {
    const previous=data.users.find(person=>person.id===id && person.blocked);
    return previous ? [...activePeople,{value:previous.id,label:`${previous.name} (gesperrt)`}] : activePeople;
  }
  return <>
    <Panel title="Aufgaben" action={<span className="subtle">{tasks.length} Aufgaben</span>}>
      <div className="panel-body"><Expand title="Aufgabe anlegen">
        <Form caption="Aufgabe speichern" fields={[
          {name:'name',label:'Aufgabe',required:true},{name:'assignee_id',label:'Verantwortlich',choices:activePeople},
          {name:'due',label:'Fällig am',type:'date'},
        ]} submit={(fields)=>run(()=>api('tasks','POST',{project_id:project.id,...fields,assignee_id:fields.assignee_id||null,due:fields.due||null}),'Aufgabe angelegt.')}/>
      </Expand></div>
    </Panel>
    <div className="board" aria-label="Kanban">
      {Object.entries(taskStages).map(([status,label])=><section key={status} className="board-column"
        onDragOver={(event)=>event.preventDefault()}
        onDrop={(event)=>{event.preventDefault();const id=event.dataTransfer.getData('text/plain');
          if(tasks.some((task)=>task.id===id && task.status!==status)) void run(()=>api(`tasks/${id}`,'PATCH',{status}));}}>
        <h2>{label} <span>{tasks.filter((task)=>task.status===status).length}</span></h2>
        {tasks.filter((task)=>task.status===status).map((task)=><article key={task.id} className="task" draggable onDragStart={(event)=>event.dataTransfer.setData('text/plain',task.id)}>
          <strong>{task.name}</strong><span className="subtle">{name(data.users,task.assignee_id)} · {calendarDate(task.due)}</span>
          <label><span className="sr-only">Status für {task.name}</span><select value={task.status} onChange={(event)=>run(()=>api(`tasks/${task.id}`,'PATCH',{status:event.target.value}))}>
            {Object.entries(taskStages).map(([key,value])=><option value={key} key={key}>{value}</option>)}
          </select></label>
          <Expand title="Bearbeiten"><Form caption="Aufgabe aktualisieren" fields={[
            {name:'name',label:'Aufgabe',value:task.name,required:true},{name:'assignee_id',label:'Verantwortlich',value:task.assignee_id,choices:assigneeChoices(task.assignee_id)},{name:'due',label:'Fällig am',type:'date',value:task.due?.slice(0,10)},
          ]} submit={(fields)=>run(()=>api(`tasks/${task.id}`,'PATCH',{...fields,assignee_id:fields.assignee_id||null,due:fields.due||null}))}/></Expand>
        </article>)}
      </section>)}
    </div>
  </>;
}

function Planning({project,data,run,accountId}:{project:Row;data:Data;run:Run;accountId:string}) {
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const calculationPanel=useRef<HTMLElement>(null);
  const reservations=data.reservations.filter((row)=>row.project_id===project.id);
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  const activePeople=options(data.users.filter(person=>!person.blocked));
  const blockedPeople=new Set(data.users.filter(person=>person.blocked).map(person=>person.id));
  const personTimeZoneId=useId();
  const inventoryTimeZoneId=useId();
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneHint=`Die Zeitzone für neue Eingaben ist ${timeZone}.`;
  const retryNote='Die Wiederholung verwendet die ursprünglich bestätigten Zeitpunkte.';
  const timeFields=(describedBy:string)=>[
    {name:'starts_at',label:'Von',type:'datetime-local',required:true,describedBy},
    {name:'ends_at',label:'Bis',type:'datetime-local',required:true,describedBy},
  ];
  return <>
    <Panel title="Ressourcenplanung"><div className="panel-body compact-actions">
      <Expand title="Personal vormerken"><Form caption="Person vormerken" retryScope={`reservations:${accountId}:${project.id}:person`} prepare={reservationTimes} retryNote={retryNote} fields={[
        {name:'user_id',label:'Person',choices:activePeople,required:true},...timeFields(personTimeZoneId),
      ]} submit={(v,key)=>run(()=>api('reservations','POST',{...v,project_id:project.id,quantity:1},key),'Person vorgemerkt.',{reportWriteRejection:true})}>
        <p id={personTimeZoneId} className="subtle wide">{timeZoneHint}</p>
      </Form></Expand>
      <Expand title="Inventar vormerken"><Form caption="Inventar vormerken" retryScope={`reservations:${accountId}:${project.id}:item`} prepare={reservationTimes} retryNote={retryNote} fields={[
        {name:'item_id',label:'Artikel',choices:options(data.items,inventoryLabel),required:true},
        {name:'location_id',label:'Lagerort',choices:options(data.locations),required:true},
        {name:'quantity',label:'Menge',type:'number',value:1,min:1,required:true},...timeFields(inventoryTimeZoneId),
      ]} submit={(v,key)=>run(()=>api('reservations','POST',{...v,project_id:project.id,quantity:Number(v.quantity)},key),'Inventar vorgemerkt.',{reportWriteRejection:true})}>
        <p id={inventoryTimeZoneId} className="subtle wide">{timeZoneHint}</p>
      </Form></Expand>
    </div><Table headers={['Ressource','Zeitraum','Menge','Status','Aktion']} rows={reservations.map((row)=>({
      key:row.id,cells:[row.user_id ? name(data.users,row.user_id) : <><span>{inventoryName(data.items,row.item_id)}</span><small>{name(data.locations,row.location_id)}</small></>,
        <>{moment(row.starts_at)}<small>bis {moment(row.ends_at)}</small></>,row.quantity,
        <Pill label={reservationStages[row.status]} tone={row.status==='firm'?'accent':'neutral'}/>,
        <div className="actions">{row.status==='tentative' && ['confirmed','running'].includes(project.stage) && (
          blockedPeople.has(row.user_id) ? <span className="subtle">Konto gesperrt</span>
            : <button onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'firm'}),'Fest reserviert.')}>Fest reservieren</button>
        )}
          {row.status!=='released' && <button onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'released'}),'Reservierung freigegeben.')}>Freigeben</button>}</div>],
    }))}/></Panel>
    <Panel title="Kalkulation" focusRef={calculationPanel} action={<button onClick={()=>run(async(isCurrent)=>{
      const positions=await api(`projects/${project.id}/offer-positions`);
      if(isCurrent()) downloadPositions(project,positions);
    },undefined,{kind:'read'})}>Angebotspositionen exportieren</button>}>
      <div className="panel-body"><Expand title="Position anlegen"><Form caption="Position speichern" fields={[
        {name:'kind',label:'Art',choices:[{value:'buy',label:'Einkauf'},{value:'sell',label:'Verkauf'}],required:true},
        {name:'name',label:'Position',required:true},{name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},
        {name:'unit',label:'Einzelpreis netto in Euro',required:true},
      ]} submit={(v)=>run(()=>api('lines','POST',{project_id:project.id,kind:v.kind,name:v.name,quantity:Number(v.quantity),unit_cents:money(v.unit)}),'Position angelegt.')}/></Expand></div>
      <Table headers={['Art','Position','Menge','Einzelpreis','Gesamt','Aktion']} rows={lines.map((row)=>({key:row.id,cells:[
        row.kind==='buy'?'Einkauf':'Verkauf',row.name,row.quantity,euros(row.unit_cents),euros(row.unit_cents*row.quantity),
        <Expand title="Position bearbeiten"><Form caption="Position aktualisieren" fields={[
          {name:'kind',label:'Art',value:row.kind,choices:[{value:'buy',label:'Einkauf'},{value:'sell',label:'Verkauf'}],required:true},
          {name:'name',label:'Position',value:row.name,required:true},
          {name:'quantity',label:'Menge',type:'number',min:1,value:row.quantity,required:true},
          {name:'unit',label:'Einzelpreis netto in Euro',value:(row.unit_cents/100).toFixed(2).replace('.',','),required:true},
        ]} submit={(v)=>run(()=>api(`lines/${row.id}`,'PATCH',{kind:v.kind,name:v.name,quantity:Number(v.quantity),unit_cents:money(v.unit)}),'Position aktualisiert.')}/>
          <button onClick={event=>setConfirmation({
            actionKey:`lines:${row.id}`,
            title:'Kalkulationsposition entfernen',
            description:`„${row.name}“ wird aus der Kalkulation dieses Projekts entfernt.`,
            actionLabel:'Position entfernen',
            trigger:event.currentTarget,
            submit:()=>api(`lines/${row.id}`,'DELETE'),
            feedback:'Position entfernt.',
          })}>Position entfernen</button>
        </Expand>,
      ]}))}/></Panel>
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={calculationPanel}/>}
  </>;
}

export function Controlling({project,data,run}:{project:Row;data:Data;run:Run}) {
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  const costs=data.costs.filter((row)=>row.project_id===project.id);
  const budget=(kind:string)=>lines.filter((row)=>row.kind===kind).reduce((sum,row)=>sum+row.quantity*row.unit_cents,0);
  const actual=costs.reduce((sum,row)=>sum+row.cents,0);
  return <>
    <div className="metrics">{[
      ['Einkauf geplant',budget('buy')],['Ist-Kosten',actual],['Abweichung',actual-budget('buy')],['Verkauf geplant',budget('sell')],
    ].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{euros(Number(value))}</strong></div>)}</div>
    <Panel title="Belegbezogene Ist-Kosten">
      <div className="panel-body"><Expand title="Ist-Kosten erfassen"><Form caption="Kosten speichern" fields={[
        {name:'reference',label:'Belegreferenz',required:true},{name:'name',label:'Bezeichnung',required:true},{name:'amount',label:'Netto in Euro',required:true},
      ]} submit={(fields)=>run(()=>api('costs','POST',{entries:[{project_id:project.id,source:'manual',reference:fields.reference,name:fields.name,cents:money(fields.amount)}]}),'Ist-Kosten gespeichert.')}/></Expand></div>
      <Table headers={['Belegreferenz','Bezeichnung','Quelle','Netto']} rows={costs.map((row)=>({key:row.id,cells:[row.reference,row.name,row.source,euros(row.cents)]}))}/>
    </Panel>
  </>;
}
