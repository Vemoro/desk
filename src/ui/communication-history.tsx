import type { ReactNode } from 'react';
import { TicketEntry, type TicketArticle, type useAttachmentDownloads } from './communication-articles';
import { attemptLabels, type Conversation, type RequestZammad, type useSendingAttempt } from './communication-delivery';
import { moment } from './client';
import { Field } from './field';
import { Table, type Confirmation, type Run } from './widgets';

type ArticleAction = (article:TicketArticle,trigger:HTMLButtonElement)=>void;

export function TicketActivity({loading,problem,articles,hasTicket,search,setSearch,attachmentDownloads,projectId,ticketId,
  replyId,forwarding,locked,replyTo,forward,quote,children}:{
  loading:boolean; problem:string; articles:TicketArticle[]; hasTicket:boolean; search:string; setSearch:(value:string)=>void;
  attachmentDownloads:ReturnType<typeof useAttachmentDownloads>; projectId:string; ticketId:number; replyId?:number;
  forwarding:boolean; locked:boolean; replyTo:ArticleAction; forward:ArticleAction; quote:(article:TicketArticle)=>void; children:ReactNode;
}) {
  const term=search.trim().toLowerCase();
  const visibleArticles=term ? articles.filter(article=>
    article.subject.toLowerCase().includes(term) || article.body.toLowerCase().includes(term)) : articles;
  return <div className="communication-scroll" role="region" aria-label="Ticketaktivität" tabIndex={0}>
    {loading && <p role="status" className="subtle">Ticketverlauf wird geladen …</p>}
    <section className="communication-history" aria-label="Ticketverlauf" aria-busy={loading}>
      {problem && <p role="alert" className="inline-error">{problem}</p>}
      {(articles.length>0 || search) && <div className="communication-search">
        <Field label="Ticketverlauf durchsuchen" className="filter">{props=><input {...props} type="search"
          value={search} onChange={event=>setSearch(event.target.value)}/>}</Field>
        {term && visibleArticles.length>0 && <p className="subtle" role="status">{visibleArticles.length} von {articles.length} Nachrichten</p>}
      </div>}
      {visibleArticles.length>0 && <ol className="thread">{visibleArticles.map(article=><TicketEntry key={article.id}
        article={article} attachmentDownloads={attachmentDownloads} projectId={projectId} ticketId={ticketId}
        replyId={replyId} forwarding={forwarding} locked={locked} replyTo={replyTo} forward={forward} quote={quote}/>)}</ol>}
      {term && articles.length>0 && visibleArticles.length===0 && <p className="subtle" role="status">Keine Nachrichten für diese Suche.</p>}
      {hasTicket && articles.length===0 && !loading && !problem && <p className="subtle">Dieses Ticket enthält noch keine Nachrichten.</p>}
    </section>
    {children}
  </div>;
}

export function SendingAttempts({entries,attempt,request,refresh,run,outgoingKey,setConfirmation}:{
  entries:Conversation['outgoing']; attempt:ReturnType<typeof useSendingAttempt>; request:RequestZammad;
  refresh:()=>Promise<Conversation|undefined>; run:Run; outgoingKey:string; setConfirmation:(confirmation:Confirmation)=>void;
}) {
  const {retryVersion,retryInProgress,applyAttemptResult,draft,setUnresolvedRetry}=attempt;
  if(!entries.length) return null;
  return <div className="communication-outgoing"><h3>Sendeversuche</h3><Table headers={['Sendeversuch','Status','Letzter Versuch','Aktion']} rows={entries.map(entry=>({
      key:entry.id,cells:[entry.subject,attemptLabels[entry.status],
          entry.attempted_at ? <time dateTime={entry.attempted_at}>{moment(entry.attempted_at)}</time> : '–',
        entry.status==='sent' ? '–' : <div className="actions">
          <button onClick={()=>run(async(isCurrent)=>{
            const version=retryVersion.current;
            const result=await request(`outgoing/${entry.id}`,{retry:false});
            if(!isCurrent()) return;
            const refreshed=await refresh();
            if(isCurrent() && retryVersion.current===version && retryInProgress.current!==entry.id) {
              applyAttemptResult(entry.id,result.status,refreshed);
            }
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
                const refreshed=await refresh();
                if(isCurrent()) applyAttemptResult(entry.id,result.status,refreshed);
                if(result.status==='failed') throw new Error('Zammad hat den Sendeversuch abgelehnt.');
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
    }))}/></div>;
}
