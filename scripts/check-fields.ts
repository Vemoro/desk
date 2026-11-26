import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const controls=new Set(['input','select','textarea']);
const checkboxExceptions=new Set(['src/ui/account-password.tsx','src/ui/warehouse.tsx']);

function isAllowedCheckbox(node:ts.JsxOpeningLikeElement,file:string) {
  if(!checkboxExceptions.has(file) || node.tagName.getText()!=='input') return false;
  return node.attributes.properties.some(attribute=>ts.isJsxAttribute(attribute) && attribute.name.getText()==='type' &&
    attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text==='checkbox');
}

function belongsToField(node:ts.Node) {
  for(let parent=node.parent;parent;parent=parent.parent) {
    if(ts.isJsxElement(parent) && parent.openingElement.tagName.getText()==='Field') return true;
  }
  return false;
}

function inspect(file:string,text:string) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const failures:string[]=[];
  function visit(node:ts.Node) {
    if((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controls.has(node.tagName.getText()) &&
      !isAllowedCheckbox(node,file) && !belongsToField(node)) {
      const {line}=source.getLineAndCharacterOfPosition(node.getStart());
      failures.push(`${file}:${line+1}: ${node.tagName.getText()} braucht ein gemeinsames Field.`);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  return failures;
}

const violations:string[]=[];
for(const path of new Bun.Glob('src/**/*.tsx').scanSync({cwd:root,dot:true})) {
  const file=path.replaceAll('\\','/');
  violations.push(...inspect(file,await Bun.file(join(root,file)).text()));
}
if(violations.length) {
  console.error(violations.join('\n'));
  process.exitCode=1;
} else {
  console.log('Gemeinsame Formularfelder geprüft.');
}
