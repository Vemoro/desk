import { useLayoutEffect, useRef, useState } from 'react';
import { api, calendarDate, name, taskStages, type Row } from './client';
import { Form, FormDialog, options, type Run } from './widgets';

const statusChoices=Object.entries(taskStages).map(([value,label])=>({value,label}));

function AddCard({projectId,status,run}:{projectId:string;status:string;run:Run}) {
  const disclosure=useRef<HTMLDetailsElement>(null);

  return <details className="kanban-add" ref={disclosure} onToggle={(event)=>{
    if(event.currentTarget.open) event.currentTarget.querySelector('input')?.focus();
  }}>
    <summary>Karte hinzufügen</summary>
    <Form className="kanban-add-form" caption="Karte anlegen" fields={[
      {name:'name',label:'Kartentitel',required:true},
    ]} submit={async({name})=>{
      const saved=await run(()=>api('tasks','POST',{project_id:projectId,status,name}),'Karte angelegt.',{reportInlineError:true});
      if(!saved) return;
      const details=disclosure.current;
      const title=details?.querySelector('input');
      if(title?.value===name) title.value='';
      if(details?.open && (details.contains(document.activeElement) || document.activeElement===document.body)) title?.focus();
    }}/>
  </details>;
}

export function ProjectKanban({projectId,tasks:allTasks,users,run}:{projectId:string;tasks:Row[];users:Row[];run:Run}) {
  const tasks=allTasks.filter(task=>task.project_id===projectId);
  const board=useRef<HTMLDivElement>(null);
  const focusCardId=useRef<string|undefined>(undefined);
  const [editor,setEditor]=useState<{task:Row;trigger:HTMLButtonElement}>();
  const activePeople=options(users.filter(person=>!person.blocked));

  useLayoutEffect(()=>{
    if(editor || !focusCardId.current) return;
    const card=board.current?.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(focusCardId.current)}"]`);
    focusCardId.current=undefined;
    (card ?? board.current)?.focus();
  },[editor]);

  function assigneeChoices(id:string | null) {
    const previous=users.find(person=>person.id===id && person.blocked);
    return previous ? [...activePeople,{value:previous.id,label:`${previous.name} (gesperrt)`}] : activePeople;
  }

  function dismiss() {
    if(!editor) return;
    focusCardId.current=editor.task.id;
    setEditor(undefined);
  }

  return <section className="project-kanban">
    <header className="kanban-heading"><h2>Aufgaben</h2><span className="subtle">{tasks.length} {tasks.length===1?'Aufgabe':'Aufgaben'}</span></header>
    <div className="board" ref={board} tabIndex={0} role="region" aria-label="Kanban">
      {statusChoices.map(({value:status,label})=>{
        const cards=tasks.filter(task=>task.status===status);
        return <section key={status} className="board-column" aria-label={label}
          onDragOver={event=>event.preventDefault()}
          onDrop={event=>{
            event.preventDefault();
            const id=event.dataTransfer.getData('text/plain');
            if(tasks.some(task=>task.id===id && task.status!==status)) void run(()=>api(`tasks/${id}`,'PATCH',{status}));
          }}>
          <h3>{label} <span>{cards.length}</span></h3>
          {cards.map(task=><article key={task.id} className="task" draggable
            onDragStart={event=>event.dataTransfer.setData('text/plain',task.id)}>
            <button type="button" className="task-card" data-task-id={task.id} onClick={event=>setEditor({task,trigger:event.currentTarget})}>
              <strong>{task.name}</strong>
              {task.assignee_id && <span className="subtle">{name(users,task.assignee_id)}</span>}
              {task.due && <span className="subtle">Fällig am {calendarDate(task.due)}</span>}
            </button>
          </article>)}
          <AddCard projectId={projectId} status={status} run={run}/>
        </section>;
      })}
    </div>
    {editor && <FormDialog title="Karte bearbeiten" trigger={editor.trigger} dismiss={dismiss}>{save=>
      <Form caption="Karte speichern" fields={[
        {name:'name',label:'Kartentitel',value:editor.task.name,required:true},
        {name:'assignee_id',label:'Verantwortlich',value:editor.task.assignee_id,choices:assigneeChoices(editor.task.assignee_id)},
        {name:'due',label:'Fällig am',type:'date',value:editor.task.due?.slice(0,10)},
        {name:'status',label:'Status',value:editor.task.status,choices:statusChoices,required:true},
      ]} submit={fields=>{
        const changes=Object.fromEntries([
          ['name',editor.task.name,fields.name],
          ['assignee_id',editor.task.assignee_id||null,fields.assignee_id||null],
          ['due',editor.task.due?.slice(0,10)||null,fields.due||null],
          ['status',editor.task.status,fields.status],
        ].filter(([,previous,next])=>previous!==next).map(([key,,value])=>[key,value]));
        const saveCard=()=>run(()=>api(`tasks/${editor.task.id}`,'PATCH',changes),'Karte gespeichert.',{reportInlineError:true});
        return save(Object.keys(changes).length ? saveCard : async()=>true);
      }}/>
    }</FormDialog>}
  </section>;
}
