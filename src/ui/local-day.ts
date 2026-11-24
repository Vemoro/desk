import { useEffect, useState } from 'react';

export function useLocalDay() {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    let timer:number;
    function updateDay() {
      window.clearTimeout(timer);
      const current=new Date();
      setNow(current);
      const nextDay=new Date(current.getFullYear(),current.getMonth(),current.getDate()+1);
      timer=window.setTimeout(updateDay,nextDay.getTime()-current.getTime());
    }
    updateDay();
    window.addEventListener('focus',updateDay);
    return ()=>{
      window.clearTimeout(timer);
      window.removeEventListener('focus',updateDay);
    };
  },[]);
  return [now.getFullYear(),now.getMonth()+1,now.getDate()].map(part=>String(part).padStart(2,'0')).join('-');
}
