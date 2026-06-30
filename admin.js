/**
 * admin.js  –  Tournament Admin Panel
 * Only authenticated admins can reach this functionality.
 * All writes are protected by Firebase Auth (and DB rules).
 */

import {
    initializeTournament,
    onMatchesUpdate,
    onTournamentUpdate,
    submitMatchResult,
    clearMatchResult,
    resetTournament,
    loginAdmin,
    logoutAdmin,
    getCurrentUser,
    onAuthStateChanged,
    startKnockoutStage,
    auth
} from './firebase.js';

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
    user:        null,
    tournament:  null,
    matches:     [],
    unsubscribes: []
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', initAdmin);

async function initAdmin() {
    setupAdminEventListeners();

    // Check existing session
    const user = await getCurrentUser();
    if (user) {
        state.user = user;
        showAdminDashboard();
        setupRealtimeListeners();
    } else {
        showLoginPage();
    }

    // React to auth state changes (login / logout from other tabs)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.user = user;
            showAdminDashboard();
            setupRealtimeListeners();
        } else {
            state.user = null;
            cleanupRealtimeListeners();
            clearLoginForm();
            showLoginPage();
        }
    });
}

// ── Event listeners ───────────────────────────────────────────────────────────
function setupAdminEventListeners() {
    document.getElementById('loginButton')              ?.addEventListener('click', handleAdminLogin);
    document.getElementById('logoutButton')             ?.addEventListener('click', handleAdminLogout);
    document.getElementById('generateTournamentButton') ?.addEventListener('click', handleGenerateTournament);
    document.getElementById('loadDefaultTeamsButton')   ?.addEventListener('click', loadDefaultTeams);
    document.getElementById('resetTournamentButton')    ?.addEventListener('click', handleResetTournament);
    document.getElementById('submitResultButton')       ?.addEventListener('click', handleSubmitResult);
    document.getElementById('clearResultButton')        ?.addEventListener('click', handleClearResult);
    document.getElementById('startKnockoutButton')      ?.addEventListener('click', handleStartKnockoutStage);
    document.getElementById('declareChampionButton')    ?.addEventListener('click', handleDeclareChampion);

    // Show/hide penalty inputs when admin toggles "penalties" checkbox
    document.getElementById('penaltyToggle')?.addEventListener('change', (e) => {
        const penRow = document.getElementById('penaltyRow');
        if (penRow) penRow.style.display = e.target.checked ? 'block' : 'none';
    });

    // Allow pressing Enter in login fields
    document.getElementById('loginPassword')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAdminLogin();
    });
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function showLoginPage() {
    document.getElementById('loginContainer').style.display  = 'flex';
    document.getElementById('adminContent').classList.remove('active');
}

function showAdminDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('adminContent').classList.add('active');
    setEl('adminEmail', state.user?.email || 'Admin');
}

function showLoginError(message) {
    const el = document.getElementById('loginError');
    if (!el) return;
    el.textContent   = message;
    el.style.display = 'block';
}

function clearLoginForm() {
    const emailEl = document.getElementById('loginEmail');
    const passEl  = document.getElementById('loginPassword');
    const errEl   = document.getElementById('loginError');
    if (emailEl) emailEl.value = '';
    if (passEl)  passEl.value  = '';
    if (errEl)  { errEl.style.display = 'none'; errEl.textContent = ''; }
}

// ── Auth handlers ─────────────────────────────────────────────────────────────
async function handleAdminLogin() {
    const email    = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    if (!email || !password) { showLoginError('Please enter email and password.'); return; }
    try {
        await loginAdmin(email, password);
    } catch (err) {
        showLoginError(err.message || 'Login failed.');
    }
}

async function handleAdminLogout() {
    if (!confirm('Are you sure you want to logout?')) return;
    try {
        await logoutAdmin();
        cleanupRealtimeListeners();
        clearLoginForm();
        showLoginPage();
    } catch (err) {
        alert('Logout failed: ' + err.message);
    }
}

// ── Tournament handlers ───────────────────────────────────────────────────────
async function handleGenerateTournament() {
    const raw           = document.getElementById('teamInput')?.value || '';
    const teams         = raw.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    const countdownVal  = document.getElementById('countdownDateTime')?.value;

    if (teams.length !== 20) {
        alert(`Please enter exactly 20 team names. Found ${teams.length}.`); return;
    }
    if (!countdownVal) {
        alert('Please choose a countdown date and time.'); return;
    }
    if (!confirm('This will create a new 20-team league tournament. Any existing data will be overwritten. Continue?')) return;

    try {
        showLoading('Creating tournament…');
        await resetTournament();
        await initializeTournament(teams, new Date(countdownVal));
        showSuccessMessage('✅ Tournament created! 190 fixtures generated.');
        document.getElementById('teamInput').value         = '';
        document.getElementById('countdownDateTime').value = '';
    } catch (err) {
        alert('Error creating tournament: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function handleStartKnockoutStage() {
    if (!confirm('Start the knockout stage with the current top 8 teams?')) return;
    try {
        showLoading('Starting knockout stage…');
        await startKnockoutStage();
        showSuccessMessage('🔥 Knockout stage started! Quarter-finals are ready.');
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function handleResetTournament() {
    if (!confirm('⚠️ Reset the ENTIRE tournament? All data will be permanently deleted. This cannot be undone.')) return;
    try {
        showLoading('Resetting…');
        await resetTournament();
        showSuccessMessage('♻️ Tournament has been reset.');
        document.getElementById('teamInput').value = '';
    } catch (err) {
        alert('Error resetting tournament: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ── Result handlers ───────────────────────────────────────────────────────────
async function handleSubmitResult() {
    const select = document.getElementById('adminMatchSelect');
    const score1 = Number(document.getElementById('adminScore1')?.value);
    const score2 = Number(document.getElementById('adminScore2')?.value);

    if (!select?.value)                               { alert('Please select a match.'); return; }
    if (!Number.isFinite(score1) || score1 < 0)      { alert('Invalid score for Team 1.'); return; }
    if (!Number.isFinite(score2) || score2 < 0)      { alert('Invalid score for Team 2.'); return; }

    // Check if penalty info is needed (only for knockout draws)
    const selectedMatch = state.matches.find((m) => m.id === select.value);
    let penaltyWinnerId   = null;
    let penaltyWinnerName = null;

    if (selectedMatch?.matchType === 'knockout' && score1 === score2) {
        const penToggle = document.getElementById('penaltyToggle');
        if (!penToggle?.checked) {
            alert('This is a drawn knockout match. Please tick "Penalties" and select the shoot-out winner.');
            return;
        }
        const penSelect = document.getElementById('penaltyWinnerSelect');
        penaltyWinnerId   = penSelect?.value;
        penaltyWinnerName = penSelect?.options[penSelect.selectedIndex]?.text;
        if (!penaltyWinnerId) { alert('Please select the penalty shoot-out winner.'); return; }
    }

    try {
        showLoading('Submitting result…');
        await submitMatchResult(select.value, score1, score2, penaltyWinnerId, penaltyWinnerName);
        showSuccessMessage('✅ Result submitted.');
        clearResultForm();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function handleClearResult() {
    const select = document.getElementById('adminMatchSelect');
    if (!select?.value) { alert('Please select a match.'); return; }
    if (!confirm('Clear this match result? This will also undo any automatic advances in knockout.')) return;
    try {
        showLoading('Clearing result…');
        await clearMatchResult(select.value);
        showSuccessMessage('🗑 Result cleared.');
        clearResultForm();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        hideLoading();
    }
}

/** Admin can manually declare a champion (edge case: Final already entered) */
async function handleDeclareChampion() {
    const finalMatch = state.matches.find((m) => m.id === 'final-1' && m.status === 'completed');
    if (!finalMatch) {
        alert('The Final must be completed before declaring a champion.'); return;
    }
    alert(`🏆 Champion: ${finalMatch.winnerName}`);
}

function clearResultForm() {
    const s1  = document.getElementById('adminScore1');
    const s2  = document.getElementById('adminScore2');
    const sel = document.getElementById('adminMatchSelect');
    const pen = document.getElementById('penaltyToggle');
    const penRow = document.getElementById('penaltyRow');
    if (s1)  s1.value  = '';
    if (s2)  s2.value  = '';
    if (sel) sel.value = '';
    if (pen) { pen.checked = false; }
    if (penRow) penRow.style.display = 'none';
}

// ── Realtime listeners ────────────────────────────────────────────────────────
function setupRealtimeListeners() {
    if (state.unsubscribes.length) return;   // already set up

    const unsubT = onTournamentUpdate((tournament) => {
        state.tournament = tournament || {};
        renderAdminStats();
        renderAdminBracket();
        renderMatchSelect();
    });

    const unsubM = onMatchesUpdate((matches) => {
        state.matches = matches || [];
        renderAdminStats();
        renderAdminBracket();
        renderMatchSelect();
    });

    state.unsubscribes = [unsubT, unsubM];
}

function cleanupRealtimeListeners() {
    state.unsubscribes.forEach((fn) => fn());
    state.unsubscribes = [];
}

// ── Render: admin stats ───────────────────────────────────────────────────────
function renderAdminStats() {
    const leagueMatches  = state.matches.filter((m) => m.matchType === 'league');
    const knockoutMatches = state.matches.filter((m) => m.matchType === 'knockout');
    const completedLeague = leagueMatches.filter((m) => m.status === 'completed').length;

    setEl('adminTeamCount',       state.tournament?.teamsCount || 0);
    setEl('adminCompletedMatches', completedLeague);
    setEl('adminTotalMatches',    leagueMatches.length);
    setEl('adminStage',           state.tournament?.currentStage || 'League');
    setEl('adminChampion',        state.tournament?.champion || '–');
}

// ── Render: match select dropdown ────────────────────────────────────────────
/**
 * CHANGE: now shows ALL matches (pending + completed) so admin can edit
 * any result, not just pending ones.
 */
function renderMatchSelect() {
    const select = document.getElementById('adminMatchSelect');
    if (!select) return;

    select.innerHTML = '<option value="">— Select Match —</option>';

    const allMatches = state.matches
        .filter((m) => m.team1Name && m.team2Name)
        .sort((a, b) => {
            // league first, then knockout
            if (a.matchType !== b.matchType) return a.matchType === 'league' ? -1 : 1;
            if ((a.matchday || 0) !== (b.matchday || 0)) return (a.matchday || 0) - (b.matchday || 0);
            return (a.matchNumber || 0) - (b.matchNumber || 0);
        });

    // Group optgroups
    let lastType = null;
    allMatches.forEach((m) => {
        if (m.matchType !== lastType) {
            lastType = m.matchType;
            const grp = document.createElement('optgroup');
            grp.label = lastType === 'league' ? '📋 League Matches' : '🏆 Knockout Matches';
            select.appendChild(grp);
        }
        const label = m.matchType === 'league'
            ? `[MD${m.matchday}] ${m.team1Name} vs ${m.team2Name}${m.status === 'completed' ? ' ✅' : ''}`
            : `${m.round}: ${m.team1Name} vs ${m.team2Name}${m.status === 'completed' ? ' ✅' : ''}`;

        const opt   = document.createElement('option');
        opt.value   = m.id;
        opt.textContent = label;
        select.appendChild(opt);
    });

    // When a match is selected, update the penalty winner select
    select.addEventListener('change', onMatchSelectChange);
}

function onMatchSelectChange(e) {
    const matchId = e.target.value;
    const match   = state.matches.find((m) => m.id === matchId);
    const penRow  = document.getElementById('penaltyRow');
    const penSel  = document.getElementById('penaltyWinnerSelect');
    const penToggle = document.getElementById('penaltyToggle');

    if (!penRow || !penSel) return;

    // Only show penalty section for knockout matches
    const isKnockout = match?.matchType === 'knockout';
    penRow.style.display = isKnockout ? 'block' : 'none';

    if (isKnockout && match) {
        penSel.innerHTML = `
            <option value="">— Penalty winner —</option>
            <option value="${match.team1Id}">${match.team1Name}</option>
            <option value="${match.team2Id}">${match.team2Name}</option>
        `;
        // Pre-fill scores if editing a completed match
        const s1 = document.getElementById('adminScore1');
        const s2 = document.getElementById('adminScore2');
        if (match.status === 'completed') {
            if (s1) s1.value = match.score1 ?? '';
            if (s2) s2.value = match.score2 ?? '';
        }
    }

    if (penToggle) penToggle.checked = false;
    if (isKnockout) penRow.style.display = 'none'; // only show after checkbox
}

// ── Render: admin bracket / league overview ───────────────────────────────────
function renderAdminBracket() {
    const container = document.getElementById('adminBracketContent');
    if (!container) return;

    if (!state.matches.length) {
        container.innerHTML = '<p class="empty-state">No tournament has been created yet.</p>';
        return;
    }

    const leagueMatches   = state.matches.filter((m) => m.matchType === 'league');
    const knockoutMatches = state.matches.filter((m) => m.matchType === 'knockout');
    const completedLeague = leagueMatches.filter((m) => m.status === 'completed').length;
    const top8            = state.tournament?.top8 || [];

    const qualifiedNames = top8.map((id) => {
        const row = state.tournament?.leagueTable?.find((r) => r.id === id);
        return row?.name || id;
    });

    const roundOrder  = ['Quarter Finals', 'Semi Finals', 'Final'];
    const knockoutHtml = roundOrder.map((rName) => {
        const rMatches = knockoutMatches
            .filter((m) => m.round === rName)
            .sort((a, b) => a.matchNumber - b.matchNumber);
        if (!rMatches.length) return '';
        return `
            <div class="round">
                <h3>${rName}</h3>
                ${rMatches.map((m) => `
                    <div class="match ${m.status === 'completed' ? 'match-done' : ''}">
                        <div class="team ${m.status === 'completed' && m.winnerId === m.team1Id ? 'winner' : ''}">
                            ${m.team1Name || 'TBD'}
                        </div>
                        <div class="team ${m.status === 'completed' && m.winnerId === m.team2Id ? 'winner' : ''}">
                            ${m.team2Name || 'TBD'}
                        </div>
                        <div class="team" style="font-size:13px; color:#aaa;">
                            ${m.status === 'completed'
                                ? `${m.score1}–${m.score2}${m.penaltyWinnerName ? ` (pens: ${m.penaltyWinnerName})` : ''}`
                                : '⏳ Pending'}
                        </div>
                    </div>`).join('')}
            </div>`;
    }).join('');

    // League table preview (top 8 highlighted)
    const tableRows = (state.tournament?.leagueTable || []).map((team, i) => {
        const isTop8 = i < 8;
        return `<tr class="${isTop8 ? 'row-top8' : ''}">
            <td>${i + 1}</td>
            <td>${team.name}</td>
            <td>${team.P}</td>
            <td>${team.W}</td>
            <td>${team.D}</td>
            <td>${team.L}</td>
            <td>${team.GF}</td>
            <td>${team.GA}</td>
            <td>${team.GD >= 0 ? '+' : ''}${team.GD}</td>
            <td><strong>${team.Pts}</strong></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="stats" style="margin-bottom:22px;">
            <div class="stat">
                <h3>${completedLeague}/${leagueMatches.length}</h3>
                <p>League matches completed</p>
            </div>
            <div class="stat">
                <h3>${state.tournament?.currentStage || 'League'}</h3>
                <p>Current stage</p>
            </div>
            <div class="stat">
                <h3>${state.tournament?.champion || 'TBD'}</h3>
                <p>Champion</p>
            </div>
        </div>

        ${tableRows ? `
        <div class="card" style="padding:20px; margin-bottom:20px; overflow-x:auto;">
            <h3 style="margin-bottom:12px; color:var(--primary);">📊 Current League Table</h3>
            <table>
                <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
                <th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>` : ''}

        ${qualifiedNames.length ? `
        <div class="card" style="padding:20px; margin-bottom:20px;">
            <h3 style="margin-bottom:12px; color:var(--gold);">🏅 Top 8 Qualified</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px;">
                ${qualifiedNames.map((name, i) => `<div class="team">${i + 1}. ${name}</div>`).join('')}
            </div>
        </div>` : ''}

        ${knockoutHtml
            ? `<div class="bracket">${knockoutHtml}</div>`
            : '<p class="empty-state">Knockout matches will appear after the league stage is complete.</p>'}
    `;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function showSuccessMessage(message) {
    const box  = document.getElementById('successMessage');
    const text = document.getElementById('successText');
    if (!box || !text) return;
    text.textContent   = message;
    box.style.display  = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function showLoading(message = 'Please wait…') {
    const el = document.getElementById('loadingOverlay');
    const msg = document.getElementById('loadingMessage');
    if (el)  el.style.display  = 'flex';
    if (msg) msg.textContent   = message;
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
}

function setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function loadDefaultTeams() {
    const defaultTeams = [
        'Real Madrid', 'Newcastle United', 'PSV Eindhoven', 'River Plate',
        'Barcelona', 'Chelsea', 'Porto', 'Celtic',
        'Atlético Madrid', 'Liverpool', 'Ajax', 'Galatasaray',
        'Manchester City', 'Bayer Leverkusen', 'Benfica', 'Flamengo',
        'Manchester United', 'Borussia Dortmund', 'Sporting CP', 'Atalanta'
    ];
    const el = document.getElementById('teamInput');
    if (el) el.value = defaultTeams.join('\n');
}

// Expose for inline HTML usage if needed
window.handleAdminLogin         = handleAdminLogin;
window.handleAdminLogout        = handleAdminLogout;
window.handleGenerateTournament = handleGenerateTournament;
window.handleStartKnockoutStage = handleStartKnockoutStage;
window.handleResetTournament    = handleResetTournament;
window.handleSubmitResult       = handleSubmitResult;
window.handleClearResult        = handleClearResult;
