-- MediTrack : schéma PostgreSQL (données 100 % fictives)
DROP TABLE IF EXISTS ordonnances, medical_records, appointments, users CASCADE;

CREATE TABLE users (
  id                SERIAL PRIMARY KEY,
  nom               VARCHAR(100) NOT NULL,
  email             VARCHAR(150) UNIQUE NOT NULL,
  mot_de_passe_hash VARCHAR(100) NOT NULL,
  role              VARCHAR(15)  NOT NULL CHECK (role IN ('patient', 'medecin', 'secretaire', 'admin')),
  specialite        VARCHAR(50),          -- médecins uniquement
  note              NUMERIC(2,1),         -- médecins uniquement (0.0 - 5.0)
  tarif             NUMERIC(6,2),         -- médecins uniquement (fictif)
  medecin_id        INT REFERENCES users(id) ON DELETE SET NULL, -- secrétaires uniquement
  medecin_traitant_id INT REFERENCES users(id) ON DELETE SET NULL, -- médecin traitant assigné (patients)
  date_naissance    DATE,                 -- date de naissance (patients)
  created_at        TIMESTAMP NOT NULL DEFAULT now(), -- date d'inscription
  actif             BOOLEAN NOT NULL DEFAULT TRUE -- activation / désactivation par l'admin
);

CREATE TABLE appointments (
  id         SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medecin_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  heure      VARCHAR(5) NOT NULL,         -- format HH:MM
  motif      VARCHAR(200) NOT NULL,
  type       VARCHAR(10) NOT NULL CHECK (type IN ('en_ligne', 'cabinet')),
  statut     VARCHAR(10) NOT NULL DEFAULT 'confirme' CHECK (statut IN ('confirme', 'termine', 'annule'))
);
-- Un médecin ne peut pas avoir deux rendez-vous actifs au même créneau
CREATE UNIQUE INDEX uniq_creneau ON appointments (medecin_id, date, heure) WHERE statut <> 'annule';

CREATE TABLE medical_records (
  id         SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diagnostic TEXT,
  ordonnance TEXT,
  notes      TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE ordonnances (
  id                 SERIAL PRIMARY KEY,
  patient_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medecin_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contenu            TEXT NOT NULL,
  diagnostic_associe VARCHAR(255),
  date_creation      TIMESTAMP NOT NULL DEFAULT now()
);

