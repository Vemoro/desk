import { Field } from './field';
import { CostImport } from './cost-import';
import { ListEmpty } from './list-page';
import { useEffect, useRef, useState, type FocusEvent, type RefObject } from 'react';
import { api, euros, money, type Row } from './client';
import type { Data } from './projects';
import { Expand, Form, ConfirmDialog, noWrite, Panel, Pill, Table, type Confirmation, type Run } from './widgets';
import { SettingsLayout, type SettingsArea } from './settings-navigation';
import { ObjectChoice, projectChoices, type ObjectOption } from './object-choice';

const costSources=new Map([['manual','Manuell'],['haben-export','Haben-Export'],['demo','Demo']]);

function costSourceLabel(source:string) {
  return costSources.get(source)??`„${source}“`;
}

export function Costs({data,run}:{data:Data;run:Run}) {
  const [query,setQuery]=useState('');
  const [source,setSource]=useState('');
  const [assignment,setAssignment]=useState('');
  const searchInput=useRef<HTMLInputElement>(null);
  const assignmentFilter=useRef<HTMLSelectElement>(null);
  const focusedAssignment=useRef<HTMLInputElement|null>(null);
  const term=query.trim().toLowerCase();
  const sources=Array.from(new Set(data.costs.map(row=>row.source))).sort();
  const visibleCosts=data.costs.filter(row=>
    (!term || [row.reference,row.name].some(value=>value.toLowerCase().includes(term)))
    && (!source || row.source===source)
    && (!assignment || Boolean(row.project_id)===(assignment==='assigned')));
  const filterActive=Boolean(term || source || assignment);

  useEffect(()=>{
    const trigger=focusedAssignment.current;
    if(trigger && !trigger.isConnected) {
      focusedAssignment.current=null;
      if(document.activeElement===document.body) assignmentFilter.current?.focus();
    }
  });

  function resetFilters() {
    setQuery('');
    setSource('');
    setAssignment('');
    searchInput.current?.focus();
  }

  const choices=projectChoices(data.projects,data.contacts);

  return <Panel title="Belege und Zuordnung" action={<span className="subtle" role="status">
    {visibleCosts.length} von {data.costs.length} {data.costs.length===1?'Beleg':'Belegen'}
  </span>}><div className="panel-body compact-actions">
    <CostImport run={run}/>
    <Expand title="Kosten einzeln erfassen"><Form caption="Beleg speichern" fields={[
      {name:'reference',label:'Belegreferenz',required:true},{name:'name',label:'Bezeichnung',required:true},
      {name:'amount',label:'Netto in Euro',required:true},{name:'project_id',label:'Projekt',searchChoices:choices,emptyChoiceLabel:'Ohne Zuordnung'},
    ]} submit={(input)=>run(()=>api('costs','POST',{entries:[{reference:input.reference,name:input.name,cents:money(input.amount),source:'manual',project_id:input.project_id||null}]}),'Beleg gespeichert.')}/></Expand>
  </div><div className="panel-body form-grid">
    <Field label="Belege suchen">{props=><input {...props} type="search" ref={searchInput} value={query} onChange={event=>setQuery(event.target.value)}/>}</Field>
    <Field label="Quelle filtern">{props=><select {...props} value={source} onChange={event=>setSource(event.target.value)}>
      <option value="">Alle Quellen</option>
      {sources.map(value=><option key={value} value={value}>{costSourceLabel(value)}</option>)}
    </select>}</Field>
    <Field label="Zuordnung filtern">{props=><select {...props} ref={assignmentFilter} value={assignment} onChange={event=>setAssignment(event.target.value)}>
      <option value="">Alle Belege</option><option value="assigned">Zugeordnet</option><option value="unassigned">Ohne Zuordnung</option>
    </select>}</Field>
    <button type="button" disabled={!query&&!source&&!assignment} onClick={resetFilters}>Filter zurücksetzen</button>
  </div>{visibleCosts.length ? <Table numeric={[3]} headers={['Beleg','Bezeichnung','Quelle','Netto','Kostenstelle','Projektzuordnung']} rows={visibleCosts.map(row=>({key:row.id,cells:[
    row.reference,row.name,costSourceLabel(row.source),euros(row.cents),
    <span className="cost-center-value">{row.cost_center?.trim() ? row.cost_center : '–'}</span>,
    <CostProjectChoice row={row} choices={choices} run={run}
      onFocus={event=>{focusedAssignment.current=event.currentTarget;}}
      onBlur={event=>{
        if(event.relatedTarget && focusedAssignment.current===event.currentTarget) focusedAssignment.current=null;
      }}/>,
  ]}))}/> : <ListEmpty>{filterActive?'Keine Belege für diese Filter.':'Hier erscheinen importierte oder einzeln erfasste Belege.'}</ListEmpty>}</Panel>;
}

function CostProjectChoice({row,choices,run,onFocus,onBlur}:{
  row:Row;choices:ObjectOption[];run:Run;
  onFocus:(event:FocusEvent<HTMLInputElement>)=>void;onBlur:(event:FocusEvent<HTMLInputElement>)=>void;
}) {
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState<{previous:string;value:string}>();
  const pending=useRef(false);
  const previous=String(row.project_id??'');
  const value=saved?.previous===previous?saved.value:previous;
  useEffect(()=>{setSaved(undefined);},[previous]);

  async function select(projectId:string) {
    if(pending.current || value===projectId) return;
    pending.current=true;
    setBusy(true);
    setError('');
    try {
      if(await run(()=>api('costs/'+row.id,'PATCH',{project_id:projectId||null}),'Zuordnung gespeichert.',{reportInlineError:true})) {
        setSaved({previous,value:projectId});
      }
    } catch(problem) {
      setError(problem instanceof Error?problem.message:'Die Zuordnung konnte nicht gespeichert werden.');
    } finally {
      pending.current=false;
      setBusy(false);
    }
  }

  return <ObjectChoice label={`Projekt für ${row.reference}`} hideLabel value={value} choices={choices}
    emptyLabel="Ohne Zuordnung" busy={busy} error={error} onFocus={onFocus} onBlur={onBlur}
    onChoose={projectId=>void select(projectId)}/>;
}

type SettingsHeading=RefObject<HTMLHeadingElement|null>;

export function Settings({data,run,flags,accountId,area}:{
  data:Data; run:Run; flags:{haben:boolean;zammad:boolean}; accountId:string; area?:SettingsArea;
}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const [issued,setIssued]=useState<{id:string;token:string}|null>(null);
  const [tokenRevision,setTokenRevision]=useState(0);
  const [creatingToken,setCreatingToken]=useState(false);
  function refreshTokens() {
    setTokenRevision(current=>current+1);
  }
  async function createToken(input:Record<string,string>) {
    setCreatingToken(true);
    try {
      return await run(async(isCurrent)=>{
        const result=await api<{id:string;token:string}>('tokens','POST',input);
        if(isCurrent()) setIssued(result);
      },'API-Token erzeugt.');
    } finally {
      setCreatingToken(false);
    }
  }
  return <SettingsLayout area={area} heading={heading}>
    {(area===undefined || area==='team') && <TeamSettings users={data.users} run={run} accountId={accountId}
      heading={heading} accountBlocked={refreshTokens}/>}
    {area==='api' && <ApiAccess run={run} heading={heading} issued={issued?.token} creating={creatingToken}
      createToken={createToken} tokenRevision={tokenRevision} tokenRevoked={id=>{
        setIssued(current=>current?.id===id ? null : current);
        refreshTokens();
      }}/>}
    <div hidden={area!=='integrations'}>
      <Integrations flags={flags} run={run} heading={area==='integrations'?heading:undefined}/>
    </div>
  </SettingsLayout>;
}

function ApiAccess({run,heading,issued,creating,createToken,tokenRevision,tokenRevoked}:{
  run:Run; heading:SettingsHeading; issued?:string; creating:boolean; tokenRevision:number;
  createToken:(input:Record<string,string>)=>Promise<boolean>; tokenRevoked:(id:string)=>void;
}) {
  const [tokenList,setTokenList]=useState<{status:'loading'|'failed'}|{status:'loaded';tokens:Row[]}>({status:'loading'});
  const [revocation,setRevocation]=useState<Confirmation>();
  const tokenRequest=useRef(0);
  const tokenPanel=useRef<HTMLElement>(null);
  const retryTokenButton=useRef<HTMLButtonElement>(null);
  const returnTokenFocus=useRef(false);
  async function refresh(){
    const request=++tokenRequest.current;
    setTokenList({status:'loading'});
    try {
      const tokens=await api<Row[]>('tokens');
      if(request===tokenRequest.current) setTokenList({status:'loaded',tokens});
    } catch {
      if(request===tokenRequest.current) setTokenList({status:'failed'});
    }
  }
  useEffect(()=>{
    void refresh();
    return ()=>{tokenRequest.current++;};
  },[issued,tokenRevision]);
  useEffect(()=>{
    if(tokenList.status==='loading' || !returnTokenFocus.current) return;
    returnTokenFocus.current=false;
    if(document.activeElement===document.body) {
      (tokenList.status==='failed'?retryTokenButton.current:tokenPanel.current)?.focus();
    }
  },[tokenList.status]);
  return <>
    <Panel title="API-Zugriff" headingRef={heading} focusRef={tokenPanel}
      action={<a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>}><div className="panel-body">
      <Expand title="API-Token erzeugen"><Form caption="Token erzeugen" disabled={creating} fields={[
        {name:'label',label:'Name',required:true},{name:'scope',label:'Berechtigung',choices:[{value:'read',label:'Lesen'},{value:'write',label:'Lesen und schreiben'}],required:true},
      ]} submit={createToken}/></Expand>
      {issued&&<Field label="Token jetzt kopieren">{props=><input {...props} value={issued} readOnly onFocus={(e)=>e.target.select()}/>}</Field>}
    </div>
    {tokenList.status==='loading'&&<p className="empty" role="status">API-Token werden geladen …</p>}
    {tokenList.status==='failed'&&<div className="panel-body">
      <p className="inline-error" role="alert">Die API-Token konnten nicht geladen werden.</p>
      <button type="button" ref={retryTokenButton} onClick={(event)=>{
        returnTokenFocus.current=document.activeElement===event.currentTarget;
        void refresh();
      }}>Erneut laden</button>
    </div>}
    {tokenList.status==='loaded'&&(tokenList.tokens.length
      ? <Table headers={['Name','Berechtigung','Aktion']} rows={tokenList.tokens.map((row)=>({key:row.id,cells:[row.label,row.scope==='read'?'Lesen':'Lesen und schreiben',
        <button type="button" className="danger" onClick={event=>setRevocation({
          actionKey:"token-revoke:"+row.id,title:"API-Token widerrufen",actionLabel:"Token widerrufen",danger:true,
          description:"Der Token „"+row.label+"“ wird ungültig. Anbindungen mit diesem Token brauchen einen neuen Token.",
          trigger:event.currentTarget,
          submit:async isCurrent=>{
            await api("tokens/"+row.id,"DELETE");
            if(isCurrent()) tokenRevoked(row.id);
          },feedback:"Token widerrufen.",
        })}>Widerrufen</button>,
      ]}))}/>
      : <p className="empty" role="status">Keine API-Token erstellt.</p>)}
    </Panel>
    {revocation && <ConfirmDialog confirmation={revocation} run={run} dismiss={()=>setRevocation(undefined)} fallbackFocus={tokenPanel}/>}
  </>;
}

function Integrations({flags,run,heading}:{flags:{haben:boolean;zammad:boolean};run:Run;heading?:SettingsHeading}) {
  const [checkedTicket,setCheckedTicket]=useState<number>();
  return <Panel title="Integrationen" headingRef={heading}><div className="panel-body actions">
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
    </div></Panel>;
}

function TeamSettings({users,run,accountId,heading,accountBlocked}:{
  users:Row[];run:Run;accountId:string;heading:SettingsHeading;accountBlocked:()=>void;
}) {
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const teamPanel=useRef<HTMLElement>(null);

  function saveAccess(row:Row,blocked:boolean) {
    return api("users/"+row.id+"/access","PATCH",{blocked});
  }

  return <>
    <Panel title="Team" headingRef={heading} focusRef={teamPanel}><div className="panel-body"><Expand title="Konto anlegen"><Form caption="Konto speichern" fields={[
      {name:'name',label:'Name',required:true},{name:'email',label:'E-Mail',type:'email',required:true},
      {name:'password',label:'Passwort',hint:'Mindestens 12 Zeichen',minLength:12,maxLength:200,type:'password',required:true,autoComplete:'new-password'},
      {name:'role',label:'Rolle',choices:[{value:'member',label:'Mitarbeit'},{value:'admin',label:'Administration'}],required:true},
    ]} submit={(input)=>run(()=>api('users','POST',input),'Konto angelegt.')}/></Expand></div>
    <Table headers={['Name','Rolle','Zugang','Aktion']} rows={users.map((row)=>({key:row.id,cells:[
      row.name,row.role==='admin'?'Administration':'Mitarbeit',row.blocked?'Gesperrt':'Aktiv',
      <button type="button" className={row.blocked?undefined:"danger"} onClick={event=>{
        if(row.blocked) {
          void run(()=>saveAccess(row,false),"Konto freigegeben.");
          return;
        }
        setConfirmation({
          actionKey:"access-block:"+row.id,title:"Konto sperren",actionLabel:"Konto sperren",danger:true,
          description:"Desk widerruft die Sitzungen und API-Tokens für „"+row.name+"“. Projektzuordnungen bleiben erhalten."
            +(row.id===accountId?" Du wirst abgemeldet.":""),
          trigger:event.currentTarget,submit:async(isCurrent)=>{
            const result=await saveAccess(row,true);
            if(isCurrent()) accountBlocked();
            return result;
          },feedback:"Konto gesperrt.",
        });
      }}>{row.blocked?"Konto freigeben":"Konto sperren"}</button>,
    ]}))}/></Panel>
    {confirmation && <ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={teamPanel}/>}
  </>;
}
