import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { api, ApiError, downloadBlob, moment, type Row } from './client';
import { Icon } from './icons';
import { ConfirmationRequests, ConfirmDialog, Expand, Form, Panel, Table, type Confirmation, type Run } from './widgets';

type Article = { id:number; subject?:string|null; from?:string|null; created_at?:string; content_type?:string;
  body:string; attachments?:{filename:string;id?:number}[]; kind?:keyof typeof articleKinds;
  reply?:{recipient:string;subject:string} };
type Conversation = { ticket:{number:string;title?:string;url:string}; articles:Article[]; outgoing:Row[] };
type DialogState = { kind:'link'|'create'; trigger:HTMLButtonElement };
type ReplyTarget = {id:number; originalSubject:string; recipient:string; subject:string; trigger:HTMLButtonElement; forwardBody?:string};
type MessageDraft = {id:string;note:boolean;reply?:ReplyTarget;payload:Record<string,unknown>};
const articleKinds = {
  'incoming-email':'Eingehende E-Mail',
  'outgoing-email':'Ausgehende E-Mail',
  'internal-note':'Interne Notiz',
  internal:'Interner Eintrag',
  other:'Ticketeintrag',
  unknown:'Art unbekannt',
};

function articleInitials(from:string|undefined|null) {
  const sender=from?.split('<')[0]?.trim();
  return sender?.match(/[\p{L}\p{N}]+/gu)?.slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('de') || '•';
}

function plainText(html:string) {
  const template=document.createElement('template');
  template.innerHTML=html;
  for (const element of template.content.querySelectorAll('script,style,template')) element.remove();
  return template.content.textContent;
}

type DownloadStatus = {loading:boolean;problem?:string};

function useAttachmentDownloads() {
  const requests=useRef(new Map<string,AbortController>());
  const [status,setStatus]=useState<Record<string,DownloadStatus>>({});
  useEffect(()=>{
    const pending=requests.current;
    return ()=>{for(const controller of pending.values()) controller.abort();};
  },[]);

  async function download(filename:string,url:string) {
    if(requests.current.has(url)) return;
    const controller=new AbortController();
    requests.current.set(url,controller);
    setStatus(current=>({...current,[url]:{loading:true}}));
    let problem:string|undefined;
    try {
      const response=await fetch(url,{signal:controller.signal,redirect:'error'});
      if(!response.ok) {
        const result=await response.json().catch(()=>null);
        throw new Error(typeof result?.error==='string' ? result.error : 'Der Anhang konnte nicht geladen werden.');
      }
      if(response.headers.get('Content-Type')!=='application/octet-stream') {
        throw new Error('Desk hat keine Datei erhalten.');
      }
      const blob=await response.blob();
      if(!controller.signal.aborted) downloadBlob(filename,blob);
    } catch(error) {
      problem=error instanceof Error && !(error instanceof TypeError) ? error.message : 'Der Anhang konnte nicht geladen werden.';
    } finally {
      requests.current.delete(url);
      if(!controller.signal.aborted) setStatus(current=>{
        const next={...current};
        if(problem) next[url]={loading:false,problem};
        else delete next[url];
        return next;
      });
    }
  }
  return {status,download};
}

function ArticleAttachment({filename,status,download}:{filename:string;status?:DownloadStatus;download:()=>void}) {
  return <div className="communication-download">
    <button type="button" className="communication-attachment" aria-label={`${filename} herunterladen`} aria-disabled={status?.loading}
      onClick={download}>
      <Icon name="download"/><span>{filename}</span>
    </button>
    {status?.loading && <p role="status" className="subtle">Anhang wird geladen …</p>}
    {status?.problem && <p role="alert" className="inline-error">{status.problem}</p>}
  </div>;
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
  const attachmentDownloads=useAttachmentDownloads();
  const confirmationRequests=useContext(ConfirmationRequests);
  const outgoingKey='zammad-outgoing:'+project.id+':';
  const ticketId=project.zammad_ticket_id ? Number(project.zammad_ticket_id) : null;
  const [dialog,setDialog]=useState<DialogState>();
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const [conversation,setConversation]=useState<Conversation|null>(null);
  const [problem,setProblem]=useState('');
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(Boolean(zammad && ticketId));
  const refreshVersion=useRef(0);
  const [freeFile,setFreeFile]=useState<File>();
  const [replyFile,setReplyFile]=useState<File>();
  const [composeVersion,setComposeVersion]=useState(0);
  const [reply,setReply]=useState<ReplyTarget>();
  const replyComposer=useRef<HTMLElement>(null);
  const noteField=useRef<HTMLTextAreaElement>(null);
  const focusNoteAfterSave=useRef(false);
  const [noteText,setNoteText]=useState('');
  const [noteError,setNoteError]=useState('');
  const draft=useRef<MessageDraft|undefined>(undefined);
  const [locked,setLocked]=useState(false);
  const [canReplay,setCanReplay]=useState(false);
  const [replayError,setReplayError]=useState('');
  const [unresolvedRetry,setUnresolvedRetry]=useState<string>();
  const retryVersion=useRef(0);
  const retryInProgress=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(reply) replyComposer.current?.querySelector<HTMLElement>(reply.forwardBody===undefined?'textarea':'input[type=email]')?.focus();
  },[reply]);
  useEffect(()=>{
    if(!locked && focusNoteAfterSave.current) {
      focusNoteAfterSave.current=false;
      noteField.current?.focus({preventScroll:true});
    }
  },[locked,noteText]);

  function closeReply(target:ReplyTarget) {
    setReply(undefined);
    setReplyFile(undefined);
    requestAnimationFrame(()=>{
      if(target.trigger.isConnected && !target.trigger.disabled) target.trigger.focus();
      else zammadPanel.current?.focus({preventScroll:true});
    });
  }

  function clearDraft() {
    draft.current=undefined;
    setLocked(false);
    setCanReplay(false);
    setReplayError('');
    setUnresolvedRetry(undefined);
  }

  function resetDraft() {
    const previous=draft.current?.reply;
    const note=draft.current?.note;
    clearDraft();
    if(note) {
      focusNoteAfterSave.current=true;
      setNoteText('');
      setNoteError('');
    } else if(previous) closeReply(previous);
    else {
      setFreeFile(undefined);
      setComposeVersion(value=>value+1);
    }
  }

  async function refresh() {
    if (!zammad || !ticketId) return;
    const version=++refreshVersion.current;
    setLoading(true);
    setProblem('');
    try {
      const current=await api<Conversation>('projects/'+project.id+'/zammad');
      if(version!==refreshVersion.current) return;
      if (draft.current && current.outgoing.some(entry=>entry.id===draft.current?.id && entry.status==='sent')) resetDraft();
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
  async function deliver(current:MessageDraft,isCurrent:()=>boolean,replay=false) {
    setCanReplay(false);
    setReplayError('');
    let result;
    try {
      result=await request(current.note?'notes':'messages',current.payload);
    } catch(error) {
      if(isCurrent() && draft.current?.id===current.id) {
        // A gateway error can arrive after Desk has already accepted the message.
        if(!replay && error instanceof ApiError &&
          (error.code==='zammad_message_not_stored' || error.code==='invalid_input')) draft.current=undefined;
        else setCanReplay(true);
      }
      throw error;
    }
    if(!isCurrent()) return;
    await refresh();
    if(result.status!=='sent') throw new Error('Sendezustand prüfen. Der Versuch steht im Projektverlauf.');
    if(isCurrent() && draft.current?.id===current.id) resetDraft();
  }

  async function sendMessage(values:Record<string,string>,file:File|undefined,target?:ReplyTarget,note=false) {
    return run(async isCurrent=>{
      if(draft.current) return;
      if(file && file.size>5_242_880) throw new Error('PDF-Anhänge sind bis 5 MB möglich.');
      const message:Record<string,unknown>={...values,id:crypto.randomUUID()};
      if(note) message.ticketId=ticketId;
      if(target && target.forwardBody===undefined) {
        message.recipient=target.recipient;
        message.replyArticleId=target.id;
      }
      setLocked(true);
      try {
        if(file) {
          const bytes=new Uint8Array(await file.arrayBuffer());
          message.attachment={name:file.name,data:bytes.toBase64()};
        }
        if(!isCurrent()) return;
        const current={id:String(message.id),note,reply:target,payload:message};
        draft.current=current;
        await deliver(current,isCurrent);
      } finally {
        if(isCurrent() && !draft.current) setLocked(false);
      }
    },note?'Interne Notiz gespeichert.':'Nachricht an Zammad übergeben.',{reportInlineError:true});
  }

  async function replayMessage() {
    const current=draft.current;
    if(!current || !canReplay) return;
    try {
      await run(isCurrent=>deliver(current,isCurrent,true),current.note?'Interne Notiz gespeichert.':'Nachricht an Zammad übergeben.',{reportInlineError:true});
    } catch(error) {
      setReplayError(error instanceof Error ? error.message : 'Der Sendeversuch konnte nicht geprüft werden.');
    }
  }
  const currentAttempt=conversation?.outgoing.find(entry=>entry.id===draft.current?.id);
  const draftActions=<>
    {canReplay && !currentAttempt && <div className="communication-replay">
      <p className="subtle">Desk hat keine Bestätigung erhalten. Du kannst dieselben Angaben erneut an Desk übergeben.</p>
      <button type="button" onClick={()=>void replayMessage()}>Mit denselben Angaben fortfahren</button>
    </div>}
    {replayError && <p className="inline-error" role="alert">{replayError}</p>}
    {currentAttempt?.status==='failed' && currentAttempt.id!==unresolvedRetry && <div className="communication-replay">
      <p className="subtle">Zammad hat den Versuch abgelehnt. Du kannst hier eine neue Nachricht vorbereiten.</p>
      <button type="button" onClick={clearDraft}>Neuen Entwurf beginnen</button>
    </div>}
  </>;
  const articles=useMemo(()=>(conversation?.articles ?? []).map(article=>({
    ...article,
    subject:article.subject || 'Nachricht',
    body:article.content_type==='text/html' ? plainText(article.body) : article.body,
  })),[conversation]);
  const term=search.trim().toLowerCase();
  const visibleArticles=term ? articles.filter(article=>
    article.subject.toLowerCase().includes(term) || article.body.toLowerCase().includes(term)) : articles;
  const updatedReply=reply && articles.find(article=>article.id===reply.id)?.reply;
  const forwarding=reply?.forwardBody!==undefined;
  const replyChanged=Boolean(reply && !forwarding && conversation && (!updatedReply || updatedReply.recipient!==reply.recipient));
  const ticket=conversation?.ticket;
  const requester=articles.find(article=>article.kind==='incoming-email' && article.from)?.from;
  const ticketIdHint=useId();
  const dialogTitle=dialog?.kind==='link'?'Ticket verknüpfen':'Ticket anlegen';

  return <div className={ticketId && zammad ? 'communication-layout communication-ticket' : 'communication-layout'}>
    <Panel title={ticket?.title || 'Kommunikation'} subtitle={ticket ? 'Zammad-Ticket #'+ticket.number : undefined} focusRef={zammadPanel}
      headingIcon={requester ? <span className="communication-avatar communication-requester" aria-hidden="true">{articleInitials(requester)}</span> : undefined}
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
            {(articles.length>0 || search) && <div className="communication-search">
              <label className="filter"><span>Ticketverlauf durchsuchen</span>
                <input type="search" value={search} onChange={event=>setSearch(event.target.value)}/>
              </label>
              {term && visibleArticles.length>0 && <p className="subtle" role="status">{visibleArticles.length} von {articles.length} Nachrichten</p>}
            </div>}
            {visibleArticles.length>0 && <ol className="thread">{visibleArticles.map(article=><li key={article.id} data-kind={article.kind ?? 'unknown'}>
              <span className="communication-avatar" aria-hidden="true">{articleInitials(article.from)}</span>
              <article className="communication-message">
                <div className="communication-bubble">
                  <span className="communication-kind">{articleKinds[article.kind ?? 'unknown']}</span>
                  <strong>{article.subject}</strong>
                  {article.from && <small className="communication-sender">{article.from}</small>}
                  <p>{article.body}</p>
                  {article.attachments?.length ? <div className="communication-attachments">
                    {article.attachments.map((attachment,index)=>{
                      if(!ticketId || !attachment.id) return <small className="communication-attachment" key={`name:${index}`}>{attachment.filename}</small>;
                      const url=`/api/v1/projects/${project.id}/zammad/attachment?ticket=${ticketId}&article=${article.id}&attachment=${attachment.id}`;
                      return <ArticleAttachment key={attachment.id} filename={attachment.filename} status={attachmentDownloads.status[url]}
                        download={()=>void attachmentDownloads.download(attachment.filename,url)}/>;
                    })}
                  </div> : null}
                </div>
                <footer className="communication-article-actions">
                  {article.reply && <button type="button" aria-expanded={reply?.id===article.id && !forwarding} disabled={locked || Boolean(reply)} onClick={event=>{
                    if(article.reply) setReply({...article.reply,id:article.id,originalSubject:article.subject,trigger:event.currentTarget});
                  }}>Antworten</button>}
                  {(article.kind==='incoming-email' || article.kind==='outgoing-email') && <button type="button"
                    aria-expanded={reply?.id===article.id && forwarding} disabled={locked || Boolean(reply)} onClick={event=>setReply({
                      id:article.id,originalSubject:article.subject,recipient:'',subject:('WG: '+article.subject).slice(0,160),
                      trigger:event.currentTarget,forwardBody:'\n\n'+article.body,
                    })}>Text weiterleiten</button>}
                  <button type="button" disabled={locked} onClick={()=>{
                    const excerpt=article.body.length>800 ? article.body.slice(0,800)+' …' : article.body;
                    const quote=[article.subject,...excerpt.split(/\r?\n/)].map(line=>'> '+line).join('\n');
                    const next=noteText ? noteText+'\n\n'+quote : quote;
                    if(next.length<=5000) {
                      setNoteText(next);
                      setNoteError('');
                    } else setNoteError('Das Zitat passt nicht mehr in die Notiz mit höchstens 5.000 Zeichen.');
                    noteField.current?.focus();
                  }}>In Notiz zitieren</button>
                </footer>
                {article.created_at && <time dateTime={article.created_at}>{moment(article.created_at)}</time>}
              </article>
            </li>)}</ol>}
            {term && articles.length>0 && visibleArticles.length===0 && <p className="subtle" role="status">Keine Nachrichten für diese Suche.</p>}
            {conversation && articles.length===0 && !loading && !problem && <p className="subtle">Dieses Ticket enthält noch keine Nachrichten.</p>}
          </section>
          <div className="communication-editors">
          <div className="communication-compose" hidden={Boolean(reply)}><Expand title="Antwort schreiben"><Form key={composeVersion} disabled={locked && !reply} caption="Über Zammad senden" fields={[
              {name:'recipient',label:'Empfänger',type:'email',required:true},{name:'subject',label:'Betreff',required:true},{name:'body',label:'Nachricht',type:'textarea',required:true},
            ]} submit={values=>sendMessage(values,freeFile)}>
              <label className="wide"><span>PDF-Anhang</span><input type="file" disabled={locked && !reply} accept="application/pdf,.pdf" onChange={event=>setFreeFile(event.target.files?.[0])}/></label>
            </Form>{!reply && !draft.current?.note && draftActions}</Expand></div>
          {reply && <section ref={replyComposer} className="communication-reply" aria-label={forwarding?'E-Mail-Weiterleitung':'E-Mail-Antwort'}>
            <header><h3>{forwarding?'Weiterleitung von':'Antwort auf'} „{reply.originalSubject}“</h3>
              <button type="button" disabled={locked} onClick={()=>closeReply(reply)}>{forwarding?'Weiterleitung schließen':'Antwort schließen'}</button>
            </header>
            {forwarding ? <p className="subtle">Überprüfe den Text und gib die Empfängeradresse ein.</p>
              : <p className="subtle">Externe E-Mail an <strong>{reply.recipient}</strong></p>}
            {replyChanged && !locked && <div className="communication-replay">
              <p role="status">{updatedReply ? 'Die Antwortadresse im Ticket hat sich geändert.' : 'Diese Nachricht kann nicht mehr direkt beantwortet werden.'}</p>
              {updatedReply && <button type="button" onClick={()=>setReply({...reply,recipient:updatedReply.recipient})}>
                Adresse {updatedReply.recipient} übernehmen
              </button>}
            </div>}
            <Form caption="E-Mail über Zammad senden" busyCaption="E-Mail wird gesendet …" disabled={locked || replyChanged} fields={[
              ...(forwarding ? [{name:'recipient',label:'Empfänger',type:'email',required:true}] : []),
              {name:'subject',label:'Betreff',value:reply.subject,required:true},{name:'body',label:'Nachricht',type:'textarea',value:reply.forwardBody,required:true},
            ]} submit={values=>sendMessage(values,replyFile,reply)}>
              <label className="wide"><span>PDF-Anhang</span><input type="file" disabled={locked || replyChanged} accept="application/pdf,.pdf" onChange={event=>setReplyFile(event.target.files?.[0])}/></label>
            </Form>
            {!draft.current?.note && draftActions}
          </section>}
          <form className="communication-note" onSubmit={event=>{
            event.preventDefault();
            setNoteError('');
            if(!noteText.trim()) return;
            void sendMessage({body:noteText},undefined,undefined,true).catch(error=>{
              setNoteError(error instanceof Error ? error.message : 'Die Notiz konnte nicht gespeichert werden.');
            });
          }}>
            <label><span>Interne Notiz</span><textarea ref={noteField} value={noteText} maxLength={5000} required
              disabled={locked} placeholder="Notiz für das Team schreiben …" onChange={event=>setNoteText(event.target.value)}/></label>
            {noteError && <p className="inline-error" role="alert">{noteError}</p>}
            {draft.current?.note && draftActions}
            <div className="form-action"><button type="submit" className="primary" disabled={locked || !noteText.trim()}>Notiz hinzufügen</button></div>
          </form>
          </div>
          {(conversation?.outgoing.length ?? 0) > 0 && <div className="communication-outgoing"><h3>Sendeversuche</h3><Table headers={['Sendeversuch','Status','Aktion']} rows={(conversation?.outgoing ?? []).map((entry:Row)=>({
              key:entry.id,cells:[entry.subject,({sent:'An Zammad übergeben',pending:'Ausstehend',failed:'Abgelehnt',unknown:'Ausgang unklar'} as Record<string,string>)[entry.status],
                entry.status==='sent' ? '–' : <div className="actions">
                  <button onClick={()=>run(async(isCurrent)=>{
                    const version=retryVersion.current;
                    const result=await request(`outgoing/${entry.id}`,{retry:false});
                    if(!isCurrent()) return;
                    if(result.status==='failed' && retryVersion.current===version && retryInProgress.current!==entry.id) {
                      setUnresolvedRetry(current=>current===entry.id ? undefined : current);
                    }
                    await refresh();
                  })}>Prüfen</button>
                  <button onClick={event=>setConfirmation({
                    actionKey:`${outgoingKey}${entry.id}`,
                    title:'Zammad-Sendeversuch wiederholen',
                    description:`Desk sucht im Ticketverlauf nach der Referenz des Sendeversuchs „${entry.subject}“. Fehlt ein Versandnachweis und ist eine Wiederholung zulässig, sendet Zammad die Nachricht erneut.`,
                    actionLabel:'Erneut senden',
                    trigger:event.currentTarget,
                    submit:async isCurrent=>{
                      const protectsDraft=draft.current?.id===entry.id;
                      if(protectsDraft) {
                        retryVersion.current++;
                        retryInProgress.current=entry.id;
                        setUnresolvedRetry(entry.id);
                      }
                      try {
                        const result=await request(`outgoing/${entry.id}`,{retry:true});
                        if(!isCurrent()) return;
                        await refresh();
                        if(result.status==='failed') {
                          if(protectsDraft) setUnresolvedRetry(undefined);
                          throw new Error('Zammad hat den Sendeversuch abgelehnt.');
                        }
                        if(result.status!=='sent') throw new Error('Der Ausgang des Sendeversuchs ist weiterhin unklar.');
                      } finally {
                        if(protectsDraft) {
                          retryInProgress.current=undefined;
                          retryVersion.current++;
                        }
                      }
                    },
                    feedback:'Sendeversuch bestätigt.',
                  })}>Erneut senden</button>
                </div>],
            }))}/></div>}
        </>}
      </div>
    </Panel>
    <aside className="communication-details" aria-label="Vorgangsdetails">
      {ticketId && <Panel title="Ticketdetails">
        <div className="panel-body communication-reference communication-ticket-details">
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
