// ===============================================
// DATA & STATE MANAGEMENT
// ===============================================

const STORAGE_KEY = 'animeDashboard_v6_combined';
const ANIPACE_STORAGE_KEY = 'anipace_separate_data';
const API_URL = 'https://api.jikan.moe/v4/anime';
const TIME_PER_EPISODE = 24;

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
}

function saveAniPaceData() {
    localStorage.setItem(ANIPACE_STORAGE_KEY, JSON.stringify(anipaceData));
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

// --- DATA GETTERS ---

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
