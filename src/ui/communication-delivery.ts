import { useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError, type Row } from './client';
import type { Article } from './communication-articles';
import type { ReplyTarget } from './communication-editor';
import { ConfirmationRequests, type Run } from './widgets';

export type AttemptStatus = 'pending'|'unknown'|'failed'|'sent';
export type Conversation = { ticket?:{number:string;title?:string;url:string}; articles:Article[]; outgoing:(Row & {status:AttemptStatus})[] };
export const attemptLabels:Record<AttemptStatus,string>={
  sent:'An Zammad übergeben',pending:'Ausstehend',failed:'Abgelehnt',unknown:'Ausgang unklar',
};

type MessageDraft = {id:string;note:boolean;reply?:ReplyTarget;payload:Record<string,unknown>};

export function draftAttemptRow(draft:MessageDraft,status:AttemptStatus) {
  return {id:draft.id,subject:draft.note ? 'Interne Notiz' : String(draft.payload.subject),status};
}


export type RequestZammad = (suffix:string,input:unknown)=>Promise<{id?:string;status:AttemptStatus}>;

export function useTicketConversation(projectId:string,ticketId:number|null,zammad:boolean,onLoad:(current:Conversation)=>void) {
  const confirmationRequests=useContext(ConfirmationRequests);
  const outgoingKey='zammad-outgoing:'+projectId+':';
  const [loadedConversation,setConversation]=useState<Conversation|null>(null);
  const [problem,setProblem]=useState('');
  const [loading,setLoading]=useState(Boolean(zammad && ticketId));
  const refreshVersion=useRef(0);

  async function refresh() {
    if (!zammad || !ticketId) return;
    const version=++refreshVersion.current;
    setLoading(true);
    setProblem('');
    try {
      const current=await api<Conversation>('projects/'+projectId+'/zammad');
      if(version!==refreshVersion.current) return;
      onLoad(current);
      setConversation(current);
      return current;
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


  return {loadedConversation,setConversation,problem,loading,refresh,outgoingKey};
}

export function useSendingAttempt(setConversation:Dispatch<SetStateAction<Conversation|null>>,
  resetComposer:(note:boolean|undefined,previous:ReplyTarget|undefined)=>void) {
  const draft=useRef<MessageDraft|undefined>(undefined);
  const [locked,setLocked]=useState(false);
  const [needsAttemptCheck,setNeedsAttemptCheck]=useState(false);
  const [missingAttempt,setMissingAttempt]=useState(false);
  const [draftStatus,setDraftStatus]=useState<AttemptStatus>();
  const [draftActionRunning,setDraftActionRunning]=useState(false);
  const draftAction=useRef(false);
  const replayButton=useRef<HTMLButtonElement>(null);
  const [replayError,setReplayError]=useState('');
  const [unresolvedRetry,setUnresolvedRetry]=useState<string>();
  const retryVersion=useRef(0);
  const retryInProgress=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(missingAttempt && !draftActionRunning) replayButton.current?.focus();
  },[missingAttempt,draftActionRunning]);

  function clearDraft() {
    draft.current=undefined;
    setLocked(false);
    setNeedsAttemptCheck(false);
    setMissingAttempt(false);
    setDraftStatus(undefined);
    setReplayError('');
    setUnresolvedRetry(undefined);
  }

  function resetDraft() {
    const previous=draft.current?.reply;
    const note=draft.current?.note;
    clearDraft();
    resetComposer(note,previous);
  }


  function applyAttemptResult(id:string,confirmed:AttemptStatus,refreshed?:Conversation) {
    const status=confirmed==='sent' ? confirmed : refreshed?.outgoing.find(entry=>entry.id===id)?.status ?? confirmed;
    const matchingDraft=draft.current?.id===id ? draft.current : undefined;
    setConversation(current=>{
      if(!current) return matchingDraft ? {articles:[],outgoing:[draftAttemptRow(matchingDraft,status)]} : null;
      const containsAttempt=current.outgoing.some(entry=>entry.id===id);
      if(containsAttempt) return {...current,
        outgoing:current.outgoing.map(entry=>entry.id===id && entry.status!=='sent' ? {...entry,status} : entry),
      };
      return matchingDraft ? {...current,outgoing:[draftAttemptRow(matchingDraft,status),...current.outgoing]} : current;
    });
    if(!matchingDraft) return;
    setMissingAttempt(false);
    if(status==='sent') resetDraft();
    else {
      setDraftStatus(status);
      if(status==='failed') setUnresolvedRetry(undefined);
    }
  }


  function confirmLoadedAttempt(current:Conversation) {
    const id=draft.current?.id;
    if(id && current.outgoing.some(entry=>entry.id===id && entry.status==='sent')) resetDraft();
  }
  return {draft,locked,setLocked,needsAttemptCheck,setNeedsAttemptCheck,missingAttempt,setMissingAttempt,draftStatus,
    draftActionRunning,setDraftActionRunning,draftAction,replayButton,replayError,setReplayError,unresolvedRetry,setUnresolvedRetry,
    retryVersion,retryInProgress,clearDraft,applyAttemptResult,confirmLoadedAttempt};
}

export function ticketDelivery({attempt,request,refresh,run,ticketId}:{
  attempt:ReturnType<typeof useSendingAttempt>; request:RequestZammad; refresh:()=>Promise<Conversation|undefined>; run:Run; ticketId:number|null;
}) {
  const {draft,setLocked,clearDraft,needsAttemptCheck,setNeedsAttemptCheck,missingAttempt,setMissingAttempt,draftStatus,
    draftAction,setDraftActionRunning,setReplayError,retryInProgress,applyAttemptResult}=attempt;
  async function deliver(current:MessageDraft,isCurrent:()=>boolean) {
    setNeedsAttemptCheck(false);
    setMissingAttempt(false);
    setReplayError('');
    let result;
    try {
      result=await request(current.note?'notes':'messages',current.payload);
    } catch(error) {
      if(isCurrent() && draft.current?.id===current.id) {
        // A gateway error can arrive after Desk has already accepted the message.
        if(error instanceof ApiError &&
          (error.code==='zammad_message_not_stored' || error.code==='invalid_input')) clearDraft();
        else setNeedsAttemptCheck(true);
      }
      if(error instanceof TypeError) throw new Error('Desk hat keine Bestätigung für den Sendeversuch erhalten.');
      throw error;
    }
    if(!isCurrent()) return;
    const refreshed=await refresh();
    if(isCurrent()) applyAttemptResult(current.id,result.status,refreshed);
    if(result.status!=='sent') throw new Error('Sendezustand prüfen. Der Versuch steht im Projektverlauf.');
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


  async function recoverDraft(replay:boolean) {
    const current=draft.current;
    if(!current || draftAction.current || retryInProgress.current===current.id) return;
    if(replay ? !missingAttempt : !needsAttemptCheck && !draftStatus) return;
    draftAction.current=true;
    setDraftActionRunning(true);
    setReplayError('');
    try {
      await run(async isCurrent=>{
        if(replay) return deliver(current,isCurrent);
        try {
          const result=await request(`outgoing/${current.id}`,{retry:false});
          if(!isCurrent() || draft.current?.id!==current.id) return;
          const refreshed=await refresh();
          if(isCurrent() && retryInProgress.current!==current.id) applyAttemptResult(current.id,result.status,refreshed);
          return;
        } catch(error) {
          if(!(error instanceof ApiError && error.status===404 && error.code==='zammad_attempt_not_found')) throw error;
          if(isCurrent() && draft.current?.id===current.id) setMissingAttempt(true);
        }
        await refresh();
      },undefined,{reportInlineError:true});
    } catch(error) {
      setReplayError(error instanceof Error ? error.message : 'Der Sendeversuch konnte nicht geprüft werden.');
    } finally {
      draftAction.current=false;
      setDraftActionRunning(false);
    }
  }

  return {sendMessage,recoverDraft};
}
