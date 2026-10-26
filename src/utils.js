// Fonctions utilitaires partagées (routes + vues)
const SPECIALITES = [
  { nom: 'Généraliste', icon: 'stethoscope' },
  { nom: 'Cardiologue', icon: 'heart' },
  { nom: 'Dentiste', icon: 'tooth' },
  { nom: 'Neurologue', icon: 'brain' },
];
const CRENEAUX = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];
const FRAIS_PLATEFORME = 2; // valeur fictive

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());

/** "Dr Sonia Karray" -> "SK" */
function initials(nom) {
  const parts = String(nom || '').replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean);
  const first = (parts[0] || '').charAt(0);
  const second = (parts[1] || '').charAt(0);
  return (first + second).toUpperCase();
}
const avatarClass = (id) => 'av-' + (Number(id) % 4);
const money = (n) => Number(n || 0).toFixed(2).replace('.', ',') + ' TND';
const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const typeLabel = (t) => (t === 'en_ligne' ? 'En ligne' : 'En cabinet');
const statutLabel = (s) => ({ confirme: 'Confirmé', termine: 'Terminé', annule: 'Annulé' }[s] || s);
const badgeClass = (s) => ({ confirme: 'badge-info', termine: 'badge-success', annule: 'badge-danger' }[s] || 'badge-info');

/** Les 7 prochains jours (dimanche exclu) avec la disponibilité de chaque créneau. */
function bookableDays(booked = new Set()) {
  const days = [];
  const now = new Date();
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (let i = 0; days.length < 7 && i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() === 0) continue;
    const iso = isoDate(d);
    days.push({
      iso,
      jour: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
      num: d.getDate(),
      mois: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      slots: CRENEAUX.map((h) => ({
        heure: h,
        dispo: !booked.has(iso + '|' + h) && !(iso === today() && h <= nowHM),
      })),
    });
  }
  return days;
}

/** Éléments de navigation selon le rôle. */
function navItems(role) {
  if (role === 'admin') {
    return [
      { href: '/admin', label: 'Tableau de bord', icon: 'chart', exact: true },
      { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: 'users' },
      { href: '/profil', label: 'Profil', icon: 'user' },
    ];
  }
  if (role === 'secretaire') {
    return [
      { href: '/secretaire', label: 'Agenda médecin', icon: 'calendar', exact: true },
      { href: '/secretaire/nouveau-rdv', label: 'Nouveau RDV', icon: 'plus' },
      { href: '/profil', label: 'Profil', icon: 'user' },
    ];
  }
  if (role === 'medecin') {
    return [
      { href: '/medecin', label: 'Tableau de bord', icon: 'chart', exact: true },
      { href: '/medecin/patients', label: 'Patients', icon: 'users', also: ['/records'] },
      { href: '/profil', label: 'Profil', icon: 'user' },
    ];
  }
  return [
    { href: '/accueil', label: 'Accueil', icon: 'home', also: ['/medecins'] },
    { href: '/rendez-vous', label: 'Rendez-vous', icon: 'calendar' },
    { href: '/dossier', label: 'Dossier', icon: 'file', also: ['/records'] },
    { href: '/profil', label: 'Profil', icon: 'user' },
  ];
}
const isActive = (item, path) =>
  [item.href, ...(item.also || [])].some((p) => (item.exact ? path === p : path === p || path.startsWith(p + '/')));

/** Évite d'écrire try/catch dans chaque route async. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function redirectWithToast(res, url, msg, type = 'success') {
  const sep = url.includes('?') ? '&' : '?';
  res.redirect(`${url}${sep}toast=${encodeURIComponent(msg)}&type=${type}`);
}

function renderError(res, code, heading, message) {
  res.status(code).render('pages/error', { layout: 'layouts/public', title: String(code), code, heading, message });
}

const viewHelpers = {
  SPECIALITES, FRAIS_PLATEFORME, initials, avatarClass, money, fmtDate, typeLabel, statutLabel, badgeClass, navItems, isActive,
};

module.exports = { SPECIALITES, CRENEAUX, FRAIS_PLATEFORME, today, bookableDays, wrap, redirectWithToast, renderError, viewHelpers };
