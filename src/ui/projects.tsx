import { Field } from './field';
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { missingStageReference } from '../project-references';
import { microsecondsWithinMillisecond } from '../time';
import { api, calendarDate, euros, inventoryLabel, inventoryName, isOpenProject, moment, money, name, projectStages, reservationStages, type Row } from './client';
import { calculationLineCents, formatCalculationTotal } from './calculation-money';
import { ConfirmDialog, Expand, Form, options, Panel, Pill, Table, type Confirmation, type Run } from './widgets';
import { ProjectHistory } from './project-history';
import { OfferExport } from './offer-export';
import { Communication } from './communication';
import { ProjectKanban } from './project-kanban';
import { projectHash, projectViews, type ProjectView } from './project-views';
import { localDayRange, useLocalDay } from './local-day';
import { ListEmpty, PageHeading, openListForm } from './list-page';
import { emptyReservationFilters, ReservationFilters } from './reservation-filters';

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

type ProjectFilters = { query:string; stage:string; due:string; contactId:string; sort:'standard'|'due' };
export const defaultProjectFilters:ProjectFilters = {query:'',stage:'all',due:'all',contactId:'',sort:'standard'};

export function Projects({data,run,select,filters,onFilter,openContacts}:{data:Data;run:Run;select:(id:string)=>void;openContacts:()=>void;
  filters:ProjectFilters;onFilter:(filters:ProjectFilters)=>void;
}) {
  const search=useRef<HTMLInputElement>(null);
  const creation=useRef<HTMLDetailsElement>(null);
  const searchHelpId=useId();
  const today=useLocalDay();
  const {filtered,contacts,selectedContact,projects,contactOptionLabel}=filteredProjects(data,filters,today);
  const canCreate=data.contacts.length>0;
  const actionLabel=canCreate?'Neues Projekt':'Zu den Kontakten';
  const openCreation=canCreate?()=>openListForm(creation):openContacts;
  return <>
    <PageHeading title="Projekte" action={<button type="button" className="primary" onClick={openCreation}>{actionLabel}</button>}/>
    <Panel title="Projekte">
      <div className="panel-body">
        <div className="project-filters">
          <div className="project-search-field">
            <Field label="Projekte suchen">{props=><input {...props} ref={search} type="search" value={filters.query} aria-describedby={searchHelpId}
              onChange={(event)=>onFilter({...filters,query:event.target.value})}/>}</Field>
            <small id={searchHelpId} className="subtle">Name, Kontakt, Referenz oder Kostenstelle</small>
          </div>
          <Field label="Status">{props=><select {...props} value={filters.stage} onChange={(event)=>onFilter({...filters,stage:event.target.value})}>
            <option value="all">Alle</option><option value="open">Offen</option>
            {Object.entries(projectStages).map(([stage,label])=><option key={stage} value={stage}>{label}</option>)}
          </select>}</Field>
          <Field label="Fälligkeit">{props=><select {...props} value={filters.due} onChange={(event)=>onFilter({...filters,due:event.target.value})}>
            <option value="all">Alle</option><option value="overdue">Überfällig</option>
            <option value="today">Heute</option><option value="missing">Ohne Termin</option>
          </select>}</Field>
          <Field label="Kontakt" className="project-contact-filter">{props=><><select {...props} value={filters.contactId} onChange={(event)=>onFilter({...filters,contactId:event.target.value})}>
            <option value="">Alle Kontakte</option>
            {contacts.map(contact=><option key={contact.id} value={contact.id}>
              {contactOptionLabel(contact)}
            </option>)}
          </select>{selectedContact && <small className="project-contact-selection" aria-hidden="true">
            {contactOptionLabel(selectedContact)}
          </small>}</>}</Field>
          <Field label="Projekte sortieren" className="project-sort-field">{props=><select {...props} value={filters.sort}
            onChange={(event)=>onFilter({...filters,sort:event.target.value==='due'?'due':'standard'})}>
            <option value="standard">Standard</option>
            <option value="due">Frühester Termin zuerst</option>
          </select>}</Field>
        </div>
        <div className="actions">
          <span className="subtle" role="status">{projects.length===1?'1 Projekt gefunden.':`${projects.length} Projekte gefunden.`}</span>
          <button type="button" disabled={!filtered} onClick={()=>{
            onFilter({...defaultProjectFilters,sort:filters.sort});
            search.current?.focus();
          }}>Filter zurücksetzen</button>
        </div>
        {canCreate && <Expand title="Projekt anlegen" detailsRef={creation}>
          <Form caption="Projekt speichern" fields={[
            { name:'name',label:'Projektname',required:true },
            { name:'contact_id',label:'Interessent',choices:options(data.contacts),required:true },
            { name:'due',label:'Termin',type:'date' },
            { name:'notes',label:'Notiz',type:'textarea' },
          ]} submit={(fields)=>run(async(isCurrent)=>{
            const project=await api('projects','POST',{...fields,due:fields.due||null});
            if(isCurrent()) select(project.id);
          },'Projekt angelegt.')}/>
        </Expand>}
      </div>
      {!projects.length ? filtered ? <ListEmpty>Keine Projekte entsprechen den Filtern.</ListEmpty>
        : <ListEmpty action={<button type="button" onClick={openCreation}>{actionLabel}</button>}>
          {canCreate?'Hier erscheinen deine Projekte.':'Lege zuerst einen Kontakt an, um ein Projekt zu erstellen.'}
        </ListEmpty>
      : <Table headers={['Projekt','Kontakt','Status','Termin']} rows={projects
        .map((project)=>({key:project.id,cells:[<button className="text-button" onClick={()=>select(project.id)}>{project.name}</button>,
          name(data.contacts,project.contact_id),<Pill label={projectStages[project.stage]} tone={project.stage==='confirmed'?'accent':'neutral'}/>,calendarDate(project.due)]}))}/>}
    </Panel>
  </>;
}

function filteredProjects(data:Data,filters:ProjectFilters,today:string) {
  const query=filters.query.trim().toLowerCase();
  const filtered=filters.query!=='' || filters.stage!=='all' || filters.due!=='all' || filters.contactId!=='';
  const contactLabelCounts=new Map<string,number>();
  const contacts=data.contacts.map(contact=>{
    const label=[contact.name,contact.email].filter(Boolean).join(' · ').replace(/[\t\n\f\r ]+/g,' ').trim();
    contactLabelCounts.set(label,(contactLabelCounts.get(label)??0)+1);
    return {id:contact.id,label,phone:contact.phone};
  });
  function contactOptionLabel({label,phone}:typeof contacts[number]) {
    return phone && (contactLabelCounts.get(label)??0)>1 ? `${label} · ${phone}` : label;
  }
  const selectedContact=contacts.find(contact=>contact.id===filters.contactId);
  const projects=data.projects.filter((project)=>{
    if(filters.contactId && project.contact_id!==filters.contactId) return false;
    const matchesSearch=`${project.name} ${name(data.contacts,project.contact_id)}`.toLowerCase().includes(query)
      || [project.offer_ref,project.invoice_ref,project.cost_center].some(value=>value?.toLowerCase().includes(query));
    const active=isOpenProject(project.stage);
    const matchesStage=filters.stage==='all' || (filters.stage==='open'?active:project.stage===filters.stage);
    const dueDate=project.due?.slice(0,10);
    const matchesDue=filters.due==='all'
      || (filters.due==='overdue' && active && Boolean(dueDate) && dueDate<today)
      || (filters.due==='today' && dueDate===today)
      || (filters.due==='missing' && !dueDate);
    return matchesSearch && matchesStage && matchesDue;
  });
  if(filters.sort==='due') {
    projects.sort((left,right)=>{
      const leftDue=left.due?.slice(0,10);
      const rightDue=right.due?.slice(0,10);
      if(!leftDue) return rightDue?1:0;
      if(!rightDue) return -1;
      return leftDue.localeCompare(rightDue);
    });
  }
  return {filtered,contacts,selectedContact,projects,contactOptionLabel};
}

export function Project({project,data,dataVersion,run,flags,accountId,back,tab}:{
  project:Row;data:Data;dataVersion:number;run:Run;flags:Flags;accountId:string;back:()=>void;tab:ProjectView;
}) {
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{title.current?.focus();},[]);
  return <>
    <div className="breadcrumb"><button className="text-button" onClick={back}>Projekte</button><span>/</span>{project.name}</div>
    <div className="project-head"><div><h1 ref={title} tabIndex={-1}>{project.name}</h1><div className="subtle">{name(data.contacts,project.contact_id)} · Termin {calendarDate(project.due)}</div></div><Pill label={projectStages[project.stage]} tone="accent"/></div>
    <nav className="tabs" aria-label="Projektansichten">{(Object.keys(projectViews) as ProjectView[]).map((key)=>
      <a key={key} href={projectHash(project.id,key)} aria-current={tab===key?'page':undefined}>{projectViews[key]}</a>
    )}</nav>
    {tab==='overview' && <Overview project={project} data={data} run={run} haben={flags.haben}/>}
    {tab==='tasks' && <ProjectKanban projectId={project.id} accountId={accountId} tasks={data.tasks} dataVersion={dataVersion}
      users={data.users} run={run}/>}
    {tab==='planning' && <Planning project={project} data={data} run={run} accountId={accountId}/>}
    {tab==='finance' && <Controlling project={project} data={data} run={run}/>}
    {tab==='communication' && <Communication project={project} zammad={flags.zammad} run={run}/>}
    {tab==='history' && <ProjectHistory projectId={project.id}/>}
  </>;
}

function Overview({project,data,run,haben}:{project:Row;data:Data;run:Run;haben:boolean}) {
  const contact=data.contacts.find((row)=>row.id===project.contact_id);
  const hintId=useId();
  const stages=(transitions[project.stage]??[]).map(stage=>({
    stage,reference:missingStageReference(stage,{
      offer_ref:project.offer_ref,invoice_ref:project.invoice_ref,haben_offer_id:project.haben_offer_id,
    }),
  }));
  return <div className="two-col">
    <Panel title="Projektdaten"><div className="panel-body">
      <p className="subtle">{contact
        ? <>Zugeordneter Kontakt <a href={'#contacts/'+contact.id}>{contact.name}</a></>
        : 'Kontakt nicht verfügbar'}</p>
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
      {stages.map(({stage,reference})=>reference && <p key={stage} id={`${hintId}-${stage}`} className="subtle">
        Für „{projectStages[stage]}“ zuerst das Feld „{reference}“ speichern.
      </p>)}
      <div className="actions stage-actions">
        {stages.map(({stage,reference})=><button key={stage} disabled={Boolean(reference)}
          aria-describedby={reference?`${hintId}-${stage}`:undefined}
          onClick={()=>run(()=>api(`projects/${project.id}/stage`,'PATCH',{stage}),`Projektstatus: ${projectStages[stage]}.`)}>{projectStages[stage]}</button>)}
      </div>
      {haben && <Expand title="Haben-Angebot">
        {project.haben_offer && <p><a href={project.haben_offer.url} target="_blank" rel="noreferrer">Angebot öffnen</a> · {project.haben_offer.status}</p>}
        <Form caption="Angebot abgleichen" fields={[{name:'id',label:'Haben-Angebots-ID',value:project.haben_offer_id ?? ''}]} submit={({id})=>run(()=>api(`projects/${project.id}/haben-offer`,'POST',id?{id}:{}),'Angebot abgeglichen.')}/>
      </Expand>}
    </div></Panel>
  </div>;
}

type ProjectPlanningProps={project:Row;data:Data;run:Run;accountId:string};

function Planning(props:ProjectPlanningProps) {
  return <><ProjectReservations {...props}/><ProjectCalculation project={props.project} data={props.data} run={props.run}/></>;
}

function overlapsReservationDay(row:Row,{start,end}:ReturnType<typeof localDayRange>) {
  const bookingEnd=Date.parse(row.ends_at);
  const submillisecond=row.ends_at_submillisecond ?? microsecondsWithinMillisecond(row.ends_at);
  return start<end && Date.parse(row.starts_at)<end
    && (bookingEnd>start || (bookingEnd===start && submillisecond>0));
}

function ProjectReservations({project,data,run,accountId}:ProjectPlanningProps) {
  const [filters,setFilters]=useState(emptyReservationFilters);
  const resourceSelector=useRef<HTMLSelectElement>(null);
  const focusedStatusAction=useRef<HTMLButtonElement>(null);
  const {resource,status,day}=filters;
  const dayRange=day ? localDayRange(day) : undefined;
  const visibleReservations=data.reservations.filter((row)=>
    row.project_id===project.id
    && (!resource || (row.user_id?'user':'item')===resource)
    && (!status || row.status===status)
    && (!dayRange || overlapsReservationDay(row,dayRange)));
  const filtered=Boolean(resource || status || day);
  const equipmentIds=new Set(data.items.filter(item=>item.kind==='equipment').map(item=>item.id));

  useEffect(()=>{
    const button=focusedStatusAction.current;
    if(!button || button.isConnected) return;
    focusedStatusAction.current=null;
    if(document.activeElement===document.body) {
      resourceSelector.current?.focus();
    }
  },[data.reservations]);

  function rememberStatusFocus(event:FocusEvent<HTMLButtonElement>) {
    focusedStatusAction.current=event.currentTarget;
  }

  function forgetStatusFocus(event:FocusEvent<HTMLButtonElement>) {
    if(event.relatedTarget && focusedStatusAction.current===event.currentTarget) {
      focusedStatusAction.current=null;
    }
  }

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
  return <Panel title="Ressourcenplanung">
      <ReservationFilters filters={filters} onChange={setFilters} resourceSelector={resourceSelector}
        count={visibleReservations.length} timeZone={timeZone}/>
      <div className="panel-body compact-actions">
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
    </div>{filtered && !visibleReservations.length ? <p className="empty">Keine Reservierungen für diese Filter.</p>
    : <Table numeric={[2,3]} headers={['Ressource','Zeitraum','Menge','Noch ausgegeben','Status','Aktion']} rows={visibleReservations.map((row)=>({
      key:row.id,cells:[row.user_id ? name(data.users,row.user_id) : <><span>{inventoryName(data.items,row.item_id)}</span><small>{name(data.locations,row.location_id)}</small></>,
        <>{moment(row.starts_at)}<small>bis {moment(row.ends_at)}</small></>,row.quantity,
        equipmentIds.has(row.item_id) ? row.checked_out ?? '–' : '–',
        <Pill label={reservationStages[row.status]} tone={row.status==='firm'?'accent':'neutral'}/>,
        <div className="actions">{row.status==='tentative' && ['confirmed','running'].includes(project.stage) && (
          blockedPeople.has(row.user_id) ? <span className="subtle">Konto gesperrt</span>
            : <button type="button" onFocus={rememberStatusFocus} onBlur={forgetStatusFocus} onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'firm'}),'Fest reserviert.')}>Fest reservieren</button>
        )}
          {row.status!=='released' && <button type="button" onFocus={rememberStatusFocus} onBlur={forgetStatusFocus} onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'released'}),'Reservierung freigegeben.')}>Freigeben</button>}</div>],
    }))}/>}</Panel>;
}

function CalculationTotals({lines}:{lines:Row[]}) {
  let buy=0n;
  let sell=0n;
  for(const line of lines){
    const cents=calculationLineCents(line.quantity,line.unit_cents);
    if(line.kind==='buy') buy+=cents;
    if(line.kind==='sell') sell+=cents;
  }
  return <div className="metrics calculation-totals" role="group" aria-label="Kalkulationssummen">
    <div className="metric"><span>Einkauf netto</span><strong>{formatCalculationTotal(buy)}</strong></div>
    <div className="metric"><span>Verkauf netto</span><strong>{formatCalculationTotal(sell)}</strong></div>
  </div>;
}

function ProjectCalculation({project,data,run}:Omit<ProjectPlanningProps,'accountId'>) {
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const calculationPanel=useRef<HTMLElement>(null);
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  return <>
    <Panel title="Kalkulation" focusRef={calculationPanel} action={<OfferExport project={project} run={run}/>}>
      <div className="panel-body">
        <CalculationTotals lines={lines}/>
        <Expand title="Position anlegen"><Form caption="Position speichern" fields={[
        {name:'kind',label:'Art',choices:[{value:'buy',label:'Einkauf'},{value:'sell',label:'Verkauf'}],required:true},
        {name:'name',label:'Position',required:true},{name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},
        {name:'unit',label:'Einzelpreis netto in Euro',required:true},
      ]} submit={(v)=>run(()=>api('lines','POST',{project_id:project.id,kind:v.kind,name:v.name,quantity:Number(v.quantity),unit_cents:money(v.unit)}),'Position angelegt.')}/></Expand></div>
      <Table numeric={[2,3,4]} headers={['Art','Position','Menge','Einzelpreis','Gesamt','Aktion']} rows={lines.map((row)=>({key:row.id,cells:[
        row.kind==='buy'?'Einkauf':'Verkauf',row.name,row.quantity,euros(row.unit_cents),euros(row.unit_cents*row.quantity),
        <Expand title="Position bearbeiten">
          <div className="actions"><button type="button" className="danger" onClick={event=>setConfirmation({
            actionKey:`lines:${row.id}`,
            title:'Kalkulationsposition entfernen',
            description:`„${row.name}“ wird aus der Kalkulation dieses Projekts entfernt.`,
            actionLabel:'Position entfernen',danger:true,
            trigger:event.currentTarget,
            submit:()=>api(`lines/${row.id}`,'DELETE'),
            feedback:'Position entfernt.',
          })}>Position entfernen</button></div>
          <Form caption="Position aktualisieren" fields={[
            {name:'kind',label:'Art',value:row.kind,choices:[{value:'buy',label:'Einkauf'},{value:'sell',label:'Verkauf'}],required:true},
            {name:'name',label:'Position',value:row.name,required:true},
            {name:'quantity',label:'Menge',type:'number',min:1,value:row.quantity,required:true},
            {name:'unit',label:'Einzelpreis netto in Euro',value:(row.unit_cents/100).toFixed(2).replace('.',','),required:true},
          ]} submit={(v)=>run(()=>api(`lines/${row.id}`,'PATCH',{kind:v.kind,name:v.name,quantity:Number(v.quantity),unit_cents:money(v.unit)}),'Position aktualisiert.')}/>
        </Expand>,
      ]}))}/></Panel>
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={calculationPanel}/>}
  </>;
}

export function Controlling({project,data,run}:{project:Row;data:Data;run:Run}) {
  const [source,setSource]=useState('');
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  const costs=data.costs.filter((row)=>row.project_id===project.id);
  const sources=[...new Set<string>(costs.map(row=>row.source))].sort();
  const selectedSource=sources.includes(source)?source:'';
  useEffect(()=>{if(source!==selectedSource) setSource(selectedSource);},[source,selectedSource]);
  const visibleCosts=selectedSource?costs.filter(row=>row.source===selectedSource):costs;
  const budget=(kind:string)=>lines.filter((row)=>row.kind===kind).reduce((sum,row)=>sum+row.quantity*row.unit_cents,0);
  const actual=costs.reduce((sum,row)=>sum+row.cents,0);
  return <>
    <div className="metrics">{[
      ['Einkauf geplant',budget('buy')],['Ist-Kosten',actual],['Abweichung',actual-budget('buy')],['Verkauf geplant',budget('sell')],
    ].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{euros(Number(value))}</strong></div>)}</div>
    <Panel title="Belegbezogene Ist-Kosten">
      <div className="panel-body">
        <Field label="Kostenquelle filtern" className="filter">{props=><select {...props} value={selectedSource}
          onChange={event=>setSource(event.currentTarget.value)}>
          <option value="">Alle Quellen</option>
          {sources.map(value=><option key={value} value={value}>{value}</option>)}
        </select>}</Field>
        <Expand title="Ist-Kosten erfassen"><Form caption="Kosten speichern" fields={[
        {name:'reference',label:'Belegreferenz',required:true},{name:'name',label:'Bezeichnung',required:true},{name:'amount',label:'Netto in Euro',required:true},
      ]} submit={(fields)=>run(()=>api('costs','POST',{entries:[{project_id:project.id,source:'manual',reference:fields.reference,name:fields.name,cents:money(fields.amount)}]}),'Ist-Kosten gespeichert.')}/></Expand></div>
      <Table numeric={[3]} headers={['Belegreferenz','Bezeichnung','Quelle','Netto']} rows={visibleCosts.map((row)=>({key:row.id,cells:[row.reference,row.name,row.source,euros(row.cents)]}))}/>
      {selectedSource&&<div className="panel-body">
        <output>Summe der sichtbaren Belege <strong className="cost-subtotal">{euros(visibleCosts.reduce((sum,row)=>sum+row.cents,0))}</strong></output>
      </div>}
    </Panel>
  </>;
}
