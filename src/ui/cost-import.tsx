import { useRef, useState, type FormEvent } from 'react';
import { costBatchLimit } from '../server/contracts';
import { api, euros, type Row } from './client';
import { csvCostSource, parseCostCsv, type CostPreviewRow } from './cost-csv';
import { Expand, Table, type Run } from './widgets';

export function CostImport({costs,projects,run}:{costs:Row[];projects:Row[];run:Run}) {
  const [csv,setCsv]=useState('');
  const [preview,setPreview]=useState<CostPreviewRow[]>();
  const [error,setError]=useState('');
  const [importing,setImporting]=useState(false);
  const importStarted=useRef(false);
  const valid=preview?.flatMap((row)=>row.entry?[row.entry]:[]) ?? [];
  const overLimit=valid.length>costBatchLimit;
  const existingByReference=new Map(costs.filter((row)=>row.source===csvCostSource).map((row)=>[row.reference,row]));
  const projectById=new Map(projects.map((project)=>[project.id,project]));
  const projectByCenter=new Map(projects.filter((project)=>project.cost_center).map((project)=>[project.cost_center,project]));

  function inspect(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try { setPreview(parseCostCsv(csv)); }
    catch(error) {
      setPreview(undefined);
      setError(error instanceof Error?error.message:'CSV konnte nicht gelesen werden.');
    }
  }

  async function confirmImport() {
    if(importStarted.current || !valid.length || overLimit) return;
    importStarted.current=true;
    setImporting(true);
    try {
      if(await run(()=>api('costs','POST',{entries:valid}),'Kosten übernommen.')){
        setCsv('');
        setPreview(undefined);
      }
    } finally {
      importStarted.current=false;
      setImporting(false);
    }
  }

  return <Expand title="Kosten aus CSV übernehmen">
    <form className="form-grid" onSubmit={inspect}>
      <label className="wide"><span>CSV-Inhalt mit reference, name, amount und optional cost_center</span>
        <textarea value={csv} required disabled={importing} onChange={(event)=>{
          setCsv(event.target.value);
          setPreview(undefined);
          setError('');
        }}/>
      </label>
      {error&&<p className="wide inline-error" role="alert">{error}</p>}
      <div className="form-action"><button type="submit" disabled={importing}>CSV prüfen</button></div>
    </form>
    {preview&&<section className="import-preview" aria-label="Importvorschau">
      <h3>Importvorschau</h3>
      <p role="status">{valid.length} gültige und {preview.length-valid.length} fehlerhafte Zeilen</p>
      {overLimit&&<p className="inline-error" role="alert">Höchstens {costBatchLimit} gültige Zeilen pro Import übernehmen. Teile die CSV auf und prüfe sie erneut.</p>}
      <Table headers={['Zeile','Beleg','Bezeichnung','Netto','Status','Projekt']} rows={preview.map((row)=>{
        const existing=existingByReference.get(row.reference);
        const center=row.entry?.cost_center;
        const matchedProject=center?projectByCenter.get(center):undefined;
        const project=existing?.project_id?projectById.get(existing.project_id):matchedProject;
        const centerHint=!center?'Kostenstelle fehlt.':!matchedProject?`Kostenstelle „${center}“ unbekannt.`:undefined;
        return {key:String(row.line),cells:[
          row.line,row.reference||'–',row.name||'–',row.entry?euros(row.entry.cents):'–',
          row.entry?(existing?'Aktualisierung':'Neu'):<><strong>Fehlerhaft</strong>{row.problems.map((problem)=><small key={problem}>{problem}</small>)}</>,
          row.entry?<>{project?.name ?? 'Ohne Zuordnung'}{centerHint&&<small>{centerHint}</small>}</>:'–',
        ]};
      })}/>
      <div className="actions">
        <button type="button" disabled={importing} onClick={()=>setPreview(undefined)}>Abbrechen</button>
        <button type="button" className="primary" disabled={!valid.length || overLimit || importing} onClick={()=>void confirmImport()}>
          {importing?'Wird übernommen …':valid.length===1?'1 gültige Zeile übernehmen':`${valid.length} gültige Zeilen übernehmen`}
        </button>
      </div>
    </section>}
  </Expand>;
}
