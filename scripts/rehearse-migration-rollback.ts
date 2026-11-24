import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const scope='desk-rollback-'+crypto.randomUUID().slice(0,12);
const tempRoot=await realpath(tmpdir());
const workspace=await mkdtemp(join(tempRoot,scope+'-'));
const checkout=join(workspace,'source');
const baseline=join(workspace,'baseline');
const fixtures=join(checkout,'migrations');
const archive=join(workspace,'desk.tar');
const password=crypto.randomUUID();
const port=process.env.DESK_ROLLBACK_TEST_PORT ?? '4182';
const origin=`http://127.0.0.1:${port}`;
const env={
  ...process.env,
  POSTGRES_PASSWORD:password,
  DATABASE_URL:`postgres://desk:${password}@${scope}-db:5432/desk`,
  DESK_ORIGIN:origin,
};
const first='9901_rollback_probe_first.sql';
const second='9902_rollback_probe_second.sql';
const failure='intentional-rollback-probe';
const secondSql='CREATE TABLE rollback_probe_second (id integer);\n';
const names=[`${scope}-db`,`${scope}-desk`];

function run(command:string[], allowFailure=false) {
  const result=Bun.spawnSync(command,{env,stdout:'pipe',stderr:'pipe'});
  const output=new TextDecoder().decode(result.stdout).trim();
  const error=new TextDecoder().decode(result.stderr).trim();
  if(result.exitCode !== 0 && !allowFailure) {
    throw new Error(`${command.slice(0,2).join(' ')} ist fehlgeschlagen.\n${error}`);
  }
  return {status:result.exitCode,output,error};
}

const docker=(args:string[],allowFailure=false)=>run(['docker',...args],allowFailure);
const sql=(statement:string)=>docker(['exec',names[0],'psql','-v','ON_ERROR_STOP=1','-U','desk','-d','desk','-Atqc',statement]).output;
const migrate=(directory:string,allowFailure=false)=>docker([
  'run','--rm','--network',scope,'-e','DATABASE_URL','--mount',`type=bind,source=${directory},target=/desk/migrations,readonly`,
  scope,'bun','scripts/migrate.ts',
],allowFailure);

function requireResult(condition:boolean, message:string) {
  if(!condition) throw new Error(message);
}

async function readiness(expected:number) {
  for(let attempt=0;attempt<30;attempt++){
    const response=await fetch(origin+'/api/v1/ready',{signal:AbortSignal.timeout(3000)}).catch(()=>null);
    if(response) {
      const data=await response.json() as {ready:boolean};
      requireResult(response.status===expected && data.ready===(expected===200),`Unerwartete Bereitschaft: HTTP ${response.status}`);
      return;
    }
    await Bun.sleep(1000);
  }
  throw new Error('Desk-Bereitschaft war nicht erreichbar.');
}

try {
  await mkdir(checkout);
  run(['git','archive','-o',archive,'HEAD']);
  run(['tar','-xf',archive,'-C',checkout]);
  await cp(fixtures,baseline,{recursive:true});
  await writeFile(join(fixtures,first),'CREATE TABLE rollback_probe_first (id integer);\n');
  await writeFile(join(fixtures,second),secondSql+`SELECT '${failure}'::integer;\n`);
  docker(['build','--tag',scope,checkout]);
  docker(['network','create',scope]);
  docker(['volume','create',scope]);
  docker(['create','--name',names[0],'--network',scope,'--mount',`type=volume,source=${scope},target=/var/lib/postgresql/data`,
    '-e','POSTGRES_USER=desk','-e','POSTGRES_DB=desk','-e','POSTGRES_PASSWORD','postgres:17']);
  docker(['start',names[0]]);
  for(let attempt=0;attempt<30;attempt++){
    if(docker(['exec',names[0],'pg_isready','-h','127.0.0.1','-U','desk','-d','desk'],true).status===0) break;
    if(attempt===29) throw new Error('PostgreSQL wurde nicht bereit.');
    await Bun.sleep(1000);
  }
  migrate(baseline);
  const project=sql(`WITH contact AS (INSERT INTO contacts (name) VALUES ('Muster Auftragsservice') RETURNING id)
    INSERT INTO projects (name,contact_id,notes) SELECT 'Musterauftrag',id,'Vor der Migration erfasst' FROM contact RETURNING id;`);
  const snapshot=()=>sql(`SELECT row_to_json(projects) FROM projects WHERE id='${project}'::uuid;`);
  const before=snapshot();
  docker(['create','--name',names[1],'--network',scope,'-p',`127.0.0.1:${port}:3000`,'-e','DATABASE_URL','-e','DESK_ORIGIN',scope]);
  docker(['start',names[1]]);
  await readiness(503);

  const attempt=migrate(fixtures,true);
  requireResult(attempt.status!==0 && attempt.output.includes(first) && attempt.error.includes(failure),'Die zweite Testmigration ist nicht am vorgesehenen SQL-Schritt gescheitert.');
  const counts=`SELECT COUNT(*) FROM desk_migrations WHERE name IN ('${first}','${second}');`;
  const tables=`SELECT to_regclass('rollback_probe_first') IS NOT NULL AND to_regclass('rollback_probe_second') IS NOT NULL;`;
  requireResult(sql(counts)==='0','Ein Testeintrag im Migrationsprotokoll blieb bestehen.');
  const rolledBack=sql("SELECT to_regclass('rollback_probe_first') IS NULL AND to_regclass('rollback_probe_second') IS NULL;");
  requireResult(rolledBack==='t','Eine teilweise Schemaänderung blieb bestehen.');
  await readiness(503);
  requireResult(before!=='' && snapshot()===before,'Projektdaten nach Rollback verändert.');
  console.log('Rollback bestätigt: HTTP 503, keine Testtabellen, keine Testeinträge, Musterprojekt erhalten.');

  await writeFile(join(fixtures,second),secondSql);
  migrate(fixtures);
  requireResult(sql(counts)==='2' && sql(tables)==='t','Korrigierte Testmigrationen fehlen.');
  await readiness(200);
  requireResult(snapshot()===before,'Projektdaten nach Migration verändert.');
  console.log('Wiederanlauf bestätigt: HTTP 200, beide Migrationen angewendet, Musterprojekt unverändert.');
} finally {
  for(const name of names) docker(['rm','-fv',name],true);
  docker(['volume','rm',scope],true);
  docker(['network','rm',scope],true);
  docker(['image','rm',scope],true);
  const target=await realpath(workspace);
  if(dirname(target)===tempRoot && target===workspace) await rm(target,{recursive:true,force:true});
}
