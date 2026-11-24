import { useEffect, useRef, useState } from 'react';
import { api, ApiError, date, downloadPositions, euros, moment, money, name, projectStages, reservationStages, taskStages, type Row } from './client';
import { ConfirmDialog, Expand, Form, options, Panel, Pill, Table, type Confirmation, type Run } from './widgets';

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
    {tab==='planning' && <Planning project={project} data={data} run={run}/>}
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

function Planning({project,data,run}:{project:Row;data:Data;run:Run}) {
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const calculationPanel=useRef<HTMLElement>(null);
  const reservations=data.reservations.filter((row)=>row.project_id===project.id);
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  const timeFields=[
    {name:'starts_at',label:'Von',type:'datetime-local',required:true},
    {name:'ends_at',label:'Bis',type:'datetime-local',required:true},
  ];
  return <>
    <Panel title="Ressourcenplanung"><div className="panel-body compact-actions">
      <Expand title="Personal vormerken"><Form caption="Person vormerken" fields={[
        {name:'user_id',label:'Person',choices:options(data.users),required:true},...timeFields,
      ]} submit={(v)=>run(()=>api('reservations','POST',{project_id:project.id,user_id:v.user_id,quantity:1,starts_at:dateTime(v.starts_at),ends_at:dateTime(v.ends_at)}),'Person vorgemerkt.')}/></Expand>
      <Expand title="Inventar vormerken"><Form caption="Inventar vormerken" fields={[
        {name:'item_id',label:'Artikel',choices:options(data.items),required:true},
        {name:'location_id',label:'Lagerort',choices:options(data.locations),required:true},
        {name:'quantity',label:'Menge',type:'number',value:1,min:1,required:true},...timeFields,
      ]} submit={(v)=>run(()=>api('reservations','POST',{...v,project_id:project.id,quantity:Number(v.quantity),starts_at:dateTime(v.starts_at),ends_at:dateTime(v.ends_at)}),'Inventar vorgemerkt.')}/></Expand>
    </div><Table headers={['Ressource','Zeitraum','Menge','Status','Aktion']} rows={reservations.map((row)=>({
      key:row.id,cells:[row.user_id ? name(data.users,row.user_id) : <>{name(data.items,row.item_id)}<small>{name(data.locations,row.location_id)}</small></>,
        <>{moment(row.starts_at)}<small>bis {moment(row.ends_at)}</small></>,row.quantity,
        <Pill label={reservationStages[row.status]} tone={row.status==='firm'?'accent':'neutral'}/>,
        <div className="actions">{row.status==='tentative' && ['confirmed','running'].includes(project.stage) && <button onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'firm'}),'Fest reserviert.')}>Fest reservieren</button>}
          {row.status!=='released' && <button onClick={()=>run(()=>api(`reservations/${row.id}`,'PATCH',{status:'released'}),'Reservierung freigegeben.')}>Freigeben</button>}</div>],
    }))}/></Panel>
    <Panel title="Kalkulation" focusRef={calculationPanel} action={<button onClick={()=>run(async()=>downloadPositions(project,await api(`projects/${project.id}/offer-positions`)),undefined,'read')}>Angebotspositionen exportieren</button>}>
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
          <button onClick={(event)=>setConfirmation({
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

function plainText(html:string) {
  const template=document.createElement('template');
  template.innerHTML=html;
  for (const element of template.content.querySelectorAll('script,style,template')) element.remove();
  return template.content.textContent;
}

function Communication({project,zammad,run}:{project:Row;zammad:boolean;run:Run}) {
  return <>
    <Panel title="Externer Vorgang"><div className="panel-body"><Form caption="Verweis speichern" fields={[
      {name:'external_link',label:'Vorgangslink',type:'url',value:project.external_link},
      {name:'communication_note',label:'Kommunikationsnotiz',type:'textarea',value:project.communication_note},
    ]} submit={(input)=>run(()=>api(`projects/${project.id}`,'PATCH',input),'Verweis gespeichert.')}/></div></Panel>
    {zammad && <ZammadConversation key={project.zammad_ticket_id ?? 'unlinked'} project={project} run={run}/>}
  </>;
}

type ZammadStatus='sent'|'pending'|'failed'|'unknown';
type ZammadMessage={
  id:string;
  recipient:string;
  subject:string;
  body:string;
  attachment?:{name:string;data:string};
};
type ZammadDraft={
  message:ZammadMessage;
  previousAttemptKey?:string;
  status:Exclude<ZammadStatus,'sent'>|'posting'|'unconfirmed'|'retry-unconfirmed'|'missing';
};

function ZammadConversation({project,run}:{project:Row;run:Run}) {
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const zammadPanel=useRef<HTMLElement>(null);
  const [conversation,setConversation]=useState<any>(null);
  const [problem,setProblem]=useState('');
  const [file,setFile]=useState<File>();
  const [composeVersion,setComposeVersion]=useState(0);
  const [draft,setDraftState]=useState<ZammadDraft>();
  const draftRef=useRef<ZammadDraft|undefined>(undefined);

  function setDraft(value?:ZammadDraft) {
    draftRef.current=value;
    setDraftState(value);
  }

  function resetDraft() {
    setDraft();
    setFile(undefined);
    setComposeVersion(value=>value+1);
  }

  function updateDraft(id:string,status:ZammadStatus,attemptKey?:string) {
    const current=draftRef.current;
    if(current?.message.id!==id) return;
    // Dieselbe Ablehnung kann aus der Zeit vor der Wiederholung stammen.
    if(current.status==='retry-unconfirmed' && status==='failed'
      && (!attemptKey || !current.previousAttemptKey || attemptKey===current.previousAttemptKey)) return;
    if(status==='sent') resetDraft();
    else setDraft({...current,status});
  }
  const active=useRef(false);
  const requestVersion=useRef(0);

  async function refresh() {
    if (!active.current || !project.zammad_ticket_id) return;
    const observedDraft=draftRef.current;
    const version=++requestVersion.current;
    const isCurrent=()=>active.current && requestVersion.current===version;
    try {
      const current=await api(`projects/${project.id}/zammad`);
      if (!isCurrent()) return;
      if(observedDraft && draftRef.current===observedDraft && observedDraft.status!=='posting') {
        const entry=current.outgoing.find((attempt:{id:string;status:ZammadStatus;attempt_key?:string})=>attempt.id===observedDraft.message.id);
        if(entry) updateDraft(entry.id,entry.status,entry.attempt_key);
      }
      setConversation(current);
      setProblem('');
    }
    catch(error) {
      if (isCurrent()) setProblem(error instanceof Error ? error.message : 'Verlauf nicht verfügbar.');
    }
  }
  useEffect(()=>{
    active.current=true;
    void refresh();
    return ()=>{
      active.current=false;
      requestVersion.current++;
    };
  },[]);
  const request=(suffix:string,input:unknown)=>api<{id:string;status:ZammadStatus;attempt_key?:string}>(`projects/${project.id}/zammad/${suffix}`,'POST',input);

  async function transmit(message:ZammadMessage,firstAttempt:boolean) {
    setDraft({message,status:'posting'});
    let result;
    try {
      result=await request('messages',message);
    } catch(error) {
      setDraft(firstAttempt && error instanceof ApiError && error.status===400
        ? undefined
        : {message,status:'unconfirmed'});
      throw error;
    }
    updateDraft(message.id,result.status);
    await refresh();
    if(result.status!=='sent') throw new Error('Sendezustand prüfen. Der Versuch steht im Projektverlauf.');
  }

  async function submitDraft(values:Record<string,string>) {
    if(draftRef.current) return;
    let message:ZammadMessage={id:crypto.randomUUID(),recipient:values.recipient,subject:values.subject,body:values.body};
    setDraft({message,status:'posting'});
    try {
      if(file) {
        if(file.size>5_242_880) throw new Error('PDF-Anhänge sind bis 5 MB möglich.');
        const bytes=new Uint8Array(await file.arrayBuffer());
        message={...message,attachment:{name:file.name,data:bytes.toBase64()}};
      }
    } catch(error) {
      setDraft();
      throw error;
    }
    await transmit(message,true);
  }

  async function reviewAttempt(id:string,retry:boolean,previousAttemptKey?:string) {
    const current=draftRef.current;
    const tracked=current?.message.id===id && current.status!=='posting' ? current : undefined;
    const observed:ZammadDraft|undefined=retry && tracked ? {...tracked,status:'posting',previousAttemptKey} : tracked;
    if(retry && observed) setDraft(observed);

    let result;
    try {
      result=await request(`outgoing/${id}`,{retry,expected_attempt:retry?previousAttemptKey:undefined});
    } catch(error) {
      if(retry && observed && draftRef.current===observed){
        if(error instanceof ApiError && error.status===424) setDraft(tracked);
        else setDraft({...observed,status:'retry-unconfirmed'});
      }
      throw error;
    }
    if(observed && draftRef.current===observed) updateDraft(id,result.status,result.attempt_key);
    await refresh();
    return result.status;
  }

  async function checkDraft() {
    const current=draftRef.current;
    if(!current || current.status==='posting' || current.status==='missing' || current.status==='failed') return;
    try {
      await reviewAttempt(current.message.id,false);
    } catch(error) {
      if(current.status!=='unconfirmed' || !(error instanceof ApiError) || error.status!==404) throw error;
      if(draftRef.current===current) setDraft({...current,status:'missing'});
      await refresh();
    }
  }

  const draftIsListed=draft && conversation?.outgoing.some((entry:Row)=>entry.id===draft.message.id);
  const canCheckDraft=draft && (
    draft.status==='unconfirmed' || draft.status==='retry-unconfirmed'
    || (!draftIsListed && (draft.status==='pending' || draft.status==='unknown'))
  );
  const draftNotice=draft && {
    posting:'Desk übermittelt den Entwurf an Zammad.',
    unconfirmed:'Der Versandstatus ist unklar. Prüfe zuerst den Sendeversuch.',
    'retry-unconfirmed':'Der Ausgang der Wiederholung ist unklar. Prüfe den Versuch oder wiederhole ihn in der Liste.',
    missing:'Desk hat keinen Sendeversuch für diesen Entwurf gefunden.',
    pending:draftIsListed?'Der Sendeversuch steht aus. Prüfe den Versuch in der Liste.':'Der Sendeversuch steht aus. Prüfe den Sendeversuch.',
    unknown:draftIsListed?'Der Ausgang ist unklar. Prüfe den Versuch in der Liste.':'Der Ausgang ist unklar. Prüfe den Sendeversuch.',
    failed:'Zammad hat die Nachricht abgelehnt. Wiederhole den Versuch in der Liste oder beginne einen neuen Entwurf.',
  }[draft.status];
  return <>
    <Panel title="Zammad" focusRef={zammadPanel} action={conversation?.ticket && <a href={conversation.ticket.url} target="_blank" rel="noreferrer">Ticket {conversation.ticket.number} öffnen</a>}>
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
          <Expand title="Antwort schreiben">
            <fieldset className="compose-fields" disabled={Boolean(draft)} aria-label="Zammad-Entwurf">
              <Form key={composeVersion} caption="Über Zammad senden" fields={[
                {name:'recipient',label:'Empfänger',type:'email',required:true},{name:'subject',label:'Betreff',required:true},{name:'body',label:'Nachricht',type:'textarea',required:true},
              ]} submit={(values)=>run(()=>submitDraft(values),'Nachricht an Zammad übergeben.')}>
                <label className="wide"><span>PDF-Anhang</span><input type="file" accept="application/pdf,.pdf" onChange={(event)=>setFile(event.target.files?.[0])}/></label>
              </Form>
            </fieldset>
            {draft && <div>
              <p role="status">{draftNotice}</p>
              {canCheckDraft && <button onClick={()=>void run(checkDraft)}>Sendeversuch prüfen</button>}
              {draft.status==='missing' && <button onClick={()=>void run(async()=>{
                const current=draftRef.current;
                if(current?.status==='missing') await transmit(current.message,false);
              },'Nachricht an Zammad übergeben.')}>Unveränderten Entwurf erneut übermitteln</button>}
              {draft.status==='failed' && <button onClick={()=>{if(draftRef.current?.status==='failed') resetDraft();}}>Neuen Entwurf beginnen</button>}
            </div>}
          </Expand>
          <Table headers={['Sendeversuch','Letzter Versuch','Status','Aktion']} rows={(conversation?.outgoing ?? []).map((entry:Row)=>({
            key:entry.id,cells:[entry.subject,entry.attempted_at ? <time dateTime={entry.attempted_at}>{moment(entry.attempted_at)}</time> : '–',
              ({sent:'An Zammad übergeben',pending:'Ausstehend',failed:'Abgelehnt',unknown:'Ausgang unklar'} as Record<string,string>)[entry.status],
              entry.status==='sent' ? '–' : <div className="actions">
                <button disabled={draft?.message.id===entry.id && draft.status==='posting'} onClick={()=>run(()=>reviewAttempt(entry.id,false))}>Prüfen</button>
                <button disabled={draft?.message.id===entry.id && draft.status==='posting'} onClick={(event)=>setConfirmation({
                  title:'Zammad-Sendeversuch wiederholen',
                  description:`Desk prüft den Ticketverlauf auf „${entry.subject}“. Fehlt die Nachricht, sendet Zammad sie erneut.`,
                  actionLabel:'Erneut senden',
                  trigger:event.currentTarget,
                  submit:async()=>{
                    const status=await reviewAttempt(entry.id,true,entry.attempt_key);
                    if(status==='failed') throw new Error('Zammad hat den Sendeversuch abgelehnt.');
                    if(status!=='sent') throw new Error('Der Ausgang des Sendeversuchs ist weiterhin unklar.');
                  },
                  feedback:'Sendeversuch bestätigt.',
                })}>Erneut senden</button>
              </div>],
          }))}/>
        </>}
      </div>
    </Panel>
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={zammadPanel}/>}
  </>;
}
