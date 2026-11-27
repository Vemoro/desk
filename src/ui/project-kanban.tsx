import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction, type RefObject, type DragEvent } from 'react';
import { api, ApiError, calendarDate, name, taskStages, type Row } from './client';
import { Icon } from './icons';
import { Form, FormDialog, options, type Run } from './widgets';
import { Field } from './field';
import { useLocalDay } from './local-day';

const statusChoices=Object.entries(taskStages).map(([value,label])=>({value,label}));
const columnEnd='end';
type DropPosition={status:string;beforeTaskId:string|null};
const assigneeFilters={all:'Alle',me:'Mir zugeordnet',unassigned:'Ohne Zuständigkeit'};
type AssigneeFilter=keyof typeof assigneeFilters;
const dueFilters={all:'Alle Termine',overdue:'Überfällig',today:'Heute',undated:'Ohne Termin'};
type DueFilter=keyof typeof dueFilters;
type Filters={assignee:AssigneeFilter;term:string;due:DueFilter;today:string};
type TaskFields={name:string;assignee_id?:string|null;due?:string|null;status:string};
const sortChoices={standard:'Standard',due:'Frühester Termin zuerst'};
type KanbanSort=keyof typeof sortChoices;

function taskFields(task:Row|Record<string,string>):TaskFields {
  return {name:task.name,assignee_id:task.assignee_id||null,due:task.due?.slice(0,10)||null,status:task.status};
}

function matchesAssignee(assignee:string|null|undefined,accountId:string,filter:AssigneeFilter) {
  return filter==='all' || (filter==='me' ? assignee===accountId : assignee==null);
}

function matchesTitle(title:string,term:string) {
  return title.toLowerCase().includes(term);
}

function matchesDue(task:TaskFields,{due,today}:Filters) {
  const day=task.due?.slice(0,10);
  if(due==='all') return true;
  if(due==='undated') return !day;
  if(due==='today') return day===today;
  return Boolean(day && day<today && task.status!=='done');
}

function hiddenByFilter(task:TaskFields,accountId:string,filters:Filters) {
  if(!matchesTitle(task.name,filters.term)) return 'title';
  if(!matchesAssignee(task.assignee_id,accountId,filters.assignee)) return 'assignee';
  if(!matchesDue(task,filters)) return 'due';
}

function compareDue(left:Row,right:Row) {
  if(!left.due || !right.due) return Number(!left.due)-Number(!right.due);
  return left.due.slice(0,10).localeCompare(right.due.slice(0,10));
}

function filteredBoard(allTasks:Row[],projectId:string,accountId:string,filters:Filters,sort:KanbanSort) {
  const tasks=allTasks.filter(task=>task.project_id===projectId && !hiddenByFilter(taskFields(task),accountId,filters));
  const columns=Object.fromEntries(statusChoices.map(({value})=>{
    const cards=tasks.filter(task=>task.status===value)
      .sort((left,right)=>(left.kanban_position ?? Infinity)-(right.kanban_position ?? Infinity));
    if(sort==='due') cards.sort(compareDue);
    return [value,cards];
  }));
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

function KanbanHeading({count,filters,search,sort,filterControl,searchControl,dueControl,onFilter,onSearch,onDue,onSort}:{
  count:number;filters:Filters;search:string;sort:KanbanSort;filterControl:RefObject<HTMLSelectElement|null>;
  searchControl:RefObject<HTMLInputElement|null>;dueControl:RefObject<HTMLSelectElement|null>;
  onFilter:(value:AssigneeFilter)=>void;onSearch:(value:string)=>void;onDue:(value:DueFilter)=>void;onSort:(value:KanbanSort)=>void;
}) {
  return <>
    <header className="kanban-heading"><h2>Aufgaben</h2>
      <div className="actions">
        <Field label="Aufgaben suchen">{props=><input {...props} ref={searchControl} type="search" value={search}
          onChange={event=>onSearch(event.currentTarget.value)}/>}</Field>
        <button type="button" disabled={!search} onClick={()=>{onSearch('');searchControl.current?.focus();}}>Suche leeren</button>
        <Field label="Aufgaben anzeigen">{props=><select {...props} ref={filterControl} value={filters.assignee}
          onChange={event=>onFilter(event.currentTarget.value as AssigneeFilter)}>
          {Object.entries(assigneeFilters).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>}</Field>
        <Field label="Aufgabentermine filtern">{props=><select {...props} ref={dueControl} value={filters.due}
          onChange={event=>onDue(event.currentTarget.value as DueFilter)}>
          {Object.entries(dueFilters).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>}</Field>
        <Field label="Aufgaben sortieren">{props=><select {...props} value={sort}
          onChange={event=>onSort(event.currentTarget.value as KanbanSort)}>
          {Object.entries(sortChoices).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>}</Field>
        <span className="subtle" role="status">{count} {count===1?'Aufgabe':'Aufgaben'}</span>
      </div>
    </header>
    <KanbanViewFeedback count={count} filters={filters} sort={sort}
      resetAssignee={()=>{onFilter('all');filterControl.current?.focus();}}/>
  </>;
}

function KanbanViewFeedback({count,filters,sort,resetAssignee}:{
  count:number;filters:Filters;sort:KanbanSort;resetAssignee:()=>void;
}) {
  const hasAssigneeFilter=filters.assignee!=='all';
  const hasDueFilter=filters.due!=='all';
  const steps=[
    sort==='due' ? 'wähle „Standard“' : '',
    filters.term ? 'leere die Suche' : '',
    hasAssigneeFilter ? 'wähle „Alle“' : '',
    hasDueFilter ? 'wähle „Alle Termine“' : '',
  ].filter(Boolean);
  if(!steps.length) return null;
  const instruction=new Intl.ListFormat('de').format(steps);
  return <div className="kanban-filter-feedback">
    <p className="subtle">{hasAssigneeFilter && !filters.term && 'Der Filter kann Karten ausblenden. '}
      Zum Umordnen {instruction}.</p>
    {count===0 && hasDueFilter && <p>Keine Aufgaben für diese Filter.</p>}
    {count===0 && !hasDueFilter && filters.term && <p>Keine Aufgaben für diese Suche.</p>}
    {count===0 && !hasDueFilter && !filters.term && hasAssigneeFilter && <div className="actions">
      <p>Keine Aufgaben für diesen Filter.</p>
      <button type="button" onClick={resetAssignee}>Alle anzeigen</button>
    </div>}
  </div>;
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

function quickAddFeedback(title:string,filters:Filters) {
  const hiddenByTitle=!matchesTitle(title,filters.term);
  if(filters.due==='today' || filters.due==='overdue') {
    const steps=[
      hiddenByTitle ? 'leere die Suche' : '',
      filters.assignee==='me' ? 'wähle bei „Aufgaben anzeigen“ „Alle“ oder „Ohne Zuständigkeit“' : '',
      'wähle bei „Aufgabentermine filtern“ „Alle Termine“ oder „Ohne Termin“',
    ].filter(Boolean);
    return `Karte ohne Termin angelegt. Damit sie erscheint, ${new Intl.ListFormat('de').format(steps)}.`;
  }
  if(hiddenByTitle && filters.assignee==='me') return 'Karte angelegt. Leere die Suche und wähle „Alle“ oder „Ohne Zuständigkeit“.';
  if(hiddenByTitle) return 'Karte angelegt. Leere die Suche, damit die Karte erscheint.';
  if(filters.assignee==='me') return 'Karte angelegt. Sie erscheint unter „Alle“ oder „Ohne Zuständigkeit“.';
  return 'Karte angelegt.';
}

function AddCard({projectId,status,run,filters}:{projectId:string;status:string;run:Run;filters:Filters}) {
  const disclosure=useRef<HTMLDetailsElement>(null);
  const [savedTitle,setSavedTitle]=useState<string>();

  return <>
    <details className="kanban-add" ref={disclosure} onToggle={event=>{
      if(event.currentTarget.open) event.currentTarget.querySelector('input')?.focus();
    }}>
      <summary>Karte hinzufügen</summary>
      <Form className="kanban-add-form" caption="Karte anlegen" fields={[
        {name:'name',label:'Kartentitel',required:true},
      ]} submit={async({name})=>{
        setSavedTitle(undefined);
        const saved=await run(()=>api('tasks','POST',{project_id:projectId,status,name}),undefined,{reportInlineError:true});
        if(!saved) return;
        setSavedTitle(name);
        const details=disclosure.current;
        const title=details?.querySelector('input');
        if(title?.value===name) title.value='';
        if(details?.open && (details.contains(document.activeElement) || document.activeElement===document.body)) title?.focus();
      }}/>
    </details>
    {savedTitle!==undefined && <p className="subtle" role="status">{quickAddFeedback(savedTitle,filters)}</p>}
  </>;
}

type CardFocus={taskId:string;trigger:HTMLButtonElement;move?:boolean};
type PendingCardFocus=CardFocus & {version:number;previous:TaskFields;next:TaskFields};

function editFocusFilter(task:TaskFields,pending:PendingCardFocus,accountId:string,filters:Filters) {
  const changedDeadline=task.due!==pending.previous.due || task.status!==pending.previous.status;
  return changedDeadline && !matchesDue(task,filters) ? 'due' : hiddenByFilter(task,accountId,filters);
}

function useKanbanFocus({board,filterControl,searchControl,dueControl,editing,allTasks,dataVersion,canReorder,filters,accountId}:{
  board:RefObject<HTMLDivElement|null>;filterControl:RefObject<HTMLSelectElement|null>;searchControl:RefObject<HTMLInputElement|null>;
  dueControl:RefObject<HTMLSelectElement|null>;editing:boolean;allTasks:Row[];dataVersion:number;
  canReorder:boolean;filters:Filters;accountId:string;
}) {
  const restoreFocus=useRef<CardFocus|undefined>(undefined);
  const pendingFocus=useRef<PendingCardFocus|undefined>(undefined);

  useLayoutEffect(()=>{
    if(editing) return;
    const pending=pendingFocus.current;
    const row=pending && allTasks.find(task=>task.id===pending.taskId);
    const current=row && taskFields(row);
    const refreshed=pending && dataVersion>=pending.version;
    if(refreshed) {
      pendingFocus.current=undefined;
      if(!restoreFocus.current && document.activeElement===document.body) restoreFocus.current=pending;
    }
    if(!restoreFocus.current) return;
    const {taskId,trigger,move:wasMove}=restoreFocus.current;
    const id=CSS.escape(taskId);
    const selector=wasMove ? `[data-kanban-card="${id}"] .task-move` : `[data-task-id="${id}"]`;
    const card=trigger.isConnected ? trigger : board.current?.querySelector<HTMLButtonElement>(selector);
    const controls={title:searchControl,assignee:filterControl,due:dueControl};
    const hiddenBy=pending?.taskId===taskId && editFocusFilter(current ?? pending.next,pending,accountId,filters);
    const filter=hiddenBy ? controls[hiddenBy] : filterControl;
    restoreFocus.current=undefined;
    (card ?? (canReorder ? board.current : filter.current))?.focus();
  },[board,filterControl,searchControl,dueControl,editing,allTasks,dataVersion,canReorder,filters,accountId]);
  return {restoreFocus,pendingFocus};
}

export function ProjectKanban({projectId,accountId,tasks:allTasks,dataVersion,users,run}:{
  projectId:string;accountId:string;tasks:Row[];dataVersion:number;users:Row[];run:Run;
}) {
  const [assignee,setAssignee]=useState<AssigneeFilter>('all');
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<KanbanSort>('standard');
  const [due,setDue]=useState<DueFilter>('all');
  const filterControl=useRef<HTMLSelectElement>(null);
  const searchControl=useRef<HTMLInputElement>(null);
  const dueControl=useRef<HTMLSelectElement>(null);
  const filters={assignee,term:search.trim().toLowerCase(),due,today:useLocalDay()};
  const canReorder=sort==='standard' && assignee==='all' && !filters.term && due==='all';
  const {tasks,columns}=filteredBoard(allTasks,projectId,accountId,filters,sort);
  const board=useRef<HTMLDivElement>(null);
  const [editor,setEditor]=useState<{task:Row;trigger:HTMLButtonElement;move?:boolean}>();
  const {restoreFocus,pendingFocus}=useKanbanFocus({board,filterControl,searchControl,dueControl,
    editing:Boolean(editor),allTasks,dataVersion,canReorder,filters,accountId});
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
    <KanbanHeading count={tasks.length} filters={filters} search={search} sort={sort}
      filterControl={filterControl} searchControl={searchControl} dueControl={dueControl}
      onFilter={value=>{clearDrop();pendingFocus.current=undefined;setAssignee(value);}}
      onSearch={value=>{clearDrop();pendingFocus.current=undefined;setSearch(value);}}
      onDue={value=>{clearDrop();pendingFocus.current=undefined;setDue(value);}}
      onSort={value=>{clearDrop();setSort(value);}}/>
    <KanbanColumns board={board} columns={columns} dropPosition={dropPosition} dragging={dragging} projectId={projectId}
      canReorder={canReorder} filters={filters}
      run={run} users={users} setEditor={setEditor} markDrop={markDrop}
      setDropPosition={setDropPosition} drop={drop} clearDrop={clearDrop}/>
    {editor && <FormDialog title={editor.move?'Karte verschieben':'Karte bearbeiten'} trigger={editor.trigger} dismiss={dismiss}>{save=>
      editor.move ? <MoveCardForm task={editor.task} columns={columns} submit={position=>save(()=>move(editor.task.id,position,true))}/>
      : <EditCardForm task={editor.task} users={users} submit={(changes,next)=>save(async()=>{
        if(!Object.keys(changes).length) return true;
        return run(()=>api(`tasks/${editor.task.id}`,'PATCH',changes),'Karte gespeichert.',{reportInlineError:true,onSaved:version=>{
          pendingFocus.current={taskId:editor.task.id,trigger:editor.trigger,previous:taskFields(editor.task),next,version};
        }});
      })}/>
    }</FormDialog>}
  </section>;
}

function EditCardForm({task,users,submit}:{
  task:Row;users:Row[];submit:(changes:Partial<TaskFields>,next:TaskFields)=>Promise<boolean>;
}) {
  return <Form caption="Karte speichern" fields={[
    {name:'name',label:'Kartentitel',value:task.name,required:true},
    {name:'assignee_id',label:'Verantwortlich',value:task.assignee_id,choices:assigneeChoices(users,task.assignee_id)},
    {name:'due',label:'Fällig am',type:'date',value:task.due?.slice(0,10)},
    {name:'status',label:'Status',value:task.status,choices:statusChoices,required:true},
  ]} submit={fields=>{
    const next=taskFields(fields);
    const previous=taskFields(task);
    const changed=(Object.keys(next) as (keyof TaskFields)[]).filter(key=>previous[key]!==next[key]);
    const changes=Object.fromEntries(changed.map(key=>[key,next[key]]));
    return submit(changes,next);
  }}/>;
}

function KanbanColumns({board,columns,dropPosition,dragging,projectId,canReorder,filters,run,users,setEditor,markDrop,
  setDropPosition,drop,clearDrop}:{
  board:RefObject<HTMLDivElement|null>; columns:Record<string,Row[]>; dropPosition?:DropPosition; dragging:RefObject<string|undefined>;
  projectId:string; canReorder:boolean; filters:Filters; run:Run; users:Row[]; setEditor:(editor:{task:Row;trigger:HTMLButtonElement;move?:boolean})=>void;
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
          <AddCard projectId={projectId} status={status} run={run} filters={filters}/>
        </section>;
      })}
    </div>;
}

function assigneeChoices(users:Row[],id:string | null) {
  const activePeople=options(users.filter(person=>!person.blocked));
  const previous=users.find(person=>person.id===id && person.blocked);
  return previous ? [...activePeople,{value:previous.id,label:`${previous.name} (gesperrt)`}] : activePeople;
}
