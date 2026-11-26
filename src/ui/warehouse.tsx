import { useState } from 'react';
import { api, inventoryLabel, inventoryName, moment, movementStages, name } from './client';
import type { Data } from './projects';
import { Expand, Form, hasPendingWrite, options, Panel, Table, type Run } from './widgets';

type WarehouseProps={data:Data;run:Run;accountId:string};

export function Warehouse(props:WarehouseProps) {
  const bookings=props.data.reservations.filter(row=>row.item_id&&(row.status==='firm'||row.checked_out>0));
  return <>
    <WarehouseStock {...props} bookings={bookings}/>
    <OpenCheckouts data={props.data} bookings={bookings}/>
    <WarehouseMovements {...props}/>
  </>;
}

type Bookings=Data['reservations'];

function WarehouseStock({data,run,accountId,bookings}:WarehouseProps & {bookings:Bookings}) {
  const [bookingId,setBookingId]=useState('');
  const [stockQuery,setStockQuery]=useState('');
  const [stockLocation,setStockLocation]=useState('');
  const [onlyAvailable,setOnlyAvailable]=useState(false);
  const itemsById=new Map(data.items.map((item)=>[item.id,item]));
  const stockTerm=stockQuery.trim().toLowerCase();
  const stockFilterActive=Boolean(stockTerm || stockLocation || onlyAvailable);
  const visibleStock=data.stock.filter((row)=>{
    const item=itemsById.get(row.item_id);
    return (!onlyAvailable || row.free>0)
      && (!stockLocation || row.location_id===stockLocation)
      && (!stockTerm || [item?.name,item?.code,item?.inventory_number]
        .some((value)=>value?.toLowerCase().includes(stockTerm)));
  });
  const bookingChoices=bookings.map((row)=>({
    value:row.id,
    label:`${name(data.projects,row.project_id)} · ${inventoryName(data.items,row.item_id)} · ${name(data.locations,row.location_id)} · ${moment(row.starts_at)} bis ${moment(row.ends_at)}`,
  }));
  const selectedBooking=bookingChoices.find((choice)=>choice.value===bookingId);
  return <Panel title="Bestand je Lagerort"><div className="panel-body compact-actions">
      <Expand title="Lagerort anlegen"><Form caption="Lagerort speichern" fields={[{name:'name',label:'Lagerort',required:true}]}
        submit={(input)=>run(()=>api('locations','POST',input),'Lagerort angelegt.')}/></Expand>
      <Expand title="Artikel anlegen"><Form caption="Artikel speichern" fields={[
        {name:'name',label:'Artikelname',required:true},{name:'code',label:'Artikelnummer',required:true},
        {name:'kind',label:'Artikelart',choices:[{value:'equipment',label:'Gerät'},{value:'consumable',label:'Verbrauchsmaterial'}],required:true},
        {name:'inventory_number',label:'Inventarnummer für Einzelgerät'},
      ]} submit={(input)=>run(()=>api('items','POST',{...input,inventory_number:input.inventory_number||null}),'Artikel angelegt.')}/></Expand>
      <Expand title="Wareneingang"><Form caption="Wareneingang buchen" retryScope={`movements:${accountId}:receive`} fields={[
        {name:'item_id',label:'Artikel',choices:options(data.items,inventoryLabel),required:true},{name:'location_id',label:'Lagerort',choices:options(data.locations),required:true},
        {name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},{name:'project_id',label:'Projektbezug',choices:options(data.projects)},
      ]} submit={(input,key)=>run(()=>api('movements','POST',{action:'receive',item_id:input.item_id,location_id:input.location_id,
        quantity:Number(input.quantity),project_id:input.project_id||undefined},key),'Wareneingang erfasst.',{reportWriteRejection:true})}/></Expand>
      <Expand title="Ausgabe, Rückgabe oder Verbrauch"><Form caption="Bewegung buchen" retryScope={`movements:${accountId}:booking`} fields={[
        {name:'action',label:'Bewegungsart',choices:[{value:'issue',label:'Ausgabe'},{value:'return',label:'Rückgabe'},{value:'consume',label:'Verbrauch'}],required:true},
        {name:'reservation_id',label:'Projektreservierung',choices:bookingChoices,required:true,value:selectedBooking?.value,onChange:setBookingId,describedBy:selectedBooking?'warehouse-booking-details':undefined},
        {name:'quantity',label:'Menge',type:'number',min:1,value:1,required:true},
      ]} submit={(input,key)=>run(()=>api('movements','POST',{...input,quantity:Number(input.quantity)},key),'Lagerbewegung gebucht.',{reportWriteRejection:true})}>
        {selectedBooking&&<p id="warehouse-booking-details" className="wide booking-details">{selectedBooking.label}</p>}
      </Form></Expand>
    </div>
    <div className="panel-body form-grid">
      <label><span>Bestand suchen</span><input type="search" value={stockQuery} onChange={(event)=>setStockQuery(event.target.value)}/></label>
      <label><span>Lagerort filtern</span><select value={stockLocation} onChange={(event)=>setStockLocation(event.target.value)}>
        <option value="">Alle Lagerorte</option>
        {options(data.locations).map(({value,label})=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="checkbox-label">
        <input type="checkbox" checked={onlyAvailable} onChange={(event)=>setOnlyAvailable(event.target.checked)}/>
        <span>Nur mit freiem Bestand</span>
      </label>
      <button type="button" disabled={!stockQuery&&!stockLocation&&!onlyAvailable}
        onClick={()=>{setStockQuery('');setStockLocation('');setOnlyAvailable(false);}}>Filter zurücksetzen</button>
    </div>
    {visibleStock.length || !stockFilterActive ? <Table headers={['Artikel','Lagerort','Physisch','Reserviert','Frei']} rows={visibleStock.map((row)=>({key:`${row.item_id}/${row.location_id}`,cells:[
      inventoryName(data.items,row.item_id),name(data.locations,row.location_id),row.physical,row.reserved,<strong>{row.free}</strong>,
    ]}))}/> : <p className="empty" role="status">Kein Bestand für diese Filter.</p>}</Panel>;
}

function OpenCheckouts({data,bookings}:{data:Data;bookings:Bookings}) {
  const [projectFilter,setProjectFilter]=useState('');
  const [locationFilter,setLocationFilter]=useState('');
  const [checkoutItem,setCheckoutItem]=useState('');
  const projectsById=new Map(data.projects.map((project)=>[project.id,project]));
  const openCheckouts=bookings.filter((row)=>row.checked_out>0);
  const visibleCheckouts=openCheckouts.filter((row)=>
    (!projectFilter || row.project_id===projectFilter)
    && (!locationFilter || row.location_id===locationFilter)
    && (!checkoutItem || row.item_id===checkoutItem));
  return <Panel title="Offene Ausgaben">
      <div className="panel-body">
        <div className="form-grid">
          <label><span>Projekt filtern</span><select value={projectFilter} onChange={(event)=>setProjectFilter(event.target.value)}>
            <option value="">Alle Projekte</option>
            {options(data.projects).map(({value,label})=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>Lagerort filtern</span><select value={locationFilter} onChange={(event)=>setLocationFilter(event.target.value)}>
            <option value="">Alle Lagerorte</option>
            {options(data.locations).map(({value,label})=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>Artikel filtern</span><select value={checkoutItem} onChange={(event)=>setCheckoutItem(event.target.value)}>
            <option value="">Alle Artikel</option>
            {data.items.map((item)=><option key={item.id} value={item.id}>
              {inventoryLabel(item)}{item.code ? ` · ${item.code}` : ''}
            </option>)}
          </select></label>
        </div>
        <div className="actions">
          <button type="button" disabled={!projectFilter && !locationFilter && !checkoutItem}
            onClick={()=>{setProjectFilter('');setLocationFilter('');setCheckoutItem('');}}>Filter zurücksetzen</button>
          <span className="subtle" role="status">
            {visibleCheckouts.length===1 ? '1 offene Ausgabe' : `${visibleCheckouts.length} offene Ausgaben`}
          </span>
        </div>
      </div>
      {visibleCheckouts.length ? <Table headers={['Projekt','Artikel','Lagerort','Ausgegeben']} rows={visibleCheckouts.map((row)=>{
        const project=projectsById.get(row.project_id);
        return {key:row.id,cells:[
          project ? <a href={`#projects/${project.id}`}>{project.name}</a> : 'Projekt nicht verfügbar',
          inventoryName(data.items,row.item_id),name(data.locations,row.location_id),row.checked_out,
        ]};
      })}/> : <p className="empty" role="status">{openCheckouts.length?'Keine offenen Ausgaben für diese Filter.':'Es gibt keine offenen Ausgaben.'}</p>}
    </Panel>;
}

function WarehouseMovements({data,run,accountId}:WarehouseProps) {
  const [correctionId,setCorrectionId]=useState('');
  const [writingCorrection,setWritingCorrection]=useState(false);
  const [movementKind,setMovementKind]=useState('');
  const [movementProject,setMovementProject]=useState('');
  const visibleMovements=data.movements.filter(row=>
    (!movementKind || row.action===movementKind)
    && (!movementProject || (movementProject==='without-project' ? !row.project_id : row.project_id===movementProject)));
  const visibleMovementIds=new Set(visibleMovements.map(row=>row.id));
  // Keep an open correction mounted until it closes, including while its row is filtered out.
  const renderedMovements=data.movements.filter(row=>visibleMovementIds.has(row.id) || row.id===correctionId);
  const movements=new Map(data.movements.map(row=>[row.id,row]));
  const corrected=new Map<string,number>();
  for(const row of data.movements) {
    if(row.corrects_movement_id) {
      corrected.set(row.corrects_movement_id,(corrected.get(row.corrects_movement_id) ?? 0)+row.quantity);
    }
  }
  return <Panel title="Lagerbewegungen">
      <div className="panel-body">
        <div className="form-grid">
          <label><span>Bewegungsart filtern</span><select value={movementKind} onChange={event=>setMovementKind(event.target.value)}>
            <option value="">Alle Bewegungsarten</option>
            {Object.entries(movementStages).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>Projekt filtern</span><select value={movementProject} onChange={event=>setMovementProject(event.target.value)}>
            <option value="">Alle Projekte</option>
            <option value="without-project">Ohne Projektbezug</option>
            {options(data.projects).map(({value,label})=><option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        <div className="actions">
          <button type="button" disabled={!movementKind && !movementProject}
            onClick={()=>{setMovementKind('');setMovementProject('');}}>Filter zurücksetzen</button>
          <span className="subtle" role="status">{visibleMovements.length} von {data.movements.length} Bewegungen</span>
        </div>
      </div>
      {renderedMovements.length > 0 && <Table hidden={visibleMovements.length===0}
      headers={['Zeitpunkt','Bewegung','Artikel','Lagerort','Projekt','Menge','Erfasst durch','Aktion']}
      rows={renderedMovements.map(row=>{
        const remaining=row.quantity-(corrected.get(row.id) ?? 0);
        const original=movements.get(row.corrects_movement_id);
        const originalLabel=original && `Original vom ${moment(original.created_at)}`;
        const correctable=['receive','consume'].includes(row.action);
        const correctionScope=`movements:${accountId}:correction:${row.id}`;
        return {key:row.id,hidden:!visibleMovementIds.has(row.id),cells:[
          <span id={`bewegung-${row.id}`} tabIndex={-1}>{moment(row.created_at)}</span>,
          <div><span>{movementStages[row.action]}</span>{original && <small>{visibleMovementIds.has(original.id) ? <a href={`#bewegung-${original.id}`}
            onClick={event=>{
              event.preventDefault();
              const target=document.getElementById(`bewegung-${original.id}`);
              target?.focus({preventScroll:true});
              target?.scrollIntoView({block:'center'});
            }}>{originalLabel}</a> : originalLabel}</small>}
            {row.correction_reason && <small>{row.correction_reason}</small>}</div>,
          inventoryName(data.items,row.item_id),name(data.locations,row.location_id),name(data.projects,row.project_id),row.quantity,name(data.users,row.actor_id),
          correctable && (remaining > 0 || hasPendingWrite(correctionScope) ? <div>
            <button type="button" aria-expanded={correctionId===row.id} disabled={writingCorrection}
              onClick={()=>setCorrectionId(current=>current===row.id?'':row.id)}>{remaining>0?'Korrigieren':'Korrektur prüfen'}</button>
            {correctionId===row.id && <div className="stock-correction-form"><Form caption="Korrektur buchen"
              retryScope={correctionScope} fields={[
                {name:'quantity',label:'Korrekturmenge',type:'number',required:true,min:1,max:remaining,value:1},
                {name:'reason',label:'Begründung',type:'textarea',required:true},
              ]} submit={async (input,key)=>{
                setWritingCorrection(true);
                try {
                  const saved=await run(()=>api(`movements/${row.id}/corrections`,'POST',
                    {quantity:Number(input.quantity),reason:input.reason},key),'Korrektur gebucht.',{reportWriteRejection:true});
                  if(saved) setCorrectionId(current=>current===row.id?'':current);
                  return saved;
                } finally {
                  setWritingCorrection(false);
                }
              }}/></div>}
          </div>
            : <span className="subtle">Vollständig korrigiert</span>),
        ]};
      })}/>}
      {visibleMovements.length===0 && <p className="empty" role="status">{data.movements.length?'Keine Lagerbewegungen für diese Filter.':'Es gibt keine Lagerbewegungen.'}</p>}
    </Panel>;
}
