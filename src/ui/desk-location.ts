import { useEffect, useState } from 'react';
import type { SearchTarget } from './global-search';
import { sections, type Section } from './navigation-targets';
import { projectHash, projectView, type ProjectView } from './project-views';

export function useDeskLocation(setNotice:(notice:{message:string;error:boolean})=>void) {
  const [section,setSection]=useState<Section>('dashboard');
  const [detailId,setDetailId]=useState('');
  const [view,setView]=useState<ProjectView>('overview');
  const [searchFocus,setSearchFocus]=useState(0);

  useEffect(()=>{
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
  },[setNotice]);

  useEffect(()=>{
    if(!searchFocus) return;
    const frame=requestAnimationFrame(()=>{
      document.getElementById('desk-main')?.focus({preventScroll:true});
      window.scrollTo(0,0);
    });
    return ()=>cancelAnimationFrame(frame);
  },[searchFocus]);

  function navigate(to:Section,id='') {
    setNotice({message:'',error:false});
    setSection(to);
    setDetailId(id);
    setView('overview');
    location.hash=id && to==='projects' ? projectHash(id) : id && to==='contacts' ? '#contacts/'+id : to;
  }

  function searchNavigate(target:SearchTarget) {
    navigate(target.section,target.id);
    setSearchFocus(value=>value+1);
  }

  return {section,detailId,view,navigate,searchNavigate};
}
