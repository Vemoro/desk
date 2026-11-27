import { useEffect, useState } from 'react';

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
