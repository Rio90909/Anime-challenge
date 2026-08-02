// ===============================================
// APP CONFIGURATION (LOCAL STORAGE & FIREBASE DB)
// ===============================================

let firebaseUser = null;
const STORAGE_KEY = 'animeDashboard_v6_combined';
const ANIPACE_STORAGE_KEY = 'anipace_separate_data';
const API_URL = 'https://kitsu.io/api/edge/anime';
const TIME_PER_EPISODE = 24;

// Normalizes Kitsu API response structure into Jikan format
function normalizeKitsuResponse(searchData) {
    const included = searchData.included || [];
    const data = searchData.data || [];

    return data.map(anime => {
        const attrs = anime.attributes || {};
        const mal_id = parseInt(anime.id) || anime.id;

        // Get genres matching this anime's relationships
        const genreIds = (anime.relationships?.genres?.data || []).map(g => g.id);
        const genres = included
            .filter(item => item.type === 'genres' && genreIds.includes(item.id))
            .map(item => ({ name: item.attributes?.name }));

        // Get categories matching this anime's relationships as fallback/additional genres
        const categoryIds = (anime.relationships?.categories?.data || []).map(c => c.id);
        const categories = included
            .filter(item => item.type === 'categories' && categoryIds.includes(item.id))
            .map(item => ({ name: item.attributes?.title || item.attributes?.name }))
            .filter(Boolean);

        // Combine and deduplicate genres and categories
        const allGenresMap = {};
        genres.forEach(g => { if (g.name) allGenresMap[g.name] = true; });
        categories.forEach(c => { if (c.name) allGenresMap[c.name] = true; });
        const combinedGenres = Object.keys(allGenresMap).map(name => ({ name }));

        // Get studios/producers matching this anime's relationships
        const animeProductionData = anime.relationships?.animeProductions?.data || [];
        const animeProductionIds = animeProductionData.map(ap => ap.id);

        const animeProductions = included.filter(item =>
            item.type === 'animeProductions' && animeProductionIds.includes(item.id)
        );

        // Map each animeProduction to its producer name and role
        const mappedProductions = animeProductions.map(ap => {
            const role = ap.attributes?.role || 'producer';
            const producerId = ap.relationships?.producer?.data?.id;
            const producerObj = producerId ? included.find(p => p.type === 'producers' && p.id === producerId) : null;
            const name = producerObj?.attributes?.name;
            return { name, role };
        }).filter(item => item.name);

        // Prioritize by role: studio > producer > licensor
        const studiosWithRole = mappedProductions.filter(p => p.role === 'studio');
        const producersWithRole = mappedProductions.filter(p => p.role === 'producer');
        const licensorsWithRole = mappedProductions.filter(p => p.role === 'licensor');

        let finalStudios = [];
        if (studiosWithRole.length > 0) {
            finalStudios = studiosWithRole.map(s => ({ name: s.name }));
        } else if (producersWithRole.length > 0) {
            finalStudios = producersWithRole.map(p => ({ name: p.name }));
        } else if (licensorsWithRole.length > 0) {
            finalStudios = licensorsWithRole.map(l => ({ name: l.name }));
        }

        const studios = finalStudios;

        // Map subtype to Jikan-like type
        let animeType = attrs.subtype || 'TV';
        if (animeType.toLowerCase() === 'tv') animeType = 'TV';
        else if (animeType.toLowerCase() === 'movie') animeType = 'Movie';
        else if (animeType.toLowerCase() === 'ova') animeType = 'OVA';
        else if (animeType.toLowerCase() === 'ona') animeType = 'ONA';
        else if (animeType.toLowerCase() === 'special') animeType = 'Special';

        // Map titles
        const titles = [];
        const canonical = attrs.canonicalTitle || attrs.titles?.en_jp || attrs.titles?.en || '';
        if (canonical) {
            titles.push({ type: 'Default', title: canonical });
        }

        let englishTitle = attrs.titles?.en || attrs.titles?.en_us || '';
        if (englishTitle) {
            titles.push({ type: 'English', title: englishTitle });
        } else {
            // fallback
            englishTitle = canonical;
            titles.push({ type: 'English', title: englishTitle });
        }

        const title = englishTitle || canonical;

        // Map score
        const score = attrs.averageRating ? parseFloat((parseFloat(attrs.averageRating) / 10).toFixed(2)) : null;

        // Map year
        const startDateStr = attrs.startDate;
        const year = startDateStr ? new Date(startDateStr).getFullYear() : null;

        // Map poster images
        const posterUrl = attrs.posterImage?.medium || attrs.posterImage?.small || attrs.posterImage?.original || '';
        const smallPosterUrl = attrs.posterImage?.small || attrs.posterImage?.tiny || '';
        const images = {
            jpg: {
                image_url: posterUrl,
                small_image_url: smallPosterUrl
            }
        };

        const episodes = attrs.episodeCount || null;
        const synopsis = attrs.synopsis || attrs.description || '';

        return {
            mal_id,
            title,
            titles,
            genres: combinedGenres,
            studios,
            type: animeType,
            score,
            year,
            images,
            episodes,
            synopsis,
            isManual: false
        };
    });
}

// Parses a single line for bulk imports, extracting optional rating at the end
function parseBulkLine(line) {
    const separatorMatch = line.match(/^(.*?)(?:\s*[-:[({]\s*([0-9]+(?:\.[0-9]+)?)\s*[)\]}]?)$/);
    if (separatorMatch) {
        const title = separatorMatch[1].trim();
        const rating = parseFloat(separatorMatch[2]);
        if (!isNaN(rating) && rating >= 1 && rating <= 10) {
            return { title, rating };
        }
    }

    const spaceMatch = line.match(/^(.*?)\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (spaceMatch) {
        const title = spaceMatch[1].trim();
        const rating = parseFloat(spaceMatch[2]);
        if (!isNaN(rating) && rating >= 1 && rating <= 10) {
            return { title, rating };
        }
    }

    return { title: line, rating: null };
}

window.toggleSynopsis = function(btn) {
    const p = btn.nextElementSibling;
    if (p.classList.contains('hidden')) {
        p.classList.remove('hidden');
        btn.textContent = 'Hide Story ▴';
    } else {
        p.classList.add('hidden');
        btn.textContent = 'Read Story ▾';
    }
};

// --- UTILS (Hoisted) ---
function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

const todayDateString = getLocalDateString(new Date());

let challengeData = { 
    days: {}, 
    unlockedAchievements: [], 
    backlog: [],
    challengeStart: todayDateString, 
    challengeEnd: '2026-12-31'
};

let anipaceData = {
    episodesToday: 0,
    minutesToday: 0,
    playbackSpeed: 1.0,
    totalXP: 0,
    lastLogDate: todayDateString,
    history: []
};

let analyticsChartInstance = null;
let startDate; 
let endDate; 
let bannerTimeoutId = null;

const GOAL_TIERS = [10, 30, 50, 100, 200, 400, 600, 800, 1000];

const achievements = [
    { id: 'total_1', title: 'First Step', description: 'Log your first anime.', check: (data) => data.allAnime.length >= 1 },
    { id: 'total_10', title: 'Anime Novice', description: 'Log 10 different anime.', check: (data) => data.allAnime.length >= 10 },
    { id: 'total_25', title: 'Anime Apprentice', description: 'Log 25 different anime.', check: (data) => data.allAnime.length >= 25 },
    { id: 'total_50', title: 'Anime Adept', description: 'Log 50 different anime.', check: (data) => data.allAnime.length >= 50 },
    { id: 'total_100', title: 'Anime Veteran', description: 'Log 100 different anime.', check: (data) => data.allAnime.length >= 100 },
    { id: 'total_200', title: 'Anime Master', description: 'Log 200 different anime.', check: (data) => data.allAnime.length >= 200 },
    { id: 'total_300', title: 'Anime Grandmaster', description: 'Log 300 different anime.', check: (data) => data.allAnime.length >= 300 },
    { id: 'total_400', title: 'Anime Legend', description: 'Log 400 different anime.', check: (data) => data.allAnime.length >= 400 },
    { id: 'total_500', title: 'Anime Mythic', description: 'Log 500 different anime.', check: (data) => data.allAnime.length >= 500 },
    { id: 'total_1000', title: 'Anime Immortal', description: 'Log 1000 different anime.', check: (data) => data.allAnime.length >= 1000 },
    
    ...['Romance', 'Action', 'Comedy', 'Fantasy', 'Sci-Fi', 'Harem', 'Slice of Life', 'Isekai', 'Drama', 'Mystery', 
        'Horror', 'Adventure', 'Supernatural', 'Mecha', 'Sports', 'Psychological', 'Thriller', 'Music', 'Historical', 'Military'].map(genre => ([
        { id: `${genre.toLowerCase()}_1`, title: `${genre} Fan`, description: `Watch 5 ${genre} anime.`, check: (data) => countGenre(data.allAnime, genre) >= 5 },
        { id: `${genre.toLowerCase()}_2`, title: `${genre} Enthusiast`, description: `Watch 15 ${genre} anime.`, check: (data) => countGenre(data.allAnime, genre) >= 15 },
        { id: `${genre.toLowerCase()}_3`, title: `${genre} Master`, description: `Watch 30 ${genre} anime.`, check: (data) => countGenre(data.allAnime, genre) >= 30 }
    ])).flat(),
    
    { id: 'decade_80s', title: '80s Nostalgia', description: 'Watch 3 anime from the 1980s.', check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 1980 && a.year < 1990).length >= 3 },
    { id: 'decade_90s', title: '90s Nostalgia', description: 'Watch 5 anime from the 1990s.', check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 1990 && a.year < 2000).length >= 5 },
    { id: 'decade_2000s', title: 'Millennium Kid', description: 'Watch 10 anime from the 2000s.', check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 2000 && a.year < 2010).length >= 10 },
    { id: 'decade_2010s', title: 'Modern Classic', description: 'Watch 15 anime from the 2010s.', check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 2010 && a.year < 2020).length >= 15 },
    { id: 'decade_2020s', title: 'Current Era', description: 'Watch 20 anime from the 2020s.', check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 2020).length >= 20 },
    
    { id: 'studio_kyoani', title: 'KyoAni Fan', description: 'Watch 3 anime from Kyoto Animation.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Kyoto Animation')).length >= 3 },
    { id: 'studio_ghibli', title: 'Ghibli Lover', description: 'Watch 3 anime from Studio Ghibli.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Studio Ghibli')).length >= 3 },
    { id: 'studio_madhouse', title: 'Madhouse Marathoner', description: 'Watch 5 anime from Madhouse.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Madhouse')).length >= 5 },
    { id: 'studio_ufotable', title: 'Ufotable Visuals', description: 'Watch 3 anime from Ufotable.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Ufotable')).length >= 3 },
    { id: 'studio_bones', title: 'Bones Collector', description: 'Watch 5 anime from Bones.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Bones')).length >= 5 },
    { id: 'studio_wit', title: 'Wit Witness', description: 'Watch 3 anime from Wit Studio.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Wit Studio')).length >= 3 },
    { id: 'studio_trigger', title: 'Trigger Happy', description: 'Watch 3 anime from Trigger.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Trigger')).length >= 3 },
    { id: 'studio_cloverworks', title: 'Clover Collector', description: 'Watch 3 anime from CloverWorks.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'CloverWorks')).length >= 3 },
    { id: 'studio_a1', title: 'A-1 Productions', description: 'Watch 5 anime from A-1 Pictures.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'A-1 Pictures')).length >= 5 },
    { id: 'studio_production_ig', title: 'IG Enthusiast', description: 'Watch 3 anime from Production I.G.', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Production I.G')).length >= 3 },
    
    { id: 'binge_watcher', title: 'Binge Watcher', description: 'Watch 5+ anime on a single day.', check: (data) => Object.values(data.days).some(d => (d.watched || []).length >= 5) },
    { id: 'critics_choice', title: 'Critic\'s Choice', description: 'Watch 5 anime with a score of 8.5 or higher.', check: (data) => data.allAnime.filter(a => !a.isManual && a.score >= 8.5).length >= 5 },
    { id: 'hidden_gems', title: 'Hidden Gems', description: 'Watch 5 anime with a score below 7.0.', check: (data) => data.allAnime.filter(a => !a.isManual && a.score < 7.0).length >= 5 },
    { id: 'long_runner', title: 'Long Runner', description: 'Watch an anime with 50+ episodes.', check: (data) => data.allAnime.some(a => !a.isManual && a.episodes >= 50) },
    { id: 'movie_buff', title: 'Movie Buff', description: 'Watch 10 anime movies.', check: (data) => data.allAnime.filter(a => !a.isManual && a.type === 'Movie').length >= 10 },
    { id: 'ova_collector', title: 'OVA Collector', description: 'Watch 5 OVAs.', check: (data) => data.allAnime.filter(a => !a.isManual && a.type === 'OVA').length >= 5 },
    { id: 'seasonal_watcher', title: 'Seasonal Watcher', description: 'Watch anime from 5 different seasons.', check: (data) => new Set(data.allAnime.filter(a => !a.isManual && a.season).map(a => `${a.season} ${a.year}`)).size >= 5 },
    { id: 'diverse_tastes', title: 'Diverse Tastes', description: 'Watch anime from 10 different genres.', check: (data) => new Set(data.allAnime.flatMap(a => !a.isManual ? (a.genres || []).map(g => g.name) : [])).size >= 10 },
    { id: 'high_scorer', title: 'High Scorer', description: 'Rate 10 anime with 9 or higher.', check: (data) => data.allAnime.filter(a => a.user_score >= 9).length >= 10 },
    { id: 'consistent_rater', title: 'Consistent Rater', description: 'Rate 20 different anime.', check: (data) => data.allAnime.filter(a => a.user_score && a.user_score > 0).length >= 20 },
    { id: 'marathon_runner', title: 'Marathon Runner', description: 'Log 10+ episodes in a single day with AniPace.', check: (data) => anipaceData.history.some(h => h.episodes >= 10) },
    { id: 'speed_demon', title: 'Speed Demon', description: 'Watch at 2.0x playback speed or higher.', check: (data) => anipaceData.playbackSpeed >= 2.0 },
    { id: 'weekend_warrior', title: 'Weekend Warrior', description: 'Log anime on 10 different weekends.', check: (data) => Object.keys(data.days).filter(date => {
        const day = new Date(date).getDay();
        return day === 0 || day === 6;
    }).length >= 10 },
    { id: 'streak_master', title: 'Streak Master', description: 'Log anime for 7 consecutive days.', check: (data) => {
        const dates = Object.keys(data.days).sort();
        let maxStreak = 0;
        let currentStreak = 1;
        
        for (let i = 1; i < dates.length; i++) {
            const prevDate = new Date(dates[i-1]);
            const currDate = new Date(dates[i]);
            const diffTime = currDate.getTime() - prevDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }
        
        return maxStreak >= 7;
    }},
    { id: 'completionist', title: 'Completionist', description: 'Complete 5 anime series (watch all episodes).', check: (data) => data.allAnime.filter(a => !a.isManual && a.watched_episodes === a.episodes).length >= 5 }
];

const ranks = [ 
    { min: 0, title: 'Newbie' }, 
    { min: 10, title: 'Novice' }, 
    { min: 25, title: 'Apprentice' }, 
    { min: 50, title: 'Adept' }, 
    { min: 75, title: 'Expert' }, 
    { min: 100, title: 'Veteran' },
    { min: 200, title: 'Master' },
    { min: 400, title: 'Grandmaster' },
    { min: 600, title: 'Legend' },
    { min: 800, title: 'Mythic' },
    { min: 1000, title: 'Immortal' }
];

// --- DATA PERSISTENCE FUNCTIONS ---

function saveData() { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(challengeData));
    if (firebaseUser) {
        firebase.database().ref(`users/${firebaseUser.uid}/challengeData`).set(challengeData)
            .catch(err => console.error("Firebase save error:", err));
    }
}

function saveAniPaceData() {
    localStorage.setItem(ANIPACE_STORAGE_KEY, JSON.stringify(anipaceData));
    if (firebaseUser) {
        firebase.database().ref(`users/${firebaseUser.uid}/anipaceData`).set(anipaceData)
            .catch(err => console.error("Firebase save error:", err));
    }
}

function loadChallengeData() {
    const localData = localStorage.getItem(STORAGE_KEY);
    const saved = localData ? JSON.parse(localData) : {};
    
    const merged = { ...challengeData, ...saved };
    
    startDate = parseLocalDate(merged.challengeStart);
    endDate = parseLocalDate(merged.challengeEnd);
    
    if (startDate.getTime() >= endDate.getTime()) {
        merged.challengeStart = todayDateString;
        merged.challengeEnd = '2026-12-31';
        startDate = parseLocalDate(merged.challengeStart);
        endDate = parseLocalDate(merged.challengeEnd);
        console.warn("Challenge dates were invalid and reset to defaults.");
    }

    return merged;
}

function loadAniPaceData() {
    const localData = localStorage.getItem(ANIPACE_STORAGE_KEY);
    const saved = localData ? JSON.parse(localData) : {};
    
    const todayKey = getLocalDateString(new Date());
    const merged = { ...anipaceData, ...saved };
    
    if (merged.lastLogDate !== todayKey) {
        merged.episodesToday = 0;
        merged.minutesToday = 0;
        merged.lastLogDate = todayKey;
    }
    
    if (!merged.history) merged.history = [];
    if (!merged.playbackSpeed) merged.playbackSpeed = 1.0;

    return merged;
}

// --- HELPER FUNCTIONS ---

function getEnglishTitle(anime) { 
    if (!anime) return 'Unknown Title'; 
    const englishTitle = (anime.titles || []).find(t => t.type === 'English'); 
    return englishTitle ? englishTitle.title : anime.title || 'Unknown Title'; 
}

function countGenre(allAnime, genre) { 
    return allAnime.filter(a => !a.isManual && (a.genres || []).some(g => g.name === genre)).length; 
}

function showNotification(message, type = 'success') {
    clearTimeout(bannerTimeoutId);
    const banner = document.getElementById('achievement-banner');
    const messageElement = document.getElementById('achievement-message');
    
    messageElement.textContent = message;
    if (type === 'error') {
        banner.style.background = 'linear-gradient(135deg, var(--error-color), #DC2626)';
        banner.style.color = '#FFF';
    } else if (type === 'achievement') {
        banner.style.background = 'linear-gradient(135deg, var(--primary-color), #FFA000)';
        banner.style.color = '#000';
    } else {
        banner.style.background = 'linear-gradient(135deg, var(--success-color), #059669)';
        banner.style.color = '#FFF';
    }
    banner.classList.add('show');
    if (type === 'achievement') { 
        document.getElementById('milestoneSound').play(); 
        messageElement.textContent = `🏆 ${message}`; 
    }
    
    bannerTimeoutId = setTimeout(() => { banner.classList.remove('show'); }, 4000);
}

function getChallengeAnime() {
    const dailyWatchedAnime = Object.values(challengeData.days).flatMap(day => day.watched || []);
    const uniqueMap = new Map();
    dailyWatchedAnime.forEach(item => {
        const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
        }
    });
    return Array.from(uniqueMap.values());
}

function getBacklogAnime() {
    const backlogAnime = challengeData.backlog || [];
    const uniqueMap = new Map();
    backlogAnime.forEach(item => {
        const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
        }
    });
    return Array.from(uniqueMap.values());
}

function getUniqueAnime() {
    const dailyWatchedAnime = Object.values(challengeData.days).flatMap(day => day.watched || []);
    const allWatchedAnime = [...dailyWatchedAnime, ...(challengeData.backlog || [])];
    
    const uniqueMap = new Map();
    allWatchedAnime.forEach(item => {
        const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
        }
    });
    return Array.from(uniqueMap.values());
}

function promptForRating(title) {
    let rating = null;
    while (rating === null) {
        const input = prompt(`Please enter your personal rating (1-10) for: ${title}\n(Enter 0 or leave blank to skip/N/A)`);
        if (input === "" || input === null) {
            return null;
        }
        
        const num = parseFloat(input);
        if (!isNaN(num) && num >= 0 && num <= 10) {
            if (num === 0) return null;
            return num;
        }
        alert("Invalid rating. Please enter a number between 1 and 10.");
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- CORE LOGIC ---

function processAchievements() {
    const achievementData = { allAnime: getUniqueAnime(), days: challengeData.days }; 
    achievements.forEach(ach => {
        if (!challengeData.unlockedAchievements.includes(ach.id) && ach.check(achievementData)) {
            challengeData.unlockedAchievements.push(ach.id);
            showNotification(`Achievement Unlocked: ${ach.title}`, 'achievement');
        }
    });
    saveData(); 
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

// --- CHART & MODAL FUNCTIONS ---

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
                        <h4 class="backlog-title">${anime.title}</h4>
                        <div class="backlog-badges-container">
                            <span class="backlog-tag manual-tag">Manual Entry</span>
                            <span class="backlog-tag my-score-tag">My Score: ${anime.user_score || 'N/A'}</span>
                            <span class="backlog-tag source-tag">${sourceText}</span>
                        </div>
                    </div>
                `;
            } else {
                const studioName = (anime.studios || []).map(s => s.name)[0] || '';
                const genres = (anime.genres || []).map(g => g.name).join(', ') || 'N/A';
                const imageUrl = anime.images?.jpg?.small_image_url || 'https://via.placeholder.com/80x110?text=N/A';
                const synopsis = anime.synopsis || '';
                itemDiv.innerHTML = `
                    <img src="${imageUrl}" alt="Poster">
                    <div class="backlog-info">
                        <h4 class="backlog-title">${getEnglishTitle(anime)}</h4>
                        <div class="backlog-badges-container">
                            <span class="backlog-tag type-tag">${anime.type || 'N/A'}</span>
                            <span class="backlog-tag year-tag">${anime.year || 'N/A'}</span>
                            <span class="backlog-tag mal-score-tag">MAL: ${anime.score || 'N/A'}</span>
                            <span class="backlog-tag my-score-tag">My Score: ${anime.user_score || 'N/A'}</span>
                            <span class="backlog-tag source-tag">${sourceText}</span>
                        </div>
                        <div class="backlog-text-meta">
                            ${studioName ? `<p><strong>Studio:</strong> ${studioName}</p>` : ''}
                            <p><strong>Genres:</strong> ${genres}</p>
                        </div>
                        ${synopsis ? `
                        <div class="backlog-synopsis-container" style="margin-top: 8px;">
                            <button class="backlog-synopsis-toggle-btn" onclick="toggleSynopsis(this)">Read Story ▾</button>
                            <p class="backlog-synopsis-text hidden" style="margin: 6px 0 0 0; font-size: 12.5px; line-height: 1.5; color: var(--text-secondary);">${synopsis}</p>
                        </div>
                        ` : ''}
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
            const genresStr = (anime.genres || []).slice(0, 2).map(g => g.name).join(', ') || 'N/A';

            item.innerHTML = `
                <img src="${imageUrl}" alt="Poster">
                <h4 style="color: var(--text-color);">${title}</h4>
                <div class="search-result-meta" style="font-size: 11.5px; font-weight: bold; color: var(--primary-color); margin-bottom: 2px;">
                    ${anime.type || 'N/A'} • ${anime.year || 'N/A'}
                </div>
                <div class="search-result-genres" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
                    ${genresStr}
                </div>
                <button>Add</button>
            `;
            item.querySelector('button').onclick = () => { onSelect(anime); modal.classList.add('hidden'); };
            grid.appendChild(item);
        });
    }
    modal.classList.remove('hidden');
}

// --- Day Entry Creation ---
function createDayEntry(date) {
    const div = document.createElement('div');
    div.className = 'day-entry';
    
    const dateKey = getLocalDateString(date);
    const todayKey = getLocalDateString(new Date());
    
    if (dateKey === todayKey) { 
        div.id = 'today-entry'; 
    }
    
    challengeData.days[dateKey] = challengeData.days[dateKey] || { watched: [] };
    let savedDayData = challengeData.days[dateKey];

    const dateDisplay = date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    
    div.innerHTML = `<h3>${dateDisplay}<span class="daily-total"></span></h3><div class="anime-list-container"></div><div class="add-controls" style="display: flex; gap: 10px; margin-top: 15px;"><input type="text" placeholder="Type anime name to search and add..." style="flex-grow: 1; padding: 12px; border-radius: 10px; background-color: rgba(0,0,0,0.2); border: 1px solid var(--border-light); color: var(--text-color); font-size: 15px;"><button class="add-btn" style="flex-shrink: 0; padding: 12px 24px; font-weight: 700; width: auto; margin: 0;">Add Anime</button></div>`;
    const animeListContainer = div.querySelector('.anime-list-container');
    const animeInput = div.querySelector('input');
    const addOnlineBtn = div.querySelector('.add-btn');
    const dailyTotalEl = div.querySelector('.daily-total');

    function renderWatchedList() {
        animeListContainer.innerHTML = '';
        (savedDayData.watched || []).forEach((anime, index) => {
            const animeDiv = document.createElement('div');
            animeDiv.className = 'anime-info-item';
            if (anime.isManual) { 
                animeDiv.innerHTML = `
                    <div class="anime-info-text">
                        <h4 class="anime-info-title">${anime.title} <span class="manual-entry-badge">(Manual)</span></h4>
                        <div class="anime-info-badges">
                            ${anime.user_score ? `<span class="anime-info-badge user-score-badge">My: ${anime.user_score}</span>` : ''}
                        </div>
                    </div>
                    <button class="remove-btn" data-index="${index}">&times;</button>
                `;
            } else {
                const imageUrl = anime.images?.jpg?.image_url || 'https://via.placeholder.com/60x85?text=N/A';
                const studioName = (anime.studios || []).map(s => s.name)[0] || '';
                const genres = (anime.genres || []).map(g => g.name).join(', ') || 'N/A';
                const synopsis = anime.synopsis || '';

                animeDiv.innerHTML = `
                    <img src="${imageUrl}" alt="Poster" class="anime-info-img">
                    <div class="anime-info-text">
                        <h4 class="anime-info-title">${getEnglishTitle(anime)}</h4>
                        <div class="anime-info-badges">
                            <span class="anime-info-badge type-badge">${anime.type || 'N/A'}</span>
                            <span class="anime-info-badge year-badge">${anime.year || 'N/A'}</span>
                            ${anime.score ? `<span class="anime-info-badge mal-score-badge">MAL: ${anime.score}</span>` : ''}
                            ${anime.user_score ? `<span class="anime-info-badge user-score-badge">My: ${anime.user_score}</span>` : ''}
                        </div>
                        <div class="anime-info-details">
                            ${studioName ? `<p><strong>Studio:</strong> ${studioName}</p>` : ''}
                            <p><strong>Genres:</strong> ${genres}</p>
                        </div>
                        ${synopsis ? `
                        <div class="anime-synopsis-container">
                            <button class="synopsis-toggle-btn" onclick="toggleSynopsis(this)">Read Story ▾</button>
                            <p class="anime-synopsis-text hidden">${synopsis}</p>
                        </div>
                        ` : ''}
                    </div>
                    <button class="remove-btn" data-index="${index}">&times;</button>
                `;
            }
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
            const response = await fetch(`${API_URL}?filter[text]=${encodeURIComponent(title)}&page[limit]=10&include=genres,categories,animeProductions.producer`);
            const searchData = await response.json(); 
            const normalizedData = normalizeKitsuResponse(searchData);
            showSearchResults(normalizedData, (selectedAnime) => {
                
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
            addOnlineBtn.textContent = 'Add Anime';
            addOnlineBtn.disabled = false; 
        } 
    };
    
    renderWatchedList();
    return div;
}

// --- ANIPACE LOGIC ---
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

// --- SCREEN SWITCHING LOGIC ---
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

// --- Challenge Layout ---
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

// --- INITIALIZATION & EVENT LISTENERS ---
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

    addBacklogOnlineBtn.onclick = async () => {
        const title = backlogInput.value.trim(); 
        if (!title) return; 
        addBacklogOnlineBtn.textContent = 'Searching...'; 
        addBacklogOnlineBtn.disabled = true; 
        try { 
            const response = await fetch(`${API_URL}?filter[text]=${encodeURIComponent(title)}&page[limit]=10&include=genres,categories,animeProductions.producer`);
            const searchData = await response.json(); 
            const normalizedData = normalizeKitsuResponse(searchData);
            showSearchResults(normalizedData, (selectedAnime) => {
                
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
            addBacklogOnlineBtn.textContent = 'Add Anime';
            addBacklogOnlineBtn.disabled = false; 
        }
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

    document.getElementById('reset-btn').onclick = () => {
        if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ANIPACE_STORAGE_KEY);
            if (firebaseUser) {
                firebase.database().ref(`users/${firebaseUser.uid}`).remove().then(() => {
                    location.reload();
                }).catch(() => {
                    location.reload();
                });
            } else {
                location.reload();
            }
        }
    };
}

function initializeFirebase() {
    const firebaseConfig = {
      apiKey: "AIzaSyDNOVz7Q0jL0FYs_LIb8gyil_7widhEwPE",
      authDomain: "anime-challenge-2ed29.firebaseapp.com",
      databaseURL: "https://anime-challenge-2ed29-default-rtdb.firebaseio.com",
      projectId: "anime-challenge-2ed29",
      storageBucket: "anime-challenge-2ed29.firebasestorage.app",
      messagingSenderId: "278845737524",
      appId: "1:278845737524:web:91a3bc97aca5ae3fc31861",
      measurementId: "G-P3WVXCZTLL"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);

    const statusEl = document.getElementById('firebase-sync-status');
    const infoEl = document.getElementById('firebase-user-info');
    const authForm = document.getElementById('firebase-auth-form');
    const accDetails = document.getElementById('firebase-account-details');
    const userEmailEl = document.getElementById('firebase-user-email');

    // Observe Auth state and load/sync user database entries
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            firebaseUser = user;
            if (statusEl) {
                statusEl.textContent = user.isAnonymous ? 'Guest Mode (Cloud Synced)' : 'Account Synced ☁️';
                statusEl.style.color = 'var(--success-color)';
            }
            if (infoEl) {
                infoEl.textContent = `UID: ${user.uid}`;
            }

            if (user.isAnonymous) {
                if (authForm) authForm.classList.remove('hidden');
                if (accDetails) accDetails.classList.add('hidden');
            } else {
                if (authForm) authForm.classList.add('hidden');
                if (accDetails) accDetails.classList.remove('hidden');
                if (userEmailEl) userEmailEl.textContent = user.email || user.displayName || 'Google Account';
            }

            // One-time pull and merge of data from Firebase upon connection
            firebase.database().ref(`users/${user.uid}`).once('value').then(snapshot => {
                const cloud = snapshot.val();
                if (cloud) {
                    let updated = false;
                    if (cloud.challengeData) {
                        // Merge fields safely to retain original object references
                        Object.assign(challengeData, cloud.challengeData);
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(challengeData));
                        updated = true;
                    }
                    if (cloud.anipaceData) {
                        // Merge fields safely to retain original object references
                        Object.assign(anipaceData, cloud.anipaceData);
                        localStorage.setItem(ANIPACE_STORAGE_KEY, JSON.stringify(anipaceData));
                        updated = true;
                    }
                    if (updated) {
                        initializeChallengeLayout();
                        updateAllDisplays();
                    }
                } else {
                    // First-time sync: Upload existing local progress to the cloud database
                    firebase.database().ref(`users/${user.uid}`).set({
                        challengeData: challengeData,
                        anipaceData: anipaceData
                    }).catch(err => console.error("Firebase init set error:", err));
                }
            }).catch(err => {
                console.error("Firebase read error:", err);
                if (statusEl) {
                    statusEl.textContent = 'Sync Access Denied';
                    statusEl.style.color = 'var(--error-color)';
                }
            });
        } else {
            firebaseUser = null;
            if (statusEl) {
                statusEl.textContent = 'Connecting...';
                statusEl.style.color = 'var(--text-secondary)';
            }
            if (authForm) authForm.classList.remove('hidden');
            if (accDetails) accDetails.classList.add('hidden');

            // Auto-sign-in anonymously to create credentials and resolve security rules cleanly
            firebase.auth().signInAnonymously().catch(err => {
                console.warn("Anonymous authentication failed. Operating in Local-Only Mode:", err);
                if (statusEl) {
                    statusEl.textContent = 'Local Mode (Cloud Offline)';
                    statusEl.style.color = 'var(--text-secondary)';
                }
                showNotification('Running in local-only mode. (Enable Anonymous Auth in Firebase Console to unlock Cloud Sync)', 'error');
            });
        }
    });

    // Google Sign-In Event Handler (NEW)
    document.getElementById('firebase-google-btn').onclick = () => {
        const provider = new firebase.auth.GoogleAuthProvider();

        // If logged in as guest (anonymous), we should link the credentials to retain their progress!
        const currentUser = firebase.auth().currentUser;
        if (currentUser && currentUser.isAnonymous) {
            currentUser.linkWithPopup(provider)
                .then((result) => {
                    showNotification('Google account linked successfully!');
                })
                .catch((err) => {
                    if (err.code === 'auth/credential-already-in-use') {
                        // If Google is already registered as an account, sign in directly with it.
                        firebase.auth().signInWithCredential(err.credential)
                            .then(() => {
                                showNotification('Signed in with Google!');
                            })
                            .catch(err2 => showNotification(err2.message, 'error'));
                    } else {
                        // Popup block or other auth issues -> fallback to popup signIn directly
                        firebase.auth().signInWithPopup(provider)
                            .then(() => {
                                showNotification('Signed in with Google!');
                            })
                            .catch(pErr => showNotification(pErr.message, 'error'));
                    }
                });
        } else {
            firebase.auth().signInWithPopup(provider)
                .then((result) => {
                    showNotification('Signed in with Google successfully!');
                })
                .catch(err => {
                    showNotification(err.message, 'error');
                });
        }
    };

    // Login Event Handler
    document.getElementById('firebase-login-btn').onclick = () => {
        const email = document.getElementById('firebase-email').value.trim();
        const password = document.getElementById('firebase-password').value;
        if (!email || !password) {
            showNotification('Please fill in both email and password.', 'error');
            return;
        }

        firebase.auth().signInWithEmailAndPassword(email, password)
            .then((result) => {
                showNotification('Signed in successfully!');
                document.getElementById('firebase-email').value = '';
                document.getElementById('firebase-password').value = '';
            })
            .catch(err => {
                showNotification(err.message, 'error');
            });
    };

    // Register Event Handler
    document.getElementById('firebase-register-btn').onclick = () => {
        const email = document.getElementById('firebase-email').value.trim();
        const password = document.getElementById('firebase-password').value;
        if (!email || !password) {
            showNotification('Please fill in both email and password.', 'error');
            return;
        }
        if (password.length < 6) {
            showNotification('Password must be at least 6 characters.', 'error');
            return;
        }

        // Copy current guest data so we can upload it to the new account after registration
        const guestChallenge = challengeData;
        const guestAnipace = anipaceData;

        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then((result) => {
                showNotification('Account created successfully!');
                const uid = result.user.uid;

                // Upload current list data to the newly created account
                firebase.database().ref(`users/${uid}`).set({
                    challengeData: guestChallenge,
                    anipaceData: guestAnipace
                }).catch(err => console.error(err));

                document.getElementById('firebase-email').value = '';
                document.getElementById('firebase-password').value = '';
            })
            .catch(err => {
                showNotification(err.message, 'error');
            });
    };

    // Logout Event Handler
    document.getElementById('firebase-logout-btn').onclick = () => {
        firebase.auth().signOut()
            .then(() => {
                showNotification('Logged out from cloud account.');
                // Clear local caches and reset to empty guest space
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(ANIPACE_STORAGE_KEY);
                location.reload();
            })
            .catch(err => {
                showNotification(err.message, 'error');
            });
    };
}

initializeApp();
initializeFirebase();

/*
========================================================================
FIREBASE SETUP INSTRUCTIONS
========================================================================
1. ENABLE ANONYMOUS AUTH:
   In your Firebase Console, navigate to:
   Authentication -> Sign-in method -> Add new provider -> select "Anonymous" and click "Enable".

2. ENABLE GOOGLE SIGN-IN:
   In your Firebase Console, navigate to:
   Authentication -> Sign-in method -> Add new provider -> select "Google", click "Enable", select your support email and Save.

3. FIREBASE REALTIME DATABASE SECURITY RULES:
   To prevent "Sync Access Denied" or permission errors, copy and paste the
   following JSON structure into your Firebase Console under:
   Realtime Database -> Rules -> Edit rules -> Publish.

   {
     "rules": {
       "users": {
         "$uid": {
           ".read": "auth != null && auth.uid == $uid",
           ".write": "auth != null && auth.uid == $uid"
         }
       }
     }
   }
========================================================================
*/