/**
 * script.js  –  Public-facing tournament website
 * Read-only: visitors can never edit data.
 * All data comes from Firebase Realtime Database via listeners.
 */

import { onMatchesUpdate, onTournamentUpdate, onTeamsUpdate } from './firebase.js';

// ── App state ────────────────────────────────────────────────────────────────
const state = {
    tournament:    null,
    matches:       [],
    teams:         {},        // keyed by teamId
    leagueTable:   [],
    activeMatchday: 1,
    screenshotMode: false
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    setupCountdown();
    setupDownloadButtons();
    setupScreenshotMode();
    setupModalEvents();
    setupRealtimeListeners();
}

// ── Firebase listeners ────────────────────────────────────────────────────────
function setupRealtimeListeners() {
    onTournamentUpdate((tournament) => {
        state.tournament  = tournament || {};
        state.leagueTable = tournament?.leagueTable || [];
        renderPage();
    });

    onMatchesUpdate((matches) => {
        state.matches = matches || [];
        renderPage();
    });

    onTeamsUpdate((teams) => {
        state.teams = teams || {};
        renderPage();
    });
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function setupCountdown() {
    const el = document.getElementById('countdown');
    if (!el) return;

    function tick() {
        if (!state.tournament?.countdownDate) {
            el.textContent = 'Loading…';
            return;
        }
        const diff = new Date(state.tournament.countdownDate).getTime() - Date.now();
        if (diff <= 0) { el.textContent = '🏁 Tournament Started!'; return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff / 3600000) % 24);
        const m = Math.floor((diff / 60000) % 60);
        const s = Math.floor((diff / 1000) % 60);
        el.textContent = `${d}d ${h}h ${m}m ${s}s`;
    }

    tick();
    setInterval(tick, 1000);
}

// ── Screenshot / download ─────────────────────────────────────────────────────
function setupDownloadButtons() {
    // Helper: capture any element and download as PNG
    async function capture(elementId, filename) {
        if (typeof html2canvas !== 'function') {
            alert('Screenshot library not loaded.');
            return;
        }
        const el = document.getElementById(elementId);
        if (!el) return;
        try {
            const canvas = await html2canvas(el, { backgroundColor: '#071426', scale: 2 });
            const link   = document.createElement('a');
            link.href     = canvas.toDataURL('image/png');
            link.download = filename;
            link.click();
        } catch (err) {
            console.error('Screenshot error:', err);
            alert('Screenshot failed: ' + err.message);
        }
    }

    document.getElementById('downloadTableBtn')
        ?.addEventListener('click', () => capture('leagueTableSection', 'league-table.png'));

    document.getElementById('downloadMatchdayBtn')
        ?.addEventListener('click', () => capture('matchdaySection', 'matchday-fixtures.png'));

    document.getElementById('downloadKnockoutBtn')
        ?.addEventListener('click', () => capture('knockoutSection', 'knockout-bracket.png'));

    // Legacy champion-section button
    document.getElementById('downloadBtn')
        ?.addEventListener('click', () => capture('championSection', 'efb-champion.png'));
}

/** Toggle screenshot mode: hides nav, buttons, footer for clean screenshots */
function setupScreenshotMode() {
    const btn = document.getElementById('screenshotModeBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        state.screenshotMode = !state.screenshotMode;
        document.body.classList.toggle('screenshot-mode', state.screenshotMode);
        btn.textContent = state.screenshotMode ? '🔓 Exit Screenshot Mode' : '📸 Screenshot Mode';
    });
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderPage() {
    renderStats();
    renderLeagueTable();
    renderMatchdays();
    renderKnockoutBracket();
    renderStatistics();
    renderChampion();
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function renderStats() {
    const leagueMatches    = state.matches.filter((m) => m.matchType === 'league');
    const completedLeague  = leagueMatches.filter((m) => m.status === 'completed').length;
    const allCompleted     = state.matches.filter((m) => m.status === 'completed').length;

    setEl('teamCount',       state.tournament?.teamsCount || 0);
    setEl('matchCount',      state.matches.length);
    setEl('completedCount',  allCompleted);
    setEl('stageDisplay',    (state.tournament?.currentStage || 'League').toUpperCase());
}

// ── League table ──────────────────────────────────────────────────────────────
function renderLeagueTable() {
    const container = document.getElementById('leagueTable');
    if (!container) return;

    const tableData = state.leagueTable.length
        ? state.leagueTable
        : computeLeagueTableFromMatches();

    if (!tableData.length) {
        container.innerHTML = '<p class="empty-state">League table will appear once the tournament starts.</p>';
        return;
    }

    const top8Ids = (state.tournament?.top8 || []);

    const rows = tableData.map((team, index) => {
        const pos     = index + 1;
        const isFirst = pos === 1;
        const isTop8  = pos <= 8;
        const rowClass = isFirst ? 'row-first' : isTop8 ? 'row-top8' : '';
        const badge    = isFirst ? '🥇' : isTop8 ? '🟢' : '';
        const logoSrc  = getLogoSrc(team.id, team.name);

        return `
            <tr data-team-id="${team.id}" class="team-row ${rowClass}">
                <td><strong>${pos}</strong> ${badge}</td>
                <td class="team-cell">
                    <img src="${logoSrc}" alt="${team.name}" class="team-logo-sm"
                         onerror="this.src='assets/logos/default.png'">
                    <span class="team-name-label">${team.name}</span>
                </td>
                <td>${team.P}</td>
                <td>${team.W}</td>
                <td>${team.D}</td>
                <td>${team.L}</td>
                <td>${team.GF}</td>
                <td>${team.GA}</td>
                <td class="${team.GD > 0 ? 'gd-pos' : team.GD < 0 ? 'gd-neg' : ''}">${team.GD > 0 ? '+' : ''}${team.GD}</td>
                <td><strong>${team.Pts}</strong></td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="league-table-el">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                    <th>Pts</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="table-legend">
            <span class="legend-item"><span class="legend-dot first-dot">🥇</span> 1st Place</span>
            <span class="legend-item"><span class="legend-dot top8-dot"></span> Top 8 – Qualify for Knockouts</span>
        </div>`;

    container.querySelectorAll('.team-row').forEach((row) => {
        row.addEventListener('click', () => openTeamModal(row.dataset.teamId));
    });
}

// ── Matchday fixtures ─────────────────────────────────────────────────────────
function renderMatchdays() {
    const tabs   = document.getElementById('matchdayTabs');
    const panels = document.getElementById('matchdays');
    if (!tabs || !panels) return;

    const leagueMatches = state.matches
        .filter((m) => m.matchType === 'league')
        .sort((a, b) => a.matchday - b.matchday || a.matchNumber - b.matchNumber);

    if (!leagueMatches.length) {
        tabs.innerHTML   = '<p class="empty-state">League fixtures are not ready yet.</p>';
        panels.innerHTML = '';
        return;
    }

    // Group by matchday
    const grouped   = {};
    leagueMatches.forEach((m) => {
        grouped[m.matchday] = grouped[m.matchday] || [];
        grouped[m.matchday].push(m);
    });
    const matchdays = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    // Keep active matchday valid
    if (!matchdays.includes(state.activeMatchday)) {
        state.activeMatchday = matchdays[0];
    }

    // Tabs
    tabs.innerHTML = matchdays.map((day) => {
        const dayMatches   = grouped[day];
        const allDone      = dayMatches.every((m) => m.status === 'completed');
        const someDone     = dayMatches.some((m) => m.status === 'completed');
        const statusClass  = allDone ? 'tab-done' : someDone ? 'tab-partial' : '';
        return `<button class="matchday-tab ${day === state.activeMatchday ? 'active' : ''} ${statusClass}"
                        data-day="${day}">MD ${day}</button>`;
    }).join('');

    // Panels
    panels.innerHTML = matchdays.map((day) => `
        <div class="matchday-panel ${day === state.activeMatchday ? 'active' : ''}" data-day="${day}">
            <div class="matchday-header">⚽ Matchday ${day}</div>
            <div class="fixtures-list">
                ${grouped[day].map(renderFixtureCard).join('')}
            </div>
        </div>
    `).join('');

    // Tab click
    tabs.querySelectorAll('.matchday-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            state.activeMatchday = Number(tab.dataset.day);
            renderMatchdays();
        });
    });
}

function renderFixtureCard(match) {
    const isDone   = match.status === 'completed';
    const score    = isDone ? `${match.score1} – ${match.score2}` : 'vs';
    const statusBadge = isDone
        ? '<span class="badge badge-done">FT</span>'
        : '<span class="badge badge-pending">Pending</span>';
    const logo1 = getLogoSrc(match.team1Id, match.team1Name);
    const logo2 = getLogoSrc(match.team2Id, match.team2Name);

    return `
        <div class="fixture-card ${isDone ? 'fixture-done' : ''}">
            <div class="fixture-team">
                <img src="${logo1}" alt="${match.team1Name}" class="fixture-logo"
                     onerror="this.src='assets/logos/default.png'">
                <span>${match.team1Name}</span>
            </div>
            <div class="fixture-score">
                <div class="score-display">${score}</div>
                ${statusBadge}
            </div>
            <div class="fixture-team fixture-team-right">
                <span>${match.team2Name}</span>
                <img src="${logo2}" alt="${match.team2Name}" class="fixture-logo"
                     onerror="this.src='assets/logos/default.png'">
            </div>
        </div>`;
}

// ── Knockout bracket ──────────────────────────────────────────────────────────
function renderKnockoutBracket() {
    const container = document.getElementById('knockoutBracket');
    if (!container) return;

    const knockoutMatches = state.matches.filter((m) => m.matchType === 'knockout');
    if (!knockoutMatches.length) {
        container.innerHTML = '<p class="empty-state">Knockout bracket will appear once the league stage is complete and the top 8 qualify.</p>';
        return;
    }

    const rounds = ['Quarter Finals', 'Semi Finals', 'Final'];
    container.innerHTML = `<div class="bracket">
        ${rounds.map((round) => {
            const roundMatches = knockoutMatches
                .filter((m) => m.round === round)
                .sort((a, b) => a.matchNumber - b.matchNumber);
            if (!roundMatches.length) return '';
            return `
                <div class="round">
                    <h3>${round}</h3>
                    ${roundMatches.map((m) => renderKnockoutMatch(m)).join('')}
                </div>`;
        }).join('')}
    </div>`;
}

function renderKnockoutMatch(match) {
    const isDone  = match.status === 'completed';
    const logo1   = getLogoSrc(match.team1Id, match.team1Name);
    const logo2   = getLogoSrc(match.team2Id, match.team2Name);
    const w1      = isDone && match.winnerId === match.team1Id;
    const w2      = isDone && match.winnerId === match.team2Id;

    const penNote = isDone && match.penaltyWinnerId
        ? `<div class="pen-note">⚡ Won on Penalties</div>` : '';

    return `
        <div class="match">
            <div class="team ${w1 ? 'winner' : ''}">
                <img src="${logo1}" alt="${match.team1Name || 'TBD'}" class="team-logo-sm"
                     onerror="this.src='assets/logos/default.png'">
                <span>${match.team1Name || 'TBD'}</span>
                <strong>${match.score1 !== null ? match.score1 : '-'}</strong>
            </div>
            <div class="team ${w2 ? 'winner' : ''}">
                <img src="${logo2}" alt="${match.team2Name || 'TBD'}" class="team-logo-sm"
                     onerror="this.src='assets/logos/default.png'">
                <span>${match.team2Name || 'TBD'}</span>
                <strong>${match.score2 !== null ? match.score2 : '-'}</strong>
            </div>
            ${penNote}
            <div class="match-status">${isDone ? '✅ FT' : '⏳ Pending'}</div>
        </div>`;
}

// ── Statistics section ─────────────────────────────────────────────────────────
function renderStatistics() {
    const container = document.getElementById('statsSection');
    if (!container) return;

    const completed = state.matches.filter((m) => m.status === 'completed' && m.matchType === 'league');
    if (!completed.length) {
        container.innerHTML = '<p class="empty-state">Statistics will appear after matches are played.</p>';
        return;
    }

    const table = computeLeagueTableFromMatches();
    if (!table.length) return;

    const leader    = table[0];
    const mostWins  = [...table].sort((a, b) => b.W  - a.W)[0];
    const mostGoals = [...table].sort((a, b) => b.GF - a.GF)[0];
    const bestDef   = [...table].filter((t) => t.P > 0).sort((a, b) => a.GA - b.GA)[0];

    // Biggest win: highest goal-difference in a single match
    let biggestWinMatch = null, biggestWinDiff = 0;
    completed.forEach((m) => {
        const diff = Math.abs(Number(m.score1) - Number(m.score2));
        if (diff > biggestWinDiff) {
            biggestWinDiff = diff;
            biggestWinMatch = m;
        }
    });

    const totalGoals = completed.reduce((sum, m) => sum + Number(m.score1) + Number(m.score2), 0);
    const avgGoals   = completed.length ? (totalGoals / completed.length).toFixed(2) : 0;

    const biggestWinText = biggestWinMatch
        ? `${biggestWinMatch.team1Name} ${biggestWinMatch.score1}–${biggestWinMatch.score2} ${biggestWinMatch.team2Name}`
        : 'N/A';

    container.innerHTML = `
        <div class="stats-grid">
            ${statCard('🏆 League Leader',       leader?.name || '–',    `${leader?.Pts || 0} pts`)}
            ${statCard('⚽ Most Wins',            mostWins?.name || '–',  `${mostWins?.W || 0} wins`)}
            ${statCard('🎯 Top Scorers',          mostGoals?.name || '–', `${mostGoals?.GF || 0} goals`)}
            ${statCard('🛡 Best Defence',         bestDef?.name || '–',   `${bestDef?.GA || 0} conceded`)}
            ${statCard('💥 Biggest Win',          biggestWinText,         `by ${biggestWinDiff} goals`)}
            ${statCard('📊 Matches Played',       completed.length,       `of ${state.matches.filter(m=>m.matchType==='league').length}`)}
            ${statCard('⚡ Avg Goals / Match',    avgGoals,               'goals per game')}
            ${statCard('🥅 Total Goals',          totalGoals,             'scored so far')}
        </div>`;
}

function statCard(label, value, sub) {
    return `
        <div class="stat-item">
            <div class="stat-label">${label}</div>
            <div class="stat-value">${value}</div>
            <div class="stat-sub">${sub}</div>
        </div>`;
}

// ── Champion ──────────────────────────────────────────────────────────────────
function renderChampion() {
    const el = document.getElementById('champion');
    if (!el) return;
    const champ = state.tournament?.champion;
    el.textContent = champ || 'No champion yet';

    const logoEl = document.getElementById('championLogo');
    if (logoEl && champ) {
        const champId = state.tournament?.championId;
        logoEl.src     = champId ? getLogoSrc(champId, champ) : 'assets/logos/default.png';
        logoEl.style.display = 'block';
    } else if (logoEl) {
        logoEl.style.display = 'none';
    }
}

// ── Team modal ────────────────────────────────────────────────────────────────
function openTeamModal(teamId) {
    const table = state.leagueTable.length
        ? state.leagueTable
        : computeLeagueTableFromMatches();

    const team = table.find((t) => t.id === teamId);
    if (!team) return;

    const position = table.findIndex((t) => t.id === teamId) + 1;
    const logoSrc  = getLogoSrc(team.id, team.name);

    // Fixtures for this team
    const teamMatches = state.matches
        .filter((m) => m.matchType === 'league' && (m.team1Id === teamId || m.team2Id === teamId))
        .sort((a, b) => a.matchday - b.matchday);

    const completed = teamMatches.filter((m) => m.status === 'completed');
    const upcoming  = teamMatches.filter((m) => m.status !== 'completed');

    const resultRows = completed.map((m) => {
        const isHome = m.team1Id === teamId;
        const opponent = isHome ? m.team2Name : m.team1Name;
        const gf = isHome ? m.score1 : m.score2;
        const ga = isHome ? m.score2 : m.score1;
        const result = gf > ga ? '🟢 W' : gf < ga ? '🔴 L' : '🟡 D';
        return `<div class="modal-result-row">${result} vs ${opponent}: ${gf}–${ga} (MD${m.matchday})</div>`;
    }).join('');

    const upcomingRows = upcoming.slice(0, 5).map((m) => {
        const isHome = m.team1Id === teamId;
        const opponent = isHome ? m.team2Name : m.team1Name;
        return `<div class="modal-upcoming-row">📅 MD${m.matchday}: vs ${opponent}</div>`;
    }).join('');

    setEl('modalTeamName', `${position}. ${team.name}`);
    const logoImgEl = document.getElementById('modalTeamLogo');
    if (logoImgEl) {
        logoImgEl.innerHTML = `<img src="${logoSrc}" alt="${team.name}"
            onerror="this.outerHTML='<div class=\\'logo-fallback\\'>${team.name.slice(0,2).toUpperCase()}</div>'"
            style="width:80px;height:80px;object-fit:contain;">`;
    }

    setEl('modalTeamStats', `
        <div class="modal-stats-grid">
            <div><strong>Position</strong><span>${position}</span></div>
            <div><strong>Points</strong><span>${team.Pts}</span></div>
            <div><strong>Played</strong><span>${team.P}</span></div>
            <div><strong>Wins</strong><span>${team.W}</span></div>
            <div><strong>Draws</strong><span>${team.D}</span></div>
            <div><strong>Losses</strong><span>${team.L}</span></div>
            <div><strong>GF</strong><span>${team.GF}</span></div>
            <div><strong>GA</strong><span>${team.GA}</span></div>
            <div><strong>GD</strong><span>${team.GD >= 0 ? '+' : ''}${team.GD}</span></div>
        </div>
        ${completed.length ? `<h4 style="margin:14px 0 8px; color:var(--primary);">Results (${completed.length})</h4>${resultRows}` : ''}
        ${upcoming.length  ? `<h4 style="margin:14px 0 8px; color:var(--gold);">Upcoming Fixtures</h4>${upcomingRows}` : ''}
    `);

    document.getElementById('teamModal').style.display = 'flex';
}

function setupModalEvents() {
    const modal = document.getElementById('teamModal');
    const close = document.getElementById('teamModalClose');
    if (!modal || !close) return;
    close.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

// ── Local table computation (fallback) ───────────────────────────────────────
function computeLeagueTableFromMatches() {
    const teams = {};

    state.matches
        .filter((m) => m.matchType === 'league')
        .forEach((m) => {
            if (m.team1Id) teams[m.team1Id] = teams[m.team1Id] || createStatObj(m.team1Id, m.team1Name);
            if (m.team2Id) teams[m.team2Id] = teams[m.team2Id] || createStatObj(m.team2Id, m.team2Name);

            if (m.status !== 'completed' || m.score1 === null || m.score2 === null) return;
            const home = teams[m.team1Id], away = teams[m.team2Id];
            const s1 = Number(m.score1), s2 = Number(m.score2);

            home.P++; away.P++;
            home.GF += s1; home.GA += s2;
            away.GF += s2; away.GA += s1;

            if (s1 > s2)      { home.W++; away.L++; home.Pts += 3; }
            else if (s1 < s2) { away.W++; home.L++; away.Pts += 3; }
            else               { home.D++; away.D++; home.Pts++; away.Pts++; }
        });

    return Object.values(teams)
        .map((t) => { t.GD = t.GF - t.GA; return t; })
        .sort((a, b) => {
            if (b.Pts !== a.Pts) return b.Pts - a.Pts;
            if (b.GD  !== a.GD)  return b.GD  - a.GD;
            if (b.GF  !== a.GF)  return b.GF  - a.GF;
            return a.name.localeCompare(b.name);
        });
}

function createStatObj(id, name) {
    return { id, name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Return logo path for a team; falls back to default badge */
function getLogoSrc(teamId, teamName) {
    if (!teamId) return 'assets/logos/default.png';
    // Try the teams map first (has the authoritative logo path)
    if (state.teams[teamId]?.logo) return state.teams[teamId].logo;
    return `assets/logos/${teamId}.png`;
}

function setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
