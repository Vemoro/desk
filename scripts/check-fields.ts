import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const controls=new Set(['input','select','textarea']);
function isAllowedCheckbox(node:ts.JsxOpeningLikeElement,file:string) {
  if(node.tagName.getText()!=='input') return false;
  const attributes=new Map(node.attributes.properties.filter(ts.isJsxAttribute)
    .map(attribute=>[attribute.name.getText(),attribute.initializer]));
  const type=attributes.get('type');
  if(!type || !ts.isStringLiteral(type) || type.text!=='checkbox') return false;
  const name=attributes.get('name');
  const checked=attributes.get('checked');
  return (file==='src/ui/account-password.tsx' && name && ts.isStringLiteral(name) && name.text==='revokeOtherSessions') ||
    (file==='src/ui/warehouse.tsx' && checked && ts.isJsxExpression(checked) && checked.expression?.getText()==='onlyAvailable');
}

function belongsToField(node:ts.Node) {
  for(let parent=node.parent;parent;parent=parent.parent) {
    if(ts.isJsxElement(parent) && parent.openingElement.tagName.getText()==='Field') return true;
  }
  return false;
}

function receivesFieldProps(node:ts.JsxOpeningLikeElement) {
  return node.attributes.properties.some(ts.isJsxSpreadAttribute);
}

function inspect(file:string,text:string) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const failures:string[]=[];
  function visit(node:ts.Node) {
    if((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controls.has(node.tagName.getText()) &&
      !isAllowedCheckbox(node,file) && (!belongsToField(node) || !receivesFieldProps(node))) {
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
