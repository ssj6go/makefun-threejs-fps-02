// The match: first to 5 rounds, at most 9. Each round is a 3 s freeze (buy
// while you stand still) then 100 s live, with buying open for the first 15 s
// of live play. Money follows the Counter-Strike shape: kills pay, the round
// pays more, losing still pays enough to keep the next round interesting.
export const WIN_SCORE = 5;
export const MAX_ROUNDS = 9;
export const ROUND_TIME = 100;
export const FREEZE_TIME = 3;
export const BUY_TIME = 15;
export const END_TIME = 3.5;

const REWARDS = { kill: 300, elimination: 1400, bomb: 1600, loss: 900 };

export function createRounds() {
  const state = {
    round: 1,
    scoreUs: 0,
    scoreThem: 0,
    money: 800,
    grenades: 0,
    phase: 'freeze',
    freezeLeft: FREEZE_TIME,
    roundLeft: ROUND_TIME,
    buyLeft: BUY_TIME,
    endLeft: 0,
    winner: null,
    reason: null,
    buyClosed: false,
  };

  function startRound() {
    state.phase = 'freeze';
    state.freezeLeft = FREEZE_TIME;
    state.roundLeft = ROUND_TIME;
    state.buyLeft = BUY_TIME;
    state.buyClosed = false;
    state.winner = null;
    state.reason = null;
  }

  function endRound(winner, reason) {
    state.phase = 'roundEnd';
    state.endLeft = END_TIME;
    state.winner = winner;
    state.reason = reason;
    if (winner === 'us') {
      state.scoreUs += 1;
      state.money += reason === 'bomb' ? REWARDS.bomb : REWARDS.elimination;
    } else {
      state.scoreThem += 1;
      state.money += REWARDS.loss;
    }
    return { type: 'roundEnd', winner, reason };
  }

  return {
    state,
    startRound,
    reset() {
      state.round = 1;
      state.scoreUs = 0;
      state.scoreThem = 0;
      state.money = 800;
      state.grenades = 0;
      startRound();
    },
    addKill() {
      state.money += REWARDS.kill;
    },
    buyOpen() {
      return state.phase === 'freeze' || (state.phase === 'live' && state.buyLeft > 0);
    },
    canMove() {
      return state.phase === 'live';
    },
    // ctx: { botsAlive, bombStatus, playerAlive }. Returns events for main.js.
    update(dt, ctx) {
      const events = [];
      if (state.phase === 'freeze') {
        state.freezeLeft -= dt;
        if (state.freezeLeft <= 0) {
          state.phase = 'live';
          events.push({ type: 'live' });
        }
        return events;
      }
      if (state.phase === 'roundEnd') {
        state.endLeft -= dt;
        if (state.endLeft > 0) return events;
        if (state.scoreUs >= WIN_SCORE || state.scoreThem >= WIN_SCORE || state.round >= MAX_ROUNDS) {
          state.phase = 'matchEnd';
          const winner = state.scoreUs > state.scoreThem ? 'us' : 'them';
          events.push({ type: 'matchEnd', winner });
        } else {
          state.round += 1;
          startRound();
          events.push({ type: 'roundStart' });
        }
        return events;
      }
      if (state.phase !== 'live') return events;

      if (!state.buyClosed && state.buyLeft > 0) {
        state.buyLeft -= dt;
        if (state.buyLeft <= 0) {
          state.buyClosed = true;
          events.push({ type: 'buyClosed' });
        }
      }
      state.roundLeft -= dt;

      // While the bomb is planted only the bomb decides the round.
      if (ctx.bombStatus === 'exploded') {
        events.push(endRound('us', 'bomb'));
        return events;
      }
      if (ctx.bombStatus === 'defused') {
        events.push(endRound('them', 'defused'));
        return events;
      }
      if (ctx.bombStatus === 'planted') return events;
      if (ctx.botsAlive === 0) {
        events.push(endRound('us', 'elimination'));
        return events;
      }
      if (!ctx.playerAlive) {
        events.push(endRound('them', 'elimination'));
        return events;
      }
      if (state.roundLeft <= 0) {
        events.push(endRound('them', 'time'));
      }
      return events;
    },
  };
}
