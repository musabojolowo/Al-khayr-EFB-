import { onMatchesUpdate, onTournamentUpdate } from './firebase.js';

const TEAM_COUNT = 32;

let state = {
    teams: [],
    matches: {},
    champion: null,
    tournament: null,
    unsubscribes: []
};

function initApp() {
    setupRealtimeListeners();
    setupCountdown();
}

function injectResetButton() {
    // Reset button is only for admin, not public website
    return;
}

function setupRealtimeListeners() {
    // Listen to tournament updates
    const unsubTournament = onTournamentUpdate((tournament) => {
        state.tournament = tournament;
        state.champion = tournament.champion || null;
        renderStats();
        renderChampion();
    });

    // Listen to matches updates
    const unsubMatches = onMatchesUpdate((matches) => {
        state.matches = matches;
        renderBracket();
        renderSchedule();
        renderStats();
        renderChampion();
    });

    state.unsubscribes = [unsubTournament, unsubMatches];
}

function setupCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;

    function updateCountdown() {
        if (!state.tournament || !state.tournament.countdownDate) {
            countdownElement.textContent = 'Loading Countdown...';
            return;
        }

        const countdownDate = new Date(state.tournament.countdownDate).getTime();
        const now = new Date().getTime();
        const distance = countdownDate - now;

        if (distance < 0) {
            countdownElement.textContent = 'Tournament Started!';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        countdownElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function renderTournament() {
    renderBracket();
    renderStats();
    renderSchedule();
}

function renderBracket() {
    const roundMap = {
        'Round of 32': document.getElementById('round32'),
        'Round of 16': document.getElementById('round16'),
        'Quarter Finals': document.getElementById('quarter'),
        'Semi Finals': document.getElementById('semi'),
        Final: document.getElementById('final')
    };

    Object.values(roundMap).forEach((container) => {
        if (container) {
            container.innerHTML = '';
        }
    });

    if (!Object.keys(state.matches).length) {
        Object.values(roundMap).forEach((container) => {
            if (container) {
                container.innerHTML = '<p class="empty-state">Tournament not started yet.</p>';
            }
        });
        return;
    }

    const roundOrder = ['Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Final'];

    roundOrder.forEach((roundName) => {
        const container = roundMap[roundName];
        if (!container || !state.matches[roundName]) {
            return;
        }

        state.matches[roundName].forEach((match) => {
            const matchCard = document.createElement('div');
            matchCard.className = 'match fade-in';

            const teamOne = createTeamElement(match, 'team1');
            const teamTwo = createTeamElement(match, 'team2');

            matchCard.appendChild(teamOne);
            matchCard.appendChild(teamTwo);

            if (match.status === 'completed') {
                const resultLine = document.createElement('div');
                resultLine.className = 'match-result';
                resultLine.textContent = `${match.score1} - ${match.score2}`;
                matchCard.appendChild(resultLine);
            }

            container.appendChild(matchCard);
        });
    });
}

function createTeamElement(match, teamKey) {
    const team = document.createElement('div');
    team.className = 'team';

    const teamName = match[teamKey];

    if (!teamName) {
        team.textContent = 'TBD';
        team.classList.add('pending');
        return team;
    }

    team.textContent = teamName;

    if (match.winner === teamName) {
        team.classList.add('winner');
    }

    return team;
}

function renderStats() {
    const teamCount = document.getElementById('teamCount');
    const matchCount = document.getElementById('matchCount');
    const remainingTeams = document.getElementById('remainingTeams');

    if (!teamCount || !matchCount || !remainingTeams) {
        return;
    }

    const allMatches = Object.values(state.matches).flat();
    const playedMatches = allMatches.filter((match) => match.status === 'completed').length;
    const currentTeams = state.tournament?.teamsCount || 0;
    const remaining = Math.max(0, currentTeams - playedMatches);
    const currentRound = getCurrentRound();

    teamCount.textContent = currentTeams;
    matchCount.textContent = playedMatches;
    matchCount.parentElement.querySelector('p').textContent = 'Matches Played';
    remainingTeams.textContent = remaining;

    let roundStat = document.getElementById('currentRound');
    if (!roundStat) {
        const statsContainer = document.querySelector('.stats');
        if (!statsContainer) {
            return;
        }

        const statCard = document.createElement('div');
        statCard.className = 'stat';
        statCard.innerHTML = `
            <h3 id="currentRound">${currentRound}</h3>
            <p>Current Round</p>
        `;
        statsContainer.appendChild(statCard);
    } else {
        roundStat.textContent = currentRound;
    }
}

function getCurrentRound() {
    if (!state.tournament) {
        return 'Loading...';
    }

    if (state.champion) {
        return 'Completed';
    }

    const roundOrder = ['Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Final'];
    for (const roundName of roundOrder) {
        const roundMatches = state.matches[roundName] || [];
        const hasPendingMatches = roundMatches.some((match) => match.status === 'pending' && match.team1 && match.team2);
        if (hasPendingMatches) {
            return roundName;
        }
    }

    return 'Final';
}

function renderSchedule() {
    const tableBody = document.getElementById('scheduleTable');
    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = '';

    const allMatches = Object.values(state.matches).flat();
    if (!allMatches.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="4">Tournament schedule not available yet.</td>';
        tableBody.appendChild(emptyRow);
        return;
    }

    const sortedMatches = allMatches.sort((a, b) => {
        const roundOrder = ['Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Final'];
        const roundDiff = roundOrder.indexOf(a.round) - roundOrder.indexOf(b.round);
        return roundDiff !== 0 ? roundDiff : (a.matchNumber - b.matchNumber);
    });

    sortedMatches.forEach((match) => {
        const row = document.createElement('tr');
        const matchLabel = `${match.round} - Match ${match.matchNumber}`;
        const date = getMatchDate(match.round, match.matchNumber);
        const time = getMatchTime(match.round);
        const status = match.status === 'completed' ? 'Played' : 'Pending';

        row.innerHTML = `
            <td>${matchLabel}</td>
            <td>${date}</td>
            <td>${time}</td>
            <td>${status}</td>
        `;
        tableBody.appendChild(row);
    });
}

function getMatchDate(roundName, matchNumber) {
    const base = new Date();
    const roundOffset = {
        'Round of 32': 0,
        'Round of 16': 1,
        'Quarter Finals': 2,
        'Semi Finals': 3,
        Final: 4
    }[roundName] ?? 0;

    const date = new Date(base);
    date.setDate(base.getDate() + roundOffset + Math.floor((matchNumber - 1) / 2));
    return date.toLocaleDateString();
}

function getMatchTime(roundName) {
    const roundTimes = {
        'Round of 32': '6:00 PM',
        'Round of 16': '7:00 PM',
        'Quarter Finals': '8:00 PM',
        'Semi Finals': '9:00 PM',
        Final: '10:00 PM'
    };

    return roundTimes[roundName] || 'TBD';
}

function renderChampion() {
    const championElement = document.getElementById('champion');
    if (!championElement) {
        return;
    }

    championElement.textContent = state.champion || 'No Champion Yet';
}

window.addEventListener('beforeunload', () => {
    state.unsubscribes.forEach((unsubscribe) => unsubscribe());
});

document.addEventListener('DOMContentLoaded', initApp);
