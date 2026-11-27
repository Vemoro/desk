import { Field } from './field';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, compileCsv, euros, money, type Row } from './client';
import type { Data } from './projects';
import { Expand, Form, ConfirmDialog, noWrite, options, Panel, Pill, Table, type Confirmation, type Run } from './widgets';
import { SettingsLayout, type SettingsArea } from './settings-navigation';

export function Costs({data,run}:{data:Data;run:Run}) {
  return <Panel title="Belege und Zuordnung"><div className="panel-body">
    <Expand title="Kosten aus CSV übernehmen"><Form caption="Kosten übernehmen" fields={[
      {name:'csv',label:'CSV-Inhalt mit reference, name, amount und optional cost_center',type:'textarea',required:true},
    ]} submit={({csv})=>run(()=>api('costs','POST',{entries:compileCsv(csv)}),'Kosten übernommen.')}/></Expand>
    <Expand title="Kosten einzeln erfassen"><Form caption="Beleg speichern" fields={[
      {name:'reference',label:'Belegreferenz',required:true},{name:'name',label:'Bezeichnung',required:true},
      {name:'amount',label:'Netto in Euro',required:true},{name:'project_id',label:'Projekt',choices:options(data.projects)},
    ]} submit={(input)=>run(()=>api('costs','POST',{entries:[{reference:input.reference,name:input.name,cents:money(input.amount),source:'manual',project_id:input.project_id||null}]}),'Beleg gespeichert.')}/></Expand>
  </div><Table numeric={[2]} headers={['Beleg','Bezeichnung','Netto','Projektzuordnung']} rows={data.costs.map((row)=>({key:row.id,cells:[
    row.reference,row.name,euros(row.cents),<Field label={`Projekt für ${row.reference}`} visuallyHiddenLabel>{props=><select {...props} value={row.project_id??''}
      onChange={(event)=>run(()=>api(`costs/${row.id}`,'PATCH',{project_id:event.target.value||null}),'Zuordnung gespeichert.')}>
      <option value="">Ohne Zuordnung</option>{data.projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select>}</Field>,
  ]}))}/></Panel>;
}

type SettingsHeading=RefObject<HTMLHeadingElement|null>;

export function Settings({data,run,flags,accountId,area}:{
  data:Data; run:Run; flags:{haben:boolean;zammad:boolean}; accountId:string; area?:SettingsArea;
}) {
  const heading=useRef<HTMLHeadingElement>(null);
  return <SettingsLayout area={area} heading={heading}>
    {(area===undefined || area==='team') && <TeamSettings users={data.users} run={run} accountId={accountId} heading={heading}/>}
    {area==='api' && <ApiAccess run={run} heading={heading}/>}
    {area==='integrations' && <Integrations flags={flags} run={run} heading={heading}/>}
  </SettingsLayout>;
}

function ApiAccess({run,heading}:{run:Run;heading:SettingsHeading}) {
  const [tokenList,setTokenList]=useState<{status:'loading'|'failed'}|{status:'loaded';tokens:Row[]}>({status:'loading'});
  const [issued,setIssued]=useState('');
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
  },[]);
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
      <Expand title="API-Token erzeugen"><Form caption="Token erzeugen" fields={[
        {name:'label',label:'Name',required:true},{name:'scope',label:'Berechtigung',choices:[{value:'read',label:'Lesen'},{value:'write',label:'Lesen und schreiben'}],required:true},
      ]} submit={(input)=>run(async(isCurrent)=>{const result=await api('tokens','POST',input);if(isCurrent()) {setIssued(result.token);await refresh();}},'API-Token erzeugt.')}/></Expand>
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
            if(isCurrent()) {setIssued("");await refresh();}
          },feedback:"Token widerrufen.",
        })}>Widerrufen</button>,
      ]}))}/>
      : <p className="empty" role="status">Keine API-Token erstellt.</p>)}
    </Panel>
    {revocation && <ConfirmDialog confirmation={revocation} run={run} dismiss={()=>setRevocation(undefined)} fallbackFocus={tokenPanel}/>}
  </>;
}

function Integrations({flags,run,heading}:{flags:{haben:boolean;zammad:boolean};run:Run;heading:SettingsHeading}) {
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

function TeamSettings({users,run,accountId,heading}:{users:Row[];run:Run;accountId:string;heading:SettingsHeading}) {
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
          trigger:event.currentTarget,submit:()=>saveAccess(row,true),feedback:"Konto gesperrt.",
        });
      }}>{row.blocked?"Konto freigeben":"Konto sperren"}</button>,
    ]}))}/></Panel>
    {confirmation && <ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={teamPanel}/>}
  </>;
}
