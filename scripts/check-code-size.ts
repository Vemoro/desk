import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const fileLimit=400;
const functionLimit=80;
const root=fileURLToPath(new URL('../',import.meta.url));
type Limits={files:Record<string,number>;functions:Record<string,number>};

const nonCodeTokens=new Set([
  ts.SyntaxKind.EndOfFileToken,ts.SyntaxKind.JsxText,ts.SyntaxKind.JsxTextAllWhiteSpaces,
  ts.SyntaxKind.OpenBraceToken,ts.SyntaxKind.CloseBraceToken,ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,ts.SyntaxKind.CommaToken,ts.SyntaxKind.SemicolonToken,
  ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail,
]);

function countLines(source:ts.SourceFile,body:ts.Node) {
  const lines=new Set<number>();
  function count(node:ts.Node) {
    const children=node.getChildren(source);
    if(children.length) {
      children.forEach(count);
    } else if(node.kind>=ts.SyntaxKind.FirstToken && node.kind<=ts.SyntaxKind.LastToken && !nonCodeTokens.has(node.kind)) {
      lines.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line);
    }
  }
  count(body);
  return lines.size;
}

function functionName(node:ts.SignatureDeclaration,source:ts.SourceFile) {
  const own=ts.getNameOfDeclaration(node);
  if(own) return own.getText(source);
  const parent=node.parent;
  if(ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) {
    return parent.name.getText(source);
  }
  return '(anonym)';
}

export function codeSizes(file:string,text:string):Limits {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const total=text ? text.replace(/\r?\n$/,'').split(/\r?\n/).length : 0;
  const sizes:Limits={files:total>fileLimit?{[file]:total}:{},functions:{}};
  const names=new Map<string,number>();
  function visit(node:ts.Node,scope='') {
    if(ts.isFunctionLike(node) && 'body' in node && node.body) {
      const name=scope+functionName(node,source);
      const sequence=(names.get(name)??0)+1;
      names.set(name,sequence);
      const identifier=sequence===1?name:`${name} #${sequence}`;
      const lines=countLines(source,node.body);
      if(lines>functionLimit) sizes.functions[`${file}:${identifier}`]=lines;
      ts.forEachChild(node,child=>visit(child,identifier+' › '));
    } else {
      ts.forEachChild(node,child=>visit(child,scope));
    }
  }
  visit(source);
  return sizes;
}

export function sizeViolations(found:Limits,baseline:Limits,release:boolean) {
  const violations:string[]=[];
  for(const [group,threshold] of [['files',fileLimit],['functions',functionLimit]] as const) {
    for(const [id,length] of Object.entries(found[group])) {
      const previous=baseline[group][id];
      if(release || previous===undefined || length>previous) {
        const previousNote=previous===undefined?'':` (Bestandsgrenze: ${previous})`;
        violations.push(`${id}: ${length} statt höchstens ${threshold} Zeilen${previousNote}.`);
      }
    }
    for(const [id,previous] of Object.entries(baseline[group])) {
      if((found[group][id]??0)<previous) {
        violations.push(`${id}: Bestandsliste aktualisieren. Die frühere Ausnahme beträgt ${previous} Zeilen.`);
      }
    }
  }
  return violations;
}

function isSourceFile(file:string) {
  return /\.tsx?$/.test(file) && !/(?:\.(?:test|spec)\.tsx?$|\/routeTree\.gen\.ts$|\.d\.ts$)/.test(file);
}

function mergeSizes(total:Limits,file:string,text:string) {
  const sizes=codeSizes(file,text);
  Object.assign(total.files,sizes.files);
  Object.assign(total.functions,sizes.functions);
}

function gitText(...args:string[]) {
  const command=Bun.spawnSync(['git','--no-replace-objects',...args],{cwd:root});
  if(command.exitCode!==0) throw new Error(command.stderr.toString().trim() || 'Git-Basis konnte nicht gelesen werden.');
  return command.stdout.toString();
}

function baseSizes(commit:string):Limits {
  if(!/^[0-9a-f]{40}$/.test(commit)) throw new Error('DESK_CHECK_BASE muss eine vollständige Commit-ID sein.');
  const files=gitText('ls-tree','-r','-z','--name-only',commit,'--','src','scripts').split('\0').filter(isSourceFile);
  const sizes:Limits={files:{},functions:{}};
  for(const file of files) mergeSizes(sizes,file,gitText('show',commit+':'+file));
  return sizes;
}

export function baselineGrowth(baseline:Limits,base:Limits) {
  const violations:string[]=[];
  for(const group of ['files','functions'] as const) {
    for(const [id,length] of Object.entries(baseline[group])) {
      if(length>(base[group][id]??0)) violations.push(id+': Neue oder vergrößerte Ausnahme in der Bestandsliste.');
    }
  }
  return violations;
}

export function requiresReleaseChecks(version:string) {
  const [major,minor]=version.split('.').map(Number);
  return major>0 || minor>=2;
}

async function main() {
  const found:Limits={files:{},functions:{}};
  const glob=new Bun.Glob('{src,scripts}/**/*.{ts,tsx}');
  const files=Array.from(glob.scanSync({cwd:root})).map(file=>file.replaceAll('\\','/')).sort();
  for(const file of files.filter(isSourceFile)) {
    mergeSizes(found,file,await Bun.file(new URL('../'+file,import.meta.url)).text());
  }
  if(process.argv.includes('--bestand')) {
    console.log(JSON.stringify(found,null,2));
    return;
  }
  const metadata=await Bun.file(new URL('../package.json',import.meta.url)).json() as {deskVersion:string};
  const baseline=await Bun.file(new URL('../.checks/code-size.json',import.meta.url)).json() as Limits;
  const release=process.argv.includes('--release') || requiresReleaseChecks(metadata.deskVersion);
  const violations=sizeViolations(found,baseline,release);
  const base=process.env.DESK_CHECK_BASE;
  if(base && !/^0{40}$/.test(base)) violations.push(...baselineGrowth(baseline,baseSizes(base)));
  if(violations.length) {
    console.error(violations.join('\n'));
    process.exitCode=1;
  } else {
    console.log('Dateigröße und Funktionslänge geprüft.');
  }
}

if(import.meta.main) await main();
