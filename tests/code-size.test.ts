import { describe, expect, test } from 'bun:test';
import { baselineGrowth, codeSizes, requiresReleaseChecks, sizeViolations } from '../scripts/check-code-size';

const limits={files:{},functions:{}};
const file='src/muster.ts';

function sourceWithFunction(length:number) {
  return 'function muster() {\n'+Array.from({length},(_,i)=>'  void '+i+';').join('\n')+'\n}\n';
}

describe('Größenregeln',()=>{
  test('400 bzw. 80 Zeilen sind erlaubt und die nächste Zeile erzeugt einen Befund',()=>{
    expect(codeSizes(file,Array(400).fill('void 0;').join('\n')+'\n')).toEqual(limits);
    expect(codeSizes(file,Array(401).fill('void 0;').join('\n')+'\n').files).toEqual({[file]:401});
    expect(codeSizes(file,sourceWithFunction(80))).toEqual(limits);
    expect(codeSizes(file,sourceWithFunction(81)).functions).toEqual({[file+':muster']:81});
  });

  test('Leerzeilen, Kommentare und Zeichenketten zählen im Rumpf nur mit zusätzlichem Code',()=>{
    const blankLines='\n  // Kommentar\n\n'.repeat(100);
    const template='  const text = `Muster\n'+'Text\n'.repeat(90)+'`;\n';
    expect(codeSizes(file,'function muster() {\n'+blankLines+template+'}\n')).toEqual(limits);
  });

  test('Die vierstellige Desk-Version aktiviert die Regeln ab 0.2.0.0',()=>{
    expect(requiresReleaseChecks('0.1.99.0')).toBe(false);
    expect(requiresReleaseChecks('0.2.0.0')).toBe(true);
    expect(requiresReleaseChecks('1.0.0.0')).toBe(true);
  });

  test('Bestandswerte dürfen weder wachsen noch als veraltete Ausnahme stehen bleiben',()=>{
    const old=codeSizes(file,sourceWithFunction(81));
    const grown=codeSizes(file,sourceWithFunction(82));
    expect(sizeViolations(old,old,false)).toEqual([]);
    expect(sizeViolations(grown,old,false)).toHaveLength(1);
    expect(sizeViolations(limits,old,false)).toHaveLength(1);
    expect(baselineGrowth(grown,old)).toHaveLength(1);
    expect(baselineGrowth(old,limits)).toHaveLength(1);
    expect(sizeViolations(old,old,true)).toHaveLength(1);
  });
});
