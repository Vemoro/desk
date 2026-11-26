import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, calendarDate, projectStages, type Row } from './client';
import type { Data } from './projects';
import { ConfirmDialog, Expand, Form, noWrite, Panel, Pill, Table, type Confirmation, type Run } from './widgets';

export function Contacts({data,run,haben,selected,selectContact,openProject}:{data:Data;run:Run;haben:boolean;selected:string;
  selectContact:(id:string)=>void;openProject:(id:string)=>void}) {
  const [search,setSearch]=useState('');
  const [comparisons,setComparisons]=useState(()=>new Map<string,any>());
  const [duplicates,setDuplicates]=useState<{input:Record<string,string>;contacts:Row[]}>();
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const contactPanel=useRef<HTMLElement>(null);
  const contactDetail=useRef<HTMLElement>(null);
  const duplicateWarning=useRef<HTMLElement>(null);
  const isOpen=useRef(false);
  const comparisonRequests=useRef(new Map<string,number>());
  const contact=data.contacts.find((row)=>row.id===selected);
  const comparison=comparisons.get(selected);
  const query=search.trim().toLowerCase();
  const phoneDigits=/^[\d\s+()-]+$/.test(query) ? query.replace(/\D/g,'') : '';
  const visibleContacts=data.contacts.filter((row)=>
    `${row.name} ${row.email}`.toLowerCase().includes(query)
    || (phoneDigits!=='' && (row.phone ?? '').replace(/\D/g,'').includes(phoneDigits)));
  const projects=contact ? data.projects.filter((project)=>project.contact_id===contact.id) : [];
  useEffect(()=>{
    isOpen.current=true;
    return ()=>{isOpen.current=false;};
  },[]);
  useEffect(()=>{if(contact?.id) contactDetail.current?.focus();},[contact?.id]);
  useEffect(()=>{if(duplicates) duplicateWarning.current?.focus();},[duplicates]);

  function openContact(id:string) {
    setComparisons(previous=>{
      if(!previous.has(id)) return previous;
      const next=new Map(previous);
      next.delete(id);
      return next;
    });
    if(id===selected) contactDetail.current?.focus();
    else selectContact(id);
  }

  async function saveContact(input:Record<string,string>,isCurrent:()=>boolean) {
    const result=await api('contacts','POST',input);
    if(!isCurrent() || !isOpen.current) return;
    selectContact(result.id);
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
    const contactId=contact.id;
    const requests=comparisonRequests.current;
    const request=(requests.get(contactId)??0)+1;
    requests.set(contactId,request);
    return run(async(isCurrent)=>{
      const result=await api(`contacts/${contactId}/haben`,'POST',input);
      if(result.action==='error')throw new Error(result.message);
      if(isCurrent() && isOpen.current && requests.get(contactId)===request) {
        setComparisons(previous=>new Map(previous).set(contactId,result));
      }
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
          {duplicates&&<Duplicates warningRef={duplicateWarning} duplicates={duplicates} openContact={openContact}
            setConfirmation={setConfirmation} saveContact={saveContact}/>}
        </Expand></div>
      <Table headers={['Name','E-Mail','Telefon']} rows={visibleContacts
        .map((row)=>({key:row.id,cells:[<button type="button" className="text-button" onClick={()=>openContact(row.id)}>{row.name}</button>,row.email||'–',row.phone||'–']}))}/>
    </Panel>
    {contact&&<ContactDetail contact={contact} projects={projects} run={run} haben={haben}
      comparison={comparison} sync={sync} detailRef={contactDetail} openProject={openProject}/>}
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={(confirmed)=>{
      setConfirmation(undefined);
      if(confirmed) setDuplicates(undefined);
    }} fallbackFocus={contactPanel}/>}
  </>;
}


function fields(record?:Row) {
  return [{name:'name',label:'Name',value:record?.name,required:true},{name:'email',label:'E-Mail',value:record?.email},
    {name:'phone',label:'Telefon',value:record?.phone,type:'tel'},{name:'notes',label:'Notiz',value:record?.notes,type:'textarea'}];
}

function ContactDetail({contact,projects,run,haben,comparison,sync,detailRef,openProject}:{
  contact:Row; projects:Row[]; run:Run; haben:boolean; comparison?:Row;
  sync:(input:unknown)=>Promise<boolean|undefined>; detailRef:RefObject<HTMLElement|null>; openProject:(id:string)=>void;
}) {
  return <Panel title={contact.name} focusRef={detailRef}><div className="panel-body">
      <Form key={contact.id} caption="Änderungen speichern" fields={fields(contact)} submit={(input)=>run(()=>api(`contacts/${contact.id}`,'PATCH',input),'Kontakt gespeichert.')}/>
      {haben&&<Expand title="Haben-Kontakt">
        <Form key={contact.id} caption="Abgleichen" fields={[{name:'link_id',label:'Vorhandene Haben-Kontakt-ID',value:contact.haben_id ?? ''}]}
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
    </Panel>;
}

function Duplicates({warningRef,duplicates,openContact,setConfirmation,saveContact}:{
  warningRef:RefObject<HTMLElement|null>; duplicates:{input:Record<string,string>;contacts:Row[]};
  openContact:(id:string)=>void; setConfirmation:(value:Confirmation)=>void; saveContact:(input:Record<string,string>,isCurrent:()=>boolean)=>Promise<void>;
}) {
  return <section ref={warningRef} tabIndex={-1} className="notice duplicate-contacts" aria-label="Mögliche Dubletten">
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
          </section>;
}
