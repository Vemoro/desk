import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction, type RefObject, type DragEvent } from 'react';
import { api, ApiError, calendarDate, name, taskStages, type Row } from './client';
import { Icon } from './icons';
import { Form, FormDialog, options, type Run } from './widgets';
import { Field } from './field';

const statusChoices=Object.entries(taskStages).map(([value,label])=>({value,label}));
const columnEnd='end';
type DropPosition={status:string;beforeTaskId:string|null};
const assigneeFilters={all:'Alle',me:'Mir zugeordnet',unassigned:'Ohne Zuständigkeit'};
type AssigneeFilter=keyof typeof assigneeFilters;

function matchesAssignee(assignee:string|null|undefined,accountId:string,filter:AssigneeFilter) {
  return filter==='all' || (filter==='me' ? assignee===accountId : assignee==null);
}

function filteredBoard(allTasks:Row[],projectId:string,accountId:string,filter:AssigneeFilter) {
  const tasks=allTasks.filter(task=>task.project_id===projectId && matchesAssignee(task.assignee_id,accountId,filter));
  const columns=Object.fromEntries(statusChoices.map(({value})=>[value,tasks.filter(task=>task.status===value)
    .sort((left,right)=>(left.kanban_position ?? Infinity)-(right.kanban_position ?? Infinity))]));
  return {tasks,columns};
}

function positionAtPointer(event:DragEvent<HTMLElement>,status:string,draggedTaskId:string):DropPosition {
  for(const card of event.currentTarget.querySelectorAll<HTMLElement>(':scope > article[data-kanban-card]')) {
    const id=card.dataset.kanbanCard;
    if(!id || id===draggedTaskId) continue;
    const bounds=card.getBoundingClientRect();
    if(event.clientY<bounds.top+bounds.height/2) return {status,beforeTaskId:id};
  }
  return {status,beforeTaskId:null};
}

function KanbanHeading({count,filter,filterControl,onFilter}:{
  count:number;filter:AssigneeFilter;filterControl:RefObject<HTMLSelectElement|null>;onFilter:(value:AssigneeFilter)=>void;
}) {
  return <>
    <header className="kanban-heading"><h2>Aufgaben</h2>
      <div className="actions">
        <Field label="Aufgaben anzeigen">{props=><select {...props} ref={filterControl} value={filter}
          onChange={event=>onFilter(event.currentTarget.value as AssigneeFilter)}>
          {Object.entries(assigneeFilters).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>}</Field>
        <span className="subtle" role="status">{count} {count===1?'Aufgabe':'Aufgaben'}</span>
      </div>
    </header>
    {filter!=='all' && <div className="kanban-filter-feedback">
      <p className="subtle">Der Filter kann Karten ausblenden. Zum Umordnen wähle „Alle“.</p>
      {count===0 && <div className="actions">
        <p>Keine Aufgaben für diesen Filter.</p>
        <button type="button" onClick={()=>{onFilter('all');filterControl.current?.focus();}}>Alle anzeigen</button>
      </div>}
    </div>}
  </>;
}

function MoveCardForm({task,columns,submit}:{task:Row;columns:Record<string,Row[]>;submit:(position:DropPosition)=>Promise<boolean>}) {
  const [status,setStatus]=useState<string>(task.status);
  const [before,setBefore]=useState(()=>{
    const cards=columns[task.status];
    return cards[cards.findIndex(card=>card.id===task.id)+1]?.id ?? columnEnd;
  });
  const targets=columns[status]?.filter(card=>card.id!==task.id) ?? [];

  return <Form caption="Karte verschieben" fields={[
    {name:'status',label:'Zielspalte',choices:statusChoices,required:true,value:status,onChange:value=>{
      setStatus(value);
      setBefore(columnEnd);
    }},
    {name:'before',label:'Zielposition',choices:[
      {value:columnEnd,label:'Ans Spaltenende'},...targets.map((card,index)=>({value:card.id,label:`${index+1}. Vor ${card.name}`})),
    ],required:true,value:before===columnEnd || targets.some(card=>card.id===before) ? before : '',onChange:setBefore},
  ]} submit={({status,before})=>submit({status,beforeTaskId:before===columnEnd?null:before})}/>;
}

function AddCard({projectId,status,run,onlyMine}:{projectId:string;status:string;run:Run;onlyMine:boolean}) {
  const disclosure=useRef<HTMLDetailsElement>(null);
  const [saved,setSaved]=useState(false);

  return <div>
    <details className="kanban-add" ref={disclosure} onToggle={event=>{
      if(event.currentTarget.open) event.currentTarget.querySelector('input')?.focus();
      else setSaved(false);
    }}>
      <summary>Karte hinzufügen</summary>
      <Form className="kanban-add-form" caption="Karte anlegen" fields={[
        {name:'name',label:'Kartentitel',required:true},
      ]} submit={async({name})=>{
        setSaved(false);
        if(!await run(()=>api('tasks','POST',{project_id:projectId,status,name}),'Karte angelegt.',{reportInlineError:true})) return;
        setSaved(true);
        const details=disclosure.current;
        const title=details?.querySelector('input');
        if(title?.value===name) title.value='';
        if(details?.open && (details.contains(document.activeElement) || document.activeElement===document.body)) title?.focus();
      }}/>
    </details>
    <div className="subtle" role="status">{saved && onlyMine?'Die Karte erscheint unter „Alle“ oder „Ohne Zuständigkeit“.':null}</div>
  </div>;
}

type CardFocus={taskId:string;trigger:HTMLButtonElement;move?:boolean};

function useKanbanFocus({board,filterControl,editing,tasks,canReorder}:{
  board:RefObject<HTMLDivElement|null>;filterControl:RefObject<HTMLSelectElement|null>;
  editing:boolean;tasks:Row[];canReorder:boolean;
}) {
  const restoreFocus=useRef<CardFocus|undefined>(undefined);
  const hiddenAfterRefresh=useRef<string|undefined>(undefined);

  useLayoutEffect(()=>{
    if(editing) return;
    const hidden=hiddenAfterRefresh.current;
    if(hidden && !tasks.some(task=>task.id===hidden)) {
      hiddenAfterRefresh.current=undefined;
      if(!restoreFocus.current && document.activeElement===document.body) filterControl.current?.focus();
    }
    if(!restoreFocus.current) return;
    const {taskId,trigger,move:wasMove}=restoreFocus.current;
    const id=CSS.escape(taskId);
    const selector=wasMove ? `[data-kanban-card="${id}"] .task-move` : `[data-task-id="${id}"]`;
    const card=trigger.isConnected ? trigger : board.current?.querySelector<HTMLButtonElement>(selector);
    restoreFocus.current=undefined;
    (card ?? (canReorder ? board.current : filterControl.current))?.focus();
  },[board,filterControl,editing,tasks,canReorder]);
  return {restoreFocus,hiddenAfterRefresh};
}

export function ProjectKanban({projectId,accountId,tasks:allTasks,users,run}:{
  projectId:string;accountId:string;tasks:Row[];users:Row[];run:Run;
}) {
  const [filter,setFilter]=useState<AssigneeFilter>('all');
  const filterControl=useRef<HTMLSelectElement>(null);
  const canReorder=filter==='all';
  const {tasks,columns}=filteredBoard(allTasks,projectId,accountId,filter);
  const board=useRef<HTMLDivElement>(null);
  const [editor,setEditor]=useState<{task:Row;trigger:HTMLButtonElement;move?:boolean}>();
  const {restoreFocus,hiddenAfterRefresh}=useKanbanFocus({board,filterControl,editing:Boolean(editor),tasks,canReorder});
  const dragging=useRef<string|undefined>(undefined);
  const [dropPosition,setDropPosition]=useState<DropPosition>();

  function dismiss() {
    if(!editor) return;
    restoreFocus.current={taskId:editor.task.id,trigger:editor.trigger,move:editor.move};
    setEditor(undefined);
  }

  function move(taskId:string,{status,beforeTaskId}:DropPosition,inlineError=false) {
    return run(async isCurrent=>{
      try {
        return await api(`projects/${projectId}/kanban/${taskId}`,'PATCH',{status,before_task_id:beforeTaskId});
      } catch(error) {
        if(isCurrent() && error instanceof ApiError && error.status===409) {
          await run(async()=>undefined,undefined,{kind:'read'});
        }
        throw error;
      }
    },'Karte verschoben.',{reportInlineError:inlineError});
  }

  function markDrop(event:DragEvent,position:DropPosition) {
    if(!dragging.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect='move';
    setDropPosition(current=>current?.status===position.status && current.beforeTaskId===position.beforeTaskId?current:position);
  }

  function clearDrop() {
    dragging.current=undefined;
    setDropPosition(undefined);
  }

  function drop(event:DragEvent,position:DropPosition) {
    const taskId=dragging.current;
    if(!taskId) return;
    event.preventDefault();
    event.stopPropagation();
    clearDrop();
    if(canReorder && tasks.some(task=>task.id===taskId)) void move(taskId,position);
  }

  return <section className="project-kanban">
    <KanbanHeading count={tasks.length} filter={filter} filterControl={filterControl} onFilter={value=>{
      clearDrop();
      hiddenAfterRefresh.current=undefined;
      setFilter(value);
    }}/>
    <KanbanColumns board={board} columns={columns} dropPosition={dropPosition} dragging={dragging} projectId={projectId}
      canReorder={canReorder} onlyMine={filter==='me'}
      run={run} users={users} setEditor={setEditor} markDrop={markDrop}
      setDropPosition={setDropPosition} drop={drop} clearDrop={clearDrop}/>
    {editor && <FormDialog title={editor.move?'Karte verschieben':'Karte bearbeiten'} trigger={editor.trigger} dismiss={dismiss}>{save=>
      editor.move ? <MoveCardForm task={editor.task} columns={columns} submit={position=>save(()=>move(editor.task.id,position,true))}/>
      : <Form caption="Karte speichern" fields={[
        {name:'name',label:'Kartentitel',value:editor.task.name,required:true},
        {name:'assignee_id',label:'Verantwortlich',value:editor.task.assignee_id,choices:assigneeChoices(users,editor.task.assignee_id)},
        {name:'due',label:'Fällig am',type:'date',value:editor.task.due?.slice(0,10)},
        {name:'status',label:'Status',value:editor.task.status,choices:statusChoices,required:true},
      ]} submit={fields=>{
        const changes=Object.fromEntries([
          ['name',editor.task.name,fields.name],
          ['assignee_id',editor.task.assignee_id||null,fields.assignee_id||null],
          ['due',editor.task.due?.slice(0,10)||null,fields.due||null],
          ['status',editor.task.status,fields.status],
        ].filter(([,previous,next])=>previous!==next).map(([key,,value])=>[key,value]));
        const saveCard=async()=>{
          const saved=await run(()=>api(`tasks/${editor.task.id}`,'PATCH',changes),'Karte gespeichert.',{reportInlineError:true});
          if(saved && !matchesAssignee(fields.assignee_id||null,accountId,filter)) hiddenAfterRefresh.current=editor.task.id;
          return saved;
        };
        return save(Object.keys(changes).length ? saveCard : async()=>true);
      }}/>
    }</FormDialog>}
  </section>;
}

function KanbanColumns({board,columns,dropPosition,dragging,projectId,canReorder,onlyMine,run,users,setEditor,markDrop,
  setDropPosition,drop,clearDrop}:{
  board:RefObject<HTMLDivElement|null>; columns:Record<string,Row[]>; dropPosition?:DropPosition; dragging:RefObject<string|undefined>;
  projectId:string; canReorder:boolean; onlyMine:boolean; run:Run; users:Row[]; setEditor:(editor:{task:Row;trigger:HTMLButtonElement;move?:boolean})=>void;
  markDrop:(event:DragEvent,position:DropPosition)=>void;
  setDropPosition:Dispatch<SetStateAction<DropPosition|undefined>>; drop:(event:DragEvent,position:DropPosition)=>void; clearDrop:()=>void;
}) {
  return <div className="board" ref={board} tabIndex={0} role="region" aria-label="Kanban">
      {statusChoices.map(({value:status,label})=>{
        const cards=columns[status];
        return <section key={status} className="board-column" aria-label={label}
          data-drop-end={dropPosition?.status===status && dropPosition.beforeTaskId===null ? '' : undefined}
          onDragOver={event=>{ if(dragging.current) markDrop(event,positionAtPointer(event,status,dragging.current)); }}
          onDragLeave={event=>{
            if(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            setDropPosition(current=>current?.status===status?undefined:current);
          }} onDrop={event=>{ if(dragging.current) drop(event,positionAtPointer(event,status,dragging.current)); }}>
          <h3>{label} <span>{cards.length}</span></h3>
          {cards.map(task=><article key={task.id} className="task" data-kanban-card={task.id} draggable={canReorder}
            data-drop-before={dropPosition?.beforeTaskId===task.id?'':undefined}
            onDragStart={canReorder ? event=>{
              dragging.current=task.id;
              event.dataTransfer.effectAllowed='move';
              event.dataTransfer.setData('text/plain',task.id);
            } : undefined} onDragEnd={clearDrop}>
            <button type="button" className="task-card" data-task-id={task.id} onClick={event=>setEditor({task,trigger:event.currentTarget})}>
              <strong id={`kanban-title-${task.id}`}>{task.name}</strong>
              {task.assignee_id && <span className="subtle">{name(users,task.assignee_id)}</span>}
              {task.due && <span className="subtle">Fällig am {calendarDate(task.due)}</span>}
            </button>
            {canReorder && <button type="button" className="task-move" aria-label="Verschieben" aria-describedby={`kanban-title-${task.id}`}
              title="Verschieben" onClick={event=>setEditor({task,move:true,trigger:event.currentTarget})}>
              <Icon name="move"/>
            </button>}
          </article>)}
          <AddCard projectId={projectId} status={status} run={run} onlyMine={onlyMine}/>
        </section>;
      })}
    </div>;
}

function assigneeChoices(users:Row[],id:string | null) {
  const activePeople=options(users.filter(person=>!person.blocked));
  const previous=users.find(person=>person.id===id && person.blocked);
  return previous ? [...activePeople,{value:previous.id,label:`${previous.name} (gesperrt)`}] : activePeople;
}
