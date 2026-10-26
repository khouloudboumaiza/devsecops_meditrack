// Remplit la base avec des données FICTIVES : 10 patients, 6 médecins, 2 secrétaires, 1 admin, 20 rendez-vous, dossiers.
// Usage : npm run seed
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/db');

const PASSWORD = 'Password123!'; // mot de passe de TOUS les comptes de test

const patients = [
  'Amine Rezgui', 'Salma Gharbi', 'Yassine Trabelsi', 'Lina Mansouri', 'Karim Bouaziz',
  'Nour Haddad', 'Omar Chaabane', 'Ines Jlassi', 'Mehdi Sassi', 'Rania Dridi'
];

// [nom, spécialité, note, tarif]  -> 6 médecins, 4 spécialités
const medecins = [
  ['Dr Sonia Karray', 'Généraliste', 4.8, 40],
  ['Dr Walid Mejri', 'Généraliste', 4.5, 35],
  ['Dr Hela Zouari', 'Cardiologue', 4.9, 70],
  ['Dr Fares Ben Salah', 'Cardiologue', 4.6, 65],
  ['Dr Amel Khlifi', 'Dentiste', 4.7, 50],
  ['Dr Rached Oueslati', 'Neurologue', 4.8, 80],
];

// [index patient, index médecin, décalage en jours, heure, motif, type, statut]
const rdv = [
  [0, 0, -14, '09:00', 'Bilan annuel', 'cabinet', 'termine'],
  [1, 0, -10, '10:30', 'Toux persistante', 'en_ligne', 'termine'],
  [2, 2, -7, '14:00', 'Douleurs thoraciques', 'cabinet', 'termine'],
  [3, 4, -5, '11:00', 'Détartrage', 'cabinet', 'termine'],
  [4, 5, -3, '15:30', 'Migraines fréquentes', 'en_ligne', 'termine'],
  [5, 1, -2, '09:30', 'Certificat médical', 'cabinet', 'termine'],
  [6, 3, -1, '16:00', 'Contrôle de la tension', 'cabinet', 'termine'],
  [7, 0, -1, '10:00', 'Fatigue', 'en_ligne', 'annule'],
  [8, 2, 0, '09:00', 'Suivi cardiaque', 'cabinet', 'confirme'],
  [9, 0, 0, '10:30', "Renouvellement d'ordonnance", 'en_ligne', 'confirme'],
  [0, 4, 0, '14:30', 'Douleur dentaire', 'cabinet', 'confirme'],
  [1, 5, 1, '09:30', 'Suivi migraine', 'cabinet', 'confirme'],
  [2, 0, 1, '11:00', 'Vaccination', 'cabinet', 'confirme'],
  [3, 2, 2, '15:00', 'Électrocardiogramme', 'cabinet', 'confirme'],
  [4, 1, 2, '10:00', 'Maux de gorge', 'en_ligne', 'confirme'],
  [5, 3, 3, '14:00', 'Avis cardiologique', 'en_ligne', 'confirme'],
  [6, 4, 3, '09:30', 'Contrôle dentaire', 'cabinet', 'confirme'],
  [7, 5, 4, '16:30', 'Vertiges', 'cabinet', 'confirme'],
  [8, 0, 5, '09:00', 'Bilan sanguin', 'cabinet', 'annule'],
  [9, 1, 6, '11:30', 'Douleurs dorsales', 'cabinet', 'confirme'],
];

const diagnostics = [
  'Hypertension artérielle légère', 'Rhinopharyngite aiguë', "Suspicion d'angine de poitrine", 'Carie dentaire (molaire 36)',
  'Migraine sans aura', 'Lombalgie commune', 'Diabète de type 2 équilibré', 'Asthme allergique saisonnier',
  'Anémie ferriprive modérée', 'Reflux gastro-œsophagien'
];
const ordonnances = [
  'Amlodipine 5 mg : 1 comprimé le matin', 'Paracétamol 1 g : 3 fois par jour pendant 5 jours',
  'Examen complémentaire à prévoir, contrôle sous 15 jours', 'Soin conservateur + bain de bouche 7 jours',
  'Antalgique + repos au calme', 'Myorelaxant 5 jours + séances de kinésithérapie',
  'Metformine 850 mg : 2 fois par jour', 'Antihistaminique : 1 comprimé par jour',
  'Fer : 1 gélule par jour pendant 3 mois', 'Inhibiteur de la pompe à protons 20 mg avant le repas'
];

const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await db.query('TRUNCATE ordonnances, medical_records, appointments, users RESTART IDENTITY CASCADE');

  const birthDates = [
    '1990-05-14', '1985-11-20', '1998-03-08', '1979-09-25', '1995-12-01',
    '2001-07-19', '1988-02-14', '1993-10-30', '1982-06-12', '1997-04-05'
  ];

  // 1. Insertion des médecins en premier
  const mIds = [];
  for (let i = 0; i < medecins.length; i++) {
    const [nom, spec, note, tarif] = medecins[i];
    const r = await db.query(
      "INSERT INTO users (nom, email, mot_de_passe_hash, role, specialite, note, tarif, actif) VALUES ($1, $2, $3, 'medecin', $4, $5, $6, TRUE) RETURNING id",
      [nom, `medecin${i + 1}@meditrack.test`, hash, spec, note, tarif]
    );
    mIds.push(r.rows[0].id);
  }

  // 2. Insertion des patients avec date de naissance et médecin traitant
  const pIds = [];
  for (let i = 0; i < patients.length; i++) {
    const traitantId = mIds[i % 3]; // Dr Sonia Karray, Dr Walid Mejri, Dr Hela Zouari
    const r = await db.query(
      "INSERT INTO users (nom, email, mot_de_passe_hash, role, date_naissance, medecin_traitant_id, actif) VALUES ($1, $2, $3, 'patient', $4, $5, TRUE) RETURNING id",
      [patients[i], `patient${i + 1}@meditrack.test`, hash, birthDates[i], traitantId]
    );
    pIds.push(r.rows[0].id);
  }

  // 3. Insertion des secrétaires (rattachées chacune à un médecin)
  // Secrétaire 1 rattachée au Dr Sonia Karray (mIds[0])
  await db.query(
    "INSERT INTO users (nom, email, mot_de_passe_hash, role, medecin_id, actif) VALUES ($1, $2, $3, 'secretaire', $4, TRUE)",
    ['Nadia Trabelsi (Secrétaire)', 'secretaire1@meditrack.test', hash, mIds[0]]
  );
  // Secrétaire 2 rattachée au Dr Hela Zouari (mIds[2])
  await db.query(
    "INSERT INTO users (nom, email, mot_de_passe_hash, role, medecin_id, actif) VALUES ($1, $2, $3, 'secretaire', $4, TRUE)",
    ['Sarra Ben Amor (Secrétaire)', 'secretaire2@meditrack.test', hash, mIds[2]]
  );

  // 4. Insertion du compte Administrateur
  await db.query(
    "INSERT INTO users (nom, email, mot_de_passe_hash, role, actif) VALUES ($1, $2, $3, 'admin', TRUE)",
    ['Administrateur MediTrack', 'admin@meditrack.test', hash]
  );

  // 5. Rendez-vous
  for (const [p, m, off, heure, motif, type, statut] of rdv) {
    await db.query(
      'INSERT INTO appointments (patient_id, medecin_id, date, heure, motif, type, statut) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [pIds[p], mIds[m], iso(off), heure, motif, type, statut]
    );
  }

  // 6. Dossiers médicaux
  for (let i = 0; i < patients.length; i++) {
    const notes = `[${iso(-20 - i)}] ${medecins[i % 2 ? 0 : 1][0]} : Patient suivi. Tél. (fictif) : 555-01${String(10 + i)}.\n[${iso(-12 - i)}] ${medecins[0][0]} : Évolution favorable, revoir dans 1 mois.`;
    await db.query(
      'INSERT INTO medical_records (patient_id, diagnostic, ordonnance, notes, created_at) VALUES ($1, $2, $3, $4, $5)',
      [pIds[i], diagnostics[i], ordonnances[i], notes, iso(-20 - i)]
    );
    if (i < 5) {
      await db.query(
        'INSERT INTO medical_records (patient_id, diagnostic, ordonnance, notes, created_at) VALUES ($1, $2, $3, $4, $5)',
        [pIds[i], 'Contrôle de suivi', 'Aucune modification du traitement', `[${iso(-4 - i)}] ${medecins[2][0]} : Résultats stables.`, iso(-4 - i)]
      );
    }
  }

  // 7. Ordonnances indépendantes (documents médicaux immuables)
  const ordonnancesInit = [
    [0, 0, -2, 'Hypertension artérielle légère', '1. Amlodipine 5 mg : 1 comprimé le matin au réveil.\n2. Règle hygiéno-diététique : limiter les apports en sel.\n3. Autosurveillance tensionnelle matin et soir pendant 3 jours avant la prochaine consultation.\n\nDurée de prescription : 3 mois renouvelable 1 fois.'],
    [0, 0, -35, 'Bilan annuel de santé', '1. Paracétamol 1g : 1 comprimé en cas de céphalées, espacer de 6h minimum (max 3g/jour).\n2. Bilan biologique de contrôle à réaliser à jeun.\n\nDurée : 10 jours.'],
    [1, 1, -5, 'Rhinopharyngite aiguë', '1. Paracétamol 1 000 mg : 1 sachet 3 fois par jour pendant 4 jours.\n2. Spray nasal eau de mer : 2 pulvérisations dans chaque narine matin et soir.\n3. Vitamine C 500 mg : 1 comprimé à croquer le matin.\n\nDurée : 5 jours.'],
    [2, 2, -1, 'Suspicion angine de poitrine', '1. Bétabloquant (Bisoprolol 2.5 mg) : 1 comprimé par jour le matin.\n2. Trinitrine sublinguale spray : 1 bouffée sous la langue en cas de crise douloureuse thoracique.\n3. Électrocardiogramme d\'effort à planifier sous quinzaine.'],
    [3, 4, -4, 'Carie dentaire & Gingivite', '1. Bain de bouche à la chlorhexidine 0.12% : 15 ml pur 2 fois par jour après brossage (7 jours).\n2. Ibuprofène 400 mg : 1 comprimé au cours des repas si douleur (max 3/jour).\n\nDurée : 7 jours.'],
    [4, 5, -8, 'Migraine sans aura', '1. Zolmitriptan 2.5 mg : 1 comprimé dès le début de la crise migraineuse.\n2. Si récidive après 2h : 1 second comprimé possible (max 2/24h).\n3. Repos dans une pièce sombre et calme.']
  ];

  for (const [p, m, off, diag, contenu] of ordonnancesInit) {
    await db.query(
      'INSERT INTO ordonnances (patient_id, medecin_id, contenu, diagnostic_associe, date_creation) VALUES ($1, $2, $3, $4, $5)',
      [pIds[p], mIds[m], contenu, diag, iso(off) + ' 10:30:00']
    );
  }

  console.log('Seed terminé avec succès :');
  console.log('- 10 patients (patient1..patient10@meditrack.test)');
  console.log('- 6 médecins (medecin1..medecin6@meditrack.test)');
  console.log('- 2 secrétaires (secretaire1@meditrack.test, secretaire2@meditrack.test)');
  console.log('- 1 administrateur (admin@meditrack.test)');
  console.log('- Ordonnances indépendantes initialisées');
  console.log(`Mot de passe unique de tous les comptes : ${PASSWORD}`);
  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
