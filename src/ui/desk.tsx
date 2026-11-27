import { useEffect, useState } from 'react';
import { defaultProjectFilters, Project, Projects } from './projects';
import { projectHash, projectView, type ProjectView } from './project-views';
import { PasskeySettings } from './passkeys';
import { AccountPassword } from './account-password';
import { Warehouse } from './warehouse';
import { useDeskData } from './desk-data';
import { Contacts } from './contacts';
import { BuildInfo, Dashboard, DeskLogin } from './desk-home';
import { Costs, Settings } from './desk-admin';
import { WeeklyPlanning } from './weekly-planning';
import { ConfirmationRequests } from './widgets';
import { Icon } from './icons';
import { Navigation, sections, type Section } from './navigation';
import { settingsArea } from './settings-navigation';

export function Desk() {
  const [section,setSection]=useState<Section>('dashboard');
  const [detailId,setDetailId]=useState('');
  const [view,setView]=useState<ProjectView>('overview');
  const [projectFilters,setProjectFilters]=useState(defaultProjectFilters);
  const [planningWeek,setPlanningWeek]=useState<string>();
  const [theme,setTheme]=useState('light');
  const {person,data,dataVersion,flags,notice,setNotice,refreshRequired,refreshing,confirmationRequests,signIn,logout,endSession,retryRefresh,run}=useDeskData(()=>{
    setProjectFilters(defaultProjectFilters);
    setPlanningWeek(undefined);
  });
  const projectId=section==='projects'?detailId:'';
  const project=data.projects.find((row)=>row.id===projectId);

  useEffect(()=>{
    const current=localStorage.getItem('desk-theme');
    if(current==='dark')setTheme(current);
    function onHash(event?:HashChangeEvent) {
      const [route,id,requestedView]=location.hash.slice(1).split('/');
      if(route==='desk-main') return;
      const [oldRoute,oldId]=event ? new URL(event.oldURL).hash.slice(1).split('/') : [route,id];
      if(oldRoute!==route || (route==='settings' && id!==oldId)) setNotice({message:'',error:false});
      const next=Object.hasOwn(sections,route) ? route as Section : 'dashboard';
      setSection(next);
      setDetailId(next==='projects'||next==='contacts'||next==='settings' ? id ?? '' : '');
      setView(projectView(next==='projects' && id ? requestedView : undefined));
    }
    onHash();
    window.addEventListener('hashchange',onHash);
    return ()=>window.removeEventListener('hashchange',onHash);
  },[]);

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('desk-theme',theme);},[theme]);

  function navigate(to:Section,id='') {
    setNotice({message:'',error:false});
    setSection(to);
    setDetailId(id);
    setView('overview');
    location.hash=id && to==='projects' ? projectHash(id) : id && to==='contacts' ? '#contacts/'+id : to;
  }

  const alert=notice.message && <div className={`notice ${notice.error?'error':''}`} role={notice.error?'alert':'status'}>{notice.message}</div>;
  const themeButton=<button className="theme" onClick={()=>setTheme(theme==='light'?'dark':'light')} aria-label={theme==='light'?'Dunkles Design':'Helles Design'}><Icon name={theme==='light'?'moon':'sun'}/></button>;

  if(person===undefined) return <main className="login"><p>Desk wird geladen …</p></main>;
  if(!person) return <DeskLogin alert={alert} themeButton={themeButton} signIn={signIn}/>;

  return <ConfirmationRequests value={confirmationRequests.current}><div className="frame">
    <a href="#desk-main" className="skip" onClick={(event)=>{
      event.preventDefault();
      document.getElementById('desk-main')?.focus();
    }}>Zum Inhalt</a>
    <Navigation person={person} section={section} themeButton={themeButton} onNavigate={navigate} onLogout={logout}/>
    <main id="desk-main" tabIndex={-1} className="main">
      {section!=='projects'||!project?<header className="page-title"><h1>{sections[section][0]}</h1></header>:null}
      {alert}
      {refreshRequired && <div className="notice actions">
        <p role="status">Die Änderung wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.</p>
        <button type="button" disabled={refreshing} onClick={()=>void retryRefresh()}>
          {refreshing?'Ansicht wird aktualisiert …':'Ansicht aktualisieren'}
        </button>
      </div>}
      {section==='dashboard' && <Dashboard data={data} accountId={person.id}
        select={(id)=>navigate('projects',id)} open={()=>navigate('projects')}/>}
      {section==='projects' && projectId && !project && <p className="notice" role="status">Dieses Projekt ist nicht verfügbar.</p>}
      {section==='projects' && (project?<Project key={project.id} tab={view} project={project} data={data} dataVersion={dataVersion}
        run={run} flags={flags} accountId={person.id} back={()=>navigate('projects')}/>
        :<Projects data={data} run={run} filters={projectFilters} onFilter={setProjectFilters} select={(id)=>navigate('projects',id)}/>)}
      {section==='planning' && <WeeklyPlanning selectedWeek={planningWeek} onWeek={setPlanningWeek} onSessionExpired={()=>{
        endSession();
        setNotice({message:'Bitte erneut anmelden, um die Wochenplanung zu öffnen.',error:false});
      }} openProject={id=>{
        navigate('projects',id);
        if(!data.projects.some(plan=>plan.id===id)) void run(async()=>{},undefined,{kind:'read'});
      }}/>}
      {section==='contacts' && <Contacts data={data} run={run} haben={flags.haben} selected={detailId}
        selectContact={id=>navigate('contacts',id)} openProject={id=>navigate('projects',id)}/>}
      {section==='warehouse' && <Warehouse data={data} run={run} accountId={person.id}/>}
      {section==='costs' && <Costs data={data} run={run}/>}
      {section==='account' && <><AccountPassword/><PasskeySettings run={run}/><BuildInfo/></>}
      {section==='settings' && (person.role==='admin' ?
        <Settings data={data} run={run} flags={flags} accountId={person.id} area={settingsArea(detailId)}/> :
        <p className="notice" role="status">Die Einstellungen sind der Administration vorbehalten.</p>)}
    </main>
  </div></ConfirmationRequests>;
}
