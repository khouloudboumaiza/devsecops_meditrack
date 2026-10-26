// Script de migration : applique les colonnes et contraintes pour les nouveaux rôles (secretaire, admin)
require('dotenv').config();
const db = require('../src/db');

async function migrate() {
  console.log('--- Début de la migration MediTrack ---');

  // 1. Modifier la contrainte check sur le rôle
  await db.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(15);
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('patient', 'medecin', 'secretaire', 'admin'));
  `);
  console.log('✔ Contrainte role mise à jour (patient, medecin, secretaire, admin)');

  // 2. Ajouter la colonne medecin_id si elle n'existe pas
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='medecin_id') THEN
        ALTER TABLE users ADD COLUMN medecin_id INT REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  console.log('✔ Colonne medecin_id vérifiée');

  // 3. Ajouter la colonne actif si elle n'existe pas
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='actif') THEN
        ALTER TABLE users ADD COLUMN actif BOOLEAN NOT NULL DEFAULT TRUE;
      END IF;
    END $$;
  `);
  console.log('✔ Colonne actif vérifiée');

  // 4. Ajouter date_naissance, medecin_traitant_id, created_at
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='date_naissance') THEN
        ALTER TABLE users ADD COLUMN date_naissance DATE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='medecin_traitant_id') THEN
        ALTER TABLE users ADD COLUMN medecin_traitant_id INT REFERENCES users(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now();
      END IF;
    END $$;
  `);
  console.log('✔ Colonnes date_naissance, medecin_traitant_id et created_at vérifiées');

  // 5. Créer la table ordonnances si elle n'existe pas
  await db.query(`
    CREATE TABLE IF NOT EXISTS ordonnances (
      id                 SERIAL PRIMARY KEY,
      patient_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medecin_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contenu            TEXT NOT NULL,
      diagnostic_associe VARCHAR(255),
      date_creation      TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  console.log('✔ Table ordonnances vérifiée');

  console.log('--- Migration terminée avec succès ---');
  await db.end();
}

migrate().catch((err) => {
  console.error('Erreur migration :', err);
  process.exit(1);
});
