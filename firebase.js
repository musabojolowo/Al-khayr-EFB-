// Firebase modular SDK (ES module)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
    getDatabase,
    ref,
    set,
    update,
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

const firebaseConfig = {
    apiKey: "AIzaSyAKH9xm9sZlgwv10ZyTH1JTrC-a5TYKDzg",
    authDomain: "al-khayr-efb-tournament.firebaseapp.com",
    projectId: "al-khayr-efb-tournament",
    storageBucket: "al-khayr-efb-tournament.appspot.com",
    messagingSenderId: "866940309952",
    appId: "1:866940309952:web:6598381e9e410857893825"
};

// Initialize
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const COLLECTIONS = {
    TOURNAMENT: 'tournament',
    MATCHES: 'matches'
};

// Utility: generate match objects for 32-team knockout
function generateMatches(teams) {
    const matches = [];
    const matchId = (round, number) => `${round}-${number}`;

    for (let i = 0; i < 16; i++) {
        matches.push({
            id: matchId('r32', i + 1),
            round: 'Round of 32',
            roundNumber: 1,
            matchNumber: i + 1,
            team1: teams[i * 2] || null,
            team2: teams[i * 2 + 1] || null,
            score1: null,
            score2: null,
            winner: null,
            status: 'pending',
            nextRound: 'Round of 16',
            nextMatchSlot: Math.floor(i / 2) + 1,
            nextSlotIndex: i % 2
        });
    }

    for (let i = 0; i < 8; i++) {
        matches.push({
            id: matchId('r16', i + 1),
            round: 'Round of 16',
            roundNumber: 2,
            matchNumber: i + 1,
            team1: null,
            team2: null,
            score1: null,
            score2: null,
            winner: null,
            status: 'pending',
            nextRound: 'Quarter Finals',
            nextMatchSlot: Math.floor(i / 2) + 1,
            nextSlotIndex: i % 2
        });
    }

    for (let i = 0; i < 4; i++) {
        matches.push({
            id: matchId('qf', i + 1),
            round: 'Quarter Finals',
            roundNumber: 3,
            matchNumber: i + 1,
            team1: null,
            team2: null,
            score1: null,
            score2: null,
            winner: null,
            status: 'pending',
            nextRound: 'Semi Finals',
            nextMatchSlot: Math.floor(i / 2) + 1,
            nextSlotIndex: i % 2
        });
    }

    for (let i = 0; i < 2; i++) {
        matches.push({
            id: matchId('sf', i + 1),
            round: 'Semi Finals',
            roundNumber: 4,
            matchNumber: i + 1,
            team1: null,
            team2: null,
            score1: null,
            score2: null,
            winner: null,
            status: 'pending',
            nextRound: 'Final',
            nextMatchSlot: 1,
            nextSlotIndex: i
        });
    }

    matches.push({
        id: matchId('final', 1),
        round: 'Final',
        roundNumber: 5,
        matchNumber: 1,
        team1: null,
        team2: null,
        score1: null,
        score2: null,
        winner: null,
        status: 'pending',
        nextRound: null,
        nextMatchSlot: null,
        nextSlotIndex: null
    });

    return matches;
}

// Initialize tournament document and matches
async function initializeTournament(teams, countdownDate = null) {
    const tournamentId = 'main-2026';
    const now = new Date().toISOString();
    const tournamentRef = ref(db, `${COLLECTIONS.TOURNAMENT}/${tournamentId}`);

    await set(tournamentRef, {
        name: 'Al-Khayr EFB Tournament',
        teamsCount: teams.length,
        champion: null,
        status: 'in-progress',
        countdownDate: countdownDate ? countdownDate.toISOString() : new Date().toISOString(),
        createdAt: now,
        updatedAt: now
    });

    const matches = generateMatches(teams);
    const updates = {};

    matches.forEach((match) => {
        updates[`${COLLECTIONS.MATCHES}/${match.id}`] = {
            ...match,
            createdAt: now,
            updatedAt: now
        };
    });

    await update(ref(db), updates);
    return { success: true, tournamentId };
}

// Subscribe to matches in real-time
function onMatchesUpdate(callback) {
    const matchesRef = ref(db, COLLECTIONS.MATCHES);
    return onValue(matchesRef, (snapshot) => {
        const data = snapshot.val() || {};
        const allMatches = Object.values(data);

        allMatches.sort((a, b) => {
            if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
            return a.matchNumber - b.matchNumber;
        });

        const matches = {};
        allMatches.forEach((match) => {
            if (!matches[match.round]) matches[match.round] = [];
            matches[match.round].push(match);
        });

        callback(matches);
    });
}

// Subscribe to tournament doc in real-time
function onTournamentUpdate(callback) {
    const tournamentRef = ref(db, `${COLLECTIONS.TOURNAMENT}/main-2026`);
    return onValue(tournamentRef, (snapshot) => {
        const data = snapshot.val();
        if (data) callback(data);
    });
}

function getMatchKeyForRound(round, slot) {
    if (round === 'Round of 32') return `r32-${slot}`;
    if (round === 'Round of 16') return `r16-${slot}`;
    if (round === 'Quarter Finals') return `qf-${slot}`;
    if (round === 'Semi Finals') return `sf-${slot}`;
    if (round === 'Final') return `final-1`;
    throw new Error(`Invalid round: ${round}`);
}

// Submit match result and advance winner
async function submitMatchResult(matchId, score1, score2) {
    if (score1 === score2) throw new Error('Draws not allowed');

    const matchRef = ref(db, `${COLLECTIONS.MATCHES}/${matchId}`);
    const snapshot = await get(matchRef);
    if (!snapshot.exists()) throw new Error('Match not found');

    const match = snapshot.val();
    const winner = score1 > score2 ? match.team1 : match.team2;
    const now = new Date().toISOString();

    await update(matchRef, {
        score1,
        score2,
        winner,
        status: 'completed',
        updatedAt: now
    });

    if (match.nextRound) {
        await advanceTeamToNextRound(match.nextRound, match.nextMatchSlot, match.nextSlotIndex, winner);
    } else {
        await update(ref(db, `${COLLECTIONS.TOURNAMENT}/main-2026`), {
            champion: winner,
            status: 'completed',
            updatedAt: now
        });
    }

    return { success: true, winner };
}

async function advanceTeamToNextRound(nextRound, nextMatchSlot, slotIndex, teamName) {
    const nextMatchId = getMatchKeyForRound(nextRound, nextMatchSlot);
    const nextMatchRef = ref(db, `${COLLECTIONS.MATCHES}/${nextMatchId}`);
    const field = slotIndex === 0 ? 'team1' : 'team2';

    await update(nextMatchRef, {
        [field]: teamName,
        updatedAt: new Date().toISOString()
    });
}

async function resetTournament() {
    await remove(ref(db, COLLECTIONS.MATCHES));
    await update(ref(db, `${COLLECTIONS.TOURNAMENT}/main-2026`), {
        champion: null,
        status: 'reset',
        updatedAt: new Date().toISOString()
    });
}

async function loginAdmin(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
}

async function logoutAdmin() {
    await signOut(auth);
}

function getCurrentUser() {
    return new Promise((resolve) => onAuthStateChanged(auth, (u) => resolve(u)));
}

export {
    db,
    auth,
    initializeTournament,
    onMatchesUpdate,
    onTournamentUpdate,
    submitMatchResult,
    resetTournament,
    loginAdmin,
    logoutAdmin,
    getCurrentUser,
    onAuthStateChanged
};
