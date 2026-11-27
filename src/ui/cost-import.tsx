import { useEffect, useRef, useState, type FormEvent } from 'react';
import { costBatchLimit } from '../server/contracts';
import { all, api, euros, type Row } from './client';
import { csvCostSource, parseCostCsv, type CostPreviewRow } from './cost-csv';
import { Field } from './field';
import { Expand, Table, type Run } from './widgets';

type Preview = { rows:CostPreviewRow[]; costs:Row[]; projects:Row[] };

export function CostImport({run}:{run:Run}) {
  const [csv,setCsv]=useState('');
  const [preview,setPreview]=useState<Preview>();
  const [error,setError]=useState('');
  const [pending,setPending]=useState<'checking'|'importing'>();
  const busy=useRef(false);
  const input=useRef<HTMLTextAreaElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const valid=preview?.rows.flatMap(row=>row.entry ? [row.entry] : []) ?? [];
  const overLimit=valid.length>costBatchLimit;

  useEffect(()=>{ if(preview) heading.current?.focus(); },[preview]);

  async function inspect(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy.current) return;
    setPreview(undefined);
    setError('');
    let rows:CostPreviewRow[];
    try { rows=parseCostCsv(csv); }
    catch(problem) {
      setError(problem instanceof Error ? problem.message : 'CSV konnte nicht gelesen werden.');
      input.current?.focus();
      return;
    }
    if(!rows.some(row=>row.entry)) {
      setPreview({rows,costs:[],projects:[]});
      return;
    }
    busy.current=true;
    setPending('checking');
    try {
      const [costs,projects]=await Promise.all([all('costs'),all('projects')]);
      setPreview({rows,costs,projects});
    } catch {
      setError('Belege und Projekte konnten für die Vorschau nicht geladen werden. Prüfe die CSV erneut.');
      input.current?.focus();
    } finally {
      busy.current=false;
      setPending(undefined);
    }
  }

  async function confirmImport() {
    if(busy.current || !valid.length || overLimit) return;
    busy.current=true;
    setPending('importing');
    try {
      if(await run(()=>api('costs','POST',{entries:valid}),'Kosten übernommen.')){
        setCsv('');
        setPreview(undefined);
        input.current?.focus();
      }
    } finally {
      busy.current=false;
      setPending(undefined);
    }
  }

  return <div className={preview?'cost-import-wide':undefined}>
    <Expand title="Kosten aus CSV übernehmen">
      <form className="form-grid" onSubmit={inspect}>
        <Field label="CSV-Inhalt" className="wide" hint="Spalten: reference, name, amount und optional cost_center." error={error}>
          {props=><textarea {...props} ref={input} value={csv} required readOnly={Boolean(pending)} onChange={event=>{
            setCsv(event.target.value);
            setPreview(undefined);
            setError('');
          }}/>}
        </Field>
        <div className="form-action"><button type="submit" aria-disabled={Boolean(pending)}>
          {pending==='checking'?'CSV wird geprüft …':'CSV prüfen'}
        </button></div>
      </form>
      {preview&&<section className="import-preview" aria-label="Importvorschau">
        <h3 ref={heading} tabIndex={-1}>Importvorschau</h3>
        <p role="status">{valid.length} gültige und {preview.rows.length-valid.length} fehlerhafte Zeilen</p>
        {overLimit&&<p className="inline-error" role="alert">Höchstens {costBatchLimit} gültige Zeilen pro Import übernehmen. Teile die CSV auf und prüfe sie erneut.</p>}
        {valid.length>0&&<p className="subtle">Die Vorschau zeigt den Stand beim Prüfen. Beim Übernehmen gilt die aktuelle Projektzuordnung.</p>}
        <PreviewTable preview={preview}/>
        <div className="actions">
          <button type="button" disabled={Boolean(pending)} onClick={()=>{setPreview(undefined);input.current?.focus();}}>Abbrechen</button>
          <button type="button" className="primary" disabled={!valid.length || overLimit} aria-disabled={pending==='importing'} onClick={()=>void confirmImport()}>
            {pending==='importing'?'Wird übernommen …':valid.length===1?'1 gültige Zeile übernehmen':valid.length+' gültige Zeilen übernehmen'}
          </button>
        </div>
      </section>}
    </Expand>
  </div>;
}

function PreviewTable({preview}:{preview:Preview}) {
  const existingByReference=new Map(preview.costs.filter(row=>row.source===csvCostSource).map(row=>[row.reference,row]));
  const projectById=new Map(preview.projects.map(project=>[project.id,project]));
  const projectByCenter=new Map(preview.projects.filter(project=>project.cost_center).map(project=>[project.cost_center,project]));
  return <Table numeric={[3]} headers={['Zeile','Beleg','Bezeichnung','Netto','Status','Voraussichtliches Projekt']} rows={preview.rows.map(row=>{
    const existing=existingByReference.get(row.reference);
    const center=row.entry?.cost_center;
    const matchedProject=center?projectByCenter.get(center):undefined;
    const project=existing?.project_id?projectById.get(existing.project_id):matchedProject;
    const centerHint=!center?'Kostenstelle fehlt.':!matchedProject?'Kostenstelle „'+center+'“ unbekannt.':undefined;
    return {key:String(row.line),cells:[
      row.line,row.reference||'–',row.name||'–',row.entry?euros(row.entry.cents):'–',
      row.entry?(existing?'Aktualisierung':'Neu'):<><strong>Fehlerhaft</strong>{row.problems.map(problem=><small key={problem}>{problem}</small>)}</>,
      row.entry?<>{project?.name ?? 'Ohne Zuordnung'}{centerHint&&<small>{centerHint}</small>}</>:'–',
    ]};
  })}/>;
}
