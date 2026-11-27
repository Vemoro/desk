import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { api, type Row } from './client';
import { SendingAttempts, TicketActivity } from './communication-history';
import { DraftActions } from './communication-draft';
import { draftAttemptRow, ticketDelivery, type Conversation, useSendingAttempt, useTicketConversation, type RequestZammad } from './communication-delivery';
import { TicketEditors, useTicketComposer, useNoteFocusAfterSave } from './communication-editor';
import { articleInitials, plainText, useAttachmentDownloads } from './communication-articles';
import { ConfirmDialog, Form, FormDialog, Panel, type Confirmation, type Run } from './widgets';

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
    {trigger && <FormDialog title={title} trigger={trigger} dismiss={()=>setTrigger(undefined)}>{save=>
      <Form caption="Verweis speichern" fields={[
        {name:'external_link',label:'Vorgangslink',type:'url',value:project.external_link},
        {name:'communication_note',label:'Kommunikationsnotiz',type:'textarea',value:project.communication_note},
      ]} submit={input=>save(()=>run(()=>api('projects/'+project.id,'PATCH',input),'Verweis gespeichert.',{reportInlineError:true}))}/>
    }</FormDialog>}
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
  const attachmentDownloads=useAttachmentDownloads();
  const ticketId=project.zammad_ticket_id ? Number(project.zammad_ticket_id) : null;
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const [search,setSearch]=useState('');
  const {loadedConversation,setConversation,problem,loading,refresh,outgoingKey}=useTicketConversation(project.id,ticketId,zammad,
    current=>attempt.confirmLoadedAttempt(current));
  const composer=useTicketComposer(zammadPanel);
  const attempt=useSendingAttempt(setConversation,composer.resetComposer);
  const {draft,locked,draftStatus}=attempt;
  const {reply,replyTo,forward,quote}=composer;
  useNoteFocusAfterSave(composer,locked);
  const request:RequestZammad=(suffix,input)=>api('projects/'+project.id+'/zammad/'+suffix,'POST',input);
  const {sendMessage,recoverDraft}=ticketDelivery({attempt,request,refresh,run,ticketId});
  const draftAttempt=draft.current;
  const listedAttempt=loadedConversation?.outgoing.find(entry=>entry.id===draftAttempt?.id);
  const savedDraft=draftAttempt && draftStatus && !listedAttempt ? draftAttemptRow(draftAttempt,draftStatus) : undefined;
  const currentAttempt=listedAttempt ?? savedDraft;
  const conversation=savedDraft ? {
    ...loadedConversation,outgoing:[savedDraft,...(loadedConversation?.outgoing ?? [])],
  } : loadedConversation;
  const draftActions=<DraftActions attempt={attempt} listedStatus={currentAttempt?.status} recoverDraft={recoverDraft}/>;
  const articles=useMemo(()=>(loadedConversation?.articles ?? []).map(article=>({
    ...article,
    subject:article.subject || 'Nachricht',
    body:article.content_type==='text/html' ? plainText(article.body) : article.body,
  })),[loadedConversation]);
  const updatedReply=reply && articles.find(article=>article.id===reply.id)?.reply;
  const forwarding=reply?.forwardBody!==undefined;
  const replyChanged=Boolean(reply && !forwarding && loadedConversation?.ticket && (!updatedReply || updatedReply.recipient!==reply.recipient));
  const ticket=loadedConversation?.ticket;
  const requester=articles.find(article=>article.kind==='incoming-email' && article.from)?.from;

  return <div className={ticketId && zammad ? 'communication-layout communication-ticket' : 'communication-layout'}>
    <Panel title={ticket?.title || 'Kommunikation'} subtitle={ticket ? 'Zammad-Ticket #'+ticket.number : undefined} focusRef={zammadPanel}
      headingIcon={requester ? <span className="communication-avatar communication-requester" aria-hidden="true">{articleInitials(requester)}</span> : undefined}
      action={ticketId && zammad ? <button type="button" onClick={()=>void refresh()}>Verlauf aktualisieren</button> : undefined}>
      <div className="panel-body communication-workspace">
        {!ticketId ? <LinkTicket request={request} run={run}/> : !zammad ? <p className="subtle">Zammad ist nicht eingerichtet. Der Ticketverlauf kann gerade nicht geladen werden.</p> : <>
          <TicketActivity loading={loading} problem={problem} articles={articles} hasTicket={Boolean(ticket)}
            search={search} setSearch={setSearch} attachmentDownloads={attachmentDownloads} projectId={project.id} ticketId={ticketId}
            replyId={reply?.id} forwarding={forwarding} locked={locked} replyTo={replyTo} forward={forward} quote={quote}>
            <SendingAttempts entries={conversation?.outgoing ?? []} attempt={attempt} request={request} refresh={refresh}
              run={run} outgoingKey={outgoingKey} setConfirmation={setConfirmation}/>
          </TicketActivity>
          <TicketEditors composer={composer} locked={locked} updatedReply={updatedReply} replyChanged={replyChanged}
            forwarding={forwarding} draftNote={draft.current?.note} draftActions={draftActions} sendMessage={sendMessage}/>
        </>}
      </div>
    </Panel>
    <TicketDetails ticketId={ticketId} projectId={project.id} ticket={ticket} zammad={zammad} failed={Boolean(problem)}
      conversation={conversation} request={request} setConfirmation={setConfirmation}>{reference}</TicketDetails>
    {confirmation&&<ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={zammadPanel}/>}
  </div>;
}

type DialogState = { kind:'link'|'create'; trigger:HTMLButtonElement };

function LinkTicket({request,run}:{request:RequestZammad;run:Run}) {
  const [dialog,setDialog]=useState<DialogState>();
  const ticketIdHint=useId();
  const dialogTitle=dialog?.kind==='link'?'Ticket verknüpfen':'Ticket anlegen';
  return <>
    <div className="communication-empty">
      <p>Mit diesem Projekt ist noch kein Zammad-Ticket verknüpft.</p>
      <div className="actions">
        <button type="button" className="primary" onClick={event=>setDialog({kind:'link',trigger:event.currentTarget})}>Ticket verknüpfen</button>
        <button type="button" onClick={event=>setDialog({kind:'create',trigger:event.currentTarget})}>Ticket anlegen</button>
      </div>
    </div>
    {dialog && <FormDialog title={dialogTitle} trigger={dialog.trigger} dismiss={()=>setDialog(undefined)}>{save=>
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
    }</FormDialog>}
  </>;
}

function TicketDetails({ticketId,projectId,ticket,zammad,failed,conversation,request,setConfirmation,children}:{
  ticketId:number|null; projectId:string; ticket:Conversation['ticket']; zammad:boolean; failed:boolean;
  conversation:{outgoing:Conversation['outgoing']}|null; request:RequestZammad;
  setConfirmation:(confirmation:Confirmation)=>void; children:ReactNode;
}) {
  const unlinkHint=useId();
  const waiting=zammad && !conversation && !failed;
  return <aside className="communication-details" aria-label="Vorgangsdetails">
    {ticketId && <Panel title="Ticketdetails">
      <div className="panel-body communication-reference communication-ticket-details">
        {ticket ? <a href={ticket.url} target="_blank" rel="noreferrer">Ticket {ticket.number} öffnen</a> : <p className="subtle">Ticket-ID {ticketId}</p>}
        {conversation?.outgoing.length ? <p className="subtle">
          Die Verknüpfung bleibt bestehen, weil für dieses Ticket Sendeversuche vorliegen.
        </p> : <button type="button" className="danger" disabled={waiting}
          aria-describedby={waiting?unlinkHint:undefined}
          onClick={event=>setConfirmation({
            actionKey:'zammad-unlink:'+projectId+':'+ticketId,
            title:'Ticketverknüpfung lösen',
            description:'Die Zuordnung zu Zammad-Ticket '+(ticket?.number ?? ticketId)+' wird aus dem Projekt entfernt. Das Ticket bleibt in Zammad erhalten.',
            actionLabel:'Verknüpfung lösen',danger:true,
            trigger:event.currentTarget,
            submit:()=>request('unlink',{id:ticketId}),
            feedback:'Ticketverknüpfung gelöst.',
          })}>Ticketverknüpfung lösen</button>}
        {waiting && <p id={unlinkHint} className="subtle">Die Verknüpfung lässt sich lösen, sobald der Ticketverlauf geprüft ist.</p>}
      </div>
    </Panel>}
    {children}
  </aside>;
}
