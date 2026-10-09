import crypto from 'node:crypto';

/** Prepare a tournament round. With an odd number of entrants, one earns a bye. */
export function startRound(room, entrants) {
  if (!Array.isArray(entrants) || entrants.length < 2) throw Error('A round requires two or more entrants.');
  room.matches = [];
  room.bye = null;
  room.roundWinners = [];
  room.matchIndex = 0;
  room.revealed = false;
  room.outcome = null;
  for (let i = 0; i < entrants.length; i += 2) {
    if (i + 1 < entrants.length) room.matches.push({ a: entrants[i], b: entrants[i + 1], votes: {} });
    else room.bye = entrants[i];
  }
}

/** Count votes for the active pair. Votes are indexed by player identity. */
export function score(match) {
  const values = Object.values(match.votes);
  return { a: values.filter(v => v === match.a.id).length,
    b: values.filter(v => v === match.b.id).length, total: values.length };
}

/** Determine winner, with the host's vote taking precedence in a tie. */
export function resolveWinner(match, hostId, randomIndex = () => crypto.randomInt(2)) {
  const votes = score(match);
  if (!votes.total) throw Error('Cannot determine a winner before a vote.');
  if (votes.a !== votes.b) return { winner: votes.a > votes.b ? match.a : match.b, tiebreak: '' };
  const hostVote = match.votes[hostId];
  const winner = hostVote === match.a.id ? match.a : hostVote === match.b.id ? match.b
    : randomIndex() ? match.a : match.b;
  return { winner, tiebreak: hostVote ? 'Tie broken by host vote' : 'Tie broken randomly' };
}
