// Loads the class documents into Firestore (one doc per class, id = classId).
// Safe to re-run: it overwrites each class with the current data.
//
//   cd firebase && npm install firebase-admin
//   node import-classes.js <classes-import.json> <service-account-key.json>
//
// The service-account key is a secret: keep it and the JSON outside this repo.
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const [dataPath, keyPath] = process.argv.slice(2);
if (!dataPath || !keyPath) { console.error('usage: node import-classes.js <classes-import.json> <service-account-key.json>'); process.exit(1); }

initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();
const classes = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Rules compare the signed-in email, lowercased, against staffEmails, so a
// mixed-case or padded entry would silently lock that teacher out. Normalise
// here, and refuse to import anything that could not match a real staff login.
const STAFF_EMAIL = /^[a-z0-9._-]+@rajalakshmi\.edu\.in$/;
let bad = 0;
for (const c of classes) {
  const emails = (Array.isArray(c.staffEmails) ? c.staffEmails : []).map((e) => String(e).trim().toLowerCase());
  const invalid = emails.filter((e) => !STAFF_EMAIL.test(e));
  if (!emails.length || invalid.length) {
    bad++;
    console.error(`BAD ${c.classId}: ${emails.length ? 'invalid staff email(s): ' + invalid.join(', ') : 'no staffEmails'}`);
  }
  c.staffEmails = [...new Set(emails)];
}
if (bad) { console.error(`${bad} class(es) have bad staff emails; fix the JSON and re-run. Nothing was imported.`); process.exit(1); }

(async () => {
  // Firestore allows 500 writes per batch; chunk so 500 staff / ~700 classes also works
  for (let i = 0; i < classes.length; i += 400) {
    const batch = db.batch();
    for (const c of classes.slice(i, i + 400)) batch.set(db.collection('classes').doc(c.classId), c);
    await batch.commit();
  }
  console.log(`Imported ${classes.length} classes.`);
})().catch((e) => { console.error(e); process.exit(1); });
