import { useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { api, moment, type Row } from './client';
import { ConfirmationRequests, ConfirmDialog, Expand, Form, Panel, Table, type Confirmation, type Run } from './widgets';

type Article = { id:number; subject?:string|null; from?:string|null; created_at?:string; content_type?:string;
  body:string; attachments?:{filename:string}[] };
type Conversation = { ticket:{number:string;title?:string;url:string}; articles:Article[]; outgoing:Row[] };
type DialogState = { kind:'link'|'create'; trigger:HTMLButtonElement };

function plainText(html:string) {
  const template=document.createElement('template');
  template.innerHTML=html;
  for (const element of template.content.querySelectorAll('script,style,template')) element.remove();
  return template.content.textContent;
}

function CommunicationDialog({title,trigger,dismiss,children}:{
  title:string; trigger:HTMLButtonElement; dismiss:()=>void;
  children:(save:(action:()=>Promise<boolean>)=>Promise<boolean>)=>ReactNode;
}) {
  const titleId=useId();
  const dialog=useRef<HTMLDialogElement>(null);
  const busy=useRef(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    element?.querySelector<HTMLElement>('input, textarea')?.focus();
    return ()=>element?.close();
  },[]);

  function close() {
    dialog.current?.close();
    dismiss();
    if(trigger.isConnected) trigger.focus();
  }

  useEffect(()=>{
    if(saving) dialog.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  },[saving]);

  async function save(action:()=>Promise<boolean>) {
    if(busy.current) return false;
    busy.current=true;
    setSaving(true);
    try {
      const saved=await action();
      if(saved && dialog.current) close();
      return saved;
    } finally {
      busy.current=false;
      setSaving(false);
    }
  }

  return <dialog ref={dialog} className="confirm-dialog communication-dialog" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();if(!busy.current) close();}}
    onKeyDown={event=>{
      if(event.key!=='Tab') return;
      const fields=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)');
      const first=fields[0];
      const last=fields[fields.length-1];
      const current=document.activeElement;
      if(!Array.from(fields).some(field=>field===current)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        return;
      }
      if(event.shiftKey && current===first) {
        event.preventDefault();
        last?.focus();
      } else if(!event.shiftKey && current===last) {
        event.preventDefault();
        first?.focus();
      }
    }}>
    <header className="communication-dialog-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" disabled={saving} onClick={close}>Schließen</button>
    </header>
    {children(save)}
  </dialog>;
}

function ExternalReference({project,run}:{project:Row;run:Run}) {
  const [trigger,setTrigger]=useState<HTMLButtonElement>();
  const stored=Boolean(project.external_link || project.communication_note);
  const title=stored?'Verweis bearbeiten':'Verweis hinzufügen';
  return <Panel title="Externer Vorgang">
    <div className="panel-body communication-reference">
      {project.external_link && <a href={project.external_link} target="_blank" rel="noreferrer">Vorgang öffnen</a>}
      {project.communication_note && <p>{project.communication_note}</p>}
      {!stored && <p className="subtle">Kein externer Verweis hinterlegt.</p>}
      <button type="button" onClick={event=>setTrigger(event.currentTarget)}>{title}</button>
    </div>
    {trigger && <CommunicationDialog title={title} trigger={trigger} dismiss={()=>setTrigger(undefined)}>{save=>
      <Form caption="Verweis speichern" fields={[
        {name:'external_link',label:'Vorgangslink',type:'url',value:project.external_link},
        {name:'communication_note',label:'Kommunikationsnotiz',type:'textarea',value:project.communication_note},
      ]} submit={input=>save(()=>run(()=>api('projects/'+project.id,'PATCH',input),'Verweis gespeichert.',{reportInlineError:true}))}/>
    }</CommunicationDialog>}
  </Panel>;
}

export function Communication({project,zammad,run}:{project:Row;zammad:boolean;run:Run}) {
  const workspace=useRef<HTMLElement>(null);
  const ticket=project.zammad_ticket_id ?? null;
  const previousTicket=useRef(ticket);
  useEffect(()=>{
    if(previousTicket.current!==ticket) workspace.current?.focus({preventScroll:true});
    previousTicket.current=ticket;
  },[ticket]);
  const reference=<ExternalReference key={project.id} project={project} run={run}/>;
  if (!zammad && !project.zammad_ticket_id) {
    return <div className="communication-layout">
      <Panel title="Kommunikation"><div className="panel-body"><p className="subtle">Zammad ist nicht eingerichtet. Du kannst einen externen Vorgang hinterlegen.</p></div></Panel>
      {reference}
    </div>;
  }
  return <ZammadCommunication key={project.id+':'+(project.zammad_ticket_id ?? '')}
    project={project} zammad={zammad} run={run} reference={reference} zammadPanel={workspace}/>;
}

function ZammadCommunication({project,zammad,run,reference,zammadPanel}:{
  project:Row; zammad:boolean; run:Run; reference:ReactNode; zammadPanel:RefObject<HTMLElement|null>;
}) {
  const confirmationRequests=useContext(ConfirmationRequests);
  const outgoingKey='zammad-outgoing:'+project.id+':';
  const ticketId=project.zammad_ticket_id ? Number(project.zammad_ticket_id) : null;
  const [dialog,setDialog]=useState<DialogState>();
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const [conversation,setConversation]=useState<Conversation|null>(null);
  const [problem,setProblem]=useState('');
  const [loading,setLoading]=useState(Boolean(zammad && ticketId));
  const refreshVersion=useRef(0);
  const [file,setFile]=useState<File>();
  const [composeVersion,setComposeVersion]=useState(0);
  const draftId=useRef<string | undefined>(undefined);

  async function refresh() {
    if (!zammad || !ticketId) return;
    const version=++refreshVersion.current;
    setLoading(true);
    setProblem('');
    try {
      const current=await api<Conversation>('projects/'+project.id+'/zammad');
      if(version!==refreshVersion.current) return;
      if (draftId.current && current.outgoing.some(entry=>entry.id===draftId.current && entry.status==='sent')) {
        draftId.current=undefined;
        setFile(undefined);
        setComposeVersion(value=>value+1);
      }
      setConversation(current);
    }
    catch(error) {
      if(version===refreshVersion.current) setProblem(error instanceof Error ? error.message : 'Verlauf nicht verfügbar.');
    }
    finally {
      if(version===refreshVersion.current) setLoading(false);
    }
  }

  useEffect(()=>{
    setConversation(null);
    setProblem('');
    setLoading(Boolean(ticketId && zammad));
    const pending=[...confirmationRequests].filter(([key])=>key.startsWith(outgoingKey)).map(([,request])=>request);
    const initial=refresh();
    let visible=true;
    if(pending.length) void Promise.all([initial,Promise.allSettled(pending)]).then(()=>{
      if(visible) void refresh();
    });
    return ()=>{visible=false;refreshVersion.current++;};
  },[outgoingKey,ticketId,zammad,confirmationRequests]);

  const request=(suffix:string,input:unknown)=>api('projects/'+project.id+'/zammad/'+suffix,'POST',input);
  const ticket=conversation?.ticket;
  const ticketIdHint=useId();
  const dialogTitle=dialog?.kind==='link'?'Ticket verknüpfen':'Ticket anlegen';

  return <div className="communication-layout">
    <Panel title={ticket?.title || 'Kommunikation'} focusRef={zammadPanel}
      action={ticketId && zammad ? <button type="button" onClick={()=>void refresh()} disabled={loading}>Verlauf aktualisieren</button> : undefined}>
      <div className="panel-body communication-workspace">
        {!ticketId ? <>
          <div className="communication-empty">
            <p>Mit diesem Projekt ist noch kein Zammad-Ticket verknüpft.</p>
            <div className="actions">
              <button type="button" className="primary" onClick={event=>setDialog({kind:'link',trigger:event.currentTarget})}>Ticket verknüpfen</button>
              <button type="button" onClick={event=>setDialog({kind:'create',trigger:event.currentTarget})}>Ticket anlegen</button>
            </div>
          </div>
          {dialog && <CommunicationDialog title={dialogTitle} trigger={dialog.trigger} dismiss={()=>setDialog(undefined)}>{save=>
            dialog.kind==='link' ? <>
              <p id={ticketIdHint} className="subtle communication-dialog-hint">Die Ticket-ID steht am Ende der Ticketadresse in Zammad.</p>
              <Form caption="Ticket verknüpfen" fields={[
                {name:'id',label:'Ticket-ID',type:'number',min:1,required:true,describedBy:ticketIdHint},
              ]} submit={v=>save(()=>run(()=>request('link',{id:Number(v.id)}),'Ticket verknüpft.',{reportInlineError:true}))}/>
            </>
            : <Form caption="Ticket anlegen" fields={[
              {name:'title',label:'Betreff',required:true},{name:'customer',label:'Kunden-E-Mail',type:'email',required:true},
              {name:'note',label:'Interne Notiz',type:'textarea',required:true},
            ]} submit={v=>save(()=>run(()=>request('tickets',v),'Ticket angelegt.',{reportInlineError:true}))}/>
          }</CommunicationDialog>}
        </> : !zammad ? <p className="subtle">Zammad ist nicht eingerichtet. Der Ticketverlauf kann gerade nicht geladen werden.</p> : <>
          {loading && <p role="status" className="subtle">Ticketverlauf wird geladen …</p>}
          <section className="communication-history" aria-label="Ticketverlauf" aria-busy={loading}>
            {problem && <p role="alert" className="inline-error">{problem}</p>}
            {conversation?.articles.length ? <ol className="thread">{conversation.articles.map(article=><li key={article.id}>
              <div><strong>{article.subject || 'Nachricht'}</strong><small>{[article.from,article.created_at && moment(article.created_at)].filter(Boolean).join(' · ')}</small></div>
              <p>{article.content_type==='text/html' ? plainText(article.body) : article.body}</p>
              {article.attachments?.map((attachment,index)=><small className="communication-attachment" key={index}>{attachment.filename}</small>)}
            </li>)}</ol> : conversation && !loading && !problem && <p className="subtle">Dieses Ticket enthält noch keine Nachrichten.</p>}
          </section>
          <div className="communication-compose"><Expand title="Antwort schreiben"><Form key={composeVersion} caption="Über Zammad senden" fields={[
              {name:'recipient',label:'Empfänger',type:'email',required:true},{name:'subject',label:'Betreff',required:true},{name:'body',label:'Nachricht',type:'textarea',required:true},
            ]} submit={(v)=>run(async(isCurrent)=>{
              const message:{[key:string]:unknown}={...v,id:draftId.current ??= crypto.randomUUID()};
              if(file) {
                if(file.size>5_242_880) throw new Error('PDF-Anhänge sind bis 5 MB möglich.');
                const bytes=new Uint8Array(await file.arrayBuffer());
                message.attachment={name:file.name,data:bytes.toBase64()};
              }
              if(!isCurrent()) return;
              const result=await request('messages',message);
              if(!isCurrent()) return;
              await refresh();
              if(result.status!=='sent') throw new Error('Sendezustand prüfen. Der Versuch steht im Projektverlauf.');
              if(isCurrent()) setFile(undefined);
            },'Nachricht an Zammad übergeben.')}>
              <label className="wide"><span>PDF-Anhang</span><input type="file" accept="application/pdf,.pdf" onChange={(event)=>setFile(event.target.files?.[0])}/></label>
            </Form></Expand></div>
          {(conversation?.outgoing.length ?? 0) > 0 && <div className="communication-outgoing"><h3>Sendeversuche</h3><Table headers={['Sendeversuch','Status','Aktion']} rows={(conversation?.outgoing ?? []).map((entry:Row)=>({
              key:entry.id,cells:[entry.subject,({sent:'An Zammad übergeben',pending:'Ausstehend',failed:'Abgelehnt',unknown:'Ausgang unklar'} as Record<string,string>)[entry.status],
                entry.status==='sent' ? '–' : <div className="actions">
                  <button onClick={()=>run(async(isCurrent)=>{await request(`outgoing/${entry.id}`,{retry:false});if(isCurrent()) await refresh();})}>Prüfen</button>
                  <button onClick={event=>setConfirmation({
                    actionKey:`${outgoingKey}${entry.id}`,
                    title:'Zammad-Sendeversuch wiederholen',
                    description:`Desk sucht im Ticketverlauf nach der Referenz des Sendeversuchs „${entry.subject}“. Fehlt ein Versandnachweis und ist eine Wiederholung zulässig, sendet Zammad die Nachricht erneut.`,
                    actionLabel:'Erneut senden',
                    trigger:event.currentTarget,
                    submit:async isCurrent=>{
                      const result=await request(`outgoing/${entry.id}`,{retry:true});
                      if(!isCurrent()) return;
                      await refresh();
                      if(result.status==='failed') throw new Error('Zammad hat den Sendeversuch abgelehnt.');
                      if(result.status!=='sent') throw new Error('Der Ausgang des Sendeversuchs ist weiterhin unklar.');
                    },
                    feedback:'Sendeversuch bestätigt.',
                  })}>Erneut senden</button>
                </div>],
            }))}/></div>}
        </>}
      </div>
    </Panel>
    <aside className="communication-details" aria-label="Vorgangsdetails">
      {ticketId && <Panel title="Zammad-Ticket">
        <div className="panel-body communication-reference">
          {ticket ? <a href={ticket.url} target="_blank" rel="noreferrer">Ticket {ticket.number} öffnen</a> : <p className="subtle">Ticket-ID {ticketId}</p>}
          {!conversation?.outgoing.length && <button type="button" disabled={zammad && !conversation && !problem}
            onClick={event=>setConfirmation({
              actionKey:'zammad-unlink:'+project.id+':'+ticketId,
              title:'Ticketverknüpfung lösen',
              description:'Die Zuordnung zu Zammad-Ticket '+(ticket?.number ?? ticketId)+' wird aus dem Projekt entfernt. Das Ticket bleibt in Zammad erhalten.',
              actionLabel:'Verknüpfung lösen',
              trigger:event.currentTarget,
              submit:()=>request('unlink',{id:ticketId}),
              feedback:'Ticketverknüpfung gelöst.',
            })}>Ticketverknüpfung lösen</button>}
        </div>
      </Panel>}
      {reference}
    </aside>
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={zammadPanel}/>}
  </div>;
}
