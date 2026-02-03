// ===============================================
// MAIN APPLICATION LOGIC
// ===============================================

let analyticsChartInstance = null;

function showNotification(message, type = 'success') {
    clearTimeout(bannerTimeoutId);
    const banner = document.getElementById('achievement-banner');
    const messageElement = document.getElementById('achievement-message');
    
    messageElement.textContent = message;
    banner.style.backgroundColor = type === 'error' ? 'var(--error-color)' : 'var(--primary-color)';
    banner.classList.add('show');
    if (type === 'achievement') { 
        document.getElementById('milestoneSound').play(); 
        messageElement.textContent = `🏆 ${message}`; 
    }
    
    bannerTimeoutId = setTimeout(() => { banner.classList.remove('show'); }, 4000);
}

function calculateDailyPace(challengeAnimeCount) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentGoal = GOAL_TIERS.find(goal => goal > challengeAnimeCount) || GOAL_TIERS[GOAL_TIERS.length - 1];

    const dailyPaceCard = document.getElementById('daily-pace-card');
    const dailyPaceValue = document.getElementById('daily-pace-value');
    dailyPaceCard.classList.remove('daily-pace-on-track', 'daily-pace-falling-behind', 'daily-pace-complete');
    dailyPaceCard.querySelector('.pace-description')?.remove();
    
    if (challengeAnimeCount >= currentGoal) {
        dailyPaceValue.textContent = 'GOAL!';
        dailyPaceCard.classList.add('daily-pace-complete');
        dailyPaceCard.style.borderLeft = '4px solid var(--primary-color)';
        const desc = document.createElement('p');
        desc.className = 'pace-description';
        desc.textContent = `Goal of ${currentGoal} reached! Next: ${GOAL_TIERS.find(g => g > currentGoal) || 'Max'}`;
        dailyPaceCard.appendChild(desc);
        return;
    }

    const diffTime = endDate.getTime() - today.getTime();
    const daysRemaining = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const remainingNeeded = currentGoal - challengeAnimeCount;

    if (daysRemaining <= 0) {
        dailyPaceValue.textContent = 'MISSED';
        dailyPaceCard.style.borderLeft = '4px solid var(--error-color)';
        const desc = document.createElement('p');
        desc.className = 'pace-description';
        desc.textContent = 'Challenge window closed.';
        dailyPaceCard.appendChild(desc);
        return;
    }

    const paceNeeded = remainingNeeded / daysRemaining;
    dailyPaceValue.textContent = paceNeeded.toFixed(2);
    
    const daysToCompletion = Math.ceil(remainingNeeded / paceNeeded);
    const projectionDate = new Date(today);
    projectionDate.setDate(today.getDate() + daysToCompletion);
    
    const formattedProjection = projectionDate.toLocaleDateString('en-GB', { month: 'short', day: '2-digit', year: 'numeric' });

    const desc = document.createElement('p');
    desc.className = 'pace-description';
    desc.innerHTML = `Anime per day. <br>Proj. Comp: **${formattedProjection}**`;
    dailyPaceCard.appendChild(desc);

    const totalChallengeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const targetPace = currentGoal / Math.max(1, totalChallengeDays);

    const challengeDaysElapsed = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentActualPace = challengeAnimeCount / Math.max(1, challengeDaysElapsed);
    
    if (currentActualPace >= targetPace * 0.9) { 
        dailyPaceCard.classList.add('daily-pace-on-track');
        dailyPaceCard.style.borderLeft = '4px solid var(--success-color)';
    } else {
        dailyPaceCard.classList.add('daily-pace-falling-behind');
        dailyPaceCard.style.borderLeft = '4px solid var(--error-color)';
    }
}

function updateAllDisplays() {
    const challengeAnime = getChallengeAnime();
    const backlogAnime = getBacklogAnime();
    const allUniqueAnime = getUniqueAnime(); 
    const currentGoal = GOAL_TIERS.find(goal => goal > challengeAnime.length) || GOAL_TIERS[GOAL_TIERS.length - 1];

    document.getElementById('total-watched-card').querySelector('h3').textContent = `Challenge Anime / ${currentGoal}`;
    document.getElementById('total-watched-value').textContent = challengeAnime.length;
    document.getElementById('days-logged-value').textContent = Object.keys(challengeData.days).filter(key => (challengeData.days[key].watched || []).length > 0).length;
    document.getElementById('achievements-unlocked-value').textContent = `${challengeData.unlockedAchievements.length} / ${achievements.length}`;
    
    document.getElementById('rank-badge').textContent = ranks.slice().reverse().find(r => challengeAnime.length >= r.min)?.title || 'Newbie';
    
    calculateDailyPace(challengeAnime.length);

    const animeWithUserScores = allUniqueAnime.filter(a => a.user_score && a.user_score > 0);
    const totalUserScore = animeWithUserScores.reduce((sum, a) => sum + a.user_score, 0);
    const avgUserScore = animeWithUserScores.length > 0 ? (totalUserScore / animeWithUserScores.length).toFixed(2) : 'N/A';
    document.getElementById('avg-score-value').textContent = avgUserScore;

    const progressPercent = Math.min(100, (challengeAnime.length / currentGoal) * 100);
    const progressFill = document.getElementById('progress-fill');
    progressFill.style.width = `${progressPercent}%`;
    progressFill.textContent = `${challengeAnime.length}/${currentGoal} (${progressPercent.toFixed(1)}%)`;

    const allGenres = allUniqueAnime.flatMap(a => a.isManual ? [] : (a.genres || []).map(g => g.name));
    if (allGenres.length > 0) {
        const genreCounts = allGenres.reduce((counts, genre) => ({ ...counts, [genre]: (counts[genre] || 0) + 1 }), {});
        document.getElementById('top-genre-value').textContent = Object.keys(genreCounts).reduce((a, b) => genreCounts[a] > genreCounts[b] ? a : b, "None");
    } else {
        document.getElementById('top-genre-value').textContent = 'None';
    }

    document.getElementById('backlog-count-value').textContent = allUniqueAnime.length; 

    const backlogGenres = backlogAnime.flatMap(a => a.isManual ? [] : (a.genres || []).map(g => g.name));
    if (backlogGenres.length > 0) {
        const genreCounts = backlogGenres.reduce((counts, genre) => ({ ...counts, [genre]: (counts[genre] || 0) + 1 }), {});
        document.getElementById('backlog-top-genre-value').textContent = Object.keys(genreCounts).reduce((a, b) => genreCounts[a] > genreCounts[b] ? a : b, "None");
    } else {
        document.getElementById('backlog-top-genre-value').textContent = 'None';
    }
    
    document.getElementById('header-title').textContent = `${currentGoal} Anime Challenge`;

    populateYearFilter(allUniqueAnime);
    populateGenreFilter(allUniqueAnime); 
    
    const { episodesToday, minutesToday, playbackSpeed } = anipaceData;
    document.getElementById('anipace-episodes-today').textContent = episodesToday;
    document.getElementById('anipace-time-hours').textContent = Math.floor(minutesToday / 60);
    document.getElementById('anipace-time-minutes').textContent = Math.round(minutesToday % 60);
    document.getElementById('anipace-current-speed').textContent = `${playbackSpeed.toFixed(2)}x`;
    document.getElementById('speed-input').value = playbackSpeed;
    
    updateAniPaceHistory();
    
    saveData();
    saveAniPaceData();
}

function updateAniPaceHistory() {
    const historyList = document.getElementById('anipace-history-list');
    const emptyState = document.getElementById('anipace-history-empty');
    
    historyList.innerHTML = '';
    
    const recentHistory = anipaceData.history.slice(-10).reverse();
    
    if (recentHistory.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    recentHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'anipace-history-item';
        
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        historyItem.innerHTML = `
            <div class="anipace-history-item-title">${item.animeName}</div>
            <div class="anipace-history-item-episodes">${item.episodes} ep</div>
            <div class="anipace-history-item-date">${formattedDate} ${formattedTime}</div>
            <button class="anipace-history-item-remove" data-id="${item.id}">&times;</button>
        `;
        
        historyList.appendChild(historyItem);
    });
    
    document.querySelectorAll('.anipace-history-item-remove').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            removeFromAniPaceHistory(id);
        });
    });
}

function removeFromAniPaceHistory(id) {
    const index = anipaceData.history.findIndex(item => item.id === id);
    
    if (index !== -1) {
        const item = anipaceData.history[index];
        
        anipaceData.episodesToday = Math.max(0, anipaceData.episodesToday - item.episodes);
        anipaceData.minutesToday = Math.max(0, anipaceData.minutesToday - item.minutes);
        
        anipaceData.history.splice(index, 1);
        
        saveAniPaceData();
        updateAllDisplays();
        showNotification('Episode log removed from AniPace.');
    }
}

function populateGenreFilter(animeList) {
    const genreFilter = document.getElementById('backlog-genre-filter');
    const genres = new Set();
    animeList.forEach(anime => {
        if (!anime.isManual && anime.genres) {
            anime.genres.forEach(genre => genres.add(genre.name));
        }
    });

    const currentValue = genreFilter.value;
    
    genreFilter.innerHTML = '<option value="all">Filter: All Genres</option>';
    Array.from(genres).sort((a, b) => a.localeCompare(b)).forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = `Filter: ${genre}`;
        genreFilter.appendChild(option);
    });

    if (genres.has(currentValue) || currentValue === 'all') {
        genreFilter.value = currentValue;
    }
}

function populateYearFilter(animeList) {
    const yearFilter = document.getElementById('backlog-year-filter');
    const years = new Set();
    animeList.forEach(anime => {
        if (anime.year) years.add(anime.year);
    });

    const currentValue = yearFilter.value;
    
    yearFilter.innerHTML = '<option value="all">Filter: All Years</option>';
    Array.from(years).sort((a, b) => b - a).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    if (years.has(parseInt(currentValue)) || currentValue === 'all') {
        yearFilter.value = currentValue;
    }
}

function createOrUpdateChart(dataType = 'genres') {
    if (analyticsChartInstance) { analyticsChartInstance.destroy(); }
    const uniqueAnime = getUniqueAnime().filter(a => !a.isManual); 
    const chartCanvas = document.getElementById('analytics-chart');
    const emptyState = document.getElementById('chart-empty-state');

    if (uniqueAnime.length === 0) {
        chartCanvas.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    chartCanvas.classList.remove('hidden');
    emptyState.classList.add('hidden');

    let dataMap = {};
    switch(dataType) {
        case 'genres':
            uniqueAnime.flatMap(a => (a.genres || []).map(g => g.name)).forEach(g => dataMap[g] = (dataMap[g] || 0) + 1);
            break;
        case 'studios':
            uniqueAnime.flatMap(a => (a.studios || []).map(s => s.name)).forEach(s => dataMap[s] = (dataMap[s] || 0) + 1);
            break;
        case 'types':
            uniqueAnime.map(a => a.type || 'Unknown').forEach(t => dataMap[t] = (dataMap[t] || 0) + 1);
            break;
    }
    
    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const chartColors = ['#f1c40f', '#e67e22', '#e74c3c', '#3498db', '#9b59b6', '#2ecc71', '#1abc9c', '#f39c12', '#d35400', '#c0392b'];

    analyticsChartInstance = new Chart(chartCanvas, {
        type: 'pie',
        data: { labels, datasets: [{ label: `By ${dataType}`, data, backgroundColor: chartColors, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: 'var(--text-color)' } } }
        }
    });
}

function renderAllAnimeList() {
    const listContainer = document.getElementById('all-anime-list-container');
    let uniqueAnime = getUniqueAnime();
    listContainer.innerHTML = '';
    
    const searchTerm = document.getElementById('backlog-search-input').value.toLowerCase();
    const sortMethod = document.getElementById('backlog-sort-select').value;
    const filterType = document.getElementById('backlog-filter-select').value;
    const filterYear = document.getElementById('backlog-year-filter').value;
    const filterGenre = document.getElementById('backlog-genre-filter').value; 

    uniqueAnime = uniqueAnime.filter(anime => {
        const title = getEnglishTitle(anime).toLowerCase();
        if (!title.includes(searchTerm)) { return false; }
        if (filterYear !== 'all' && anime.year !== parseInt(filterYear)) { return false; }
        if (filterGenre !== 'all' && !anime.isManual) {
            const matchesGenre = (anime.genres || []).some(g => g.name === filterGenre);
            if (!matchesGenre) { return false; }
        }
        if (filterType === 'Manual') { return anime.isManual; }
        if (filterType === 'score_7_up') { return (anime.user_score || 0) >= 7; }
        if (filterType === 'score_8_up') { return (anime.user_score || 0) >= 8; }
        if (filterType !== 'all') { return anime.type === filterType; }
        return true;
    });

    uniqueAnime.sort((a, b) => {
        const titleA = getEnglishTitle(a).toLowerCase();
        const titleB = getEnglishTitle(b).toLowerCase();

        switch (sortMethod) {
            case 'title_asc': return titleA.localeCompare(titleB);
            case 'score_desc': return (b.score || 0) - (a.score || 0);
            case 'user_score_desc': return (b.user_score || 0) - (a.user_score || 0);
            case 'date_added': return (b.date_added ? new Date(b.date_added).getTime() : 0) - (a.date_added ? new Date(a.date_added).getTime() : 0);
            default: return 0;
        }
    });

    if (uniqueAnime.length === 0) {
        document.getElementById('backlog-empty-state').classList.remove('hidden');
        document.getElementById('backlog-empty-state').textContent = 'No anime matched your current filters or search criteria.';
    } else {
        document.getElementById('backlog-empty-state').classList.add('hidden');
        
        const dailyAnimeKeys = new Set(getChallengeAnime().map(item => item.isManual ? item.title.toLowerCase().trim() : item.mal_id));

        uniqueAnime.forEach(anime => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'backlog-anime-list-item';
            
            const isBacklogSource = getBacklogAnime().some(item => 
                item.isManual ? item.title.toLowerCase().trim() === anime.title.toLowerCase().trim() : item.mal_id === anime.mal_id
            );
            const isDailySource = dailyAnimeKeys.has(anime.isManual ? anime.title.toLowerCase().trim() : anime.mal_id);
            
            let sourceText = '';
            if (isBacklogSource && isDailySource) { sourceText = 'Source: Challenge & Backlog';
            } else if (isDailySource) { sourceText = 'Source: Challenge Log';
            } else if (isBacklogSource) { sourceText = 'Source: Backlog Only'; }

            if (anime.isManual) {
                itemDiv.innerHTML = `
                    <img src="https://via.placeholder.com/80x110?text=Manual" alt="Poster">
                    <div class="backlog-info">
                        <h4>${anime.title} (Manual Entry)</h4>
                        <p>My Score: ${anime.user_score || 'N/A'}</p>
                        <p style="margin-top: 2px; font-size: 10px; color: var(--text-secondary);">${sourceText}</p>
                    </div>
                `;
            } else {
                const studios = (anime.studios || []).map(s => s.name).join(', ') || 'N/A';
                const genres = (anime.genres || []).map(g => g.name).join(', ') || 'N/A';
                const imageUrl = anime.images?.jpg?.small_image_url || 'https://via.placeholder.com/80x110?text=N/A';
                itemDiv.innerHTML = `
                    <img src="${imageUrl}" alt="Poster">
                    <div class="backlog-info">
                        <h4>${getEnglishTitle(anime)} (${anime.type || 'N/A'})</h4>
                        <p>MAL Score: ${anime.score || 'N/A'} | **My Score: ${anime.user_score || 'N/A'}**</p>
                        <p style="margin-top: 2px; font-size: 10px; color: var(--text-secondary);">Year: ${anime.year || 'N/A'} | Studio: ${studios} | Genres: ${genres}</p>
                        <p style="margin-top: 2px; font-size: 10px; color: var(--text-secondary);">${sourceText}</p>
                    </div>
                `;
            }
            
            if (isBacklogSource) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-btn';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = 'Remove from Backlog';
                removeBtn.onclick = () => {
                    const index = challengeData.backlog.findIndex(item => 
                        item.isManual ? item.title.toLowerCase().trim() === anime.title.toLowerCase().trim() : item.mal_id === anime.mal_id
                    );
                    if (index !== -1) {
                        challengeData.backlog.splice(index, 1);
                        saveData();
                        renderAllAnimeList(); 
                        updateAllDisplays();
                        processAchievements();
                        showNotification('Anime removed from backlog.', 'success');
                    }
                };
                itemDiv.appendChild(removeBtn);
            }
            listContainer.appendChild(itemDiv);
        });
    }
}

function showSearchResults(results, onSelect) {
    const modal = document.getElementById('search-results-modal');
    const grid = document.getElementById('search-results-grid');
    grid.innerHTML = '';
    if (!results || results.length === 0) { 
        grid.innerHTML = `<div class="empty-state-message">No results found.</div>`;
    } else {
        results.forEach(anime => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            const title = getEnglishTitle(anime);
            
            const imageUrl = anime.images?.jpg?.image_url || 'https://via.placeholder.com/100x140?text=No+Image';

            item.innerHTML = `<img src="${imageUrl}" alt="Poster"><h4 style="color: var(--text-color);">${title}</h4><button>Add</button>`;
            item.querySelector('button').onclick = () => { onSelect(anime); modal.classList.add('hidden'); };
            grid.appendChild(item);
        });
    }
    modal.classList.remove('hidden');
}

function createDayEntry(date) {
    const div = document.createElement('div');
    div.className = 'day-entry';
    
    // FIX: Use local date string for proper comparison
    const dateKey = getLocalDateString(date);
    const todayKey = getLocalDateString(new Date());
    
    if (dateKey === todayKey) { 
        div.id = 'today-entry'; 
    }
    
    challengeData.days[dateKey] = challengeData.days[dateKey] || { watched: [] };
    let savedDayData = challengeData.days[dateKey];

    const dateDisplay = date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    
    div.innerHTML = `<h3>${dateDisplay}<span class="daily-total"></span></h3><div class="anime-list-container"></div><textarea placeholder="Type an anime name..."></textarea><div class="add-controls"><button class="add-btn">Add from Online</button><button class="add-btn manual-add-btn">Add Manually</button></div>`;
    const animeListContainer = div.querySelector('.anime-list-container');
    const animeInput = div.querySelector('textarea');
    const addOnlineBtn = div.querySelector('.add-btn');
    const addManualBtn = div.querySelector('.manual-add-btn');
    const dailyTotalEl = div.querySelector('.daily-total');

    function renderWatchedList() {
        animeListContainer.innerHTML = '';
        (savedDayData.watched || []).forEach((anime, index) => {
            const animeDiv = document.createElement('div');
            animeDiv.className = 'anime-info-item';
            let scoreDisplay = anime.user_score ? ` (My Score: ${anime.user_score})` : '';
            if (anime.isManual) { 
                animeDiv.innerHTML = `<div class="anime-info-text"><h4>${anime.title} (Manual)${scoreDisplay}</h4></div>`;
            } else {
                const imageUrl = anime.images?.jpg?.image_url || 'https://via.placeholder.com/40x60?text=N/A';
                animeDiv.innerHTML = `<img src="${imageUrl}" alt="Poster"><div class="anime-info-text"><h4>${getEnglishTitle(anime)}${scoreDisplay}</h4><p>${(anime.genres || []).map(g => g.name).join(', ')}</p></div>`;
            }
            animeDiv.innerHTML += `<button class="remove-btn" data-index="${index}">&times;</button>`;
            animeListContainer.appendChild(animeDiv);
        });
        animeListContainer.querySelectorAll('.remove-btn').forEach(btn => {
            btn.onclick = (e) => { 
                savedDayData.watched.splice(e.target.dataset.index, 1); 
                saveData(); 
                renderWatchedList(); 
                updateAllDisplays(); 
                processAchievements(); 
            };
        });
        dailyTotalEl.textContent = `Total Today: ${(savedDayData.watched || []).length}`;
    }

    addOnlineBtn.onclick = async () => { 
        const title = animeInput.value.trim(); 
        if (!title) return; 
        addOnlineBtn.textContent = 'Searching...'; 
        addOnlineBtn.disabled = true; 
        try { 
            const response = await fetch(`${API_URL}?q=${encodeURIComponent(title)}&limit=10`); 
            const searchData = await response.json(); 
            showSearchResults(searchData.data, (selectedAnime) => { 
                
                const rating = promptForRating(getEnglishTitle(selectedAnime));
                const newAnime = { ...selectedAnime, date_added: new Date().toISOString() };
                if (rating !== null) newAnime.user_score = rating;
                newAnime.year = newAnime.year || (newAnime.aired ? new Date(newAnime.aired.from).getFullYear() : null);

                savedDayData.watched.push(newAnime); 
                animeInput.value = ''; 
                saveData(); 
                renderWatchedList(); 
                updateAllDisplays(); 
                processAchievements(); 
            }); 
        } catch (error) { 
            console.error("API Error:", error); 
            showNotification('Failed to fetch anime data. Check internet or API rate limits.', 'error'); 
        } finally { 
            addOnlineBtn.textContent = 'Add from Online'; 
            addOnlineBtn.disabled = false; 
        } 
    };
    
    addManualBtn.onclick = () => { 
        const title = animeInput.value.trim(); 
        if (!title) return; 

        const rating = promptForRating(title);
        
        savedDayData.watched.push({ 
            title: title, 
            isManual: true,
            user_score: rating,
            date_added: new Date().toISOString()
        }); 
        animeInput.value = ''; 
        saveData(); 
        renderWatchedList(); 
        updateAllDisplays(); 
        processAchievements(); 
    };
    
    renderWatchedList();
    return div;
}

function calculatePlan() { 
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const breakMinutes = parseInt(document.getElementById('break-time').value) || 0;
    const episodeDuration = parseInt(document.getElementById('planner-episode-duration').value) || TIME_PER_EPISODE;
    const playbackSpeed = parseFloat(document.getElementById('planner-playback-speed').value) || anipaceData.playbackSpeed; 
    
    if (!startTime || !endTime) { 
        showNotification("Please select a start and end time.", "error"); 
        return; 
    } 
    
    const timeToMinutes = t => (t.split(':').map(Number)[0] * 60) + t.split(':').map(Number)[1]; 
    let startMinutes = timeToMinutes(startTime);
    let endMinutes = timeToMinutes(endTime); 
    
    if (endMinutes < startMinutes) endMinutes += 24 * 60; 
    
    const availableWatchMinutes = (endMinutes - startMinutes) - breakMinutes; 
    const resultsEl = document.getElementById('planner-results'); 
    
    if (availableWatchMinutes <= 0) { 
        resultsEl.querySelector('#result-episodes').textContent = '0'; 
        resultsEl.querySelector('#result-time').textContent = '0h 0m'; 
    } else { 
        const realTimePerEpisode = episodeDuration / playbackSpeed; 
        const numberOfEpisodes = Math.floor(availableWatchMinutes / realTimePerEpisode); 
        resultsEl.querySelector('#result-episodes').textContent = numberOfEpisodes; 
        resultsEl.querySelector('#result-time').textContent = `${Math.floor(availableWatchMinutes / 60)}h ${Math.round(availableWatchMinutes % 60)}m`; 
    } 
    resultsEl.classList.remove('hidden');
}

function switchToScreen(screenId) {
    const challengeScreen = document.getElementById('challenge-screen');
    const backlogScreen = document.getElementById('backlog-manager-screen');
    const anipaceScreen = document.getElementById('anipace-log-screen');
    
    const switchToChallengeBtn = document.getElementById('switch-to-challenge-btn');
    const switchToBacklogBtn = document.getElementById('switch-to-backlog-btn');
    const switchToAniPaceBtn = document.getElementById('switch-to-anipace-btn');
    const jumpToTodayBtn = document.getElementById('jump-to-today-btn');
    const headerTitle = document.getElementById('header-title');
    const body = document.body;
    const currentGoal = GOAL_TIERS.find(goal => goal > getChallengeAnime().length) || GOAL_TIERS[GOAL_TIERS.length - 1];
    
    challengeScreen.classList.add('hidden');
    backlogScreen.classList.add('hidden');
    anipaceScreen.classList.add('hidden');
    switchToChallengeBtn.classList.remove('hidden');
    switchToBacklogBtn.classList.remove('hidden');
    switchToAniPaceBtn.classList.remove('hidden');
    jumpToTodayBtn.classList.remove('hidden');
    body.classList.remove('backlog-active');
    
    if (screenId === 'backlog') {
        backlogScreen.classList.remove('hidden');
        switchToBacklogBtn.classList.add('hidden');
        jumpToTodayBtn.classList.add('hidden');
        headerTitle.textContent = 'My Anime Backlog';
        body.classList.add('backlog-active');
        renderAllAnimeList(); 
    } else if (screenId === 'anipace') {
        anipaceScreen.classList.remove('hidden');
        switchToAniPaceBtn.classList.add('hidden');
        jumpToTodayBtn.classList.add('hidden');
        headerTitle.textContent = 'AniPace Quick Log';
        updateAllDisplays();
    } else {
        challengeScreen.classList.remove('hidden');
        switchToChallengeBtn.classList.add('hidden');
        headerTitle.textContent = `${currentGoal} Anime Challenge`;
    }
}

function initializeChallengeLayout() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    
    const todayKey = getLocalDateString(new Date());
    
    let currentDate = parseLocalDate(challengeData.challengeStart);
    
    const stopDate = parseLocalDate(challengeData.challengeEnd);
    stopDate.setDate(stopDate.getDate() + 1);

    while (currentDate < stopDate) {
        const dateKey = getLocalDateString(currentDate);
        const hasData = (challengeData.days[dateKey]?.watched || []).length > 0;
        
        if (dateKey >= todayKey || hasData) {
            app.appendChild(createDayEntry(new Date(currentDate)));
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
}

function initializeApp() {
    challengeData = loadChallengeData();
    anipaceData = loadAniPaceData();
    
    document.getElementById('challenge-start-date').value = challengeData.challengeStart;
    document.getElementById('challenge-end-date').value = challengeData.challengeEnd;
    
    document.getElementById('content-area').classList.remove('hidden');
    initializeChallengeLayout();
    updateAllDisplays(); 
    
    document.getElementById('switch-to-backlog-btn').onclick = () => switchToScreen('backlog');
    document.getElementById('switch-to-challenge-btn').onclick = () => switchToScreen('challenge');
    document.getElementById('switch-to-anipace-btn').onclick = () => switchToScreen('anipace');
    
    document.getElementById('backlog-search-input').oninput = debounce(renderAllAnimeList, 300);
    document.getElementById('backlog-sort-select').onchange = renderAllAnimeList;
    document.getElementById('backlog-filter-select').onchange = renderAllAnimeList;
    document.getElementById('backlog-year-filter').onchange = renderAllAnimeList;
    document.getElementById('backlog-genre-filter').onchange = renderAllAnimeList; 

    document.getElementById('jump-to-today-btn').onclick = () => { 
        const todayEntry = document.getElementById('today-entry'); 
        if (todayEntry) { 
            todayEntry.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
            todayEntry.style.boxShadow = '0 0 25px var(--primary-color)'; 
            setTimeout(() => { todayEntry.style.boxShadow = ''; }, 2500); 
        } else { 
            showNotification("Today's date is not in the challenge period.", "error"); 
        } 
    };
    
    document.getElementById('settings-btn').onclick = () => document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('open-planner-btn').onclick = () => { 
        document.getElementById('planner-playback-speed').value = anipaceData.playbackSpeed; 
        document.getElementById('planner-results').classList.add('hidden');
        document.getElementById('planner-modal').classList.remove('hidden'); 
    };
    document.getElementById('calculate-plan-btn').onclick = calculatePlan;

    document.querySelectorAll('.modal').forEach(modal => { 
        modal.querySelector('.close-btn').onclick = () => modal.classList.add('hidden'); 
        modal.onclick = (e) => { 
            if (e.target === modal && !e.target.closest('.modal-content')) {
                modal.classList.add('hidden');
            }
        }; 
    });
    
    ['total-watched-card', 'avg-score-card', 'top-genre-card', 'backlog-top-genre-card', 'daily-pace-card'].forEach(id => {
        document.getElementById(id).onclick = () => {
            createOrUpdateChart('genres'); 
            document.getElementById('chart-modal').classList.remove('hidden');
        };
    });
    
    document.getElementById('achievements-card').onclick = () => { 
        const grid = document.getElementById('achievements-grid'); 
        grid.innerHTML = ''; 
        if(achievements.length === 0) { 
            grid.innerHTML = `<div class="empty-state-message">No achievements defined.</div>`; 
        } else { 
            const categories = {
                'Milestone Achievements': achievements.filter(a => a.id.startsWith('total_')),
                'Genre Achievements': achievements.filter(a => a.id.includes('_1') || a.id.includes('_2') || a.id.includes('_3')),
                'Decade Achievements': achievements.filter(a => a.id.startsWith('decade_')),
                'Studio Achievements': achievements.filter(a => a.id.startsWith('studio_')),
                'Special Achievements': achievements.filter(a => !a.id.startsWith('total_') && !a.id.startsWith('decade_') && !a.id.startsWith('studio_') && 
                    !(a.id.includes('_1') || a.id.includes('_2') || a.id.includes('_3')))
            };
            
            Object.entries(categories).forEach(([category, categoryAchievements]) => {
                if (categoryAchievements.length > 0) {
                    const categoryDiv = document.createElement('div');
                    categoryDiv.className = 'achievement-category';
                    categoryDiv.innerHTML = `<h3>${category}</h3>`;
                    
                    categoryAchievements.forEach(ach => { 
                        const isUnlocked = challengeData.unlockedAchievements.includes(ach.id); 
                        const item = document.createElement('div'); 
                        item.className = `achievement-item ${isUnlocked ? 'unlocked' : ''}`; 
                        item.innerHTML = `<h4>${ach.title}</h4><p>${ach.description}</p>`; 
                        categoryDiv.appendChild(item); 
                    });
                    
                    grid.appendChild(categoryDiv);
                }
            });
        } 
        document.getElementById('achievements-modal').classList.remove('hidden'); 
    };

    const chartToggleBtns = document.querySelectorAll('.chart-toggle-btn');
    chartToggleBtns.forEach(btn => {
        btn.onclick = () => {
            chartToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            createOrUpdateChart(btn.dataset.type);
        };
    });

    const backlogInput = document.getElementById('backlog-anime-input');
    const addBacklogOnlineBtn = document.getElementById('add-backlog-online-btn');
    const addBacklogManualBtn = document.getElementById('add-backlog-manual-btn');

    addBacklogOnlineBtn.onclick = async () => {
        const title = backlogInput.value.trim(); 
        if (!title) return; 
        addBacklogOnlineBtn.textContent = 'Searching...'; 
        addBacklogOnlineBtn.disabled = true; 
        try { 
            const response = await fetch(`${API_URL}?q=${encodeURIComponent(title)}&limit=10`); 
            const searchData = await response.json(); 
            showSearchResults(searchData.data, (selectedAnime) => { 
                
                const rating = promptForRating(getEnglishTitle(selectedAnime));
                const newAnime = { ...selectedAnime, date_added: new Date().toISOString() };
                if (rating !== null) newAnime.user_score = rating;
                newAnime.year = newAnime.year || (newAnime.aired ? new Date(newAnime.aired.from).getFullYear() : null);

                challengeData.backlog.push(newAnime); 
                backlogInput.value = ''; 
                saveData(); 
                renderAllAnimeList(); 
                updateAllDisplays(); 
                processAchievements();
            }); 
        } catch (error) { 
            console.error("API Error:", error); 
            showNotification('Failed to fetch anime data. Check internet or API rate limits.', 'error'); 
        } finally { 
            addBacklogOnlineBtn.textContent = 'Add Online'; 
            addBacklogOnlineBtn.disabled = false; 
        }
    };

    addBacklogManualBtn.onclick = () => { 
        const title = backlogInput.value.trim(); 
        if (!title) return; 
        
        const rating = promptForRating(title);

        challengeData.backlog.push({ 
            title: title, 
            isManual: true,
            user_score: rating,
            date_added: new Date().toISOString()
        }); 
        backlogInput.value = ''; 
        saveData(); 
        renderAllAnimeList(); 
        updateAllDisplays(); 
        processAchievements();
    };
    
    document.getElementById('anipace-log-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const episodes = parseInt(document.getElementById('anipace-episode-count-input').value);
        const animeName = document.getElementById('anipace-anime-name-input').value.trim() || 'Unnamed Quick-Log Anime';
        
        if (!episodes || episodes < 1) return;
        
        const timePerEpisode = parseFloat(document.getElementById('anipace-episode-duration-input').value) || TIME_PER_EPISODE;
        const playbackSpeed = anipaceData.playbackSpeed;
        const minutesWatched = (timePerEpisode / playbackSpeed) * episodes;
        
        anipaceData.episodesToday += episodes;
        anipaceData.minutesToday += minutesWatched;
        anipaceData.totalXP += (minutesWatched * 10); 

        const historyEntry = {
            id: Date.now().toString(),
            animeName: animeName,
            episodes: episodes,
            minutes: minutesWatched,
            timestamp: new Date().toISOString()
        };
        
        anipaceData.history.push(historyEntry);
        
        saveAniPaceData();
        updateAllDisplays();
        form.reset();
        showNotification(`Logged ${episodes} episodes of ${animeName} in AniPace.`);
    };

    document.getElementById('speed-input').onchange = (e) => {
        const newSpeed = parseFloat(e.target.value);
        if (!isNaN(newSpeed) && newSpeed > 0) {
            anipaceData.playbackSpeed = newSpeed;
            updateAllDisplays();
            saveAniPaceData();
        } else {
            e.target.value = anipaceData.playbackSpeed;
        }
    };
    
    document.getElementById('save-date-settings-btn').onclick = () => {
        const newStart = document.getElementById('challenge-start-date').value;
        const newEnd = document.getElementById('challenge-end-date').value;
        
        if (!newStart || !newEnd) {
            showNotification('Please select both a start and end date.', 'error');
            return;
        }
        
        const start = parseLocalDate(newStart);
        const end = parseLocalDate(newEnd);
        
        if (start.getTime() >= end.getTime()) {
            showNotification('Start date must be before the end date.', 'error');
            return;
        }

        challengeData.challengeStart = newStart;
        challengeData.challengeEnd = newEnd;
        saveData();
        showNotification('Challenge dates updated. Reloading dashboard to apply new period...');
        
        setTimeout(() => location.reload(), 1000);
    };

    document.getElementById('export-btn').onclick = () => {
        const dataStr = JSON.stringify(challengeData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anime-challenge-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Progress exported to Downloads folder!');
    };

    document.getElementById('copy-backup-btn').onclick = () => {
        const dataStr = JSON.stringify(challengeData, null, 2);
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(dataStr).then(() => {
                showNotification('Backup copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                showNotification('Failed to copy. Please try Export as File.', 'error');
            });
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = dataStr;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showNotification('Backup copied to clipboard!');
            } catch (err) {
                showNotification('Failed to copy. Please try Export as File.', 'error');
            }
            document.body.removeChild(textArea);
        }
    };

    document.getElementById('import-file').onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData && importedData.days) {
                    if (confirm('Are you sure you want to overwrite your current progress?')) {
                        importedData.backlog = importedData.backlog || [];
                        importedData.challengeStart = importedData.challengeStart || challengeData.challengeStart;
                        importedData.challengeEnd = importedData.challengeEnd || challengeData.challengeEnd;

                        challengeData = importedData;
                        saveData(); 
                        location.reload();
                    }
                } else {
                    showNotification('Invalid backup file.', 'error');
                }
            } catch (err) {
                showNotification('Could not read the file.', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = null; 
    };

    document.getElementById('import-text-btn').onclick = () => {
        document.getElementById('import-text-modal').classList.remove('hidden');
        document.getElementById('import-text-area').value = '';
    };

    document.getElementById('clear-text-btn').onclick = () => {
        document.getElementById('import-text-area').value = '';
    };

    document.getElementById('import-text-confirm-btn').onclick = () => {
        const text = document.getElementById('import-text-area').value;
        if (!text.trim()) {
            showNotification('Please paste your backup text.', 'error');
            return;
        }
        
        try {
            const importedData = JSON.parse(text);
            if (importedData && importedData.days) {
                if (confirm('Are you sure you want to overwrite your current progress?')) {
                    importedData.backlog = importedData.backlog || [];
                    importedData.challengeStart = importedData.challengeStart || challengeData.challengeStart;
                    importedData.challengeEnd = importedData.challengeEnd || challengeData.challengeEnd;
                    challengeData = importedData;
                    saveData(); 
                    document.getElementById('import-text-modal').classList.add('hidden');
                    showNotification('Backup imported! Reloading...');
                    setTimeout(() => location.reload(), 1500);
                }
            } else {
                showNotification('Invalid backup text.', 'error');
            }
        } catch (err) {
            showNotification('Could not read the text.', 'error');
        }
    };
    
    document.getElementById('export-anipace-btn').onclick = () => {
        const dataStr = JSON.stringify(anipaceData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anipace-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('AniPace data exported!');
    };
    
    document.getElementById('copy-anipace-btn').onclick = () => {
        const dataStr = JSON.stringify(anipaceData, null, 2);
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(dataStr).then(() => {
                showNotification('AniPace data copied to clipboard!');
            }).catch(err => {
                showNotification('Failed to copy.', 'error');
            });
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = dataStr;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showNotification('AniPace data copied to clipboard!');
            } catch (err) {
                showNotification('Failed to copy.', 'error');
            }
            document.body.removeChild(textArea);
        }
    };
    
    document.getElementById('import-anipace-file').onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData) {
                    if (confirm('Overwrite current AniPace data?')) {
                        anipaceData = { ...anipaceData, ...importedData };
                        saveAniPaceData();
                        updateAllDisplays();
                        showNotification('AniPace data imported!');
                    }
                } else {
                    showNotification('Invalid AniPace backup.', 'error');
                }
            } catch (err) {
                showNotification('Could not read the file.', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = null; 
    };
    
    document.getElementById('import-anipace-text-btn').onclick = () => {
        document.getElementById('import-anipace-text-modal').classList.remove('hidden');
        document.getElementById('import-anipace-text-area').value = '';
    };
    
    document.getElementById('clear-anipace-text-btn').onclick = () => {
        document.getElementById('import-anipace-text-area').value = '';
    };
    
    document.getElementById('import-anipace-text-confirm-btn').onclick = () => {
        const text = document.getElementById('import-anipace-text-area').value;
        if (!text.trim()) {
            showNotification('Please paste your AniPace backup.', 'error');
            return;
        }
        
        try {
            const importedData = JSON.parse(text);
            if (importedData) {
                if (confirm('Overwrite current AniPace data?')) {
                    anipaceData = { ...anipaceData, ...importedData };
                    saveAniPaceData();
                    updateAllDisplays();
                    document.getElementById('import-anipace-text-modal').classList.add('hidden');
                    showNotification('AniPace data imported!');
                }
            } else {
                showNotification('Invalid AniPace backup.', 'error');
            }
        } catch (err) {
            showNotification('Could not read the text.', 'error');
        }
    };

    document.getElementById('reset-btn').onclick = () => {
        if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ANIPACE_STORAGE_KEY);
            location.reload();
        }
    };
}

initializeApp();
