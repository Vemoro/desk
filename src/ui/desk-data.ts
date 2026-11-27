import { useEffect, useRef, useState, type RefObject } from 'react';
import { all, api, ApiError, type Row } from './client';
import type { Data } from './projects';
import type { Person } from './navigation';
import { noWrite, type Run } from './widgets';

const collections = ['contacts','projects','tasks','users','lines','reservations','locations','items','movements','costs','stock'] as const;
const initialData=Object.fromEntries(collections.map((key)=>[key,[]])) as unknown as Data;

export function useDeskData(resetUi:()=>void) {
  const [person,setPerson]=useState<Person|null>();
  const [snapshot,setSnapshot]=useState({data:initialData,version:0});
  const [flags,setFlags]=useState({haben:false,zammad:false});
  const [notice,setNotice]=useState({message:'',error:false});
  const [refreshRequired,setRefreshRequired]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const savedVersion=useRef(0);
  const displayedSavedVersion=useRef(0);
  const loadVersion=useRef(0);
  const sessionVersion=useRef(0);
  const signInPending=useRef(false);
  const logoutPending=useRef(false);
  const confirmationRequests=useRef(new Map<string,Promise<boolean>>());

  async function load(session:number) {
    if(session!==sessionVersion.current) return false;
    const request=++loadVersion.current;
    const saved=savedVersion.current;
    const isCurrent=()=>session===sessionVersion.current && request===loadVersion.current && saved===savedVersion.current;
    try {
      const [integrations,...result]=await Promise.all([api('integrations'),...collections.map((collection)=>
        collection==='tasks'?api<Row[]>('tasks/kanban'):
          collection==='users'||collection==='stock'?api<Row[]>(collection):all(collection),
      )]);
      if(!isCurrent()) return false;
      setFlags(integrations);
      const data=Object.fromEntries(collections.map((key,index)=>[key,result[index]])) as unknown as Data;
      setSnapshot({data,version:saved});
      displayedSavedVersion.current=saved;
      setRefreshRequired(false);
      return true;
    } catch(error) {
      if(!isCurrent()) return false;
      throw error;
    }
  }

  function endSession() {
    sessionVersion.current++;
    confirmationRequests.current=new Map();
    displayedSavedVersion.current=savedVersion.current;
    setPerson(null);
    setSnapshot({data:initialData,version:savedVersion.current});
    resetUi();
    setFlags({haben:false,zammad:false});
    setRefreshRequired(false);
    setRefreshing(false);
  }

  useEffect(()=>{
    const session=sessionVersion.current;
    void (async()=>{
      try {const current=await api<Person>('me'); if(await load(session)) setPerson(current);}
      catch(error) {
        if(session!==sessionVersion.current) return;
        endSession();
        if(!(error instanceof ApiError) || error.status!==401) setNotice({message:'Desk-Daten konnten nicht geladen werden.',error:true});
      }
    })();
  },[]);

  async function refreshSavedData(session:number) {
    const version=savedVersion.current;
    try {
      return await load(session);
    } catch(error) {
      if(session!==sessionVersion.current || version!==savedVersion.current) return false;
      if(error instanceof ApiError && error.status===401) {
        endSession();
        setNotice({message:'Die Änderung wurde gespeichert. Bitte erneut anmelden, um die Ansicht zu aktualisieren.',error:false});
      } else {
        setRefreshRequired(true);
      }
      return false;
    }
  }

  const retryRefresh=deskRefresh(sessionVersion,setRefreshing,refreshSavedData);

  const run=deskAction({sessionVersion,savedVersion,displayedSavedVersion,load,refreshSavedData,endSession,setNotice});

  const {signIn,logout}=deskAuthentication({sessionVersion,signInPending,logoutPending,load,endSession,setPerson,setNotice});
  return {person,data:snapshot.data,dataVersion:snapshot.version,flags,notice,setNotice,refreshRequired,refreshing,
    confirmationRequests,signIn,logout,endSession,retryRefresh,run};
}

type LoadDeskData = (session:number)=>Promise<boolean>;
type DeskNotice = {message:string;error:boolean};

function deskAction({sessionVersion,savedVersion,displayedSavedVersion,load,refreshSavedData,endSession,setNotice}:{
  sessionVersion:RefObject<number>; savedVersion:RefObject<number>; displayedSavedVersion:RefObject<number>;
  load:LoadDeskData; refreshSavedData:LoadDeskData; endSession:()=>void; setNotice:(notice:DeskNotice)=>void;
}):Run {
  return async(operation,feedback,{kind='write',reportWriteRejection,reportInlineError,onSaved}={})=>{
    const session=sessionVersion.current;
    const isCurrent=()=>session===sessionVersion.current;
    setNotice({message:'',error:false});
    try {
      const result=await operation(isCurrent);
      if(!isCurrent()) return false;
      if(result===noWrite) return true;
      if(kind==='read') {
        const refreshed=displayedSavedVersion.current===savedVersion.current
          ? await load(session)
          : await refreshSavedData(session);
        if(!refreshed) return true;
      }
    } catch(error) {
      if(!isCurrent()) return false;
      if(reportWriteRejection && error instanceof ApiError && [400,409].includes(error.status)) throw error;
      if(error instanceof ApiError && error.status===401) endSession();
      else if(reportInlineError) throw error;
      setNotice({message:error instanceof Error?error.message:'Die Aktion ist fehlgeschlagen.',error:true});
      return false;
    }
    if(kind==='write') {
      savedVersion.current++;
      onSaved?.(savedVersion.current);
      if(!await refreshSavedData(session)) return true;
    }
    if(feedback && isCurrent())setNotice({message:feedback,error:false});
    return true;
  };
}

function deskRefresh(sessionVersion:RefObject<number>,setRefreshing:(refreshing:boolean)=>void,refreshSavedData:LoadDeskData) {
  return async function retryRefresh() {
    const session=sessionVersion.current;
    setRefreshing(true);
    try { await refreshSavedData(session); }
    finally { if(session===sessionVersion.current) setRefreshing(false); }
  }
}

function deskAuthentication({sessionVersion,signInPending,logoutPending,load,endSession,setPerson,setNotice}:{
  sessionVersion:RefObject<number>; signInPending:RefObject<boolean>; logoutPending:RefObject<boolean>;
  load:LoadDeskData; endSession:()=>void; setPerson:(person:Person)=>void; setNotice:(notice:DeskNotice)=>void;
}) {
  async function signIn(authenticate:()=>Promise<unknown>) {
    if(logoutPending.current) throw new Error('Die Abmeldung läuft noch. Versuche es gleich erneut.');
    if(signInPending.current) throw new Error('Eine Anmeldung läuft bereits.');
    signInPending.current=true;
    const session=sessionVersion.current;
    try {
      await authenticate();
      if(session!==sessionVersion.current) return;
      const current=await api<Person>('me');
      if(await load(session)) {
        setPerson(current);
        setNotice({message:'',error:false});
      }
    } finally {
      signInPending.current=false;
    }
  }

  async function logout() {
    if(logoutPending.current) return;
    logoutPending.current=true;
    const session=sessionVersion.current;
    try {
      await api('logout','POST');
      if(session!==sessionVersion.current) return;
      endSession();
      setNotice({message:'',error:false});
    } catch {
      if(session===sessionVersion.current) setNotice({message:'Abmelden fehlgeschlagen.',error:true});
    } finally {
      logoutPending.current=false;
    }
  }
  return {signIn,logout};
}
