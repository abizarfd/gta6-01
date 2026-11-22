// progression.js — Street Cred: the rank Jax earns as he works Solmar Bay.
// Missions, taxi fares and stashed cash all feed one number; the rank title
// shows in the HUD so the player always sees the next rung. Nothing is
// locked behind cred — it is a badge of how deep into the city Jax has got.
export const CRED_RANKS = [
  { min: 0, title: 'Wheelman' },
  { min: 500, title: 'Hustler' },
  { min: 1500, title: 'Runner' },
  { min: 4000, title: 'Kingpin of Solmar Bay' },
];

// One number for everything Jax has done. Missions are worth the most; a
// taxi fare and a stashed package are worth a little each.
export function credFor(missions) {
  const done = (missions.completed || []).length * 400;
  const fares = (missions.taxiFares || 0) * 60;
  const cash = (missions.packageTotal || 0) * 40;
  return done + fares + cash;
}

export function rankTitle(cred) {
  let title = CRED_RANKS[0].title;
  for (const rank of CRED_RANKS) {
    if (cred >= rank.min) title = rank.title;
  }
  return title;
}

// How far to the next rank, for the pause screen line. Returns null at the top.
export function nextRank(cred) {
  for (const rank of CRED_RANKS) {
    if (cred < rank.min) return { title: rank.title, left: rank.min - cred };
  }
  return null;
}
