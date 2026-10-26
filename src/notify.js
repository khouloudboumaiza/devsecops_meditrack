// Simulation d'un service de notification (aucun appel réseau réel).
const { FAKE_API_KEY } = require('./config');

function notifyBooking(patientNom, medecinNom, date, heure) {
  // On n'affiche que le début de la clé dans les logs.
  console.log(`[notify:${FAKE_API_KEY.slice(0, 8)}…] RDV ${date} ${heure} : ${patientNom} -> ${medecinNom}`);
}

module.exports = { notifyBooking };
