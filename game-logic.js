import crypto from 'node:crypto';

/**
 * Arrange a knockout bracket with a short play-in round for non-power-of-two
 * pack sizes. For n entrants, only n - 2^floor(log2(n)) matches are played in
 * the play-in round; everyone else advances automatically.
 *
 * Example: 35 entrants -> three play-in matches (6 players), 29 byes ->
 * 32 entrants for the regular bracket. Once the regular bracket begins,
 * there are no further byes.
 *
 * Entrants must be randomly shuffled before the opening round. Once the
 * preliminary winners and bye recipients join the regular bracket, the server
 * shuffles the full field for its round-of-32 draw.
 */
export function startRound(room, entrants) {
  if (!Array.isArray(entrants) || entrants.length < 2) {
    throw Error('A round requires two or more entrants.');
  }
  const n = entrants.length;
  const regularSize = 2 ** Math.floor(Math.log2(n));
  const playInMatches = n - regularSize;
  room.isPreliminary = playInMatches > 0;
  room.roundEntrants = n;
  room.roundTarget = regularSize;
  room.matches = [];
  room.byes = [];
  room.roundWinners = [];
  room.matchIndex = 0;
  room.revealed = false;
  room.outcome = null;

  // For 35 entrants, only the first six play; the remaining 29 get a bye.
  // For 32 entrants, all 32 play 16 matches, then 8, 4, 2 and 1.
  const inPlay = room.isPreliminary ? playInMatches * 2 : n;
  for (let i = 0; i < inPlay; i += 2) {
    room.matches.push({ a: entrants[i], b: entrants[i + 1], votes: {} });
  }
  if (room.isPreliminary) room.byes = entrants.slice(inPlay);
}

/** Human-readable label used by the voting screen. */
export function roundLabel(room) {
  if (room.isPreliminary) return 'PLAY-IN ROUND';
  const n = room.roundEntrants;
  if (n === 2) return 'THE GRAND FINAL';
  if (n === 4) return 'SEMIFINALS';
  if (n === 8) return 'QUARTERFINALS';
  return `ROUND OF ${n}`;
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
