import {
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
} from './firebase.js';

// Admin Dashboard Logic
// Handles authentication, tournament management, and real-time updates

let adminState = {
    user: null,
    matches: {},
    tournament: null,
    unsubscribes: [],
    isLoading: false
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', initAdmin);

async function initAdmin() {
    setupAdminEventListeners();

    // Check authentication status
    const user = await getCurrentUser();
    if (user) {
        adminState.user = user;
        showAdminDashboard();
        setupAdminRealtimeListeners();
    } else {
        showLoginPage();
    }

    // Listen for auth changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            adminState.user = user;
            showAdminDashboard();
            if (!adminState.unsubscribes.length) {
                setupAdminRealtimeListeners();
            }
        } else {
            adminState.user = null;
            showLoginPage();
            cleanupRealtimeListeners();
        }
    });
}

function showLoginPage() {
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('adminContent').classList.remove('active');
}

function showAdminDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('adminContent').classList.add('active');
    document.getElementById('adminEmail').textContent = adminState.user.email;
}

async function handleAdminLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    errorDiv.style.display = 'none';

    if (!email || !password) {
        showLoginError('Please enter email and password.');
        return;
    }

    try {
        adminState.isLoading = true;
        await loginAdmin(email, password);
        // Auth state change will handle showing dashboard
    } catch (error) {
        console.error('login error', error);
        showLoginError(getErrorMessage(error));
        adminState.isLoading = false;
    }
}

async function handleAdminLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await logoutAdmin();
            cleanupRealtimeListeners();
            showLoginPage();
            clearLoginForm();
        } catch (error) {
            alert('Logout failed: ' + error.message);
        }
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function clearLoginForm() {
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
}

function setupAdminRealtimeListeners() {
    // Listen to tournament updates
    const unsubTournament = onTournamentUpdate((tournament) => {
        adminState.tournament = tournament;
        renderAdminStats();
        renderAdminChampion();
        renderAdminMatchOptions();
    });

    // Listen to matches updates
    const unsubMatches = onMatchesUpdate((matches) => {
        adminState.matches = matches;
        renderAdminBracket();
        renderAdminSchedule();
        renderAdminStats();
        renderAdminChampion();
        renderAdminMatchOptions();
    });

    adminState.unsubscribes = [unsubTournament, unsubMatches];
}

function cleanupRealtimeListeners() {
    adminState.unsubscribes.forEach((unsubscribe) => unsubscribe());
    adminState.unsubscribes = [];
}

async function handleGenerateTournament() {
    const textarea = document.getElementById('teamInput');
    const countdownInput = document.getElementById('countdownDateTime');

    const rawTeams = textarea.value
        .split(/\n|\r\n/)
        .map((team) => team.trim())
        .filter(Boolean);

    if (rawTeams.length !== 32) {
        alert(`Please enter exactly 32 team names. Found ${rawTeams.length}.`);
        return;
    }

    if (!countdownInput.value) {
        alert('Please set a countdown date and time.');
        return;
    }

    if (!confirm('This will create a new tournament. Proceed?')) {
        return;
    }

    try {
        // Reset tournament first
        await resetTournament();

        // Initialize tournament with teams and countdown
        const countdownDate = new Date(countdownInput.value);
        await initializeTournament(rawTeams, countdownDate);

        showSuccessMessage('Tournament generated successfully!');
        textarea.value = '';
        countdownInput.value = '';
    } catch (error) {
        console.error('generate tournament error', error);
        alert('Error generating tournament: ' + error.message);
    }
}

function setupAdminEventListeners() {
    const loginButton = document.getElementById('loginButton');
    const logoutButton = document.getElementById('logoutButton');
    const generateButton = document.getElementById('generateTournamentButton');
    const resetButton = document.getElementById('resetTournamentButton');
    const submitButton = document.getElementById('submitResultButton');

    if (loginButton) {
        loginButton.addEventListener('click', handleAdminLogin);
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', handleAdminLogout);
    }
    if (generateButton) {
        generateButton.addEventListener('click', handleGenerateTournament);
    }
    if (resetButton) {
        resetButton.addEventListener('click', handleResetTournament);
    }
    if (submitButton) {
        submitButton.addEventListener('click', handleSubmitResult);
    }
}

// expose functions globally for compatibility if needed
window.handleAdminLogin = handleAdminLogin;
window.handleAdminLogout = handleAdminLogout;
window.handleGenerateTournament = handleGenerateTournament;
window.handleResetTournament = handleResetTournament;
window.handleSubmitResult = handleSubmitResult;

async function handleResetTournament() {
    if (!confirm('Are you sure? This will delete all tournament data.')) {
        return;
    }

    try {
        await resetTournament();
        showSuccessMessage('Tournament reset successfully!');
        document.getElementById('teamInput').value = '';
    } catch (error) {
        alert('Error resetting tournament: ' + error.message);
    }
}

async function handleSubmitResult() {
    const select = document.getElementById('adminMatchSelect');
    const score1 = Number(document.getElementById('adminScore1').value);
    const score2 = Number(document.getElementById('adminScore2').value);

    if (!select.value) {
        alert('Please select a match.');
        return;
    }

    if (Number.isNaN(score1) || Number.isNaN(score2)) {
        alert('Please enter both scores.');
        return;
    }

    if (score1 === score2) {
        alert('Draw detected. Please specify different scores.');
        return;
    }

    try {
        await submitMatchResult(select.value, score1, score2);
        showSuccessMessage('Result submitted successfully!');
        document.getElementById('adminScore1').value = '';
        document.getElementById('adminScore2').value = '';
        select.value = '';
    } catch (error) {
        console.error('submit result error', error);
        alert('Error submitting result: ' + error.message);
    }
}

function renderAdminBracket() {
    const roundMap = {
        'Round of 32': document.getElementById('adminRound32'),
        'Round of 16': document.getElementById('adminRound16'),
        'Quarter Finals': document.getElementById('adminQuarter'),
        'Semi Finals': document.getElementById('adminSemi'),
        Final: document.getElementById('adminFinal')
    };

    Object.values(roundMap).forEach((container) => {
        if (container) {
            container.innerHTML = '';
        }
    });

    if (!Object.keys(adminState.matches).length) {
        Object.values(roundMap).forEach((container) => {
            if (container) {
                container.innerHTML = '<p class="empty-state">No tournament started yet.</p>';
            }
        });
        return;
    }

    const roundOrder = ['Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Final'];

    roundOrder.forEach((roundName) => {
        const container = roundMap[roundName];
        if (!container || !adminState.matches[roundName]) {
            return;
        }

        adminState.matches[roundName].forEach((match) => {
            const matchCard = document.createElement('div');
            matchCard.className = 'match fade-in';

            const team1Div = document.createElement('div');
            team1Div.className = 'team';
            team1Div.textContent = match.team1 || 'TBD';
            if (match.winner === match.team1) {
                team1Div.classList.add('winner');
            }

            const team2Div = document.createElement('div');
            team2Div.className = 'team';
            team2Div.textContent = match.team2 || 'TBD';
            if (match.winner === match.team2) {
                team2Div.classList.add('winner');
            }

            matchCard.appendChild(team1Div);
            matchCard.appendChild(team2Div);

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

function renderAdminSchedule() {
    const tableBody = document.getElementById('adminScheduleTable');
    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = '';

    const allMatches = Object.values(adminState.matches).flat();
    if (!allMatches.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="5">Tournament not started yet.</td>';
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
        const scoreText = match.status === 'completed' 
            ? `${match.score1} - ${match.score2}` 
            : '-';
        
        row.innerHTML = `
            <td>${match.round} #${match.matchNumber}</td>
            <td>${match.team1 || 'TBD'}</td>
            <td>${match.team2 || 'TBD'}</td>
            <td>${scoreText}</td>
            <td>${match.status === 'completed' ? 'Completed' : 'Pending'}</td>
        `;
        tableBody.appendChild(row);
    });
}

function renderAdminStats() {
    const teamCount = document.getElementById('adminTeamCount');
    const matchCount = document.getElementById('adminMatchCount');
    const remainingTeams = document.getElementById('adminRemainingTeams');
    const currentRound = document.getElementById('adminCurrentRound');

    if (!teamCount || !matchCount || !remainingTeams || !currentRound) {
        return;
    }

    const allMatches = Object.values(adminState.matches).flat();
    const playedMatches = allMatches.filter((match) => match.status === 'completed').length;
    const currentTeams = adminState.tournament?.teamsCount || 0;
    const remaining = Math.max(0, currentTeams - playedMatches);
    const round = getCurrentAdminRound();

    teamCount.textContent = currentTeams;
    matchCount.textContent = playedMatches;
    remainingTeams.textContent = remaining;
    currentRound.textContent = round;
}

function getCurrentAdminRound() {
    if (!adminState.tournament) {
        return 'Loading...';
    }

    if (adminState.tournament.champion) {
        return 'Completed';
    }

    const roundOrder = ['Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Final'];
    for (const roundName of roundOrder) {
        const roundMatches = adminState.matches[roundName] || [];
        const hasPendingMatches = roundMatches.some(
            (match) => match.status === 'pending' && match.team1 && match.team2
        );
        if (hasPendingMatches) {
            return roundName;
        }
    }

    return 'Not Started';
}

function renderAdminChampion() {
    const championElement = document.getElementById('adminChampion');
    if (!championElement) {
        return;
    }

    championElement.textContent = adminState.tournament?.champion || 'No Champion Yet';
}

function renderAdminMatchOptions() {
    const select = document.getElementById('adminMatchSelect');
    if (!select) {
        return;
    }

    select.innerHTML = '<option value="">Select Match...</option>';

    const allMatches = Object.values(adminState.matches).flat();
    const pendingMatches = allMatches.filter(
        (match) => match.status === 'pending' && match.team1 && match.team2
    );

    pendingMatches.forEach((match) => {
        const option = document.createElement('option');
        option.value = match.id;
        option.textContent = `${match.round} - ${match.team1} vs ${match.team2}`;
        select.appendChild(option);
    });
}

function showSuccessMessage(message) {
    const successDiv = document.getElementById('successMessage');
    const successText = document.getElementById('successText');

    successText.textContent = message;
    successDiv.classList.add('show');

    setTimeout(() => {
        successDiv.classList.remove('show');
    }, 3000);
}

function getErrorMessage(error) {
    if (error.code === 'auth/invalid-email') {
        return 'Invalid email address.';
    } else if (error.code === 'auth/user-not-found') {
        return 'No account found with this email.';
    } else if (error.code === 'auth/wrong-password') {
        return 'Incorrect password.';
    } else if (error.code === 'auth/too-many-requests') {
        return 'Too many failed login attempts. Try again later.';
    } else {
        return error.message || 'Login failed. Please try again.';
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    cleanupRealtimeListeners();
});
