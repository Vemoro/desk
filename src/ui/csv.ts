export function csvText(value:string) {
  return '"'+(/^[=+\-@\t\r]/.test(value) ? "'"+value : value).replaceAll('"','""')+'"';
}

export function csvFile(lines:string[]) {
  return new Blob(['\uFEFF',lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
}
