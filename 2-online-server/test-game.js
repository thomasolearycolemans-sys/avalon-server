/*
 * test-game.js — verifies the Phase 3 game engine (proposals, votes, quests, assassination).
 * Run: node test-game.js
 */
const C = require("./lib/avalon-core.js");
let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) pass++; else { fail++; console.log("  FAIL  " + label); } };

/* build a game with an explicit role->seat layout for deterministic tests */
function makeGame(layout, opts = {}) {
  // layout: array of role keys, index = seat
  const players = layout.map((_, i) => ({ seat: i, name: "P" + i }));
  const deal = layout.map((role, i) => ({ player: "P" + i, role, seat: i }));
  const settings = { lanc: "default", sorc: false, msg: false };
  return C.createGame(players, deal, settings, opts.leader || 0);
}
/* token->seat maps are trivial in tests: token "sN" -> seat N */
const tsm = t => parseInt(t.slice(1), 10);

/* helper: everyone votes the same way to pass/reject a proposal */
function voteAll(g, vote) {
  let last;
  for (const p of g.players) last = C.castVote(g, p.seat, vote);
  return last;
}
/* helper: force a quest to a given outcome by having team play cards.
   evilFails = how many evil members play fail (good always success). */
function runQuest(g, evilFails) {
  const team = g.proposal.slice();
  let f = 0, last;
  for (const s of team) {
    const isEvil = C.teamOf(g, s) === "evil";
    const card = (isEvil && f < evilFails) ? "fail" : "success";
    if (card === "fail") f++;
    last = C.submitQuestCard(g, s, card);
  }
  return last;
}

/* =================================================================
 * 1. Quest sizing + two-fails
 * =============================================================== */
ok("5p quest sizes", JSON.stringify(C.QUEST_SIZES[5]) === JSON.stringify([2,3,2,3,3]));
ok("7p quest sizes", JSON.stringify(C.QUEST_SIZES[7]) === JSON.stringify([2,3,3,4,4]));
ok("q4 needs two fails at 7p", C.questNeedsTwoFails(7,4) === true);
ok("q4 needs one fail at 6p", C.questNeedsTwoFails(6,4) === false);
ok("q3 needs one fail at 7p", C.questNeedsTwoFails(7,3) === false);

/* =================================================================
 * 2. Proposal validation
 * =============================================================== */
{
  // 5 players: merlin, loyal, loyal (good) ; assassin, minion (evil). Quest 1 size = 2.
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  ok("phase starts at proposal", g.phase === "proposal");
  ok("leader is seat 0", C.leaderSeat(g) === 0);
  // non-leader cannot propose
  let r = C.proposeTeam(g, "s1", [0,1], tsm);
  ok("non-leader cannot propose", !r.ok);
  // wrong size rejected
  r = C.proposeTeam(g, "s0", [0,1,2], tsm);
  ok("wrong team size rejected", !r.ok);
  // correct proposal accepted -> vote phase
  r = C.proposeTeam(g, "s0", [0,1], tsm);
  ok("valid proposal accepted", r.ok && g.phase === "vote");
}

/* =================================================================
 * 3. Voting: majority passes, tie/minority rejects, leader rotates
 * =============================================================== */
{
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  C.proposeTeam(g, "s0", [0,1], tsm);
  // 3 approve, 2 reject -> passes
  C.castVote(g, 0, "approve"); C.castVote(g, 1, "approve"); C.castVote(g, 2, "approve");
  C.castVote(g, 3, "reject");
  const last = C.castVote(g, 4, "reject");
  ok("majority approve passes to quest", last.passed === true && g.phase === "quest");
}
{
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  C.proposeTeam(g, "s0", [0,1], tsm);
  // 2 approve, 3 reject -> rejected, leader advances, back to proposal
  C.castVote(g, 0, "approve"); C.castVote(g, 1, "approve");
  C.castVote(g, 2, "reject"); C.castVote(g, 3, "reject");
  const last = C.castVote(g, 4, "reject");
  ok("minority approve is rejected", last.passed === false);
  ok("leader rotates after reject", C.leaderSeat(g) === 1);
  ok("returns to proposal after reject", g.phase === "proposal");
}
{
  // tie also rejects (strict majority required)
  const g = makeGame(["merlin","loyal_servant","assassin","minion"]); // 4p not standard but tests tie
  // manually set to 4 players quest-size independent; use only vote logic
  g.proposal = [0,1]; g.phase = "vote"; g.votes = {};
  C.castVote(g, 0, "approve"); C.castVote(g, 1, "approve");
  C.castVote(g, 2, "reject");
  const last = C.castVote(g, 3, "reject");
  ok("tie vote rejects (strict majority)", last.passed === false);
}

/* =================================================================
 * 4. Five consecutive rejects => evil wins
 * =============================================================== */
{
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  let last;
  for (let i = 0; i < 5; i++) {
    const leader = C.leaderSeat(g);
    C.proposeTeam(g, "s" + leader, [0,1], tsm);
    last = voteAll(g, "reject");
  }
  ok("five rejects ends game", g.phase === "over");
  ok("five rejects => evil wins", g.winner === "evil" && last.gameOver === true);
}

/* =================================================================
 * 5. Quest resolution + Good cannot fail
 * =============================================================== */
{
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  C.proposeTeam(g, "s0", [0,1], tsm);   // both good (merlin + loyal)
  voteAll(g, "approve");
  // a good player attempting to fail is rejected
  const bad = C.submitQuestCard(g, 0, "fail");
  ok("good player cannot play fail", !bad.ok);
  // both play success -> quest succeeds
  C.submitQuestCard(g, 0, "success");
  const res = C.submitQuestCard(g, 1, "success");
  ok("all-success quest succeeds", res.result === "success");
  ok("quest recorded", g.questResults.length === 1 && g.questResults[0] === "success");
  ok("advanced to quest 2", g.questNumber === 2 && g.phase === "proposal");
}
{
  // evil on team fails the quest (1 fail is enough outside the 2-fail quest)
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  C.proposeTeam(g, "s0", [0,3], tsm);   // merlin(good) + assassin(evil)
  voteAll(g, "approve");
  const res = runQuest(g, 1);           // assassin plays fail
  ok("one fail fails a normal quest", res.result === "fail");
  ok("failure recorded", g.questResults[0] === "fail");
}

/* =================================================================
 * 6. Two-fails rule on quest 4 (7 players)
 * =============================================================== */
{
  // 7 players: 4 good, 3 evil. Seats 4,5,6 evil.
  const layout = ["merlin","percival","loyal_servant","loyal_servant","assassin","morgana","minion"];
  const g = makeGame(layout);
  // fast-forward to quest 4 by stuffing results
  g.questResults = ["success","fail","success"]; // 2 success, 1 fail
  g.questNumber = 4;
  g.phase = "proposal";
  g.leaderIdx = 0;
  const size = C.currentQuestSize(g); // 4
  ok("quest 4 size at 7p is 4", size === 4);
  // propose a team with two evil members (seats 4 and 5) plus two good
  C.proposeTeam(g, "s0", [0,1,4,5], tsm);
  voteAll(g, "approve");
  // exactly ONE evil fails -> quest 4 should still SUCCEED (needs two)
  const single = runQuest(g, 1);
  ok("q4 with one fail succeeds (two-fails rule)", single.result === "success");
}
{
  const layout = ["merlin","percival","loyal_servant","loyal_servant","assassin","morgana","minion"];
  const g = makeGame(layout);
  g.questResults = ["success","fail","success"];
  g.questNumber = 4; g.phase = "proposal"; g.leaderIdx = 0;
  C.proposeTeam(g, "s0", [0,1,4,5], tsm);
  voteAll(g, "approve");
  const dbl = runQuest(g, 2);   // two evil fail
  ok("q4 with two fails fails", dbl.result === "fail");
}

/* =================================================================
 * 7. Three successes => good wins the quests => assassination
 * =============================================================== */
function playToGoodQuestWin(layout) {
  const g = makeGame(layout);
  // drive three successful quests using all-good teams where possible
  while (g.phase === "proposal" && g.questResults.filter(r => r === "success").length < 3) {
    const size = C.currentQuestSize(g);
    // choose the first `size` GOOD seats
    const goodSeats = g.players.map(p => p.seat).filter(s => C.teamOf(g, s) === "good").slice(0, size);
    const team = goodSeats.length === size ? goodSeats : g.players.slice(0, size).map(p => p.seat);
    C.proposeTeam(g, "s" + C.leaderSeat(g), team, tsm);
    voteAll(g, "approve");
    runQuest(g, 0);
  }
  return g;
}
{
  const layout = ["merlin","percival","loyal_servant","assassin","morgana"]; // 5p, 3 good 2 evil
  const g = playToGoodQuestWin(layout);
  ok("three good successes -> assassination phase", g.phase === "assassination");
}

/* =================================================================
 * 8. Assassination: hitting Merlin flips the win to evil
 * =============================================================== */
{
  const layout = ["merlin","percival","loyal_servant","assassin","morgana"];
  const g = playToGoodQuestWin(layout);
  const assassinSeat = g.deal.find(d => d.role === "assassin").seat;
  const merlinSeat = g.deal.find(d => d.role === "merlin").seat;
  // only the assassin may strike
  const wrong = C.assassinate(g, "s" + merlinSeat, merlinSeat, tsm);
  ok("non-assassin cannot assassinate", !wrong.ok);
  // assassin hits Merlin -> evil wins
  const hit = C.assassinate(g, "s" + assassinSeat, merlinSeat, tsm);
  ok("assassin hitting Merlin => evil wins", hit.ok && g.winner === "evil" && hit.hitMerlin);
}
{
  const layout = ["merlin","percival","loyal_servant","assassin","morgana"];
  const g = playToGoodQuestWin(layout);
  const assassinSeat = g.deal.find(d => d.role === "assassin").seat;
  const percivalSeat = g.deal.find(d => d.role === "percival").seat;
  const miss = C.assassinate(g, "s" + assassinSeat, percivalSeat, tsm);
  ok("assassin missing Merlin => good wins", miss.ok && g.winner === "good" && !miss.hitMerlin);
}

/* =================================================================
 * 9. Three failures => evil wins outright (no assassination)
 * =============================================================== */
{
  const layout = ["merlin","loyal_servant","loyal_servant","assassin","minion"];
  const g = makeGame(layout);
  let guard = 0;
  while (g.phase !== "over" && guard++ < 30) {
    if (g.phase === "proposal") {
      const size = C.currentQuestSize(g);
      // always include an evil seat (3) to fail
      const team = [3];
      for (const p of g.players) { if (team.length >= size) break; if (p.seat !== 3) team.push(p.seat); }
      C.proposeTeam(g, "s" + C.leaderSeat(g), team.slice(0, size), tsm);
      voteAll(g, "approve");
    } else if (g.phase === "quest") {
      runQuest(g, 1);
    }
  }
  ok("three failed quests => evil wins", g.winner === "evil" && g.winReason === "Three quests failed.");
}

/* =================================================================
 * 10. Public view never leaks roles until game over
 * =============================================================== */
{
  const g = makeGame(["merlin","loyal_servant","loyal_servant","assassin","minion"]);
  C.proposeTeam(g, "s0", [0,1], tsm);
  const midView = JSON.stringify(C.publicGameView(g));
  ok("mid-game public view contains no role keys", !/"role":/.test(midView) && !/assassin|merlin|minion/.test(midView.replace(/name/g,"")));
  // finish the game and confirm reveal appears
  const g2 = playToGoodQuestWin(["merlin","percival","loyal_servant","assassin","morgana"]);
  const aSeat = g2.deal.find(d => d.role === "assassin").seat;
  const pSeat = g2.deal.find(d => d.role === "percival").seat;
  C.assassinate(g2, "s" + aSeat, pSeat, tsm);
  const endView = C.publicGameView(g2);
  ok("end-of-game view reveals all roles", Array.isArray(endView.reveal) && endView.reveal.length === 5);
}

console.log(`\nPhase 3 game engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
