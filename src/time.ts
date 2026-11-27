export function microsecondsWithinMillisecond(isoTimestamp:string) {
  const fraction=/\.\d{3}(\d{1,3})/.exec(isoTimestamp)?.[1];
  return fraction ? Number(fraction.padEnd(3,'0')) : 0;
}
