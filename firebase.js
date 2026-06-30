import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
    getDatabase,
    ref,
    update,
    set,
    get,
    remove,
    onValue
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';

// ── Firebase config ──────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAKH9xm9sZlgwv10ZyTH1JTrC-a5TYKDzg",
    authDomain: "al-khayr-efb-tournament.firebaseapp.com",
    projectId: "al-khayr-efb-tournament",
    storageBucket: "al-khayr-efb-tournament.appspot.com",
    messagingSenderId: "866940309952",
    appId: "1:866940309952:web:6598381e9e410857893825"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

// ── Collection / path constants ───────────────────────────────────────────────
const COLLECTIONS = {
    TOURNAMENT: 'tournament',
    MATCHES:    'matches',
    TEAMS:      'teams'
};

const TOURNAMENT_ID = 'main-2026';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a team name to a safe Firebase key */
function sanitizeTeamId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/**
 * Build a team object.
 * Logo path follows the pattern:  assets/logos/<id>.png
 */
function createTeamObject(name) {
    const id = sanitizeTeamId(name);
    return { id, name, logo: `assets/logos/${id}.png` };
}

/**
 * Build a league match object.
 * matchday  – 1-based round number (1–19 for 20 teams)
 * matchNumber – position within the matchday (1-based)
 */
function createMatchObject(matchday, matchNumber, team1, team2) {
    const now = new Date().toISOString();
    return {
        id:          `league-${matchday}-${matchNumber}`,
        round:       'League',
        matchType:   'league',
        matchday,
        matchNumber,
        team1Id:     team1.id,
        team1Name:   team1.name,
        team1Logo:   team1.logo,
        team2Id:     team2.id,
        team2Name:   team2.name,
        team2Logo:   team2.logo,
        score1:      null,
        score2:      null,
        winnerId:    null,
        winnerName:  null,
        status:      'pending',
        // Admins may set a scheduled date/time per match (optional)
        scheduledAt: null,
        createdAt:   now,
        updatedAt:   now
    };
}

/**
 * Round-robin schedule using the "polygon" rotation algorithm.
 * With N teams this produces (N-1) matchdays, each with N/2 fixtures,
 * guaranteeing every team plays every other team exactly once.
 *
 * FIX: logo is now copied into each match object so the UI never needs
 * to look it up separately.
 */
function generateLeagueFixtures(teamObjects) {
    const teams   = [...teamObjects];
    const total   = teams.length;        // must be even
    const rounds  = total - 1;           // 19 for 20 teams
    const half    = total / 2;           // 10 matches per matchday
    const rotation = teams.slice(1);     // teams[0] is the fixed "anchor"
    const schedule = [];

    for (let round = 1; round <= rounds; round += 1) {
        const opponents = [teams[0], ...rotation];

        for (let index = 0; index < half; index += 1) {
            const teamA = opponents[index];
            const teamB = opponents[total - 1 - index];
            schedule.push(createMatchObject(round, index + 1, teamA, teamB));
        }

        // Rotate all except the anchor
        rotation.unshift(rotation.pop());
    }

    return schedule;
}

/** Coerce score to Number (null stays null) */
function formatScore(value) {
    return value === null ? null : Number(value);
}

/** Blank stats object for one team */
function createStatObj(id, name) {
    return { id, name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
}

/**
 * Sort league table:
 *   1. Points (desc)
 *   2. Goal Difference (desc)
 *   3. Goals Scored (desc)
 *   4. Alphabetical (asc) as tie-breaker
 */
function sortLeagueTable(table) {
    return table.sort((a, b) => {
        if (b.Pts !== a.Pts) return b.Pts - a.Pts;
        if (b.GD  !== a.GD)  return b.GD  - a.GD;
        if (b.GF  !== a.GF)  return b.GF  - a.GF;
        return a.name.localeCompare(b.name);
    });
}

// ── Tournament initialisation ─────────────────────────────────────────────────

/**
 * Create a brand-new 20-team league tournament in Firebase.
 * Writes: tournament doc + all team docs + all 190 league fixtures.
 */
async function initializeTournament(teamNames, countdownDate = null) {
    const teams  = teamNames.map(createTeamObject);
    const now    = new Date().toISOString();
    const updates = {};

    // Tournament root document
    updates[`${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`] = {
        name:          'Al-Khayr EFB Tournament',
        teamsCount:    teams.length,
        champion:      null,
        status:        'league',
        currentStage:  'league',
        knockoutStage: null,
        countdownDate: countdownDate ? countdownDate.toISOString() : new Date().toISOString(),
        createdAt:     now,
        updatedAt:     now,
        teamList:      teams.map((t) => t.id),
        top8:          []
    };

    // Team documents
    teams.forEach((team) => {
        updates[`${COLLECTIONS.TEAMS}/${team.id}`] = team;
    });

    // 190 league fixtures
    const fixtures = generateLeagueFixtures(teams);
    fixtures.forEach((match) => {
        updates[`${COLLECTIONS.MATCHES}/${match.id}`] = match;
    });

    await update(ref(db), updates);
    await updateLeagueTable();
    return { success: true };
}

// ── Real-time listeners ───────────────────────────────────────────────────────

function onMatchesUpdate(callback) {
    return onValue(ref(db, COLLECTIONS.MATCHES), (snapshot) => {
        callback(Object.values(snapshot.val() || {}));
    });
}

function onTournamentUpdate(callback) {
    return onValue(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`), (snapshot) => {
        callback(snapshot.val() || {});
    });
}

function onTeamsUpdate(callback) {
    return onValue(ref(db, COLLECTIONS.TEAMS), (snapshot) => {
        callback(snapshot.val() || {});
    });
}

// ── Data fetch helpers ────────────────────────────────────────────────────────

async function getTeams() {
    const snapshot = await get(ref(db, COLLECTIONS.TEAMS));
    return snapshot.val() || {};
}

async function getAllMatches() {
    const snapshot = await get(ref(db, COLLECTIONS.MATCHES));
    return Object.values(snapshot.val() || {});
}

// ── League table recalculation ────────────────────────────────────────────────

/**
 * Recompute the league table from all completed league matches and
 * write it back to Firebase.  Also determines the current top-8.
 */
async function updateLeagueTable() {
    const teams       = await getTeams();
    const allMatches  = await getAllMatches();
    const league      = allMatches.filter((m) => m.matchType === 'league');
    const table       = Object.values(teams).map((t) => createStatObj(t.id, t.name));
    const statsMap    = Object.fromEntries(table.map((e) => [e.id, e]));

    league.forEach((match) => {
        if (match.status !== 'completed' || match.score1 === null || match.score2 === null) return;

        const home   = statsMap[match.team1Id];
        const away   = statsMap[match.team2Id];
        const score1 = Number(match.score1);
        const score2 = Number(match.score2);

        home.P += 1; away.P += 1;
        home.GF += score1; home.GA += score2;
        away.GF += score2; away.GA += score1;

        if (score1 > score2) {
            home.W += 1; away.L += 1; home.Pts += 3;
        } else if (score2 > score1) {
            away.W += 1; home.L += 1; away.Pts += 3;
        } else {
            home.D += 1; away.D += 1; home.Pts += 1; away.Pts += 1;
        }
    });

    table.forEach((t) => { t.GD = t.GF - t.GA; });

    const sorted = sortLeagueTable(table);
    const top8   = sorted.slice(0, 8).map((t) => t.id);

    await update(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`), {
        leagueTable: sorted,
        top8,
        updatedAt: new Date().toISOString()
    });

    return { leagueTable: sorted, top8 };
}

// ── Knockout stage ────────────────────────────────────────────────────────────

/**
 * Map a round name + slot number to the Firebase match key.
 * slot is 1-based.
 */
function getMatchKeyForRound(round, slot) {
    if (round === 'Quarter Finals') return `qf-${slot}`;
    if (round === 'Semi Finals')    return `sf-${slot}`;
    if (round === 'Final')          return 'final-1';
    return `${round.toLowerCase().replace(/\s+/g, '-')}-${slot}`;
}

/**
 * Generate all knockout matches (QF × 4, SF × 2, Final × 1) from the top-8.
 *
 * FIXED pairing order (spec: 1v8, 2v7, 3v6, 4v5):
 *   QF-1: 1st vs 8th   → winner → SF-1 slot 0
 *   QF-2: 2nd vs 7th   → winner → SF-1 slot 1
 *   QF-3: 3rd vs 6th   → winner → SF-2 slot 0
 *   QF-4: 4th vs 5th   → winner → SF-2 slot 1
 *
 * NOTE: In the original code the pairs were [0,7],[3,4],[1,6],[2,5]
 *   which gave wrong bracket progression. Now fixed to [0,7],[1,6],[2,5],[3,4].
 */
async function startKnockoutStage() {
    const tSnap      = await get(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`));
    const tournament = tSnap.val();
    if (!tournament) throw new Error('Tournament not found.');

    const allMatches        = await getAllMatches();
    const leagueMatches     = allMatches.filter((m) => m.matchType === 'league');
    const completedLeague   = leagueMatches.filter((m) => m.status === 'completed').length;

    if (completedLeague < leagueMatches.length) {
        throw new Error('All 190 league matches must be completed before starting the knockout stage.');
    }

    // Idempotent: if QFs already exist, do nothing
    const existingQF = allMatches.filter((m) => m.matchType === 'knockout' && m.round === 'Quarter Finals');
    if (existingQF.length) return { success: true };

    const leagueTable = tournament.leagueTable || (await updateLeagueTable()).leagueTable;
    if (!leagueTable || leagueTable.length < 8) throw new Error('Unable to determine top 8 teams.');

    const qualified = leagueTable.slice(0, 8); // positions 0-7 (1st–8th)

    // FIXED: correct Premier League-style QF seeding
    // 1v8, 2v7, 3v6, 4v5
    const qfPairs = [
        [qualified[0], qualified[7]],  // QF-1: 1st vs 8th  → SF-1
        [qualified[1], qualified[6]],  // QF-2: 2nd vs 7th  → SF-1
        [qualified[2], qualified[5]],  // QF-3: 3rd vs 6th  → SF-2
        [qualified[3], qualified[4]]   // QF-4: 4th vs 5th  → SF-2
    ];

    const now     = new Date().toISOString();
    const updates = {};

    // Quarter-finals
    qfPairs.forEach((pair, index) => {
        const matchId     = `qf-${index + 1}`;
        const sfSlot      = index < 2 ? 1 : 2;          // QF 1,2 → SF-1 | QF 3,4 → SF-2
        const sfTeamIndex = index % 2;                    // 0 = team1, 1 = team2

        updates[`${COLLECTIONS.MATCHES}/${matchId}`] = {
            id:            matchId,
            round:         'Quarter Finals',
            matchType:     'knockout',
            matchNumber:   index + 1,
            team1Id:       pair[0].id,
            team1Name:     pair[0].name,
            team1Logo:     pair[0].logo || `assets/logos/${pair[0].id}.png`,
            team2Id:       pair[1].id,
            team2Name:     pair[1].name,
            team2Logo:     pair[1].logo || `assets/logos/${pair[1].id}.png`,
            score1:        null,
            score2:        null,
            // For penalty shoot-outs: store the penalty winner separately
            penaltyWinnerId:   null,
            penaltyWinnerName: null,
            winnerId:      null,
            winnerName:    null,
            status:        'pending',
            nextRound:     'Semi Finals',
            nextMatchSlot: sfSlot,
            nextSlotIndex: sfTeamIndex,
            createdAt:     now,
            updatedAt:     now
        };
    });

    // Semi-finals (placeholder – teams filled by QF results)
    for (let index = 1; index <= 2; index += 1) {
        const matchId = `sf-${index}`;
        updates[`${COLLECTIONS.MATCHES}/${matchId}`] = {
            id:            matchId,
            round:         'Semi Finals',
            matchType:     'knockout',
            matchNumber:   index,
            team1Id:       null, team1Name: null, team1Logo: null,
            team2Id:       null, team2Name: null, team2Logo: null,
            score1:        null, score2: null,
            penaltyWinnerId:   null,
            penaltyWinnerName: null,
            winnerId:      null, winnerName: null,
            status:        'pending',
            nextRound:     'Final',
            nextMatchSlot: 1,
            nextSlotIndex: index - 1,   // SF-1 winner → final team1, SF-2 → team2
            createdAt:     now,
            updatedAt:     now
        };
    }

    // Final (placeholder)
    updates[`${COLLECTIONS.MATCHES}/final-1`] = {
        id:            'final-1',
        round:         'Final',
        matchType:     'knockout',
        matchNumber:   1,
        team1Id:       null, team1Name: null, team1Logo: null,
        team2Id:       null, team2Name: null, team2Logo: null,
        score1:        null, score2: null,
        penaltyWinnerId:   null,
        penaltyWinnerName: null,
        winnerId:      null, winnerName: null,
        status:        'pending',
        nextRound:     null,
        nextMatchSlot: null,
        nextSlotIndex: null,
        createdAt:     now,
        updatedAt:     now
    };

    // Update tournament status
    updates[`${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}/status`]        = 'knockout';
    updates[`${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}/currentStage`]  = 'knockout';
    updates[`${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}/knockoutStage`] = 'Quarter Finals';
    updates[`${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}/updatedAt`]     = now;
    updates[`${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}/top8`]          = qualified.map((t) => t.id);

    await update(ref(db), updates);
    return { success: true };
}

/**
 * Copy the winning team into the next knockout match slot.
 */
async function advanceTeamToNextRound(nextRound, nextMatchSlot, nextSlotIndex, winner) {
    const nextMatchId  = getMatchKeyForRound(nextRound, nextMatchSlot);
    const nextMatchRef = ref(db, `${COLLECTIONS.MATCHES}/${nextMatchId}`);
    const payload      = {};

    if (nextSlotIndex === 0) {
        payload.team1Id   = winner.id;
        payload.team1Name = winner.name;
        payload.team1Logo = winner.logo || `assets/logos/${winner.id}.png`;
    } else {
        payload.team2Id   = winner.id;
        payload.team2Name = winner.name;
        payload.team2Logo = winner.logo || `assets/logos/${winner.id}.png`;
    }

    payload.updatedAt = new Date().toISOString();
    await update(nextMatchRef, payload);
}

// ── Result submission ─────────────────────────────────────────────────────────

/**
 * Submit (or update) a match result.
 *
 * For LEAGUE matches: draws are fine (1 pt each).
 * For KNOCKOUT matches: if score1 === score2 the admin must also supply
 *   penaltyWinnerId / penaltyWinnerName (the team that won on penalties).
 *
 * CHANGE: Removed the hard "no draws in knockout" throw.  Instead the
 *   caller passes penalty info when scores are level after ET.
 */
async function submitMatchResult(matchId, score1, score2, penaltyWinnerId = null, penaltyWinnerName = null) {
    const matchRef  = ref(db, `${COLLECTIONS.MATCHES}/${matchId}`);
    const snapshot  = await get(matchRef);
    if (!snapshot.exists()) throw new Error('Match not found');
    const match     = snapshot.val();
    const now       = new Date().toISOString();

    // ── League match ──────────────────────────────────────────────────────────
    if (match.matchType === 'league') {
        const s1       = formatScore(score1);
        const s2       = formatScore(score2);
        const winnerId   = s1 > s2 ? match.team1Id   : s2 > s1 ? match.team2Id   : null;
        const winnerName = s1 > s2 ? match.team1Name : s2 > s1 ? match.team2Name : null;

        await update(matchRef, { score1: s1, score2: s2, winnerId, winnerName, status: 'completed', updatedAt: now });
        await updateLeagueTable();

        // Auto-start knockout once all league matches are done
        const allMatches     = await getAllMatches();
        const league         = allMatches.filter((m) => m.matchType === 'league');
        const completedCount = league.filter((m) => m.status === 'completed').length;
        if (completedCount === league.length) {
            await startKnockoutStage();
        }

        return { success: true, winnerId };
    }

    // ── Knockout match ────────────────────────────────────────────────────────
    const s1 = formatScore(score1);
    const s2 = formatScore(score2);
    let winnerId, winnerName;

    if (s1 === s2) {
        // Scores level after Extra Time → need penalty winner
        if (!penaltyWinnerId || !penaltyWinnerName) {
            throw new Error(
                'Knockout match is drawn after Extra Time. Please supply the penalty shoot-out winner.'
            );
        }
        winnerId   = penaltyWinnerId;
        winnerName = penaltyWinnerName;
    } else {
        winnerId   = s1 > s2 ? match.team1Id   : match.team2Id;
        winnerName = s1 > s2 ? match.team1Name : match.team2Name;
    }

    await update(matchRef, {
        score1: s1,
        score2: s2,
        penaltyWinnerId:   s1 === s2 ? penaltyWinnerId   : null,
        penaltyWinnerName: s1 === s2 ? penaltyWinnerName : null,
        winnerId,
        winnerName,
        status:    'completed',
        updatedAt: now
    });

    if (match.nextRound) {
        // Advance winner to next round
        await advanceTeamToNextRound(match.nextRound, match.nextMatchSlot, match.nextSlotIndex, {
            id:   winnerId,
            name: winnerName,
            logo: winnerId === match.team1Id ? match.team1Logo : match.team2Logo
        });
    } else {
        // This was the Final – set champion
        await update(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`), {
            champion:      winnerName,
            championId:    winnerId,
            status:        'completed',
            currentStage:  'completed',
            updatedAt:     now
        });
    }

    return { success: true, winnerId };
}

// ── Clear / undo a result ─────────────────────────────────────────────────────

async function clearMatchResult(matchId) {
    const matchRef  = ref(db, `${COLLECTIONS.MATCHES}/${matchId}`);
    const snapshot  = await get(matchRef);
    if (!snapshot.exists()) throw new Error('Match not found');
    const match     = snapshot.val();
    const now       = new Date().toISOString();

    await update(matchRef, {
        score1: null, score2: null,
        penaltyWinnerId: null, penaltyWinnerName: null,
        winnerId: null, winnerName: null,
        status: 'pending', updatedAt: now
    });

    if (match.matchType === 'league') {
        await updateLeagueTable();
        // If we were in knockout, revert to league stage
        const tSnap = await get(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`));
        const t     = tSnap.val();
        if (t && t.status === 'knockout') {
            await update(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`), {
                status: 'league', currentStage: 'league', champion: null, updatedAt: now
            });
        }
    } else {
        // Clear the team that was advanced from this match
        if (match.nextRound) {
            const nextMatchId  = getMatchKeyForRound(match.nextRound, match.nextMatchSlot);
            const nextMatchRef = ref(db, `${COLLECTIONS.MATCHES}/${nextMatchId}`);
            const nextSnap     = await get(nextMatchRef);
            if (nextSnap.exists()) {
                const nextMatch = nextSnap.val();
                const fieldId   = match.nextSlotIndex === 0 ? 'team1Id'   : 'team2Id';
                const fieldName = match.nextSlotIndex === 0 ? 'team1Name' : 'team2Name';
                const fieldLogo = match.nextSlotIndex === 0 ? 'team1Logo' : 'team2Logo';
                if (nextMatch[fieldId] === match.winnerId) {
                    await update(nextMatchRef, {
                        [fieldId]: null, [fieldName]: null, [fieldLogo]: null, updatedAt: now
                    });
                }
            }
        } else {
            // Was the Final – clear champion
            const tSnap = await get(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`));
            const t     = tSnap.val();
            if (t?.champion === match.winnerName) {
                await update(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`), {
                    champion: null, championId: null, status: 'knockout',
                    currentStage: 'knockout', updatedAt: now
                });
            }
        }
    }

    return { success: true };
}

// ── Full tournament reset ─────────────────────────────────────────────────────

async function resetTournament() {
    await remove(ref(db, COLLECTIONS.MATCHES));
    await remove(ref(db, COLLECTIONS.TEAMS));
    await set(ref(db, `${COLLECTIONS.TOURNAMENT}/${TOURNAMENT_ID}`), {
        name:          'Al-Khayr EFB Tournament',
        teamsCount:    0,
        champion:      null,
        championId:    null,
        status:        'reset',
        currentStage:  'setup',
        knockoutStage: null,
        countdownDate: new Date().toISOString(),
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        teamList:      [],
        top8:          []
    });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function loginAdmin(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
}

async function logoutAdmin() {
    return signOut(auth);
}

function getCurrentUser() {
    return new Promise((resolve) => onAuthStateChanged(auth, (user) => resolve(user)));
}

// ── Exports ───────────────────────────────────────────────────────────────────

export {
    db,
    auth,
    initializeTournament,
    onMatchesUpdate,
    onTournamentUpdate,
    onTeamsUpdate,
    submitMatchResult,
    clearMatchResult,
    startKnockoutStage,
    updateLeagueTable,
    resetTournament,
    loginAdmin,
    logoutAdmin,
    getCurrentUser,
    onAuthStateChanged
};
