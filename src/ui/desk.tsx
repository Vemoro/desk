import { useEffect, useRef, useState } from 'react';
import { all, api, ApiError, compileCsv, date, euros, moment, money, movementStages, name, projectStages, type Row } from './client';
import { Project, Projects, type Data } from './projects';
import { ConfirmDialog, Expand, Form, options, Panel, Pill, Table, type Confirmation, type Run } from './widgets';

const sections = {
  dashboard:['Übersicht','▦'], projects:['Projekte','▤'], contacts:['Kontakte','◎'],
  warehouse:['Projektlager','▧'], costs:['Ist-Kosten','≋'], settings:['Einstellungen','⚙'],
};
type Section=keyof typeof sections;
type Person={id:string;name:string;role:'admin'|'member'};
const collections = ['contacts','projects','tasks','users','lines','reservations','locations','items','movements','costs','stock'] as const;
const initialData=Object.fromEntries(collections.map((key)=>[key,[]])) as unknown as Data;

export function Desk() {
  const [person,setPerson]=useState<Person|null>();
  const [data,setData]=useState<Data>(initialData);
  const [flags,setFlags]=useState({haben:false,zammad:false});
  const [section,setSection]=useState<Section>('dashboard');
  const [projectId,setProjectId]=useState('');
  const [theme,setTheme]=useState('light');
  const [notice,setNotice]=useState({message:'',error:false});
  const [refreshRequired,setRefreshRequired]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const savedVersion=useRef(0);
  const project=data.projects.find((row)=>row.id===projectId);

  async function load() {
    const version=savedVersion.current;
    const [integrations,...result]=await Promise.all([api('integrations'),...collections.map((collection)=>
      collection==='users'||collection==='stock'?api<Row[]>(collection):all(collection),
    )]);
    if(version!==savedVersion.current) return false;
    setFlags(integrations);
    setData(Object.fromEntries(collections.map((key,index)=>[key,result[index]])) as unknown as Data);
    setRefreshRequired(false);
    return true;
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
    void (async()=>{
      try {const current=await api<Person>('me'); await load();setPerson(current);}
      catch(error) {
        setPerson(null);
        if(!(error instanceof ApiError) || error.status!==401) setNotice({message:'Desk-Daten konnten nicht geladen werden.',error:true});
      }
    })();
    return ()=>window.removeEventListener('hashchange',onHash);
  },[]);

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('desk-theme',theme);},[theme]);

  async function refreshSavedData() {
    const version=savedVersion.current;
    try {
      return await load();
    } catch(error) {
      if(version!==savedVersion.current) return false;
      if(error instanceof ApiError && error.status===401) {
        setRefreshRequired(false);
        setPerson(null);
        setNotice({message:'Die Änderung wurde gespeichert. Bitte erneut anmelden, um die Ansicht zu aktualisieren.',error:false});
      } else {
        setRefreshRequired(true);
      }
      return false;
    }
  }

  async function retryRefresh() {
    setRefreshing(true);
    try { await refreshSavedData(); }
    finally { setRefreshing(false); }
  }

  const run:Run=async(operation,feedback,kind='write')=>{
    setNotice({message:'',error:false});
    try {
      await operation();
      if(kind==='read') await load();
    } catch(error) {
      if(error instanceof ApiError && error.status===401)setPerson(null);
      setNotice({message:error instanceof Error?error.message:'Die Aktion ist fehlgeschlagen.',error:true});
      return false;
    }
    if(kind==='write') {
      savedVersion.current++;
      if(!await refreshSavedData()) return true;
    }
    if(feedback)setNotice({message:feedback,error:false});
    return true;
  };

  function navigate(to:Section,id='') {
    setNotice({message:'',error:false});
    setSection(to);
    setProjectId(id);
    location.hash=id?`${to}/${id}`:to;
  }

  const alert=notice.message && <div className={`notice ${notice.error?'error':''}`} role={notice.error?'alert':'status'}>{notice.message}</div>;
  const themeButton=<button className="theme" onClick={()=>setTheme(theme==='light'?'dark':'light')} aria-label={theme==='light'?'Dunkles Design':'Helles Design'}>{theme==='light'?'◐':'☀'}</button>;

  if(person===undefined) return <main className="login"><p>Desk wird geladen …</p></main>;
  if(!person) return <main className="login">
    <div className="login-box"><div className="login-brand"><span className="mark">D</span><strong>Desk</strong>{themeButton}</div>
      <h1>Anmelden</h1>{alert}
      <Form caption="Anmelden" fields={[
        {name:'email',label:'E-Mail',type:'email',required:true,autoComplete:'username'},
        {name:'password',label:'Passwort',type:'password',required:true,autoComplete:'current-password'},
      ]} submit={async(input)=>{
        await api('login','POST',input); const current=await api<Person>('me'); await load();setPerson(current);setNotice({message:'',error:false});
      }}/>
    </div></main>;

  return <div className="frame">
    <a href="#desk-main" className="skip">Zum Inhalt</a>
    <aside className="sidebar"><div className="brand"><span className="mark">D</span><strong>Desk</strong></div>
      <nav aria-label="Hauptnavigation">{Object.entries(sections).map(([key,[label,glyph]])=>
        key==='settings'&&person.role!=='admin'?null:<button key={key} aria-current={section===key?'page':undefined}
          onClick={()=>navigate(key as Section)}><span aria-hidden="true">{glyph}</span>{label}</button>,
      )}</nav>
      <footer className="sidebar-foot"><div className="account"><span className="avatar">{person.name.slice(0,1)}</span>
        <div><strong>{person.name}</strong><small>{person.role==='admin'?'Administration':'Mitarbeit'}</small></div>{themeButton}</div>
        <button onClick={async()=>{try { await api('logout','POST');setPerson(null);setData(initialData);setNotice({message:'',error:false}); } catch { setNotice({message:'Abmelden fehlgeschlagen.',error:true}); }}}>Abmelden</button>
      </footer>
    </aside>
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
      {section==='projects' && (project?<Project key={project.id} project={project} data={data} run={run} flags={flags} back={()=>navigate('projects')}/>
        :<Projects data={data} run={run} select={(id)=>navigate('projects',id)}/>)}
      {section==='contacts' && <Contacts data={data} run={run} haben={flags.haben}/>}
      {section==='warehouse' && <Warehouse data={data} run={run}/>}
      {section==='costs' && <Costs data={data} run={run}/>}
      {section==='settings'&&person.role==='admin' && <Settings data={data} run={run} flags={flags}/>}
    </main>
  </div>;
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
        <button className="text-button" onClick={()=>select(row.id)}>{row.name}</button>,name(data.contacts,row.contact_id),<Pill label={projectStages[row.stage]} tone="accent"/>,date(row.due),
      ]}))}/>
    </Panel>
    <Panel title="Fällige Aufgaben"><Table headers={['Aufgabe','Projekt','Verantwortlich','Termin']} rows={data.tasks.filter((task)=>task.status!=='done'&&task.due)
      .sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,10)
      .map((task)=>({key:task.id,cells:[task.name,<button className="text-button" onClick={()=>select(task.project_id)}>{name(data.projects,task.project_id)}</button>,name(data.users,task.assignee_id),date(task.due)]}))}/></Panel>
  </>;
}

function Contacts({data,run,haben}:{data:Data;run:Run;haben:boolean}) {
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState('');
  const [comparison,setComparison]=useState<any>();
  const [duplicates,setDuplicates]=useState<{input:Record<string,string>;contacts:Row[]}>();
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const contactPanel=useRef<HTMLElement>(null);
  const contactDetail=useRef<HTMLElement>(null);
  const [focusContact,setFocusContact]=useState('');
  const contact=data.contacts.find((row)=>row.id===selected);
  useEffect(()=>{
    if(focusContact && contact?.id===focusContact){
      contactDetail.current?.focus();
      setFocusContact('');
    }
  },[focusContact,contact?.id]);
  function fields(record?:Row) {
    return [{name:'name',label:'Name',value:record?.name,required:true},{name:'email',label:'E-Mail',value:record?.email},
      {name:'phone',label:'Telefon',value:record?.phone,type:'tel'},{name:'notes',label:'Notiz',value:record?.notes,type:'textarea'}];
  }

  async function saveContact(input:Record<string,string>) {
    const result=await api('contacts','POST',input);
    setSelected(result.id);
    setComparison(undefined);
    setDuplicates(undefined);
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
    await run(()=>saveContact(input),'Kontakt angelegt.');
  }

  async function sync(input:unknown) {
    if(!contact)return;
    return run(async()=>{
      const result=await api(`contacts/${contact.id}/haben`,'POST',input);
      if(result.action==='error')throw new Error(result.message);
      setComparison(result);
    });
  }

  return <>
    <Panel title="Interessenten und Kontakte" focusRef={contactPanel} action={haben&&<button onClick={()=>run(()=>api('haben/contacts/import','POST',{}),'Haben-Kontakte importiert.')}>Aus Haben importieren</button>}>
      <div className="panel-body"><label className="filter"><span>Kontakte suchen</span><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)}/></label>
        <Expand title="Kontakt anlegen">
          <div onInput={()=>setDuplicates(undefined)}>
            <Form caption="Kontakt speichern" fields={fields()} submit={createContact}/>
          </div>
          {duplicates&&<section className="notice duplicate-contacts" aria-label="Mögliche Dubletten">
            <h3>Mögliche Dubletten</h3>
            <p>Desk hat Kontakte mit gleichem Namen oder gleicher E-Mail-Adresse gefunden.</p>
            <ul>{duplicates.contacts.map((row)=><li key={row.id}>
              <button type="button" className="text-button" onClick={()=>{setSelected(row.id);setComparison(undefined);setFocusContact(row.id);}}>
                {row.email?`${row.name} · ${row.email}`:row.name}
              </button>
            </li>)}</ul>
            <button type="button" onClick={(event)=>setConfirmation({
              title:'Neuen Kontakt anlegen',
              description:`„${duplicates.input.name}“ wird als zusätzlicher Kontakt gespeichert.`,
              actionLabel:'Kontakt anlegen',
              trigger:event.currentTarget,
              submit:()=>saveContact(duplicates.input),
              feedback:'Kontakt angelegt.',
            })}>Trotzdem anlegen</button>
          </section>}
        </Expand></div>
      <Table headers={['Name','E-Mail','Telefon']} rows={data.contacts.filter((row)=>`${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase()))
        .map((row)=>({key:row.id,cells:[<button className="text-button" onClick={()=>{setSelected(row.id);setComparison(undefined);}}>{row.name}</button>,row.email||'–',row.phone||'–']}))}/>
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
    </div></Panel>}
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={contactPanel}/>}
  </>;
}

function Warehouse({data,run}:{data:Data;run:Run}) {
  const bookings=data.reservations.filter((row)=>row.item_id&&(row.status==='firm'||row.checked_out>0));
  const bookingChoices=bookings.map((row)=>({value:row.id,label:`${name(data.projects,row.project_id)} · ${name(data.items,row.item_id)}`}));
  return <>
    <Panel title="Bestand je Lagerort"><div className="panel-body compact-actions">
      <Expand title="Lagerort anlegen"><Form caption="Lagerort speichern" fields={[{name:'name',label:'Lagerort',required:true}]}
        submit={(input)=>run(()=>api('locations','POST',input),'Lagerort angelegt.')}/></Expand>
      <Expand title="Artikel anlegen"><Form caption="Artikel speichern" fields={[
        {name:'name',label:'Artikelname',required:true},{name:'code',label:'Artikelnummer',required:true},
        {name:'kind',label:'Artikelart',choices:[{value:'equipment',label:'Gerät'},{value:'consumable',label:'Verbrauchsmaterial'}],required:true},
        {name:'inventory_number',label:'Inventarnummer für Einzelgerät'},
      ]} submit={(input)=>run(()=>api('items','POST',{...input,inventory_number:input.inventory_number||null}),'Artikel angelegt.')}/></Expand>
      <Expand title="Wareneingang"><Form caption="Wareneingang buchen" fields={[
        {name:'item_id',label:'Artikel',choices:options(data.items),required:true},{name:'location_id',label:'Lagerort',choices:options(data.locations),required:true},
        {name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},{name:'project_id',label:'Projektbezug',choices:options(data.projects)},
      ]} submit={(input)=>run(()=>api('movements','POST',{action:'receive',item_id:input.item_id,location_id:input.location_id,
        quantity:Number(input.quantity),project_id:input.project_id||undefined}),'Wareneingang erfasst.')}/></Expand>
      <Expand title="Ausgabe, Rückgabe oder Verbrauch"><Form caption="Bewegung buchen" fields={[
        {name:'action',label:'Bewegungsart',choices:[{value:'issue',label:'Ausgabe'},{value:'return',label:'Rückgabe'},{value:'consume',label:'Verbrauch'}],required:true},
        {name:'reservation_id',label:'Projektreservierung',choices:bookingChoices,required:true},
        {name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},
      ]} submit={(input)=>run(()=>api('movements','POST',{...input,quantity:Number(input.quantity)}),'Lagerbewegung gebucht.')}/></Expand>
    </div>
    <Table headers={['Artikel','Lagerort','Physisch','Reserviert','Frei']} rows={data.stock.map((row)=>({key:`${row.item_id}/${row.location_id}`,cells:[
      name(data.items,row.item_id),name(data.locations,row.location_id),row.physical,row.reserved,<strong>{row.free}</strong>,
    ]}))}/></Panel>
    <Panel title="Offene Ausgaben"><Table headers={['Projekt','Artikel','Lagerort','Ausgegeben']} rows={bookings.filter((row)=>row.checked_out>0).map((row)=>({
      key:row.id,cells:[name(data.projects,row.project_id),name(data.items,row.item_id),name(data.locations,row.location_id),row.checked_out],
    }))}/></Panel>
    <Panel title="Lagerbewegungen"><Table headers={['Zeitpunkt','Bewegung','Artikel','Projekt','Menge','Erfasst durch']} rows={data.movements.map((row)=>({key:row.id,cells:[
      moment(row.created_at),movementStages[row.action],name(data.items,row.item_id),name(data.projects,row.project_id),row.quantity,name(data.users,row.actor_id),
    ]}))}/></Panel>
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

function Settings({data,run,flags}:{data:Data;run:Run;flags:{haben:boolean;zammad:boolean}}) {
  const [tokens,setTokens]=useState<Row[]>([]);
  const [issued,setIssued]=useState('');
  async function refresh(){setTokens(await api('tokens'));}
  useEffect(()=>{void refresh().catch(()=>{});},[]);
  return <>
    <Panel title="Team"><div className="panel-body"><Expand title="Konto anlegen"><Form caption="Konto speichern" fields={[
      {name:'name',label:'Name',required:true},{name:'email',label:'E-Mail',type:'email',required:true},
      {name:'password',label:'Passwort (mindestens 12 Zeichen)',type:'password',required:true,autoComplete:'new-password'},
      {name:'role',label:'Rolle',choices:[{value:'member',label:'Mitarbeit'},{value:'admin',label:'Administration'}],required:true},
    ]} submit={(input)=>run(()=>api('users','POST',input),'Konto angelegt.')}/></Expand></div>
    <Table headers={['Name','Rolle']} rows={data.users.map((row)=>({key:row.id,cells:[row.name,row.role==='admin'?'Administration':'Mitarbeit']}))}/></Panel>
    <Panel title="API-Zugriff" action={<a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>}><div className="panel-body">
      <Expand title="API-Token erzeugen"><Form caption="Token erzeugen" fields={[
        {name:'label',label:'Name',required:true},{name:'scope',label:'Berechtigung',choices:[{value:'read',label:'Lesen'},{value:'write',label:'Lesen und schreiben'}],required:true},
      ]} submit={(input)=>run(async()=>{const result=await api('tokens','POST',input);setIssued(result.token); await refresh();},'API-Token erzeugt.')}/></Expand>
      {issued&&<label><span>Token jetzt kopieren</span><input value={issued} readOnly onFocus={(e)=>e.target.select()}/></label>}
    </div><Table headers={['Name','Berechtigung','Aktion']} rows={tokens.map((row)=>({key:row.id,cells:[row.label,row.scope==='read'?'Lesen':'Lesen und schreiben',
      <button onClick={()=>run(async()=>{await api(`tokens/${row.id}`,'DELETE');setIssued('');await refresh();},'Token widerrufen.')}>Widerrufen</button>,
    ]}))}/></Panel>
    <Panel title="Integrationen"><div className="panel-body actions">
      <Pill label={flags.haben?'Haben eingerichtet':'Haben optional'} tone={flags.haben?'accent':'neutral'}/>
      <Pill label={flags.zammad?'Zammad eingerichtet':'Zammad optional'} tone={flags.zammad?'accent':'neutral'}/>
    </div></Panel>
  </>;
}
