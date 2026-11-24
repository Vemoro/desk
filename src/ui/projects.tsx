import { useEffect, useRef, useState } from 'react';
import { api, date, downloadPositions, euros, moment, money, name, projectStages, reservationStages, taskStages, type Row } from './client';
import { Expand, Form, options, Panel, Pill, Table, type Run } from './widgets';

export type Data = Record<'contacts'|'projects'|'tasks'|'users'|'lines'|'reservations'|'locations'|'items'|'movements'|'costs'|'stock',Row[]>;
type Flags = { haben:boolean; zammad:boolean };

const transitions:Record<string,string[]> = {
  inquiry:['planning','cancelled'], planning:['offered','cancelled'], offered:['planning','confirmed','cancelled'],
  confirmed:['running','cancelled'], running:['complete','cancelled'], complete:[],cancelled:[],
};
const dateTime = (value:string) => new Date(value).toISOString();

export function Projects({data,run,select}:{data:Data;run:Run;select:(id:string)=>void}) {
  const [filter,setFilter]=useState('');
  return <>
    <Panel title="Projekte">
      <div className="panel-body"><label className="filter"><span>Projekte suchen</span><input type="search" value={filter} onChange={(event)=>setFilter(event.target.value)}/></label>
        <Expand title="Projekt anlegen">
          <Form caption="Projekt speichern" fields={[
            { name:'name',label:'Projektname',required:true },
            { name:'contact_id',label:'Interessent',choices:options(data.contacts),required:true },
            { name:'due',label:'Termin',type:'date' },
            { name:'notes',label:'Notiz',type:'textarea' },
          ]} submit={(fields)=>run(async()=>{const project=await api('projects','POST',{...fields,due:fields.due||null});select(project.id);},'Projekt angelegt.')}/>
        </Expand>
      </div>
      <Table headers={['Projekt','Kontakt','Status','Termin']} rows={data.projects
        .filter((project)=>`${project.name} ${name(data.contacts,project.contact_id)}`.toLowerCase().includes(filter.toLowerCase()))
        .map((project)=>({key:project.id,cells:[<button className="text-button" onClick={()=>select(project.id)}>{project.name}</button>,
          name(data.contacts,project.contact_id),<Pill label={projectStages[project.stage]} tone={project.stage==='confirmed'?'accent':'neutral'}/>,date(project.due)]}))}/>
    </Panel>
  </>;
}

export function Project({project,data,run,flags,back}:{project:Row;data:Data;run:Run;flags:Flags;back:()=>void}) {
  const [tab,setTab]=useState('overview');
  const tabs:Record<string,string>={overview:'Überblick',tasks:'Kanban',planning:'Ressourcen & Kalkulation',finance:'Controlling',communication:'Kommunikation'};
  return <>
    <div className="breadcrumb"><button className="text-button" onClick={back}>Projekte</button><span>/</span>{project.name}</div>
    <div className="project-head"><div><h1>{project.name}</h1><div className="subtle">{name(data.contacts,project.contact_id)} · Termin {date(project.due)}</div></div><Pill label={projectStages[project.stage]} tone="accent"/></div>
    <nav className="tabs" aria-label="Projektansichten">{Object.entries(tabs).map(([key,label])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {tab==='overview' && <Overview project={project} data={data} run={run} haben={flags.haben}/>}
    {tab==='tasks' && <Kanban project={project} data={data} run={run}/>}
    {tab==='planning' && <Planning key={project.id} project={project} data={data} run={run}/>}
    {tab==='finance' && <Controlling project={project} data={data} run={run}/>}
    {tab==='communication' && <Communication project={project} zammad={flags.zammad} run={run}/>}
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
  return <>
    <Panel title="Aufgaben" action={<span className="subtle">{tasks.length} Aufgaben</span>}>
      <div className="panel-body"><Expand title="Aufgabe anlegen">
        <Form caption="Aufgabe speichern" fields={[
          {name:'name',label:'Aufgabe',required:true},{name:'assignee_id',label:'Verantwortlich',choices:options(data.users)},
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
          <strong>{task.name}</strong><span className="subtle">{name(data.users,task.assignee_id)} · {date(task.due)}</span>
          <label><span className="sr-only">Status für {task.name}</span><select value={task.status} onChange={(event)=>run(()=>api(`tasks/${task.id}`,'PATCH',{status:event.target.value}))}>
            {Object.entries(taskStages).map(([key,value])=><option value={key} key={key}>{value}</option>)}
          </select></label>
          <Expand title="Bearbeiten"><Form caption="Aufgabe aktualisieren" fields={[
            {name:'name',label:'Aufgabe',value:task.name,required:true},{name:'assignee_id',label:'Verantwortlich',value:task.assignee_id,choices:options(data.users)},{name:'due',label:'Fällig am',type:'date',value:task.due?.slice(0,10)},
          ]} submit={(fields)=>run(()=>api(`tasks/${task.id}`,'PATCH',{...fields,assignee_id:fields.assignee_id||null,due:fields.due||null}))}/></Expand>
        </article>)}
      </section>)}
    </div>
  </>;
}

function localDayRange(value:string) {
  const [year,month,day]=value.split('-').map(Number);
  function midnight(dayOfMonth:number) {
    const calendar=new Date(0);
    calendar.setUTCFullYear(year,month-1,dayOfMonth);
    return Number.isFinite(calendar.getTime()) ? Date.parse(calendar.toISOString().slice(0,-1)) : NaN;
  }
  return {start:midnight(day),end:midnight(day+1)};
}

function reservationDuration(start:string,end:string) {
  const totalMinutes=Math.floor((Date.parse(end)-Date.parse(start))/60_000);
  if(!Number.isFinite(totalMinutes) || totalMinutes<0) return null;
  const hours=Math.floor(totalMinutes/60);
  const minutes=totalMinutes%60;
  const minuteLabel=`${minutes} ${minutes===1?'Minute':'Minuten'}`;
  if(!hours) return minuteLabel;
  const hourLabel=`${hours} ${hours===1?'Stunde':'Stunden'}`;
  return minutes ? `${hourLabel} ${minuteLabel}` : hourLabel;
}

function Planning({project,data,run}:{project:Row;data:Data;run:Run}) {
  const [sort,setSort]=useState('standard');
  const [resourceFilter,setResourceFilter]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [dayFilter,setDayFilter]=useState('');
  const [onlyCheckedOut,setOnlyCheckedOut]=useState(false);
  const dayRange=dayFilter ? localDayRange(dayFilter) : null;
  const reservations=data.reservations.filter((row)=>row.project_id===project.id);
  const equipmentIds=new Set(data.items.filter(item=>item.kind==='equipment').map(item=>item.id));
  const visibleReservations=reservations.filter((row)=>
    (!resourceFilter || (row.user_id ? 'user' : 'item')===resourceFilter)
    && (!statusFilter || row.status===statusFilter)
    && (!onlyCheckedOut || (equipmentIds.has(row.item_id) && row.checked_out>0))
    && (!dayRange || (dayRange.start<dayRange.end
      && Date.parse(row.starts_at)<dayRange.end && Date.parse(row.ends_at)>dayRange.start)));
  if(sort==='start'){
    visibleReservations.sort((left,right)=>Date.parse(left.starts_at)-Date.parse(right.starts_at));
  }
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  const timeFields=[
    {name:'starts_at',label:'Von',type:'datetime-local',required:true},
    {name:'ends_at',label:'Bis',type:'datetime-local',required:true},
  ];
  return <>
    <Panel title="Ressourcenplanung" action={<span className="subtle">{visibleReservations.length} {visibleReservations.length===1?'Reservierung':'Reservierungen'}</span>}>
      <div className="panel-body form-grid">
        <label><span>Ressourcentyp</span><select value={resourceFilter} onChange={(event)=>setResourceFilter(event.target.value)}>
          <option value="">Alle</option><option value="user">Personal</option><option value="item">Inventar</option>
        </select></label>
        <label><span>Status filtern</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>
          <option value="">Alle</option>
          {Object.entries(reservationStages).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
        <label><span>Am Datum</span><input type="date" value={dayFilter} onChange={(event)=>setDayFilter(event.target.value)}/></label>
        <label className="reservation-check">
          <input type="checkbox" checked={onlyCheckedOut} onChange={(event)=>setOnlyCheckedOut(event.target.checked)}/>
          <span>Nur offene Geräteausgaben</span>
        </label>
        <label><span>Reservierungen sortieren</span><select value={sort} onChange={(event)=>setSort(event.target.value)}>
          <option value="standard">Standard</option>
          <option value="start">Frühester Beginn zuerst</option>
        </select></label>
        <button type="button" disabled={!resourceFilter&&!statusFilter&&!dayFilter&&!onlyCheckedOut}
          onClick={()=>{setResourceFilter('');setStatusFilter('');setDayFilter('');setOnlyCheckedOut(false);}}>Filter zurücksetzen</button>
      </div>
      <div className="panel-body compact-actions">
      <Expand title="Personal vormerken"><Form caption="Person vormerken" fields={[
        {name:'user_id',label:'Person',choices:options(data.users),required:true},...timeFields,
      ]} submit={(v)=>run(()=>api('reservations','POST',{project_id:project.id,user_id:v.user_id,quantity:1,starts_at:dateTime(v.starts_at),ends_at:dateTime(v.ends_at)}),'Person vorgemerkt.')}/></Expand>
      <Expand title="Inventar vormerken"><Form caption="Inventar vormerken" fields={[
        {name:'item_id',label:'Artikel',choices:options(data.items),required:true},
        {name:'location_id',label:'Lagerort',choices:options(data.locations),required:true},
        {name:'quantity',label:'Menge',type:'number',value:1,min:1,required:true},...timeFields,
      ]} submit={(v)=>run(()=>api('reservations','POST',{...v,project_id:project.id,quantity:Number(v.quantity),starts_at:dateTime(v.starts_at),ends_at:dateTime(v.ends_at)}),'Inventar vorgemerkt.')}/></Expand>
    </div>{visibleReservations.length ? <Table headers={['Ressource','Zeitraum','Menge','Noch ausgegeben','Status','Aktion']} rows={visibleReservations.map((row)=>({
      key:row.id,cells:[row.user_id ? name(data.users,row.user_id) : <>{name(data.items,row.item_id)}<small>{name(data.locations,row.location_id)}</small></>,
        <>{moment(row.starts_at)}<small>bis {moment(row.ends_at)}</small><small>{reservationDuration(row.starts_at,row.ends_at)}</small></>,row.quantity,
        equipmentIds.has(row.item_id) ? row.checked_out ?? '–' : '–',
        <Pill label={reservationStages[row.status]} tone={row.status==='firm'?'accent':'neutral'}/>,
        <div className="actions">{row.status==='tentative' && ['confirmed','running'].includes(project.stage) && <button onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'firm'}),'Fest reserviert.')}>Fest reservieren</button>}
          {row.status!=='released' && <button onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'released'}),'Reservierung freigegeben.')}>Freigeben</button>}</div>],
    }))}/> : <p className="empty" role="status">Keine Reservierungen für diese Filter.</p>}</Panel>
    <Panel title="Kalkulation" action={<button onClick={()=>run(async()=>downloadPositions(project,await api(`projects/${project.id}/offer-positions`)))}>Angebotspositionen exportieren</button>}>
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
          <button onClick={()=>{if(window.confirm('Diese Kalkulationsposition entfernen?')) void run(()=>api(`lines/${row.id}`,'DELETE'),'Position entfernt.');}}>Position entfernen</button>
        </Expand>,
      ]}))}/></Panel>
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

function plainText(html:string) {
  const template=document.createElement('template');
  template.innerHTML=html;
  for (const element of template.content.querySelectorAll('script,style,template')) element.remove();
  return template.content.textContent;
}

function Communication({project,zammad,run}:{project:Row;zammad:boolean;run:Run}) {
  const [conversation,setConversation]=useState<any>(null);
  const [problem,setProblem]=useState('');
  const [file,setFile]=useState<File>();
  const [composeVersion,setComposeVersion]=useState(0);
  const draftId=useRef<string | undefined>(undefined);
  async function refresh() {
    if (!zammad || !project.zammad_ticket_id) return;
    try {
      const current=await api(`projects/${project.id}/zammad`);
      if (draftId.current && current.outgoing.some((entry:Row)=>entry.id===draftId.current && entry.status==='sent')) {
        draftId.current=undefined;
        setFile(undefined);
        setComposeVersion((value)=>value+1);
      }
      setConversation(current);
      setProblem('');
    }
    catch(error) {setProblem(error instanceof Error ? error.message : 'Verlauf nicht verfügbar.');}
  }
  useEffect(()=>{setConversation(null);void refresh();},[project.id,project.zammad_ticket_id,zammad]);
  const request=(suffix:string,input:unknown)=>api(`projects/${project.id}/zammad/${suffix}`,'POST',input);
  return <>
    <Panel title="Externer Vorgang"><div className="panel-body"><Form caption="Verweis speichern" fields={[
      {name:'external_link',label:'Vorgangslink',type:'url',value:project.external_link},
      {name:'communication_note',label:'Kommunikationsnotiz',type:'textarea',value:project.communication_note},
    ]} submit={(input)=>run(()=>api(`projects/${project.id}`,'PATCH',input),'Verweis gespeichert.')}/></div></Panel>
    {zammad && <Panel title="Zammad" action={conversation?.ticket && <a href={conversation.ticket.url} target="_blank" rel="noreferrer">Ticket {conversation.ticket.number} öffnen</a>}>
      <div className="panel-body">
        {problem && <p role="alert" className="inline-error">{problem}</p>}
        {!project.zammad_ticket_id ? <>
          <Expand title="Vorhandenes Ticket verknüpfen"><Form caption="Ticket verknüpfen" fields={[{name:'id',label:'Ticket-ID',type:'number',min:1,required:true}]} submit={(v)=>run(()=>request('link',{id:Number(v.id)}),'Ticket verknüpft.')}/></Expand>
          <Expand title="Ticket anlegen"><Form caption="Ticket anlegen" fields={[
            {name:'title',label:'Betreff',required:true},{name:'customer',label:'Kunden-E-Mail',type:'email',required:true},
            {name:'note',label:'Interne Notiz',type:'textarea',required:true},
          ]} submit={(v)=>run(()=>request('tickets',v),'Ticket angelegt.')}/></Expand>
        </> : <>
          <button onClick={()=>void refresh()}>Verlauf aktualisieren</button>
          <ol className="thread">{conversation?.articles.map((article:any)=><li key={article.id}>
            <div><strong>{article.subject || 'Nachricht'}</strong><small>{article.from} · {moment(article.created_at)}</small></div>
            <p>{article.content_type==='text/html' ? plainText(article.body) : article.body}</p>
            {article.attachments?.map((attachment:{filename:string})=><small key={attachment.filename}>{attachment.filename}</small>)}
          </li>)}</ol>
          <Expand title="Antwort schreiben"><Form key={composeVersion} caption="Über Zammad senden" fields={[
            {name:'recipient',label:'Empfänger',type:'email',required:true},{name:'subject',label:'Betreff',required:true},{name:'body',label:'Nachricht',type:'textarea',required:true},
          ]} submit={(v)=>run(async()=>{
            const message:{[key:string]:unknown}={...v,id:draftId.current ??= crypto.randomUUID()};
            if(file) {
              if(file.size>5_242_880) throw new Error('PDF-Anhänge sind bis 5 MB möglich.');
              const bytes=new Uint8Array(await file.arrayBuffer());
              message.attachment={name:file.name,data:bytes.toBase64()};
            }
            const result=await request('messages',message);
            await refresh();
            if(result.status!=='sent') throw new Error('Sendezustand prüfen. Der Versuch steht im Projektverlauf.');
            setFile(undefined);
          },'Nachricht an Zammad übergeben.')}>
            <label className="wide"><span>PDF-Anhang</span><input type="file" accept="application/pdf,.pdf" onChange={(event)=>setFile(event.target.files?.[0])}/></label>
          </Form></Expand>
          <Table headers={['Sendeversuch','Status','Aktion']} rows={(conversation?.outgoing ?? []).map((entry:Row)=>({
            key:entry.id,cells:[entry.subject,({sent:'An Zammad übergeben',pending:'Ausstehend',failed:'Abgelehnt',unknown:'Ausgang unklar'} as Record<string,string>)[entry.status],
              entry.status==='sent' ? '–' : <div className="actions">
                <button onClick={()=>run(async()=>{await request(`outgoing/${entry.id}`,{retry:false});await refresh();})}>Prüfen</button>
                <button onClick={()=>{if(window.confirm('Ticketverlauf prüfen und, falls die Nachricht fehlt, erneut senden?')) void run(async()=>{await request(`outgoing/${entry.id}`,{retry:true});await refresh();});}}>Erneut senden</button>
              </div>],
          }))}/>
        </>}
      </div>
    </Panel>}
  </>;
}
