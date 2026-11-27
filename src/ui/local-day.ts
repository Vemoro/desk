import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

function dayKey(date:Date) {
  return [date.getFullYear(),date.getMonth()+1,date.getDate()].map(part=>String(part).padStart(2,'0')).join('-');
}

export function useLocalDay(beforeDayChange?:()=>void) {
  const [today,setToday]=useState(()=>dayKey(new Date()));
  useEffect(()=>{
    let timer:number;
    let lastDay:string|undefined;
    function updateDay() {
      window.clearTimeout(timer);
      const current=new Date();
      const day=dayKey(current);
      if(lastDay!==undefined && day!==lastDay) beforeDayChange?.();
      lastDay=day;
      setToday(day);
      const nextDay=new Date(current.getFullYear(),current.getMonth(),current.getDate()+1);
      timer=window.setTimeout(updateDay,nextDay.getTime()-current.getTime());
    }
    updateDay();
    window.addEventListener('focus',updateDay);
    return ()=>{
      window.clearTimeout(timer);
      window.removeEventListener('focus',updateDay);
    };
  },[beforeDayChange]);
  return today;
}

export function useLocalDayWithFocus(container:RefObject<HTMLElement|null>,fallback:RefObject<HTMLElement|null>) {
  const previouslyFocused=useRef<Element|null>(null);
  const rememberFocus=useCallback(()=>{
    const focused=document.activeElement;
    previouslyFocused.current=container.current?.contains(focused) ? focused : null;
  },[container]);
  const today=useLocalDay(rememberFocus);

  useLayoutEffect(()=>{
    const focused=previouslyFocused.current;
    previouslyFocused.current=null;
    if(focused && !focused.isConnected && document.activeElement===document.body) fallback.current?.focus();
  },[today,fallback]);
  return today;
}

export function localDayRange(value:string) {
  const [year,month,day]=value.split('-').map(Number);
  function midnight(dayOfMonth:number) {
    // Normalize the calendar date before resolving midnight in the browser zone.
    const calendar=new Date(0);
    calendar.setUTCFullYear(year,month-1,dayOfMonth);
    return Number.isFinite(calendar.getTime()) ? Date.parse(calendar.toISOString().slice(0,-1)) : NaN;
  }
  return {start:midnight(day),end:midnight(day+1)};
}
