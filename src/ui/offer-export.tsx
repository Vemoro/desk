import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError, downloadPositions, euros, type OfferPosition, type Row } from './client';
import { Table, type Run } from './widgets';

type Preview = {status:'loading'|'failed'} | {status:'ready';positions:OfferPosition[]};

export function OfferExport({project,run}:{project:Pick<Row,'id'>;run:Run}) {
  const titleId=useId();
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const requestVersion=useRef(0);
  const [preview,setPreview]=useState<Preview>({status:'loading'});
  const positions=preview.status==='ready'?preview.positions:[];
  const totalCents=positions.reduce((sum,{quantity,unit_cents})=>sum+quantity*unit_cents,0);

  useEffect(()=>()=>{requestVersion.current++;},[]);

  async function loadPositions() {
    const request=++requestVersion.current;
    setPreview({status:'loading'});
    try {
      const current=await api<OfferPosition[]>(`projects/${project.id}/offer-positions`);
      if(request===requestVersion.current) setPreview({status:'ready',positions:current});
    } catch(error) {
      if(request!==requestVersion.current) return;
      if(error instanceof ApiError && error.status===401){
        await run(()=>Promise.reject(error),undefined,'read');
        return;
      }
      setPreview({status:'failed'});
    }
  }

  function openPreview() {
    const modal=dialog.current;
    if(!modal || modal.open) return;
    modal.showModal();
    closeButton.current?.focus();
    void loadPositions();
  }

  function closePreview() {
    requestVersion.current++;
    dialog.current?.close();
    trigger.current?.focus();
  }

  return <>
    <button type="button" ref={trigger} aria-haspopup="dialog" onClick={openPreview}>Angebotspositionen exportieren</button>
    <dialog ref={dialog} className="confirm-dialog offer-preview" aria-labelledby={titleId}
      onCancel={(event)=>{event.preventDefault();closePreview();}}>
      <h2 id={titleId}>Angebotspositionen</h2>
      {preview.status==='loading'&&<p role="status">Angebotspositionen werden geladen …</p>}
      {preview.status==='failed'&&<p role="alert" className="inline-error">Die Angebotspositionen konnten nicht geladen werden.</p>}
      {preview.status==='ready'&&(positions.length
        ? <Table headers={['Position','Menge','Netto je Einheit']} rows={positions.map((row,index)=>({
          key:String(index),cells:[row.name,row.quantity,euros(row.unit_cents)],
        }))}/>
        : <p role="status">Für dieses Projekt sind keine Verkaufspositionen vorhanden.</p>)}
      {positions.length>0 && <p><strong>Netto-Summe {euros(totalCents)}</strong></p>}
      <div className="actions">
        <button type="button" ref={closeButton} onClick={closePreview}>Schließen</button>
        {preview.status==='failed'&&<button type="button" onClick={()=>{closeButton.current?.focus();void loadPositions();}}>
          Erneut laden
        </button>}
        {positions.length>0&&<button type="button" className="primary" onClick={()=>{downloadPositions(project,positions);closePreview();}}>
          CSV herunterladen
        </button>}
      </div>
    </dialog>
  </>;
}
