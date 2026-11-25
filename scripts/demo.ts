import { db, first } from '../src/server/db';
import { createAccount } from '../src/server/accounts';
import { changeStage, importCosts, saveCore } from '../src/server/core';
import { createMovement, createReservation, setReservation } from '../src/server/stock';

type Id = { id:string };
const getId = (value:unknown)=>(value as Id).id;
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_demo')) {
  throw new Error('Demo-Daten nur in einer Datenbank mit der Endung _demo anlegen.');
}

try {
  const exists=await first(db,"SELECT id FROM users WHERE email='mira@example.test'");
  if (exists) {
    console.log('Muster Auftragsservice ist bereits eingerichtet.');
  } else {
    const password=process.env.DESK_DEMO_PASSWORD;
    if (!password) throw new Error('DESK_DEMO_PASSWORD setzen.');
    const admin=getId(await createAccount({name:'Mira Muster',email:'mira@example.test',password,role:'admin'}));
    const member=getId(await createAccount({name:'Noah Beispiel',email:'noah@example.test',password,role:'member'}));
    const clientOne=getId(await saveCore('contacts',{name:'Kulturhaus am Park',email:'anfragen@kulturhaus.example.test'}));
    const clientTwo=getId(await saveCore('contacts',{name:'Kontor West',email:'buero@kontor.example.test'}));
    const warehouse=getId(await saveCore('locations',{name:'Hauptlager'}));
    const reserve=getId(await saveCore('locations',{name:'Werkstatt'}));
    const device=getId(await saveCore('items',{name:'Mobiles Technikset',code:'GER-01',kind:'equipment',inventory_number:'INV-0101'}));
    const consumable=getId(await saveCore('items',{name:'Kabelbinder, Packung',code:'MAT-11',kind:'consumable'}));
    const toolbox=getId(await saveCore('items',{name:'Montagekoffer',code:'GER-02',kind:'equipment'}));
    await createMovement({action:'receive',item_id:device,location_id:warehouse,quantity:1},admin);
    await createMovement({action:'receive',item_id:consumable,location_id:warehouse,quantity:18},admin);
    await createMovement({action:'receive',item_id:toolbox,location_id:reserve,quantity:4},admin);
    const quantities = [[device,'2028-05-17T07:30:00+02:00'],[consumable,'2028-05-17T08:00:00+02:00'],[toolbox,'2028-05-17T08:15:00+02:00']];
    for (const [id, timestamp] of quantities) {
      await db.unsafe("UPDATE movements SET created_at=$2 WHERE item_id=$1 AND action='receive'",[id,timestamp]);
    }
    for (const [label,contact,center,due] of [
      ['Veranstaltungsbetreuung im Kulturhaus',clientOne,'K-102','2028-05-18'],
      ['Büroinstallation Westflügel',clientTwo,'K-103','2028-05-25'],
    ]) {
      const project=getId(await saveCore('projects',{name:label,contact_id:contact,cost_center:center,due,
        notes:'Beispielauftrag von Muster Auftragsservice.',offer_ref:`ANG-${center}`}));
      await changeStage(project,'planning',admin);
      await changeStage(project,'offered',admin);
      await changeStage(project,'confirmed',admin);
      for (const [task,status,assignee] of [
        ['Bedarf mit Kunde abstimmen','done',admin],['Materialliste prüfen','review',member],
        ['Einsatz vorbereiten','doing',member],['Übergabe dokumentieren','todo',admin],
        ['Termin rückbestätigen','todo',admin],
      ]) await saveCore('tasks',{project_id:project,name:task,status,assignee_id:assignee,due});
      await saveCore('lines',{project_id:project,kind:'buy',name:'Material und Transport',quantity:2,unit_cents:4200});
      await saveCore('lines',{project_id:project,kind:'sell',name:'Projektservice',quantity:8,unit_cents:6500});
      const starts_at=`${due}T08:00:00+02:00`;
      const ends_at=`${due}T17:00:00+02:00`;
      const staff=getId(await createReservation({project_id:project,user_id:member,quantity:1,starts_at,ends_at}));
      const resource=getId(await createReservation({project_id:project,item_id:consumable,location_id:warehouse,quantity:3,starts_at,ends_at}));
      await setReservation(staff,'firm',admin);
      await setReservation(resource,'firm',admin);
      await db.unsafe(`
        WITH ordered AS (
          SELECT id,row_number() OVER (ORDER BY created_at,id) AS position
          FROM project_history WHERE project_id=$1
        )
        UPDATE project_history h SET created_at=$2::timestamptz + ordered.position * interval '1 minute'
        FROM ordered WHERE h.id=ordered.id
      `,[project,`${due}T07:00:00+02:00`]);
      await importCosts([{source:'demo',reference:`E-${center}`,cost_center:center,name:'Befestigungsmaterial',cents:6290}]);
    }
    await importCosts([{source:'demo',reference:'E-104',name:'Kurierfahrt',cents:1790}]);
    console.log('Demo-Daten für Muster Auftragsservice angelegt.');
  }
} finally {
  await db.close();
}
