import { useEffect, useRef, useState } from 'react';
import { all, api, ApiError, calendarDate, compileCsv, euros, inventoryLabel, inventoryName, moment, money, movementStages, name, projectStages, type Row } from './client';
import { Project, Projects, type Data } from './projects';
import { PasskeyLogin, PasskeySettings } from './passkeys';
import { AccountPassword } from './account-password';
import { WeeklyPlanning } from './weekly-planning';
import { ConfirmationRequests, ConfirmDialog, Expand, Form, hasPendingWrite, noWrite, options, Panel, Pill, Table, type Confirmation, type Run } from './widgets';
import { Icon } from './icons';
import { Navigation, sections, type Person, type Section } from './navigation';

const collections = ['contacts','projects','tasks','users','lines','reservations','locations','items','movements','costs','stock'] as const;
const initialData=Object.fromEntries(collections.map((key)=>[key,[]])) as unknown as Data;

export function Desk() {
  const [person,setPerson]=useState<Person|null>();
  const [data,setData]=useState<Data>(initialData);
  const [flags,setFlags]=useState({haben:false,zammad:false});
  const [section,setSection]=useState<Section>('dashboard');
  const [projectId,setProjectId]=useState('');
  const [planningWeek,setPlanningWeek]=useState<string>();
  const [theme,setTheme]=useState('light');
  const [notice,setNotice]=useState({message:'',error:false});
  const [refreshRequired,setRefreshRequired]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const savedVersion=useRef(0);
  const displayedSavedVersion=useRef(0);
  const loadVersion=useRef(0);
  const sessionVersion=useRef(0);
  const signInPending=useRef(false);
  const logoutPending=useRef(false);
  const confirmationRequests=useRef(new Map<string,Promise<boolean>>());
  const project=data.projects.find((row)=>row.id===projectId);

  async function load(session:number) {
    if(session!==sessionVersion.current) return false;
    const request=++loadVersion.current;
    const saved=savedVersion.current;
    const isCurrent=()=>session===sessionVersion.current && request===loadVersion.current && saved===savedVersion.current;
    try {
      const [integrations,...result]=await Promise.all([api('integrations'),...collections.map((collection)=>
        collection==='users'||collection==='stock'?api<Row[]>(collection):all(collection),
      )]);
      if(!isCurrent()) return false;
      setFlags(integrations);
      setData(Object.fromEntries(collections.map((key,index)=>[key,result[index]])) as unknown as Data);
      displayedSavedVersion.current=saved;
      setRefreshRequired(false);
      return true;
    } catch(error) {
      if(!isCurrent()) return false;
      throw error;
    }
  }

  function endSession() {
    sessionVersion.current++;
    confirmationRequests.current=new Map();
    displayedSavedVersion.current=savedVersion.current;
    setPerson(null);
    setData(initialData);
    setPlanningWeek(undefined);
    setFlags({haben:false,zammad:false});
    setRefreshRequired(false);
    setRefreshing(false);
  }


  useEffect(()=>{
    const current=localStorage.getItem('desk-theme');
    if(current==='dark')setTheme(current);
    function onHash() {
      const [route,id]=location.hash.slice(1).split('/');
      if(route in sections) {setSection(route as Section);setProjectId(id??'');}
    }
    onHash();
    window.addEventListener('hashchange',onHash);
    const session=sessionVersion.current;
    void (async()=>{
      try {const current=await api<Person>('me'); if(await load(session)) setPerson(current);}
      catch(error) {
        if(session!==sessionVersion.current) return;
        endSession();
        if(!(error instanceof ApiError) || error.status!==401) setNotice({message:'Desk-Daten konnten nicht geladen werden.',error:true});
      }
    })();
    return ()=>window.removeEventListener('hashchange',onHash);
  },[]);

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('desk-theme',theme);},[theme]);

  async function refreshSavedData(session:number) {
    const version=savedVersion.current;
    try {
      return await load(session);
    } catch(error) {
      if(session!==sessionVersion.current || version!==savedVersion.current) return false;
      if(error instanceof ApiError && error.status===401) {
        endSession();
        setNotice({message:'Die Änderung wurde gespeichert. Bitte erneut anmelden, um die Ansicht zu aktualisieren.',error:false});
      } else {
        setRefreshRequired(true);
      }
      return false;
    }
  }

  async function retryRefresh() {
    const session=sessionVersion.current;
    setRefreshing(true);
    try { await refreshSavedData(session); }
    finally { if(session===sessionVersion.current) setRefreshing(false); }
  }

  const run:Run=async(operation,feedback,{kind='write',reportWriteRejection,reportInlineError}={})=>{
    const session=sessionVersion.current;
    const isCurrent=()=>session===sessionVersion.current;
    setNotice({message:'',error:false});
    try {
      const result=await operation(isCurrent);
      if(!isCurrent()) return false;
      if(result===noWrite) return true;
      if(kind==='read') {
        const refreshed=displayedSavedVersion.current===savedVersion.current
          ? await load(session)
          : await refreshSavedData(session);
        if(!refreshed) return true;
      }
    } catch(error) {
      if(!isCurrent()) return false;
      if(reportWriteRejection && error instanceof ApiError && [400,409].includes(error.status)) throw error;
      if(error instanceof ApiError && error.status===401) endSession();
      else if(reportInlineError) throw error;
      setNotice({message:error instanceof Error?error.message:'Die Aktion ist fehlgeschlagen.',error:true});
      return false;
    }
    if(kind==='write') {
      savedVersion.current++;
      if(!await refreshSavedData(session)) return true;
    }
    if(feedback && isCurrent())setNotice({message:feedback,error:false});
    return true;
  };

  function navigate(to:Section,id='') {
    setNotice({message:'',error:false});
    setSection(to);
    setProjectId(id);
    location.hash=id?`${to}/${id}`:to;
  }

  async function signIn(authenticate:()=>Promise<unknown>) {
    if(logoutPending.current) throw new Error('Die Abmeldung läuft noch. Versuche es gleich erneut.');
    if(signInPending.current) throw new Error('Eine Anmeldung läuft bereits.');
    signInPending.current=true;
    const session=sessionVersion.current;
    try {
      await authenticate();
      if(session!==sessionVersion.current) return;
      const current=await api<Person>('me');
      if(await load(session)) {
        setPerson(current);
        setNotice({message:'',error:false});
      }
    } finally {
      signInPending.current=false;
    }
  }

  const alert=notice.message && <div className={`notice ${notice.error?'error':''}`} role={notice.error?'alert':'status'}>{notice.message}</div>;
  const themeButton=<button className="theme" onClick={()=>setTheme(theme==='light'?'dark':'light')} aria-label={theme==='light'?'Dunkles Design':'Helles Design'}><Icon name={theme==='light'?'moon':'sun'}/></button>;

  if(person===undefined) return <main className="login"><p>Desk wird geladen …</p></main>;
  if(!person) return <main className="login">
    <div className="login-box"><div className="login-brand"><span className="mark">D</span><strong>Desk</strong>{themeButton}</div>
      <h1>Anmelden</h1>{alert}
      <Form caption="Anmelden" fields={[
        {name:'email',label:'E-Mail',type:'email',required:true,autoComplete:'username'},
        {name:'password',label:'Passwort',type:'password',required:true,autoComplete:'current-password'},
      ]} submit={(input)=>signIn(()=>api('login','POST',input))}/>
      <PasskeyLogin onSignIn={signIn}/>
    </div></main>;

  return <ConfirmationRequests value={confirmationRequests.current}><div className="frame">
    <a href="#desk-main" className="skip">Zum Inhalt</a>
    <Navigation person={person} section={section} themeButton={themeButton} onNavigate={navigate} onLogout={async()=>{
      if(logoutPending.current) return;
      logoutPending.current=true;
      const session=sessionVersion.current;
      try {
        await api('logout','POST');
        if(session!==sessionVersion.current) return;
        endSession();
        setNotice({message:'',error:false});
      } catch {
        if(session===sessionVersion.current) setNotice({message:'Abmelden fehlgeschlagen.',error:true});
      } finally {
        logoutPending.current=false;
      }
    }}/>
    <main id="desk-main" tabIndex={-1} className="main">
      {section!=='projects'||!project?<header className="page-title"><h1>{sections[section][0]}</h1></header>:null}
      {alert}
      {refreshRequired && <div className="notice actions">
        <p role="status">Die Änderung wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.</p>
        <button type="button" disabled={refreshing} onClick={()=>void retryRefresh()}>
          {refreshing?'Ansicht wird aktualisiert …':'Ansicht aktualisieren'}
        </button>
      </div>}
      {section==='dashboard' && <Dashboard data={data} select={(id)=>navigate('projects',id)} open={()=>navigate('projects')}/>}
      {section==='projects' && (project?<Project key={project.id} project={project} data={data} run={run} flags={flags} accountId={person.id} back={()=>navigate('projects')}/>
        :<Projects data={data} run={run} select={(id)=>navigate('projects',id)}/>)}
      {section==='planning' && <WeeklyPlanning selectedWeek={planningWeek} onWeek={setPlanningWeek} onSessionExpired={()=>{
        endSession();
        setNotice({message:'Bitte erneut anmelden, um die Wochenplanung zu öffnen.',error:false});
      }} openProject={id=>{
        navigate('projects',id);
        if(!data.projects.some(plan=>plan.id===id)) void run(async()=>{},undefined,{kind:'read'});
      }}/>}
      {section==='contacts' && <Contacts data={data} run={run} haben={flags.haben} openProject={id=>navigate('projects',id)}/>}
      {section==='warehouse' && <Warehouse data={data} run={run} accountId={person.id}/>}
      {section==='costs' && <Costs data={data} run={run}/>}
      {section==='account' && <><AccountPassword/><PasskeySettings/><BuildInfo/></>}
      {section==='settings'&&person.role==='admin' && <Settings data={data} run={run} flags={flags} accountId={person.id}/>}
    </main>
  </div></ConfirmationRequests>;
}

function BuildInfo() {
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
      <label><span>Version und Git-Commit</span>
        <textarea rows={2} readOnly value={value} onFocus={(event)=>event.currentTarget.select()}/>
      </label>
      <div className="actions">
        <button type="button" onClick={copy}>Kopieren</button>
        {copyStatus && <small role="status">{copyStatus}</small>}
      </div>
    </div>
  </Panel>;
}

function Dashboard({data,select,open}:{data:Data;select:(id:string)=>void;open:()=>void}) {
  const active=data.projects.filter((project)=>!['complete','cancelled'].includes(project.stage));
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
    <Panel title="Fällige Aufgaben"><Table headers={['Aufgabe','Projekt','Verantwortlich','Termin']} rows={data.tasks.filter((task)=>task.status!=='done'&&task.due)
      .sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,10)
      .map((task)=>({key:task.id,cells:[task.name,<button className="text-button" onClick={()=>select(task.project_id)}>{name(data.projects,task.project_id)}</button>,name(data.users,task.assignee_id),calendarDate(task.due)]}))}/></Panel>
  </>;
}

function Contacts({data,run,haben,openProject}:{data:Data;run:Run;haben:boolean;openProject:(id:string)=>void}) {
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState('');
  const [comparison,setComparison]=useState<any>();
  const [duplicates,setDuplicates]=useState<{input:Record<string,string>;contacts:Row[]}>();
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const contactPanel=useRef<HTMLElement>(null);
  const contactDetail=useRef<HTMLElement>(null);
  const duplicateWarning=useRef<HTMLElement>(null);
  const [focusContact,setFocusContact]=useState('');
  const contact=data.contacts.find((row)=>row.id===selected);
  const projects=contact ? data.projects.filter((project)=>project.contact_id===contact.id) : [];
  useEffect(()=>{
    if(focusContact && contact?.id===focusContact){
      contactDetail.current?.focus();
      setFocusContact('');
    }
  },[focusContact,contact?.id]);
  useEffect(()=>{if(duplicates) duplicateWarning.current?.focus();},[duplicates]);

  function openContact(id:string) {
    setSelected(id);
    setComparison(undefined);
    setFocusContact(id);
  }

  function fields(record?:Row) {
    return [{name:'name',label:'Name',value:record?.name,required:true},{name:'email',label:'E-Mail',value:record?.email},
      {name:'phone',label:'Telefon',value:record?.phone,type:'tel'},{name:'notes',label:'Notiz',value:record?.notes,type:'textarea'}];
  }

  async function saveContact(input:Record<string,string>,isCurrent:()=>boolean) {
    const result=await api('contacts','POST',input);
    if(!isCurrent()) return;
    setSelected(result.id);
    setComparison(undefined);
  }

  async function createContact(fields:Record<string,string>) {
    const input={...fields,name:fields.name.trim(),email:fields.email.trim()};
    const contactName=input.name.toLowerCase();
    const email=input.email.toLowerCase();
    const matches=data.contacts.filter((row)=>row.name.trim().toLowerCase()===contactName
      || (email && (row.email ?? '').trim().toLowerCase()===email));
    const contacts=[...new Map(matches.map((row)=>[row.id,row])).values()];
    if(contacts.length){
      setDuplicates({input,contacts});
      return;
    }
    setDuplicates(undefined);
    await run(isCurrent=>saveContact(input,isCurrent),'Kontakt angelegt.');
  }

  async function sync(input:unknown) {
    if(!contact)return;
    return run(async(isCurrent)=>{
      const result=await api(`contacts/${contact.id}/haben`,'POST',input);
      if(result.action==='error')throw new Error(result.message);
      if(isCurrent()) setComparison(result);
      if(result.action==='conflict') return noWrite;
    });
  }

  return <>
    <Panel title="Interessenten und Kontakte" focusRef={contactPanel} action={haben&&<button onClick={()=>run(()=>api('haben/contacts/import','POST',{}),'Haben-Kontakte importiert.')}>Aus Haben importieren</button>}>
      <div className="panel-body"><label className="filter"><span>Kontakte suchen</span><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)}/></label>
        <Expand title="Kontakt anlegen">
          <div onInput={()=>setDuplicates(undefined)}>
            <Form caption="Kontakt speichern" fields={fields()} submit={createContact}/>
          </div>
          {duplicates&&<section ref={duplicateWarning} tabIndex={-1} className="notice duplicate-contacts" aria-label="Mögliche Dubletten">
            <h3>Mögliche Dubletten</h3>
            <p>Desk hat Kontakte mit gleichem Namen oder gleicher E-Mail-Adresse gefunden.</p>
            <ul>{duplicates.contacts.map((row)=><li key={row.id}>
              <button type="button" className="text-button" onClick={()=>openContact(row.id)}>
                {row.email?`${row.name} · ${row.email}`:row.name}
              </button>
            </li>)}</ul>
            <button type="button" onClick={(event)=>setConfirmation({
              actionKey:`contact-create:${JSON.stringify(duplicates.input)}`,
              title:'Neuen Kontakt anlegen',
              description:`„${duplicates.input.name}“ wird als zusätzlicher Kontakt gespeichert.`,
              actionLabel:'Kontakt anlegen',
              trigger:event.currentTarget,
              submit:isCurrent=>saveContact(duplicates.input,isCurrent),
              feedback:'Kontakt angelegt.',
            })}>Trotzdem anlegen</button>
          </section>}
        </Expand></div>
      <Table headers={['Name','E-Mail','Telefon']} rows={data.contacts.filter((row)=>`${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase()))
        .map((row)=>({key:row.id,cells:[<button type="button" className="text-button" onClick={()=>openContact(row.id)}>{row.name}</button>,row.email||'–',row.phone||'–']}))}/>
    </Panel>
    {contact&&<Panel title={contact.name} focusRef={contactDetail}><div className="panel-body">
      <Form key={contact.id} caption="Änderungen speichern" fields={fields(contact)} submit={(input)=>run(()=>api(`contacts/${contact.id}`,'PATCH',input),'Kontakt gespeichert.')}/>
      {haben&&<Expand title="Haben-Kontakt">
        <Form caption="Abgleichen" fields={[{name:'link_id',label:'Vorhandene Haben-Kontakt-ID',value:contact.haben_id ?? ''}]}
          submit={({link_id})=>sync(link_id?{link_id}:{})}/>
        {comparison?.action==='conflict' && <div className="conflict">
          <p>Beide Stände unterscheiden sich. Welcher soll übernommen werden?</p>
          <Table headers={['Quelle','Name','E-Mail','Telefon']} rows={[
            {key:'desk',cells:['Desk',comparison.desk.name,comparison.desk.email,comparison.desk.phone]},
            {key:'haben',cells:['Haben',comparison.haben.name,comparison.haben.email,comparison.haben.phone]},
          ]}/>
          <div className="actions"><button onClick={()=>sync({prefer:'desk',link_id:comparison.haben_id})}>Desk übernehmen</button>
            <button onClick={()=>sync({prefer:'haben',link_id:comparison.haben_id})}>Haben übernehmen</button></div>
        </div>}
        {comparison&&comparison.action!=='conflict'&&<p role="status">Abgleich abgeschlossen.</p>}
      </Expand>}
    </div>
      <section className="contact-projects" aria-labelledby="contact-projects-title">
        <div className="panel-body">
          <h3 id="contact-projects-title">Zugehörige Projekte</h3>
          {!projects.length&&<p className="subtle">Diesem Kontakt sind noch keine Projekte zugeordnet.</p>}
        </div>
        {projects.length>0&&<Table headers={['Projekt','Status','Termin']} rows={projects.map((project)=>({key:project.id,cells:[
          <button type="button" className="text-button" onClick={()=>openProject(project.id)}>{project.name}</button>,
          <Pill label={projectStages[project.stage]} tone={project.stage==='confirmed'?'accent':'neutral'}/>,
          calendarDate(project.due),
        ]}))}/>}
      </section>
    </Panel>}
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={(confirmed)=>{
      setConfirmation(undefined);
      if(confirmed) setDuplicates(undefined);
    }} fallbackFocus={contactPanel}/>}
  </>;
}

function Warehouse({data,run,accountId}:{data:Data;run:Run;accountId:string}) {
  const bookings=data.reservations.filter((row)=>row.item_id&&(row.status==='firm'||row.checked_out>0));
  const [projectFilter,setProjectFilter]=useState('');
  const [locationFilter,setLocationFilter]=useState('');
  const [bookingId,setBookingId]=useState('');
  const [correctionId,setCorrectionId]=useState('');
  const [stockQuery,setStockQuery]=useState('');
  const [stockLocation,setStockLocation]=useState('');
  const [onlyAvailable,setOnlyAvailable]=useState(false);
  const itemsById=new Map(data.items.map((item)=>[item.id,item]));
  const stockTerm=stockQuery.trim().toLowerCase();
  const stockFilterActive=Boolean(stockTerm || stockLocation || onlyAvailable);
  const visibleStock=data.stock.filter((row)=>{
    const item=itemsById.get(row.item_id);
    return (!onlyAvailable || row.free>0)
      && (!stockLocation || row.location_id===stockLocation)
      && (!stockTerm || [item?.name,item?.code,item?.inventory_number]
        .some((value)=>value?.toLowerCase().includes(stockTerm)));
  });
  const openCheckouts=bookings.filter((row)=>row.checked_out>0);
  const visibleCheckouts=openCheckouts.filter((row)=>
    (!projectFilter || row.project_id===projectFilter) && (!locationFilter || row.location_id===locationFilter));
  const bookingChoices=bookings.map((row)=>({
    value:row.id,
    label:`${name(data.projects,row.project_id)} · ${inventoryName(data.items,row.item_id)} · ${name(data.locations,row.location_id)} · ${moment(row.starts_at)} bis ${moment(row.ends_at)}`,
  }));
  const selectedBooking=bookingChoices.find((choice)=>choice.value===bookingId);
  const movements=new Map(data.movements.map(row=>[row.id,row]));
  const corrected=new Map<string,number>();
  for(const row of data.movements) {
    if(row.corrects_movement_id) {
      corrected.set(row.corrects_movement_id,(corrected.get(row.corrects_movement_id) ?? 0)+row.quantity);
    }
  }
  return <>
    <Panel title="Bestand je Lagerort"><div className="panel-body compact-actions">
      <Expand title="Lagerort anlegen"><Form caption="Lagerort speichern" fields={[{name:'name',label:'Lagerort',required:true}]}
        submit={(input)=>run(()=>api('locations','POST',input),'Lagerort angelegt.')}/></Expand>
      <Expand title="Artikel anlegen"><Form caption="Artikel speichern" fields={[
        {name:'name',label:'Artikelname',required:true},{name:'code',label:'Artikelnummer',required:true},
        {name:'kind',label:'Artikelart',choices:[{value:'equipment',label:'Gerät'},{value:'consumable',label:'Verbrauchsmaterial'}],required:true},
        {name:'inventory_number',label:'Inventarnummer für Einzelgerät'},
      ]} submit={(input)=>run(()=>api('items','POST',{...input,inventory_number:input.inventory_number||null}),'Artikel angelegt.')}/></Expand>
      <Expand title="Wareneingang"><Form caption="Wareneingang buchen" retryScope={`movements:${accountId}:receive`} fields={[
        {name:'item_id',label:'Artikel',choices:options(data.items,inventoryLabel),required:true},{name:'location_id',label:'Lagerort',choices:options(data.locations),required:true},
        {name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},{name:'project_id',label:'Projektbezug',choices:options(data.projects)},
      ]} submit={(input,key)=>run(()=>api('movements','POST',{action:'receive',item_id:input.item_id,location_id:input.location_id,
        quantity:Number(input.quantity),project_id:input.project_id||undefined},key),'Wareneingang erfasst.',{reportWriteRejection:true})}/></Expand>
      <Expand title="Ausgabe, Rückgabe oder Verbrauch"><Form caption="Bewegung buchen" retryScope={`movements:${accountId}:booking`} fields={[
        {name:'action',label:'Bewegungsart',choices:[{value:'issue',label:'Ausgabe'},{value:'return',label:'Rückgabe'},{value:'consume',label:'Verbrauch'}],required:true},
        {name:'reservation_id',label:'Projektreservierung',choices:bookingChoices,required:true,value:selectedBooking?.value,onChange:setBookingId,describedBy:selectedBooking?'warehouse-booking-details':undefined},
        {name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},
      ]} submit={(input,key)=>run(()=>api('movements','POST',{...input,quantity:Number(input.quantity)},key),'Lagerbewegung gebucht.',{reportWriteRejection:true})}>
        {selectedBooking&&<p id="warehouse-booking-details" className="wide booking-details">{selectedBooking.label}</p>}
      </Form></Expand>
    </div>
    <div className="panel-body form-grid">
      <label><span>Bestand suchen</span><input type="search" value={stockQuery} onChange={(event)=>setStockQuery(event.target.value)}/></label>
      <label><span>Lagerort filtern</span><select value={stockLocation} onChange={(event)=>setStockLocation(event.target.value)}>
        <option value="">Alle Lagerorte</option>
        {options(data.locations).map(({value,label})=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="checkbox-label">
        <input type="checkbox" checked={onlyAvailable} onChange={(event)=>setOnlyAvailable(event.target.checked)}/>
        <span>Nur mit freiem Bestand</span>
      </label>
      <button type="button" disabled={!stockQuery&&!stockLocation&&!onlyAvailable}
        onClick={()=>{setStockQuery('');setStockLocation('');setOnlyAvailable(false);}}>Filter zurücksetzen</button>
    </div>
    {visibleStock.length || !stockFilterActive ? <Table headers={['Artikel','Lagerort','Physisch','Reserviert','Frei']} rows={visibleStock.map((row)=>({key:`${row.item_id}/${row.location_id}`,cells:[
      inventoryName(data.items,row.item_id),name(data.locations,row.location_id),row.physical,row.reserved,<strong>{row.free}</strong>,
    ]}))}/> : <p className="empty" role="status">Kein Bestand für diese Filter.</p>}</Panel>
    <Panel title="Offene Ausgaben">
      <div className="panel-body">
        <div className="form-grid">
          <label><span>Projekt filtern</span><select value={projectFilter} onChange={(event)=>setProjectFilter(event.target.value)}>
            <option value="">Alle Projekte</option>
            {options(data.projects).map(({value,label})=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>Lagerort filtern</span><select value={locationFilter} onChange={(event)=>setLocationFilter(event.target.value)}>
            <option value="">Alle Lagerorte</option>
            {options(data.locations).map(({value,label})=><option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        <div className="actions">
          <button type="button" disabled={!projectFilter && !locationFilter}
            onClick={()=>{setProjectFilter('');setLocationFilter('');}}>Filter zurücksetzen</button>
        </div>
      </div>
      {visibleCheckouts.length ? <Table headers={['Projekt','Artikel','Lagerort','Ausgegeben']} rows={visibleCheckouts.map((row)=>({
        key:row.id,cells:[name(data.projects,row.project_id),inventoryName(data.items,row.item_id),name(data.locations,row.location_id),row.checked_out],
      }))}/> : <p className="empty" role="status">{openCheckouts.length?'Keine offenen Ausgaben für diese Filter.':'Es gibt keine offenen Ausgaben.'}</p>}
    </Panel>
    <Panel title="Lagerbewegungen"><Table headers={['Zeitpunkt','Bewegung','Artikel','Lagerort','Projekt','Menge','Erfasst durch','Aktion']}
      rows={data.movements.map(row=>{
        const remaining=row.quantity-(corrected.get(row.id) ?? 0);
        const original=movements.get(row.corrects_movement_id);
        const correctable=['receive','consume'].includes(row.action);
        const correctionScope=`movements:${accountId}:correction:${row.id}`;
        return {key:row.id,cells:[
          <span id={`bewegung-${row.id}`} tabIndex={-1}>{moment(row.created_at)}</span>,
          <div><span>{movementStages[row.action]}</span>{original && <small><a href={`#bewegung-${original.id}`}
            onClick={event=>{
              event.preventDefault();
              const target=document.getElementById(`bewegung-${original.id}`);
              target?.focus({preventScroll:true});
              target?.scrollIntoView({block:'center'});
            }}>Original vom {moment(original.created_at)}</a></small>}
            {row.correction_reason && <small>{row.correction_reason}</small>}</div>,
          inventoryName(data.items,row.item_id),name(data.locations,row.location_id),name(data.projects,row.project_id),row.quantity,name(data.users,row.actor_id),
          correctable && (remaining > 0 || hasPendingWrite(correctionScope) ? <div>
            <button type="button" aria-expanded={correctionId===row.id}
              onClick={()=>setCorrectionId(current=>current===row.id?'':row.id)}>{remaining>0?'Korrigieren':'Korrektur prüfen'}</button>
            {correctionId===row.id && <div className="stock-correction-form"><Form caption="Korrektur buchen"
              retryScope={correctionScope} fields={[
                {name:'quantity',label:'Korrekturmenge',type:'number',required:true,min:1,max:remaining,value:1},
                {name:'reason',label:'Begründung',type:'textarea',required:true},
              ]} submit={async (input,key)=>{
                const saved=await run(()=>api(`movements/${row.id}/corrections`,'POST',
                  {quantity:Number(input.quantity),reason:input.reason},key),'Korrektur gebucht.',{reportWriteRejection:true});
                if(saved) setCorrectionId(current=>current===row.id?'':current);
                return saved;
              }}/></div>}
          </div>
            : <span className="subtle">Vollständig korrigiert</span>),
        ]};
      })}/></Panel>
  </>;
}

function Costs({data,run}:{data:Data;run:Run}) {
  return <Panel title="Belege und Zuordnung"><div className="panel-body">
    <Expand title="Kosten aus CSV übernehmen"><Form caption="Kosten übernehmen" fields={[
      {name:'csv',label:'CSV-Inhalt mit reference, name, amount und optional cost_center',type:'textarea',required:true},
    ]} submit={({csv})=>run(()=>api('costs','POST',{entries:compileCsv(csv)}),'Kosten übernommen.')}/></Expand>
    <Expand title="Kosten einzeln erfassen"><Form caption="Beleg speichern" fields={[
      {name:'reference',label:'Belegreferenz',required:true},{name:'name',label:'Bezeichnung',required:true},
      {name:'amount',label:'Netto in Euro',required:true},{name:'project_id',label:'Projekt',choices:options(data.projects)},
    ]} submit={(input)=>run(()=>api('costs','POST',{entries:[{reference:input.reference,name:input.name,cents:money(input.amount),source:'manual',project_id:input.project_id||null}]}),'Beleg gespeichert.')}/></Expand>
  </div><Table headers={['Beleg','Bezeichnung','Netto','Projektzuordnung']} rows={data.costs.map((row)=>({key:row.id,cells:[
    row.reference,row.name,euros(row.cents),<select aria-label={`Projekt für ${row.reference}`} value={row.project_id??''}
      onChange={(event)=>run(()=>api(`costs/${row.id}`,'PATCH',{project_id:event.target.value||null}),'Zuordnung gespeichert.')}>
      <option value="">Ohne Zuordnung</option>{data.projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select>,
  ]}))}/></Panel>;
}

function Settings({data,run,flags,accountId}:{data:Data;run:Run;flags:{haben:boolean;zammad:boolean};accountId:string}) {
  const [tokens,setTokens]=useState<Row[]>([]);
  const [issued,setIssued]=useState('');
  const [checkedTicket,setCheckedTicket]=useState<number>();
  async function refresh(){setTokens(await api('tokens'));}
  useEffect(()=>{void refresh().catch(()=>{});},[]);
  return <>
    <Panel title="Team"><div className="panel-body"><Expand title="Konto anlegen"><Form caption="Konto speichern" fields={[
      {name:'name',label:'Name',required:true},{name:'email',label:'E-Mail',type:'email',required:true},
      {name:'password',label:'Passwort (mindestens 12 Zeichen)',type:'password',required:true,autoComplete:'new-password'},
      {name:'role',label:'Rolle',choices:[{value:'member',label:'Mitarbeit'},{value:'admin',label:'Administration'}],required:true},
    ]} submit={(input)=>run(()=>api('users','POST',input),'Konto angelegt.')}/></Expand></div>
    <Table headers={['Name','Rolle','Zugang','Aktion']} rows={data.users.map((row)=>({key:row.id,cells:[
      row.name,row.role==='admin'?'Administration':'Mitarbeit',row.blocked?'Gesperrt':'Aktiv',
      <button onClick={()=>{
        const blocked=!row.blocked;
        const ownAccount=row.id===accountId;
        const consequence=ownAccount?' Du wirst abgemeldet.':'';
        if(blocked && !window.confirm(`Konto von ${row.name} sperren? Desk widerruft vorhandene Sitzungen und API-Tokens. Projektzuordnungen bleiben erhalten.${consequence}`)) return;
        void run(async isCurrent=>{
          await api(`users/${row.id}/access`,'PATCH',{blocked});
          if(isCurrent()) {
            setIssued('');
            if(!ownAccount) await refresh().catch(()=>{});
          }
        },blocked?'Konto gesperrt.':'Konto freigegeben.');
      }}>{row.blocked?'Konto freigeben':'Konto sperren'}</button>,
    ]}))}/></Panel>
    <Panel title="API-Zugriff" action={<a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>}><div className="panel-body">
      <Expand title="API-Token erzeugen"><Form caption="Token erzeugen" fields={[
        {name:'label',label:'Name',required:true},{name:'scope',label:'Berechtigung',choices:[{value:'read',label:'Lesen'},{value:'write',label:'Lesen und schreiben'}],required:true},
      ]} submit={(input)=>run(async(isCurrent)=>{const result=await api('tokens','POST',input);if(isCurrent()) {setIssued(result.token);await refresh();}},'API-Token erzeugt.')}/></Expand>
      {issued&&<label><span>Token jetzt kopieren</span><input value={issued} readOnly onFocus={(e)=>e.target.select()}/></label>}
    </div><Table headers={['Name','Berechtigung','Aktion']} rows={tokens.map((row)=>({key:row.id,cells:[row.label,row.scope==='read'?'Lesen':'Lesen und schreiben',
      <button onClick={()=>run(async(isCurrent)=>{await api(`tokens/${row.id}`,'DELETE');if(isCurrent()) {setIssued('');await refresh();}},'Token widerrufen.')}>Widerrufen</button>,
    ]}))}/></Panel>
    <Panel title="Integrationen"><div className="panel-body actions">
      <Pill label={flags.haben?'Haben eingerichtet':'Haben optional'} tone={flags.haben?'accent':'neutral'}/>
      <Pill label={flags.zammad?'Zammad eingerichtet':'Zammad optional'} tone={flags.zammad?'accent':'neutral'}/>
    </div><div className="panel-body">
      <Form caption="Zammad-Verbindung prüfen" busyCaption="Wird geprüft …" fields={[
        {name:'id',label:'Zammad-Ticket-ID',type:'number',min:1,max:2_147_483_647,required:true},
      ]} submit={({id})=>run(async(isCurrent)=>{
        const ticket=Number(id);
        setCheckedTicket(undefined);
        await api('integrations/zammad/check','POST',{id:ticket});
        if(isCurrent()) setCheckedTicket(ticket);
        return noWrite;
      },undefined,{kind:'read',reportInlineError:true})}/>
      {checkedTicket!==undefined && <p role="status">Ticket {checkedTicket} und sein Verlauf sind erreichbar.</p>}
    </div></Panel>
  </>;
}
