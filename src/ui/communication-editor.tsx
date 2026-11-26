import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { TicketArticle } from './communication-articles';
import { Form } from './widgets';
import { Icon } from './icons';
import { Field } from './field';

export type ReplyTarget = {id:number; originalSubject:string; recipient:string; subject:string; trigger:HTMLButtonElement; forwardBody?:string};
type SendMessage = (values:Record<string,string>,file:File|undefined,target?:ReplyTarget,note?:boolean)=>Promise<unknown>;

export function useTicketComposer(zammadPanel:RefObject<HTMLElement|null>) {
  const [freeFile,setFreeFile]=useState<File>();
  const [replyFile,setReplyFile]=useState<File>();
  const [composeVersion,setComposeVersion]=useState(0);
  const [composing,setComposing]=useState(false);
  const composeButton=useRef<HTMLButtonElement>(null);
  const freeComposer=useRef<HTMLElement>(null);
  const [reply,setReply]=useState<ReplyTarget>();
  const replyComposer=useRef<HTMLElement>(null);
  const noteField=useRef<HTMLTextAreaElement>(null);
  const focusNoteAfterSave=useRef(false);
  const [noteText,setNoteText]=useState('');
  const [noteError,setNoteError]=useState('');
  useEffect(()=>{
    if(reply) replyComposer.current?.querySelector<HTMLElement>(reply.forwardBody===undefined?'textarea':'input[type=email]')?.focus();
  },[reply]);
  useEffect(()=>{
    if(composing) {
      freeComposer.current?.querySelector<HTMLInputElement>('input[type=email]')?.focus();
    }
  },[composing]);


  function replyTo(article:TicketArticle,trigger:HTMLButtonElement) {
    if(article.reply) setReply({...article.reply,id:article.id,originalSubject:article.subject,trigger});
  }

  function forward(article:TicketArticle,trigger:HTMLButtonElement) {
    setReply({id:article.id,originalSubject:article.subject,recipient:'',subject:('WG: '+article.subject).slice(0,160),
      trigger,forwardBody:'\n\n'+article.body});
  }

  function quote(article:TicketArticle) {
    const excerpt=article.body.length>800 ? article.body.slice(0,800)+' …' : article.body;
    const quoted=[article.subject,...excerpt.split(/\r?\n/)].map(line=>'> '+line).join('\n');
    const next=noteText ? noteText+'\n\n'+quoted : quoted;
    if(next.length<=5000) {
      setNoteText(next);
      setNoteError('');
    } else setNoteError('Das Zitat passt nicht mehr in die Notiz mit höchstens 5.000 Zeichen.');
    if(composing) {
      setComposing(false);
      requestAnimationFrame(()=>noteField.current?.focus());
    } else noteField.current?.focus();
  }

  function closeReply(target:ReplyTarget) {
    setReply(undefined);
    setReplyFile(undefined);
    setComposing(false);
    requestAnimationFrame(()=>{
      if(target.trigger.isConnected && !target.trigger.disabled) target.trigger.focus();
      else zammadPanel.current?.focus({preventScroll:true});
    });
  }


  function resetComposer(note:boolean|undefined,previous:ReplyTarget|undefined) {
    if(note) {
      focusNoteAfterSave.current=true;
      setNoteText('');
      setNoteError('');
    } else if(previous) closeReply(previous);
    else {
      setFreeFile(undefined);
      setComposeVersion(value=>value+1);
      setComposing(false);
      focusNoteAfterSave.current=true;
    }
  }

  return {freeFile,setFreeFile,replyFile,setReplyFile,composeVersion,composing,setComposing,composeButton,freeComposer,reply,setReply,replyComposer,noteField,noteText,setNoteText,noteError,setNoteError,focusNoteAfterSave,replyTo,forward,quote,closeReply,resetComposer};
}

export function useNoteFocusAfterSave({focusNoteAfterSave,noteText,noteField}:ReturnType<typeof useTicketComposer>,locked:boolean) {
  useEffect(()=>{
    if(!locked && focusNoteAfterSave.current) {
      focusNoteAfterSave.current=false;
      noteField.current?.focus({preventScroll:true});
    }
  },[locked,noteText]);
}

function PdfField({file,disabled,setFile}:{file?:File;disabled:boolean;setFile:(file:File|undefined)=>void}) {
  return <Field label="PDF-Anhang" className="wide communication-file" hint={file?.name}>{props=><>
    <input {...props} className="sr-only" type="file" disabled={disabled} accept="application/pdf,.pdf"
      onChange={event=>setFile(event.currentTarget.files?.[0])}/>
    <span className="communication-file-picker" aria-hidden="true">{file?'Andere PDF-Datei auswählen':'PDF-Datei auswählen'}</span>
  </>}</Field>;
}

function TicketNote({composer,locked,draftActions,sendMessage}:{
  composer:ReturnType<typeof useTicketComposer>; locked:boolean; draftActions:ReactNode; sendMessage:SendMessage;
}) {
  const {composing,setComposing,composeButton,reply,noteField,noteText,setNoteText,noteError,setNoteError}=composer;
  const [validation,setValidation]=useState('');
  return <form className="communication-note" hidden={composing || Boolean(reply)} noValidate onSubmit={event=>{
    event.preventDefault();
    if(locked) return;
    setNoteError('');
    if(!noteText.trim()) {
      setValidation('Schreibe zuerst eine interne Notiz.');
      noteField.current?.focus();
      return;
    }
    void sendMessage({body:noteText},undefined,undefined,true).catch(error=>{
      setNoteError(error instanceof Error ? error.message : 'Die Notiz konnte nicht gespeichert werden.');
    });
  }}>
    <Field label={<><Icon name="lock"/> Interne Notiz</>} error={validation}>{props=><textarea {...props}
      ref={noteField} value={noteText} maxLength={5000} required disabled={locked} placeholder="Notiz für das Team schreiben …"
      onChange={event=>{
        setNoteText(event.currentTarget.value);
        if(event.currentTarget.value.trim()) setValidation('');
      }}/>}</Field>
    {noteError && <p className="inline-error" role="alert">{noteError}</p>}
    {draftActions}
    <div className="communication-note-actions">
      <button ref={composeButton} type="button" disabled={locked} onClick={()=>setComposing(true)}><Icon name="mail"/> Antwort schreiben</button>
      <button type="submit" className="primary" disabled={locked}>Notiz hinzufügen</button>
    </div>
  </form>;
}

export function TicketEditors({composer,locked,updatedReply,replyChanged,forwarding,draftNote,draftActions,sendMessage}:{
  composer:ReturnType<typeof useTicketComposer>; locked:boolean; updatedReply?:TicketArticle['reply'];
  replyChanged:boolean; forwarding:boolean; draftNote?:boolean; draftActions:ReactNode; sendMessage:SendMessage;
}) {
  const {freeFile,setFreeFile,replyFile,setReplyFile,composeVersion,composing,setComposing,composeButton,freeComposer,
    reply,setReply,replyComposer,closeReply}=composer;
  return <section className="communication-editors" aria-label="Beitrag verfassen">
    <section className="communication-reply" aria-label="Neue E-Mail" ref={freeComposer} hidden={!composing || Boolean(reply)}>
      <header><h3>Neue E-Mail</h3>
        <button type="button" disabled={locked} onClick={()=>{
          setComposing(false);
          requestAnimationFrame(()=>composeButton.current?.focus());
        }}>Zur internen Notiz</button>
      </header>
      <Form key={composeVersion} disabled={locked && !reply} caption="Über Zammad senden" fields={[
        {name:'recipient',label:'Empfänger',type:'email',required:true},{name:'subject',label:'Betreff',required:true},{name:'body',label:'Nachricht',type:'textarea',required:true},
      ]} submit={values=>sendMessage(values,freeFile)}>
        <PdfField file={freeFile} disabled={locked && !reply} setFile={setFreeFile}/>
      </Form>{!reply && !draftNote && draftActions}</section>
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
        <PdfField file={replyFile} disabled={locked || replyChanged} setFile={setReplyFile}/>
      </Form>
      {!draftNote && draftActions}
    </section>}
    <TicketNote composer={composer} locked={locked} draftActions={draftNote && draftActions} sendMessage={sendMessage}/>
  </section>;
}
