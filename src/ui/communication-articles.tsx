import { useEffect, useRef, useState } from 'react';
import { downloadBlob, moment } from './client';
import { Icon } from './icons';

export type Article = { id:number; subject?:string|null; from?:string|null; created_at?:string; content_type?:string;
  body:string; attachments?:{filename:string;id?:number}[]; kind?:keyof typeof articleKinds;
  reply?:{recipient:string;subject:string} };
const articleKinds = {
  'incoming-email':'Eingehende E-Mail',
  'outgoing-email':'Ausgehende E-Mail',
  'internal-note':'Interne Notiz',
  internal:'Interner Eintrag',
  other:'Ticketeintrag',
  unknown:'Art unbekannt',
};

export function articleInitials(from:string|undefined|null) {
  const sender=from?.split('<')[0]?.trim();
  return sender?.match(/[\p{L}\p{N}]+/gu)?.slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('de') || '•';
}

export function plainText(html:string) {
  const template=document.createElement('template');
  template.innerHTML=html;
  for (const element of template.content.querySelectorAll('script,style,template')) element.remove();
  return template.content.textContent;
}

type DownloadStatus = {loading:boolean;problem?:string};

export function useAttachmentDownloads() {
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

export type TicketArticle = Article & {subject:string};

type ArticleAction = (article:TicketArticle,trigger:HTMLButtonElement)=>void;

export function TicketEntry({article,attachmentDownloads,projectId,ticketId,replyId,forwarding,locked,replyTo,forward,quote}:{
  article:TicketArticle; attachmentDownloads:ReturnType<typeof useAttachmentDownloads>;
  projectId:string; ticketId:number; replyId?:number; forwarding:boolean; locked:boolean;
  replyTo:ArticleAction; forward:ArticleAction; quote:(article:TicketArticle)=>void;
}) {
  return <li data-kind={article.kind ?? 'unknown'}>
  <span className="communication-avatar" aria-hidden="true">{articleInitials(article.from)}</span>
  <article className="communication-message">
    <div className="communication-message-meta">
      {article.from && <span className="communication-sender">{article.from}</span>}
      {article.created_at && <time dateTime={article.created_at}>{moment(article.created_at)}</time>}
    </div>
    <div className="communication-bubble">
      <span className="communication-kind">{articleKinds[article.kind ?? 'unknown']}</span>
      <strong>{article.subject}</strong>
      <p>{article.body}</p>
      {article.attachments?.length ? <div className="communication-attachments">
        {article.attachments.map((attachment,index)=>{
          if(!attachment.id) return <small className="communication-attachment" key={`name:${index}`}>{attachment.filename}</small>;
          const url=`/api/v1/projects/${projectId}/zammad/attachment?ticket=${ticketId}&article=${article.id}&attachment=${attachment.id}`;
          return <ArticleAttachment key={attachment.id} filename={attachment.filename} status={attachmentDownloads.status[url]}
            download={()=>void attachmentDownloads.download(attachment.filename,url)}/>;
        })}
      </div> : null}
    </div>
    <footer className="communication-article-actions">
      {article.reply && <button type="button" aria-expanded={replyId===article.id && !forwarding} disabled={locked || replyId!==undefined} onClick={event=>replyTo(article,event.currentTarget)}>Antworten</button>}
      {(article.kind==='incoming-email' || article.kind==='outgoing-email') && <button type="button"
        aria-expanded={replyId===article.id && forwarding} disabled={locked || replyId!==undefined} onClick={event=>forward(article,event.currentTarget)}>Text weiterleiten</button>}
      <button type="button" disabled={locked || replyId!==undefined} onClick={()=>quote(article)}>In Notiz zitieren</button>
    </footer>
  </article>
  </li>;
}
