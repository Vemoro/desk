import { useEffect, useRef, useState } from 'react';
import { api, compileCsv, euros, money, type Row } from './client';
import type { Data } from './projects';
import { Expand, Form, noWrite, options, Panel, Pill, Table, type Run } from './widgets';

export function Costs({data,run}:{data:Data;run:Run}) {
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

export function Settings({data,run,flags,accountId}:{data:Data;run:Run;flags:{haben:boolean;zammad:boolean};accountId:string}) {
  const [tokenList,setTokenList]=useState<{status:'loading'|'failed'}|{status:'loaded';tokens:Row[]}>({status:'loading'});
  const [issued,setIssued]=useState('');
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
  },[]);
  useEffect(()=>{
    if(tokenList.status==='loading' || !returnTokenFocus.current) return;
    returnTokenFocus.current=false;
    if(document.activeElement===document.body) {
      (tokenList.status==='failed'?retryTokenButton.current:tokenPanel.current)?.focus();
    }
  },[tokenList.status]);
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
            if(!ownAccount) await refresh();
          }
        },blocked?'Konto gesperrt.':'Konto freigegeben.');
      }}>{row.blocked?'Konto freigeben':'Konto sperren'}</button>,
    ]}))}/></Panel>
    <Panel title="API-Zugriff" focusRef={tokenPanel} action={<a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>}><div className="panel-body">
      <Expand title="API-Token erzeugen"><Form caption="Token erzeugen" fields={[
        {name:'label',label:'Name',required:true},{name:'scope',label:'Berechtigung',choices:[{value:'read',label:'Lesen'},{value:'write',label:'Lesen und schreiben'}],required:true},
      ]} submit={(input)=>run(async(isCurrent)=>{const result=await api('tokens','POST',input);if(isCurrent()) {setIssued(result.token);await refresh();}},'API-Token erzeugt.')}/></Expand>
      {issued&&<label><span>Token jetzt kopieren</span><input value={issued} readOnly onFocus={(e)=>e.target.select()}/></label>}
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
        <button onClick={()=>run(async(isCurrent)=>{await api(`tokens/${row.id}`,'DELETE');if(isCurrent()) {setIssued('');await refresh();}},'Token widerrufen.')}>Widerrufen</button>,
      ]}))}/>
      : <p className="empty" role="status">Keine API-Token erstellt.</p>)}
    </Panel>
    <Integrations flags={flags} run={run}/>
  </>;
}

function Integrations({flags,run}:{flags:{haben:boolean;zammad:boolean};run:Run}) {
  const [checkedTicket,setCheckedTicket]=useState<number>();
  return <Panel title="Integrationen"><div className="panel-body actions">
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
