import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError, downloadPositions, euros, type OfferPosition, type Row } from './client';
import { noWrite, Table, type Run } from './widgets';

type Preview = {status:'loading'} | {status:'failed'} | {status:'ready';positions:OfferPosition[]};

export function OfferExport({project,run}:{project:Pick<Row,'id'>;run:Run}) {
  const titleId=useId();
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const actionButton=useRef<HTMLButtonElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const requestVersion=useRef(0);
  const [preview,setPreview]=useState<Preview>({status:'loading'});
  const positions=preview.status==='ready' ? preview.positions : [];

  useEffect(()=>()=>{requestVersion.current++;},[]);

  function loadPositions() {
    const request=++requestVersion.current;
    setPreview({status:'loading'});
    void run(async isCurrent=>{
      const isOpenRequest=()=>isCurrent() && request===requestVersion.current && dialog.current?.open;
      try {
        const current=await api<OfferPosition[]>('projects/'+project.id+'/offer-positions');
        if(isOpenRequest()) setPreview({status:'ready',positions:current});
      } catch(error) {
        if(!isOpenRequest()) return noWrite;
        if(error instanceof ApiError && error.status===401) throw error;
        setPreview({status:'failed'});
      }
      return noWrite;
    },undefined,{kind:'read'});
  }

  function openPreview() {
    const modal=dialog.current;
    if(!modal || modal.open) return;
    modal.showModal();
    closeButton.current?.focus();
    loadPositions();
  }

  function closePreview() {
    requestVersion.current++;
    dialog.current?.close();
    trigger.current?.focus();
  }

  return <>
    <button type="button" ref={trigger} aria-haspopup="dialog" onClick={openPreview}>Angebotspositionen exportieren</button>
    <dialog ref={dialog} className="confirm-dialog offer-preview" aria-labelledby={titleId}
      onCancel={event=>{event.preventDefault();closePreview();}}
      onKeyDown={event=>{
        if(event.key!=='Tab') return;
        const first=positions.length ? list.current : closeButton.current;
        const last=actionButton.current ?? closeButton.current;
        if((event.shiftKey && document.activeElement===first) || (!event.shiftKey && document.activeElement===last)){
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}>
      <header><h2 id={titleId}>Angebotspositionen</h2></header>
      <div className="offer-preview-body">
        <div ref={list} className="dialog-content offer-preview-list" tabIndex={positions.length ? 0 : undefined}
          role={positions.length ? 'region' : undefined} aria-label={positions.length ? 'Verkaufspositionen' : undefined}>
          <PreviewContent preview={preview}/>
        </div>
        <div className="actions">
          <button type="button" ref={closeButton} onClick={closePreview}>Schließen</button>
          {preview.status==='failed'&&<button type="button" ref={actionButton} onClick={()=>{closeButton.current?.focus();loadPositions();}}>
            Erneut laden
          </button>}
          {positions.length>0&&<button type="button" ref={actionButton} className="primary" onClick={()=>{downloadPositions(project,positions);closePreview();}}>
            CSV herunterladen
          </button>}
        </div>
      </div>
    </dialog>
  </>;
}

function PreviewContent({preview}:{preview:Preview}) {
  if(preview.status==='loading') return <p role="status">Angebotspositionen werden geladen …</p>;
  if(preview.status==='failed') return <p role="alert" className="inline-error">Die Angebotspositionen konnten nicht geladen werden.</p>;
  if(!preview.positions.length) return <p role="status">Für dieses Projekt sind keine Verkaufspositionen vorhanden.</p>;
  return <Table numeric={[1,2]} headers={['Position','Menge','Netto je Einheit']} rows={preview.positions.map((row,index)=>({
    key:String(index),cells:[row.name,row.quantity,euros(row.unit_cents)],
  }))}/>;
}
