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

function fieldRenderer(node:ts.Node) {
  let renderer:ts.ArrowFunction|undefined;
  for(let parent=node.parent;parent;parent=parent.parent) {
    if(ts.isArrowFunction(parent)) renderer=parent;
    if(ts.isJsxElement(parent) && parent.openingElement.tagName.getText()==='Field') {
      if(renderer && ts.isJsxExpression(renderer.parent) && renderer.parent.parent===parent) return renderer;
      return undefined;
    }
  }
}

function receivesFieldProps(node:ts.JsxOpeningLikeElement) {
  const renderer=fieldRenderer(node);
  const parameter=renderer?.parameters[0]?.name;
  if(!renderer || !parameter || !ts.isIdentifier(parameter)) return false;
  const names=new Set([parameter.text]);
  if(ts.isBlock(renderer.body)) {
    for(const statement of renderer.body.statements) {
      if(!ts.isVariableStatement(statement)) continue;
      for(const {name,initializer} of statement.declarationList.declarations) {
        if(ts.isIdentifier(name) && initializer && ts.isObjectLiteralExpression(initializer) &&
          initializer.properties.some(property=>ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression) &&
            names.has(property.expression.text))) names.add(name.text);
      }
    }
  }
  return node.attributes.properties.some(attribute=>ts.isJsxSpreadAttribute(attribute) &&
    ts.isIdentifier(attribute.expression) && names.has(attribute.expression.text));
}

export function inspectFields(file:string,text:string) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const failures:string[]=[];
  function visit(node:ts.Node) {
    if((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controls.has(node.tagName.getText()) &&
      !isAllowedCheckbox(node,file) && !receivesFieldProps(node)) {
      const {line}=source.getLineAndCharacterOfPosition(node.getStart());
      failures.push(`${file}:${line+1}: ${node.tagName.getText()} braucht ein gemeinsames Field.`);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  return failures;
}

if(import.meta.main) {
  const violations:string[]=[];
  for(const path of new Bun.Glob('src/**/*.tsx').scanSync({cwd:root,dot:true})) {
    const file=path.replaceAll('\\','/');
    violations.push(...inspectFields(file,await Bun.file(join(root,file)).text()));
  }
  if(violations.length) {
    console.error(violations.join('\n'));
    process.exitCode=1;
  } else {
    console.log('Gemeinsame Formularfelder geprüft.');
  }
}
