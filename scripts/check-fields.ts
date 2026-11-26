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
    if(ts.isFunctionLike(parent)) {
      if(renderer || !ts.isArrowFunction(parent)) return undefined;
      renderer=parent;
    }
    if(ts.isJsxElement(parent) && parent.openingElement.tagName.getText()==='Field') {
      if(renderer && ts.isJsxExpression(renderer.parent) && renderer.parent.parent===parent) return renderer;
      return undefined;
    }
  }
}

function receivesFieldProps(node:ts.JsxOpeningLikeElement,checker:ts.TypeChecker) {
  const renderer=fieldRenderer(node);
  const parameter=renderer?.parameters[0]?.name;
  if(!renderer || !parameter || !ts.isIdentifier(parameter)) return false;
  const binding=checker.getSymbolAtLocation(parameter);
  if(!binding) return false;
  const bindings=new Set([binding]);
  const comesFromField=(expression:ts.Expression)=>{
    const symbol=ts.isIdentifier(expression) && checker.getSymbolAtLocation(expression);
    return Boolean(symbol && bindings.has(symbol));
  };
  if(ts.isBlock(renderer.body)) {
    for(const statement of renderer.body.statements) {
      if(!ts.isVariableStatement(statement)) continue;
      for(const {name,initializer} of statement.declarationList.declarations) {
        const alias=ts.isIdentifier(name) && checker.getSymbolAtLocation(name);
        if(alias && initializer && ts.isObjectLiteralExpression(initializer) &&
          initializer.properties.some(property=>ts.isSpreadAssignment(property) && comesFromField(property.expression))) bindings.add(alias);
      }
    }
  }
  return node.attributes.properties.some(attribute=>ts.isJsxSpreadAttribute(attribute) && comesFromField(attribute.expression));
}

export function inspectFields(file:string,text:string) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const options={jsx:ts.JsxEmit.Preserve,noResolve:true,noLib:true};
  const host=ts.createCompilerHost(options);
  host.getSourceFile=name=>name===file?source:undefined;
  const checker=ts.createProgram([file],options,host).getTypeChecker();
  const failures:string[]=[];
  function visit(node:ts.Node) {
    if((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controls.has(node.tagName.getText()) &&
      !isAllowedCheckbox(node,file) && !receivesFieldProps(node,checker)) {
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
