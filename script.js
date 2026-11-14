// ===============================================
// APP CONFIGURATION (LOCAL STORAGE & FIREBASE DB)
// ===============================================

let firebaseUser = null;
const STORAGE_KEY = 'animeDashboard_v6_combined';
const ANIPACE_STORAGE_KEY = 'anipace_separate_data';
const API_URL = 'https://kitsu.io/api/edge/anime';
const TIME_PER_EPISODE = 24;

// Ported Lounge State & Constants (hoisted to prevent ReferenceErrors on initialization)
let activeChatId = null;
let chatListenerRef = null;
let friendsListenerRef = null;
let presenceListenerRef = null;
let requestsListenerRef = null;
let sentRequestsListenerRef = null;
let myLoungeProfile = { username: null, friendCode: null };
let otherUsersProfiles = {}; // Cache of user profiles

const AVATAR_PRESETS = [
    { name: "🦊 Naruto", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Naruto" },
    { name: "👒 Luffy", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Luffy" },
    { name: "⚡ Goku", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Goku" },
    { name: "🌸 Usagi", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Usagi" },
    { name: "🎒 Deku", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Deku" },
    { name: "⚔️ Zoro", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Zoro" },
    { name: "🕶️ Gojo", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Gojo" },
    { name: "🔥 Tanjiro", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Tanjiro" },
    { name: "🎋 Nezuko", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Nezuko" },
    { name: "🍵 Levi", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Levi" },
    { name: "👁️ Kakashi", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Kakashi" },
    { name: "🥚 Saitama", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Saitama" },
    { name: "🦾 Edward", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Edward" }
];

const EMOJIS = ["😊", "😂", "🔥", "✨", "🍿", "🎉", "💖", "🤩", "🤔", "😭", "😤", "🌸", "🍥", "⚔️", "🦊", "👒", "⚡", "🎒", "👽", "🤖"];

// Normalizes Kitsu API response structure into Jikan format
// ================= AniList API layer =================
// AniList is the app's main anime data source (GraphQL, no key needed
// for public data). Everything AniList returns is converted by
// normalizeAniListResponse into the exact same object shape the rest
// of the app has always consumed, so no screen or feature changes —
// only the source underneath. Kitsu is kept for streaming links only.
const ANILIST_API_URL = 'https://graphql.anilist.co';

// AniList's genre list is fixed by AniList itself (no Setting/place
// tags can ever appear, unlike Kitsu categories). Slugs are ours;
// titles must match AniList's genre names exactly for filtering.
const ANILIST_GENRES = [
    { title: 'Action', slug: 'action' },
    { title: 'Adventure', slug: 'adventure' },
    { title: 'Comedy', slug: 'comedy' },
    { title: 'Drama', slug: 'drama' },
    { title: 'Ecchi', slug: 'ecchi' },
    { title: 'Fantasy', slug: 'fantasy' },
    { title: 'Horror', slug: 'horror' },
    { title: 'Mahou Shoujo', slug: 'mahou-shoujo' },
    { title: 'Mecha', slug: 'mecha' },
    { title: 'Music', slug: 'music' },
    { title: 'Mystery', slug: 'mystery' },
    { title: 'Psychological', slug: 'psychological' },
    { title: 'Romance', slug: 'romance' },
    { title: 'Sci-Fi', slug: 'sci-fi' },
    { title: 'Slice of Life', slug: 'slice-of-life' },
    { title: 'Sports', slug: 'sports' },
    { title: 'Supernatural', slug: 'supernatural' },
    { title: 'Thriller', slug: 'thriller' }
];

// Fresh API results are registered here (keyed by source + id) so the
// Read Story details loader can tell AniList entries from older
// Kitsu entries — both use plain numeric ids that can overlap.
const ANIME_DETAILS_REGISTRY = {};
function registerAnimeForDetails(anime) {
    if (anime && anime.mal_id !== null && anime.mal_id !== undefined) {
        ANIME_DETAILS_REGISTRY[`${anime.source || 'kitsu'}:${anime.mal_id}`] = anime;
    }
}

function stripHtmlTags(text) {
    return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
}

async function anilistGraphQL(query, variables) {
    const res = await fetch(ANILIST_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
        throw new Error(`AniList request failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json.errors) {
        throw new Error('AniList returned errors');
    }
    return json.data;
}

const ANILIST_MEDIA_FIELDS = `
    id
    title { romaji english }
    coverImage { large medium extraLarge }
    bannerImage
    episodes
    duration
    averageScore
    popularity
    seasonYear
    startDate { year }
    format
    status
    genres
    tags { name rank isGeneralSpoiler isMediaSpoiler }
    description
    isAdult
    trailer { id site }
    studios { edges { isMain node { name } } nodes { name } }
    rankings { rank type allTime }
`;

const ANILIST_PAGE_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $genre: String, $tag: String, $formatIn: [MediaFormat], $epGreater: Int, $epLesser: Int, $search: String) {
    Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, status: $status, genre: $genre, tag: $tag, format_in: $formatIn, episodes_greater: $epGreater, episodes_lesser: $epLesser, search: $search, isAdult: false) {
            ${ANILIST_MEDIA_FIELDS}
        }
    }
}`;

const ANILIST_CHARACTERS_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        characters(sort: [ROLE, ID], page: 1, perPage: 4) {
            edges {
                role
                node { name { full } image { medium } }
            }
        }
    }
}`;

// Converts an AniList Page result into the app's normalized shape —
// the same fields the old Kitsu mapper used to produce.
function normalizeAniListResponse(pageData) {
    const media = (pageData && pageData.media) || [];
    const formatMap = { TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special', MUSIC: 'Music' };
    const statusMap = { RELEASING: 'current', FINISHED: 'finished', NOT_YET_RELEASED: 'upcoming', CANCELLED: 'cancelled' };

    return media.map(m => {
        const romaji = (m.title && m.title.romaji) || '';
        const english = (m.title && m.title.english) || null;
        const title = english || romaji;
        const titles = [];
        if (romaji) titles.push({ type: 'Default', title: romaji });
        titles.push({ type: 'English', title: title });

        const mainStudios = ((m.studios && m.studios.edges) || []).filter(e => e.isMain && e.node).map(e => ({ name: e.node.name }));
        const studios = mainStudios.length > 0 ? mainStudios : (((m.studios && m.studios.nodes) || []).slice(0, 1).map(n => ({ name: n.name })));

        const rated = (m.rankings || []).find(r => r.type === 'RATED' && r.allTime);
        const popular = (m.rankings || []).find(r => r.type === 'POPULAR' && r.allTime);

        // AniList keeps detailed labels (Harem, Isekai, School...) as
        // tags, separate from its 18 genres. Pull every non-spoiler tag
        // the anime has, strongest first, so nothing AniList knows
        // about the anime is left behind.
        const tags = (m.tags || [])
            .filter(t => t && t.name && !t.isGeneralSpoiler && !t.isMediaSpoiler)
            .sort((a, b) => (b.rank || 0) - (a.rank || 0))
            .map(t => ({ name: t.name, rank: t.rank || 0 }));

        const anime = {
            mal_id: m.id,
            title: title,
            titles: titles,
            genres: (m.genres || []).map(name => ({ name: name })),
            tags: tags,
            studios: studios,
            type: formatMap[m.format] || 'TV',
            score: (m.averageScore !== null && m.averageScore !== undefined) ? parseFloat((m.averageScore / 10).toFixed(2)) : null,
            year: m.seasonYear || (m.startDate && m.startDate.year) || null,
            images: {
                jpg: {
                    image_url: (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || '',
                    small_image_url: (m.coverImage && m.coverImage.medium) || ''
                }
            },
            episodes: (m.episodes === undefined ? null : m.episodes),
            synopsis: stripHtmlTags(m.description || ''),
            popularityRank: popular ? popular.rank : null,
            ratingRank: rated ? rated.rank : null,
            userCount: m.popularity || null,
            airingStatus: statusMap[m.status] || 'unknown',
            averageRating: (m.averageScore !== null && m.averageScore !== undefined) ? String(m.averageScore) : null,
            youtubeVideoId: (m.trailer && m.trailer.site === 'youtube') ? m.trailer.id : null,
            ageRating: m.isAdult ? 'R' : null,
            ageRatingGuide: null,
            episodeLength: m.duration || null,
            coverImage: m.bannerImage || (m.coverImage && m.coverImage.extraLarge) || null,
            isManual: false,
            source: 'anilist'
        };
        registerAnimeForDetails(anime);
        return anime;
    });
}

// Display labels for a card: the AniList genres first (so the first
// label is always a real genre), then the anime's strongest AniList
// tags — that is where labels like Harem and Isekai live on AniList.
function animeLabelLine(anime, tagLimit) {
    const genreNames = (anime.genres || []).map(g => g.name);
    const tagNames = (anime.tags || []).slice(0, tagLimit === undefined ? 10 : tagLimit).map(t => t.name);
    return genreNames.concat(tagNames).join(', ') || 'N/A';
}

async function searchAniList(text, perPage) {
    const data = await anilistGraphQL(ANILIST_PAGE_QUERY, {
        page: 1,
        perPage: perPage || 10,
        search: text,
        sort: ['SEARCH_MATCH']
    });
    return normalizeAniListResponse(data.Page);
}

// Shared Discover filter variables (genre / format / episode length)
// built from the current Discover filter state.
function buildDiscoverVariables(page) {
    const vars = { page: page, perPage: 12 };
    if (activeDiscoverGenre !== 'all') {
        const genre = ANILIST_GENRES.find(g => g.slug === activeDiscoverGenre);
        if (genre) vars.genre = genre.title;
    }
    if (activeDiscoverTag !== 'all') {
        vars.tag = activeDiscoverTag;
    }
    if (activeDiscoverFormat !== 'all') {
        const formatMap = { 'TV': ['TV', 'TV_SHORT'], 'Movie': ['MOVIE'], 'OVA': ['OVA'], 'special': ['SPECIAL'] };
        if (formatMap[activeDiscoverFormat]) vars.formatIn = formatMap[activeDiscoverFormat];
    }
    if (activeDiscoverEpisodes !== 'all' && DISCOVER_EPISODE_RANGES[activeDiscoverEpisodes]) {
        const rangeParts = DISCOVER_EPISODE_RANGES[activeDiscoverEpisodes].split('..').map(Number);
        // The trend grid's client-side filter enforces the exact range;
        // the server range is kept one wider on the low side so an
        // off-by-one in AniList's comparison can never hide a match.
        vars.epGreater = rangeParts[0] - 1;
        vars.epLesser = rangeParts[1];
    }
    return vars;
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

window.toggleSynopsis = function(btn, animeId, animeSource) {
    const p = btn.nextElementSibling;
    if (p.classList.contains('hidden')) {
        p.classList.remove('hidden');
        btn.textContent = 'Hide Story ▴';
        if (animeId) {
            window.lazyLoadDetails(animeId, animeSource);
        }
    } else {
        p.classList.add('hidden');
        btn.textContent = 'Read Story ▾';
    }
};

// Finds the full anime object behind a details panel: fresh API
// results are in the registry; saved entries come from the user's
// own lists. Older saved entries have no source — they are Kitsu
// entries, because Kitsu was the only source when they were added.
function resolveAnimeForDetails(animeId, animeSource) {
    const source = animeSource || 'kitsu';
    const registered = ANIME_DETAILS_REGISTRY[`${source}:${animeId}`];
    if (registered) return registered;
    const stored = getUniqueAnime().find(a => String(a.mal_id) === String(animeId) && (a.source || 'kitsu') === source);
    if (stored) {
        registerAnimeForDetails(stored);
        return stored;
    }
    return null;
}

// Streaming links live on Kitsu. AniList entries carry AniList ids,
// so their Kitsu entry is found by title first.
async function kitsuIdByTitle(title) {
    try {
        const res = await fetch(`${API_URL}?filter[text]=${encodeURIComponent(title)}&page[limit]=1&fields[anime]=id`);
        const resData = await res.json();
        return (resData.data && resData.data[0] && resData.data[0].id) || null;
    } catch (err) {
        console.error("Kitsu title lookup error:", err);
        return null;
    }
}

function renderStreamingLinks(linksContainer, kitsuId) {
    fetch(`https://kitsu.io/api/edge/anime/${kitsuId}/streaming-links`)
        .then(res => res.json())
        .then(resData => {
            const links = resData.data || [];
            if (links.length === 0) {
                linksContainer.innerHTML = '<span style="font-size: 10.5px; color: var(--text-secondary);">Streaming: No official links found.</span>';
                return;
            }
            let html = '<strong style="font-size: 11px; display: block; margin-bottom: 6px; color: var(--primary-color);">📺 Stream Officially:</strong><div style="display: flex; gap: 8px; flex-wrap: wrap;">';
            links.forEach(link => {
                const url = link.attributes?.url || '#';
                let platform = 'Streaming Service';
                if (url.includes('crunchyroll.com')) platform = 'Crunchyroll';
                else if (url.includes('netflix.com')) platform = 'Netflix';
                else if (url.includes('hulu.com')) platform = 'Hulu';
                else if (url.includes('funimation.com')) platform = 'Funimation';
                else if (url.includes('hidive.com')) platform = 'HIDIVE';
                else if (url.includes('youtube.com')) platform = 'YouTube';
                else if (url.includes('amazon.com')) platform = 'Amazon Prime';

                html += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="streaming-link-badge" style="background: #1F2937; color: #FFFFFF; font-size: 10px; padding: 4px 8px; border-radius: 4px; text-decoration: none; border: 1px solid rgba(255,255,255,0.15); display: inline-flex; align-items: center; gap: 4px; font-weight: bold; transition: background 0.2s;">📺 ${platform}</a>`;
            });
            html += '</div>';
            linksContainer.innerHTML = html;
        })
        .catch(err => {
            console.error("Streaming fetch error:", err);
            linksContainer.innerHTML = '<span style="font-size: 10.5px; color: var(--error-color);">Failed to load streaming links.</span>';
        });
}

// Characters come from AniList (names + images), rendered into the
// same cards the Kitsu characters used.
function renderAniListCharacters(charsContainer, anilistId) {
    anilistGraphQL(ANILIST_CHARACTERS_QUERY, { id: anilistId })
        .then(data => {
            const edges = (data && data.Media && data.Media.characters && data.Media.characters.edges) || [];
            if (edges.length === 0) {
                charsContainer.innerHTML = '';
                return;
            }
            let html = '<strong style="font-size: 11px; display: block; margin-bottom: 6px; color: var(--primary-color); margin-top: 8px;">🎭 Main Characters:</strong><div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; max-width: 100%; box-sizing: border-box;">';
            edges.forEach(edge => {
                if (!edge.node) return;
                const name = (edge.node.name && edge.node.name.full) || 'Unknown';
                const img = (edge.node.image && edge.node.image.medium) || 'https://via.placeholder.com/40x50';
                const roleType = edge.role === 'MAIN' ? 'Main' : 'Supporting';

                html += `
                    <div style="flex: 0 0 auto; width: 80px; text-align: center; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 6px; border: 1px solid rgba(255,255,255,0.05);">
                        <img src="${img}" alt="${name}" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; margin-bottom: 4px;">
                        <div style="font-size: 9px; font-weight: bold; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name}">${name}</div>
                        <div style="font-size: 8px; color: var(--text-secondary);">${roleType}</div>
                    </div>
                `;
            });
            html += '</div>';
            charsContainer.innerHTML = html;
        })
        .catch(err => {
            console.error("Characters fetch error:", err);
            charsContainer.innerHTML = '';
        });
}

window.lazyLoadDetails = function(animeId, animeSource) {
    const linksContainer = document.getElementById(`streaming-links-${animeId}`);
    const charsContainer = document.getElementById(`characters-${animeId}`);
    const anime = resolveAnimeForDetails(animeId, animeSource);
    const source = animeSource || (anime && anime.source) || 'kitsu';

    // Full AniList tag list: the tags ride along on the anime object,
    // so showing them needs no extra request. Inserted once, above
    // the streaming links.
    const tagsAnchor = linksContainer || charsContainer;
    if (tagsAnchor && anime && Array.isArray(anime.tags) && anime.tags.length > 0) {
        const parent = tagsAnchor.parentElement;
        if (parent && !parent.querySelector('.anime-tags-row')) {
            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'anime-tags-row';
            tagsDiv.style.cssText = 'margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 10.5px; color: var(--text-secondary); line-height: 1.7;';
            tagsDiv.innerHTML = '<strong>🏷️ Tags:</strong> ' + anime.tags.map(t => t.name).join(', ');
            parent.insertBefore(tagsDiv, tagsAnchor);
        }
    }

    if (linksContainer && !linksContainer.dataset.loaded) {
        linksContainer.dataset.loaded = 'true';
        linksContainer.innerHTML = '<span style="font-size: 10px; color: var(--text-secondary);">Loading streaming options...</span>';
        if (anime && anime.isManual) {
            linksContainer.innerHTML = '<span style="font-size: 10.5px; color: var(--text-secondary);">Streaming: No official links found.</span>';
        } else if (source === 'anilist') {
            const titleForLookup = anime ? getEnglishTitle(anime) : null;
            if (!titleForLookup) {
                linksContainer.innerHTML = '<span style="font-size: 10.5px; color: var(--text-secondary);">Streaming: No official links found.</span>';
            } else {
                kitsuIdByTitle(titleForLookup).then(kitsuId => {
                    if (kitsuId) {
                        renderStreamingLinks(linksContainer, kitsuId);
                    } else {
                        linksContainer.innerHTML = '<span style="font-size: 10.5px; color: var(--text-secondary);">Streaming: No official links found.</span>';
                    }
                });
            }
        } else {
            renderStreamingLinks(linksContainer, animeId);
        }
    }

    if (charsContainer && !charsContainer.dataset.loaded) {
        charsContainer.dataset.loaded = 'true';
        charsContainer.innerHTML = '<span style="font-size: 10px; color: var(--text-secondary);">Loading characters...</span>';
        if (anime && anime.isManual) {
            charsContainer.innerHTML = '';
        } else if (source === 'anilist') {
            renderAniListCharacters(charsContainer, parseInt(animeId));
        } else if (anime) {
            // Kitsu-era entry: find its AniList match by title, then
            // load that entry's characters from AniList.
            searchAniList(getEnglishTitle(anime), 1)
                .then(results => {
                    if (results && results.length > 0) {
                        renderAniListCharacters(charsContainer, results[0].mal_id);
                    } else {
                        charsContainer.innerHTML = '';
                    }
                })
                .catch(() => { charsContainer.innerHTML = ''; });
        } else {
            charsContainer.innerHTML = '';
        }
    }
};

window.playTrailer = function(btn, videoId) {
    const container = btn.parentElement;
    if (!container) return;

    container.innerHTML = `
        <div class="trailer-iframe-wrapper" style="position: relative; width: 100%; padding-top: 56.25%; margin-top: 10px; border-radius: 8px; overflow: hidden; background: #000; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
            <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1"
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
                    allow="autoplay; encrypted-media"
                    allowfullscreen>
            </iframe>
        </div>
    `;
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

// --- ACHIEVEMENT HELPERS ---
// Longest run of consecutive days with at least one logged anime.
// Shared by the streak achievements and their progress bars so the
// logic lives in exactly one place.
function getMaxLogStreak(days) {
    const dates = Object.keys(days || {}).sort();
    if (dates.length === 0) return 0;
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < dates.length; i++) {
        const diffDays = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else if (diffDays > 1) {
            currentStreak = 1;
        }
    }
    return maxStreak;
}

// Total XP earned from unlocked achievements (tiered XP, not a flat rate).
function calculateAchievementXP(unlockedIds) {
    const unlocked = new Set(unlockedIds || []);
    return achievements.reduce((sum, ach) => sum + (unlocked.has(ach.id) ? (ach.xp || 0) : 0), 0);
}

// Which rank tab is shown in the achievements modal. Reset to 'Newbie'
// every time the modal opens (see the achievements-card click handler).
let activeAchievementRank = 'Newbie';

// Icon + accent colour for each genre's badge achievements.
const GENRE_ACH_META = {
    'Romance': { icon: '💕', color: '#F472B6' },
    'Action': { icon: '⚔️', color: '#EF4444' },
    'Comedy': { icon: '😂', color: '#FACC15' },
    'Fantasy': { icon: '🐉', color: '#A78BFA' },
    'Sci-Fi': { icon: '🚀', color: '#38BDF8' },
    'Harem': { icon: '💘', color: '#FB7185' },
    'Slice of Life': { icon: '🍵', color: '#4ADE80' },
    'Isekai': { icon: '🌀', color: '#818CF8' },
    'Drama': { icon: '🎭', color: '#FB923C' },
    'Mystery': { icon: '🔍', color: '#94A3B8' },
    'Horror': { icon: '👻', color: '#C084FC' },
    'Adventure': { icon: '🗺️', color: '#34D399' },
    'Supernatural': { icon: '👁️', color: '#E879F9' },
    'Mecha': { icon: '🤖', color: '#67E8F9' },
    'Sports': { icon: '⚽', color: '#F97316' },
    'Psychological': { icon: '🧠', color: '#F472B6' },
    'Thriller': { icon: '😱', color: '#F87171' },
    'Music': { icon: '🎵', color: '#FBBF24' },
    'Historical': { icon: '🏯', color: '#D97706' },
    'Military': { icon: '🎖️', color: '#84CC16' }
};

// XP tiers: easy 100 / medium 250 / hard 500 / epic 1000.
// `category` is the ONLY thing the modal filters on (never ID substrings).
// `rank` is the rank tab an achievement appears under. `target` is the
// number the progress bar counts towards. Existing IDs are unchanged so
// already-unlocked achievements stay unlocked.
const achievements = [
    { id: 'total_1', title: 'First Step', description: 'Log your first anime.', category: 'total', icon: '🌱', color: '#4ADE80', xp: 100, rank: 'Newbie', target: 1, check: (data) => data.allAnime.length >= 1 },
    { id: 'total_10', title: 'Anime Novice', description: 'Log 10 different anime.', category: 'total', icon: '🚀', color: '#22C55E', xp: 100, rank: 'Novice', target: 10, check: (data) => data.allAnime.length >= 10 },
    { id: 'total_25', title: 'Anime Apprentice', description: 'Log 25 different anime.', category: 'total', icon: '🌟', color: '#10B981', xp: 250, rank: 'Apprentice', target: 25, check: (data) => data.allAnime.length >= 25 },
    { id: 'total_50', title: 'Anime Adept', description: 'Log 50 different anime.', category: 'total', icon: '🎖️', color: '#F59E0B', xp: 250, rank: 'Adept', target: 50, check: (data) => data.allAnime.length >= 50 },
    { id: 'total_100', title: 'Anime Veteran', description: 'Log 100 different anime.', category: 'total', icon: '👑', color: '#F97316', xp: 500, rank: 'Veteran', target: 100, check: (data) => data.allAnime.length >= 100 },
    { id: 'total_200', title: 'Anime Master', description: 'Log 200 different anime.', category: 'total', icon: '💎', color: '#38BDF8', xp: 500, rank: 'Master', target: 200, check: (data) => data.allAnime.length >= 200 },
    { id: 'total_300', title: 'Anime Grandmaster', description: 'Log 300 different anime.', category: 'total', icon: '🔥', color: '#EF4444', xp: 500, rank: 'Master', target: 300, check: (data) => data.allAnime.length >= 300 },
    { id: 'total_400', title: 'Anime Legend', description: 'Log 400 different anime.', category: 'total', icon: '⚡', color: '#A78BFA', xp: 1000, rank: 'Grandmaster', target: 400, check: (data) => data.allAnime.length >= 400 },
    { id: 'total_500', title: 'Anime Mythic', description: 'Log 500 different anime.', category: 'total', icon: '🌌', color: '#818CF8', xp: 1000, rank: 'Grandmaster', target: 500, check: (data) => data.allAnime.length >= 500 },
    { id: 'total_600', title: 'Legendary Watcher', description: 'Log 600 different anime.', category: 'total', icon: '🛡️', color: '#FACC15', xp: 1000, rank: 'Legend', target: 600, check: (data) => data.allAnime.length >= 600 },
    { id: 'total_800', title: 'Mythical Watcher', description: 'Log 800 different anime.', category: 'total', icon: '🔮', color: '#C084FC', xp: 1000, rank: 'Mythic', target: 800, check: (data) => data.allAnime.length >= 800 },
    { id: 'total_1000', title: 'Anime Immortal', description: 'Log 1000 different anime.', category: 'total', icon: '🏆', color: '#FFD700', xp: 1000, rank: 'Immortal', target: 1000, check: (data) => data.allAnime.length >= 1000 },
    
    ...['Romance', 'Action', 'Comedy', 'Fantasy', 'Sci-Fi', 'Harem', 'Slice of Life', 'Isekai', 'Drama', 'Mystery', 
        'Horror', 'Adventure', 'Supernatural', 'Mecha', 'Sports', 'Psychological', 'Thriller', 'Music', 'Historical', 'Military'].map(genre => {
        const meta = GENRE_ACH_META[genre] || { icon: '🎬', color: '#9CA3AF' };
        return ([
            { id: `${genre.toLowerCase()}_1`, title: `${genre} Fan`, description: `Watch 5 ${genre} anime.`, category: 'genre', genre, icon: meta.icon, color: meta.color, xp: 100, rank: 'Newbie', target: 5, check: (data) => countGenre(data.allAnime, genre) >= 5 },
            { id: `${genre.toLowerCase()}_2`, title: `${genre} Enthusiast`, description: `Watch 15 ${genre} anime.`, category: 'genre', genre, icon: meta.icon, color: meta.color, xp: 250, rank: 'Novice', target: 15, check: (data) => countGenre(data.allAnime, genre) >= 15 },
            { id: `${genre.toLowerCase()}_3`, title: `${genre} Master`, description: `Watch 30 ${genre} anime.`, category: 'genre', genre, icon: meta.icon, color: meta.color, xp: 500, rank: 'Apprentice', target: 30, check: (data) => countGenre(data.allAnime, genre) >= 30 }
        ]);
    }).flat(),
    
    { id: 'decade_80s', title: '80s Nostalgia', description: 'Watch 3 anime from the 1980s.', category: 'decade', icon: '📼', color: '#F472B6', xp: 100, rank: 'Newbie', target: 3, startYear: 1980, endYear: 1990, check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 1980 && a.year < 1990).length >= 3 },
    { id: 'decade_90s', title: '90s Nostalgia', description: 'Watch 5 anime from the 1990s.', category: 'decade', icon: '📟', color: '#FB923C', xp: 100, rank: 'Newbie', target: 5, startYear: 1990, endYear: 2000, check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 1990 && a.year < 2000).length >= 5 },
    { id: 'decade_2000s', title: 'Millennium Kid', description: 'Watch 10 anime from the 2000s.', category: 'decade', icon: '💿', color: '#38BDF8', xp: 250, rank: 'Novice', target: 10, startYear: 2000, endYear: 2010, check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 2000 && a.year < 2010).length >= 10 },
    { id: 'decade_2010s', title: 'Modern Classic', description: 'Watch 15 anime from the 2010s.', category: 'decade', icon: '📱', color: '#A78BFA', xp: 250, rank: 'Apprentice', target: 15, startYear: 2010, endYear: 2020, check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 2010 && a.year < 2020).length >= 15 },
    { id: 'decade_2020s', title: 'Current Era', description: 'Watch 20 anime from the 2020s.', category: 'decade', icon: '🚀', color: '#4ADE80', xp: 500, rank: 'Apprentice', target: 20, startYear: 2020, endYear: null, check: (data) => data.allAnime.filter(a => !a.isManual && a.year >= 2020).length >= 20 },
    
    { id: 'studio_kyoani', title: 'KyoAni Fan', description: 'Watch 3 anime from Kyoto Animation.', category: 'studio', icon: '🌸', color: '#F9A8D4', xp: 250, rank: 'Adept', target: 3, studio: 'Kyoto Animation', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Kyoto Animation')).length >= 3 },
    { id: 'studio_ghibli', title: 'Ghibli Lover', description: 'Watch 3 anime from Studio Ghibli.', category: 'studio', icon: '🌿', color: '#86EFAC', xp: 250, rank: 'Adept', target: 3, studio: 'Studio Ghibli', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Studio Ghibli')).length >= 3 },
    { id: 'studio_madhouse', title: 'Madhouse Marathoner', description: 'Watch 5 anime from Madhouse.', category: 'studio', icon: '🎭', color: '#FCA5A5', xp: 500, rank: 'Adept', target: 5, studio: 'Madhouse', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Madhouse')).length >= 5 },
    { id: 'studio_ufotable', title: 'Ufotable Visuals', description: 'Watch 3 anime from Ufotable.', category: 'studio', icon: '⚔️', color: '#FDA4AF', xp: 250, rank: 'Adept', target: 3, studio: 'Ufotable', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Ufotable')).length >= 3 },
    { id: 'studio_bones', title: 'Bones Collector', description: 'Watch 5 anime from Bones.', category: 'studio', icon: '💀', color: '#C4B5FD', xp: 500, rank: 'Adept', target: 5, studio: 'Bones', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Bones')).length >= 5 },
    { id: 'studio_wit', title: 'Wit Witness', description: 'Watch 3 anime from Wit Studio.', category: 'studio', icon: '🗡️', color: '#93C5FD', xp: 250, rank: 'Expert', target: 3, studio: 'Wit Studio', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Wit Studio')).length >= 3 },
    { id: 'studio_trigger', title: 'Trigger Happy', description: 'Watch 3 anime from Trigger.', category: 'studio', icon: '💥', color: '#FDBA74', xp: 250, rank: 'Expert', target: 3, studio: 'Trigger', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Trigger')).length >= 3 },
    { id: 'studio_cloverworks', title: 'Clover Collector', description: 'Watch 3 anime from CloverWorks.', category: 'studio', icon: '🍀', color: '#86EFAC', xp: 250, rank: 'Expert', target: 3, studio: 'CloverWorks', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'CloverWorks')).length >= 3 },
    { id: 'studio_a1', title: 'A-1 Productions', description: 'Watch 5 anime from A-1 Pictures.', category: 'studio', icon: '🎬', color: '#FCD34D', xp: 500, rank: 'Expert', target: 5, studio: 'A-1 Pictures', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'A-1 Pictures')).length >= 5 },
    { id: 'studio_production_ig', title: 'IG Enthusiast', description: 'Watch 3 anime from Production I.G.', category: 'studio', icon: '🤖', color: '#67E8F9', xp: 250, rank: 'Expert', target: 3, studio: 'Production I.G', check: (data) => data.allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === 'Production I.G')).length >= 3 },
    
    { id: 'binge_watcher', title: 'Binge Watcher', description: 'Watch 5+ anime on a single day.', category: 'special', icon: '🍿', color: '#F59E0B', xp: 250, rank: 'Newbie', target: 5, check: (data) => Object.values(data.days).some(d => (d.watched || []).length >= 5) },
    { id: 'critics_choice', title: 'Critic\'s Choice', description: 'Watch 5 anime with a score of 8.5 or higher.', category: 'special', icon: '🎩', color: '#E879F9', xp: 250, rank: 'Novice', target: 5, check: (data) => data.allAnime.filter(a => !a.isManual && a.score >= 8.5).length >= 5 },
    { id: 'hidden_gems', title: 'Hidden Gems', description: 'Watch 5 anime with a score below 7.0.', category: 'special', icon: '💎', color: '#38BDF8', xp: 250, rank: 'Newbie', target: 5, check: (data) => data.allAnime.filter(a => !a.isManual && a.score < 7.0).length >= 5 },
    { id: 'long_runner', title: 'Long Runner', description: 'Watch an anime with 50+ episodes.', category: 'special', icon: '🏃', color: '#34D399', xp: 250, rank: 'Novice', target: 50, check: (data) => data.allAnime.some(a => !a.isManual && a.episodes >= 50) },
    { id: 'movie_buff', title: 'Movie Buff', description: 'Watch 10 anime movies.', category: 'special', icon: '🎬', color: '#F472B6', xp: 500, rank: 'Novice', target: 10, check: (data) => data.allAnime.filter(a => !a.isManual && a.type === 'Movie').length >= 10 },
    { id: 'ova_collector', title: 'OVA Collector', description: 'Watch 5 OVAs.', category: 'special', icon: '📀', color: '#A78BFA', xp: 250, rank: 'Novice', target: 5, check: (data) => data.allAnime.filter(a => !a.isManual && a.type === 'OVA').length >= 5 },
    { id: 'seasonal_watcher', title: 'Seasonal Watcher', description: 'Watch anime from 5 different seasons.', category: 'special', icon: '🍂', color: '#FB923C', xp: 250, rank: 'Novice', target: 5, check: (data) => new Set(data.allAnime.filter(a => !a.isManual && a.season).map(a => `${a.season} ${a.year}`)).size >= 5 },
    { id: 'diverse_tastes', title: 'Diverse Tastes', description: 'Watch anime from 10 different genres.', category: 'special', icon: '🌈', color: '#F472B6', xp: 250, rank: 'Novice', target: 10, check: (data) => new Set(data.allAnime.map(a => !a.isManual ? (a.genres || [])[0]?.name : null).filter(Boolean)).size >= 10 },
    { id: 'high_scorer', title: 'High Scorer', description: 'Rate 10 anime with 9 or higher.', category: 'special', icon: '⭐', color: '#FACC15', xp: 500, rank: 'Veteran', target: 10, check: (data) => data.allAnime.filter(a => a.user_score >= 9).length >= 10 },
    { id: 'consistent_rater', title: 'Consistent Rater', description: 'Rate 20 different anime.', category: 'special', icon: '📝', color: '#60A5FA', xp: 500, rank: 'Expert', target: 20, check: (data) => data.allAnime.filter(a => a.user_score && a.user_score > 0).length >= 20 },
    { id: 'marathon_runner', title: 'Marathon Runner', description: 'Log 10+ episodes in a single day with AniPace.', category: 'special', icon: '🏅', color: '#F97316', xp: 250, rank: 'Apprentice', target: 10, check: (data) => anipaceData.history.some(h => h.episodes >= 10) },
    { id: 'speed_demon', title: 'Speed Demon', description: 'Watch at 2.0x playback speed or higher.', category: 'special', icon: '⚡', color: '#FACC15', xp: 100, rank: 'Apprentice', target: 2, check: (data) => anipaceData.playbackSpeed >= 2.0 },
    { id: 'weekend_warrior', title: 'Weekend Warrior', description: 'Log anime on 10 different weekends.', category: 'special', icon: '🛋️', color: '#A78BFA', xp: 500, rank: 'Expert', target: 10, check: (data) => Object.keys(data.days).filter(date => {
        const day = new Date(date).getDay();
        return day === 0 || day === 6;
    }).length >= 10 },
    { id: 'streak_master', title: 'Streak Master', description: 'Log anime for 7 consecutive days.', category: 'special', icon: '🔥', color: '#EF4444', xp: 500, rank: 'Expert', target: 7, check: (data) => getMaxLogStreak(data.days) >= 7 },
    { id: 'completionist', title: 'Completionist', description: 'Complete 5 anime series (watch all episodes).', category: 'special', icon: '✅', color: '#22C55E', xp: 500, rank: 'Expert', target: 5, check: (data) => data.allAnime.filter(a => !a.isManual && a.watched_episodes === a.episodes).length >= 5 },

    // --- NEW ACHIEVEMENTS (added in the achievements redesign) ---
    { id: 'first_week_streak', title: 'First Week Streak', description: 'Log anime 3 days in a row.', category: 'special', icon: '📅', color: '#4ADE80', xp: 100, rank: 'Newbie', target: 3, check: (data) => getMaxLogStreak(data.days) >= 3 },
    { id: 'night_owl', title: 'Night Owl', description: 'Log episodes with AniPace late at night (10pm – 5am).', category: 'special', icon: '🦉', color: '#818CF8', xp: 100, rank: 'Newbie', target: 1, check: (data) => (anipaceData.history || []).some(h => {
        const hour = new Date(h.timestamp).getHours();
        return hour >= 22 || hour < 5;
    }) },
    { id: 'rewatch_master', title: 'Rewatch Master', description: 'Come back to the same anime on a different day.', category: 'special', icon: '🔁', color: '#38BDF8', xp: 250, rank: 'Novice', target: 2, check: (data) => {
        const daysPerAnime = {};
        Object.keys(data.days).forEach(date => {
            (data.days[date].watched || []).forEach(a => {
                const key = a.isManual ? a.title.toLowerCase().trim() : a.mal_id;
                if (!daysPerAnime[key]) daysPerAnime[key] = new Set();
                daysPerAnime[key].add(date);
            });
        });
        return Object.values(daysPerAnime).some(dates => dates.size >= 2);
    } },
    { id: 'perfect_10', title: 'Perfect 10', description: 'Give an anime a perfect 10/10 score.', category: 'special', icon: '💯', color: '#FFD700', xp: 100, rank: 'Newbie', target: 1, check: (data) => data.allAnime.some(a => a.user_score === 10) }
];

// Progress towards one achievement: { current, target, percent, text }.
// Uses the explicit `target` / `genre` / `startYear` / `studio` fields —
// never ID substrings — so the modal and the "Next up" row agree.
function getAchievementProgress(ach, data) {
    const allAnime = data.allAnime;
    const days = data.days || {};
    let current = 0;
    let target = ach.target || 1;
    let text = null;

    if (ach.category === 'total') {
        current = allAnime.length;
    } else if (ach.category === 'genre') {
        current = countGenre(allAnime, ach.genre);
    } else if (ach.category === 'decade') {
        current = allAnime.filter(a => !a.isManual && a.year >= ach.startYear && (ach.endYear === null || a.year < ach.endYear)).length;
    } else if (ach.category === 'studio') {
        current = allAnime.filter(a => !a.isManual && (a.studios || []).some(s => s.name === ach.studio)).length;
    } else if (ach.id === 'binge_watcher') {
        current = Math.max(0, ...Object.values(days).map(d => (d.watched || []).length));
    } else if (ach.id === 'critics_choice') {
        current = allAnime.filter(a => !a.isManual && a.score >= 8.5).length;
    } else if (ach.id === 'hidden_gems') {
        current = allAnime.filter(a => !a.isManual && a.score < 7.0).length;
    } else if (ach.id === 'long_runner') {
        current = Math.max(0, ...allAnime.filter(a => !a.isManual).map(a => a.episodes || 0));
    } else if (ach.id === 'movie_buff') {
        current = allAnime.filter(a => !a.isManual && a.type === 'Movie').length;
    } else if (ach.id === 'ova_collector') {
        current = allAnime.filter(a => !a.isManual && a.type === 'OVA').length;
    } else if (ach.id === 'seasonal_watcher') {
        current = new Set(allAnime.filter(a => !a.isManual && a.season).map(a => `${a.season} ${a.year}`)).size;
    } else if (ach.id === 'diverse_tastes') {
        // Each anime counts once, by its primary (first) genre only — the
        // same rule as the achievement check — so a single anime carrying
        // many genre tags can't nearly complete this on its own.
        current = new Set(allAnime.map(a => !a.isManual ? (a.genres || [])[0]?.name : null).filter(Boolean)).size;
    } else if (ach.id === 'high_scorer') {
        current = allAnime.filter(a => a.user_score >= 9).length;
    } else if (ach.id === 'consistent_rater') {
        current = allAnime.filter(a => a.user_score && a.user_score > 0).length;
    } else if (ach.id === 'marathon_runner') {
        current = anipaceData.history ? Math.max(0, ...anipaceData.history.map(h => h.episodes || 0)) : 0;
    } else if (ach.id === 'speed_demon') {
        current = anipaceData.playbackSpeed || 1.0;
        text = `${current.toFixed(2)}x / 2.00x`;
    } else if (ach.id === 'weekend_warrior') {
        current = Object.keys(days).filter(date => {
            const day = new Date(date).getDay();
            return day === 0 || day === 6;
        }).length;
    } else if (ach.id === 'streak_master' || ach.id === 'first_week_streak') {
        current = getMaxLogStreak(days);
    } else if (ach.id === 'completionist') {
        current = allAnime.filter(a => !a.isManual && a.watched_episodes === a.episodes).length;
    } else if (ach.id === 'night_owl') {
        current = (anipaceData.history || []).some(h => {
            const hour = new Date(h.timestamp).getHours();
            return hour >= 22 || hour < 5;
        }) ? 1 : 0;
    } else if (ach.id === 'rewatch_master') {
        const daysPerAnime = {};
        Object.keys(days).forEach(date => {
            (days[date].watched || []).forEach(a => {
                const key = a.isManual ? a.title.toLowerCase().trim() : a.mal_id;
                if (!daysPerAnime[key]) daysPerAnime[key] = new Set();
                daysPerAnime[key].add(date);
            });
        });
        current = Math.max(0, ...Object.values(daysPerAnime).map(dates => dates.size));
    } else if (ach.id === 'perfect_10') {
        current = allAnime.filter(a => a.user_score === 10).length;
    } else {
        current = (challengeData.unlockedAchievements || []).includes(ach.id) ? 1 : 0;
    }

    const percent = Math.min(100, (current / target) * 100);
    // Display current capped at target so an over-completed achievement
    // never shows impossible progress like "49/3".
    return { current, target, percent, text: text || `${Math.min(current, target)}/${target}` };
}
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

function syncUserProfileAndLeaderboard() {
    if (!firebaseUser) return;
    try {
        const challengeAnime = getChallengeAnime();
        const backlogAnime = getBacklogAnime();
        const { totalXP, userLevel } = calculateUserXPAndLevel();
        // Rank counts ALL anime (challenge days + backlog), not just challenge days.
        const allUniqueCount = getUniqueAnime().length;
        const calculatedRank = ranks.slice().reverse().find(r => allUniqueCount >= r.min)?.title || 'Newbie';

        const watchedListSync = challengeAnime.map(item => ({
            mal_id: item.mal_id || null,
            title: item.title,
            user_score: item.user_score || null,
            type: item.type || 'TV',
            isManual: !!item.isManual
        }));

        const backlogListSync = backlogAnime.map(item => ({
            mal_id: item.mal_id || null,
            title: item.title,
            user_score: item.user_score || null,
            type: item.type || 'TV',
            isManual: !!item.isManual
        }));

        const statsUpdate = {
            title: calculatedRank,
            completedCount: challengeAnime.length,
            totalCount: challengeAnime.length + backlogListSync.length,
            xp: totalXP,
            level: userLevel,
            watchedList: watchedListSync,
            backlogList: backlogListSync
        };

        firebase.database().ref(`users/${firebaseUser.uid}/profile`).update(statsUpdate)
            .catch(err => console.error("Firebase profile real-time update error:", err));

        firebase.database().ref(`leaderboard/${firebaseUser.uid}`).update(statsUpdate)
            .catch(err => console.error("Firebase leaderboard real-time update error:", err));
    } catch (e) {
        console.error("Error during real-time profile/leaderboard sync:", e);
    }
}

function saveData() { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(challengeData));
    if (firebaseUser) {
        firebase.database().ref(`users/${firebaseUser.uid}/challengeData`).set(challengeData)
            .then(() => {
                syncUserProfileAndLeaderboard();
            })
            .catch(err => console.error("Firebase save error:", err));
    }
}

function saveAniPaceData() {
    localStorage.setItem(ANIPACE_STORAGE_KEY, JSON.stringify(anipaceData));
    if (firebaseUser) {
        firebase.database().ref(`users/${firebaseUser.uid}/anipaceData`).set(anipaceData)
            .then(() => {
                syncUserProfileAndLeaderboard();
            })
            .catch(err => console.error("Firebase save error:", err));
    }
}

// --- DATA BACKUP / EXPORT ---
// Downloads a JSON backup of everything stored locally (challenge data +
// AniPace data) so it can be kept safe or restored later. The file holds
// the exact objects saved under the two localStorage keys, and the matching
// restore lives in importBackupData() below (Settings → Import / Restore).
function exportBackupData() {
    try {
        const backup = {
            app: 'Aniclipse',
            version: 1,
            exportedAt: new Date().toISOString(),
            storageKeys: { challengeData: STORAGE_KEY, anipaceData: ANIPACE_STORAGE_KEY },
            challengeData: JSON.parse(JSON.stringify(challengeData)),
            anipaceData: JSON.parse(JSON.stringify(anipaceData))
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aniclipse-backup-${getLocalDateString(new Date())}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotification('Backup downloaded! Keep the file safe — it holds all your anime and episode data.', 'success');
    } catch (err) {
        console.error('Backup export failed:', err);
        showNotification('Backup failed. Please try again.', 'error');
    }
}

// --- DATA RESTORE / IMPORT ---
// Restores a backup file created by exportBackupData(). The file is
// validated BEFORE anything is touched, the user confirms the overwrite,
// and a safety copy of the current data is kept in localStorage first.
const PRE_RESTORE_CHALLENGE_KEY = 'animeDashboard_v6_combined_pre_restore';
const PRE_RESTORE_ANIPACE_KEY = 'anipace_separate_data_pre_restore';

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Checks a parsed backup file. Returns { ok: true } or
// { ok: false, error: '<reason>' }. Pure function — no data is read or
// changed here, so it is safe to call before any restore step.
function validateBackupFile(parsed) {
    if (!isPlainObject(parsed)) return { ok: false, error: 'That file is not a valid Aniclipse backup.' };
    if (parsed.app !== undefined && parsed.app !== 'Aniclipse') return { ok: false, error: 'That file is not an Aniclipse backup.' };
    const hasChallenge = isPlainObject(parsed.challengeData);
    const hasAnipace = isPlainObject(parsed.anipaceData);
    if (!hasChallenge && !hasAnipace) return { ok: false, error: 'Backup has no anime or episode data to restore.' };
    if (hasChallenge) {
        if (parsed.challengeData.days !== undefined && !isPlainObject(parsed.challengeData.days)) return { ok: false, error: 'Backup challenge data is damaged (days).' };
        if (parsed.challengeData.backlog !== undefined && !Array.isArray(parsed.challengeData.backlog)) return { ok: false, error: 'Backup challenge data is damaged (backlog).' };
        if (parsed.challengeData.unlockedAchievements !== undefined && !Array.isArray(parsed.challengeData.unlockedAchievements)) return { ok: false, error: 'Backup challenge data is damaged (achievements).' };
    }
    if (hasAnipace && parsed.anipaceData.history !== undefined && !Array.isArray(parsed.anipaceData.history)) return { ok: false, error: 'Backup episode data is damaged (history).' };
    return { ok: true };
}

// File-picker handler: reads the chosen file, validates it, asks for
// confirmation, and only then restores. Any failure or a cancelled
// confirmation leaves the current data completely untouched.
function handleBackupFileSelect(event) {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    if (event.target) event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        let parsed;
        try {
            parsed = JSON.parse(reader.result);
        } catch (err) {
            showNotification('Could not read that file — it is not valid JSON. Nothing was changed.', 'error');
            return;
        }
        const check = validateBackupFile(parsed);
        if (!check.ok) {
            showNotification(check.error + ' Nothing was changed.', 'error');
            return;
        }
        const parts = [];
        if (isPlainObject(parsed.challengeData)) parts.push('anime, backlog and achievements');
        if (isPlainObject(parsed.anipaceData)) parts.push('episode logs');
        const ok = confirm('Restore this backup? Your current ' + parts.join(' and ') + ' will be replaced by the backup file.\n\nTip: export your current data first if you want to keep it.');
        if (!ok) return; // Cancelled — nothing changed.
        restoreBackupData(parsed);
    };
    reader.onerror = () => {
        showNotification('Could not read that file. Nothing was changed.', 'error');
    };
    reader.readAsText(file);
}

function restoreBackupData(parsed) {
    try {
        // Safety copy of the CURRENT data first, so a bad restore can be
        // undone from the pre-restore keys.
        try {
            const currentChallenge = localStorage.getItem(STORAGE_KEY);
            if (currentChallenge) localStorage.setItem(PRE_RESTORE_CHALLENGE_KEY, currentChallenge);
            const currentAnipace = localStorage.getItem(ANIPACE_STORAGE_KEY);
            if (currentAnipace) localStorage.setItem(PRE_RESTORE_ANIPACE_KEY, currentAnipace);
        } catch (err) {
            console.error('Could not save pre-restore safety copy:', err);
        }
        // Assign into the live objects (keeps their references, like the
        // Firebase login merge does), then save through the normal path so
        // the restored data is written to localStorage AND to Firebase.
        // This matters because the one-time login pull would otherwise
        // overwrite a local-only restore with the old cloud data; pushing
        // the restore to the cloud first means the next pull reads the
        // restored data back. Logged out, saveData() is local-only and
        // the reload below is enough.
        if (isPlainObject(parsed.challengeData)) {
            Object.assign(challengeData, parsed.challengeData);
            saveData();
        }
        if (isPlainObject(parsed.anipaceData)) {
            Object.assign(anipaceData, parsed.anipaceData);
            saveAniPaceData();
        }
        showNotification('Backup restored — reloading…', 'success');
        setTimeout(() => location.reload(), 900);
    } catch (err) {
        console.error('Backup restore failed:', err);
        showNotification('Restore failed. Your current data was not changed.', 'error');
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

// Forgiving title search: punctuation is ignored and the typed words
// can appear in any order, so "girlfriend" or "girlfriend girlfriend"
// both find "Girlfriend, Girlfriend" (whose comma used to break a
// strict letter-by-letter match). All title variants (English and
// romaji) are searched.
function normalizeSearchText(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function animeSearchText(anime) {
    const parts = [anime.title || '', getEnglishTitle(anime)];
    (anime.titles || []).forEach(t => { if (t && t.title) parts.push(t.title); });
    return normalizeSearchText(parts.join(' '));
}

function titleMatchesSearch(anime, rawSearch) {
    const words = normalizeSearchText(rawSearch).split(' ').filter(Boolean);
    if (words.length === 0) return true;
    const haystack = animeSearchText(anime);
    return words.every(w => haystack.includes(w));
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

function animeTitleKeys(anime) {
    const keys = new Set();
    if (anime.title) keys.add(anime.title.toLowerCase().trim());
    (anime.titles || []).forEach(t => {
        if (t && t.title) keys.add(t.title.toLowerCase().trim());
    });
    return keys;
}

function isDuplicateAnime(anime) {
    // The same show can arrive from two APIs with different numeric
    // ids (Kitsu before the switch, AniList after), so duplicates are
    // matched by title as well as by id within the same source.
    const titleKeys = animeTitleKeys(anime);
    const matches = (item) => {
        if (!item) return false;
        if (item.isManual || anime.isManual) {
            return !!(item.title && anime.title && item.title.toLowerCase().trim() === anime.title.toLowerCase().trim());
        }
        if ((item.source || 'kitsu') === (anime.source || 'kitsu') && item.mal_id === anime.mal_id) return true;
        const itemKeys = animeTitleKeys(item);
        for (const k of titleKeys) {
            if (itemKeys.has(k)) return true;
        }
        return false;
    };

    // Check in challenge days
    const dailyWatchedAnime = Object.values(challengeData.days).flatMap(day => day.watched || []);
    if (dailyWatchedAnime.some(matches)) return true;

    // Check in backlog
    return (challengeData.backlog || []).some(matches);
}

function getAnimeTrackedStatus(anime) {
    const key = anime.isManual ? anime.title.toLowerCase().trim() : anime.mal_id;

    // Check in challenge days
    const dailyWatchedAnime = Object.values(challengeData.days).flatMap(day => day.watched || []);
    const inChallenge = dailyWatchedAnime.some(item => {
        const itemKey = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
        return itemKey === key;
    });
    if (inChallenge) return 'completed';

    // Check in backlog
    const inBacklog = (challengeData.backlog || []).some(item => {
        const itemKey = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
        return itemKey === key;
    });
    if (inBacklog) return 'backlog';

    return null;
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

// Builds a manual (user-typed) anime entry in the same shape the rest of
// the app already renders and stores: day cards and the backlog list both
// have dedicated isManual rendering, and genre/studio stats skip manual
// entries. Used when the API doesn't know a title.
function createManualAnimeEntry(title, episodes) {
    const cleanTitle = (title || '').trim();
    return {
        mal_id: null,
        title: cleanTitle,
        titles: [
            { type: 'Default', title: cleanTitle },
            { type: 'English', title: cleanTitle }
        ],
        genres: [],
        studios: [],
        type: 'TV',
        score: null,
        year: null,
        images: { jpg: { image_url: '', small_image_url: '' } },
        episodes: episodes || null,
        watched_episodes: 0,
        synopsis: '',
        isManual: true,
        date_added: new Date().toISOString()
    };
}

// Applies a personal score to every stored copy of an anime (challenge
// days + backlog), since the backlog list shows one merged entry per anime
// while the score physically lives on each stored copy.
function setUserScoreEverywhere(anime, rating) {
    const key = anime.isManual ? anime.title.toLowerCase().trim() : anime.mal_id;
    const matches = item => (item.isManual ? item.title.toLowerCase().trim() : item.mal_id) === key;
    Object.values(challengeData.days).forEach(day => {
        (day.watched || []).forEach(item => { if (matches(item)) item.user_score = rating; });
    });
    (challengeData.backlog || []).forEach(item => { if (matches(item)) item.user_score = rating; });
}

// Moves a backlog-only anime into today's challenge log.
function moveBacklogItemToToday(anime) {
    const key = anime.isManual ? anime.title.toLowerCase().trim() : anime.mal_id;
    const matches = item => (item.isManual ? item.title.toLowerCase().trim() : item.mal_id) === key;
    const index = (challengeData.backlog || []).findIndex(matches);
    if (index === -1) return;
    const [stored] = challengeData.backlog.splice(index, 1);
    const todayKey = getLocalDateString(new Date());
    challengeData.days[todayKey] = challengeData.days[todayKey] || { watched: [] };
    challengeData.days[todayKey].watched.push(stored);
}

// Moves a challenge-log anime into the backlog (removes it from all days,
// keeping one stored copy).
function moveChallengeItemToBacklog(anime) {
    const key = anime.isManual ? anime.title.toLowerCase().trim() : anime.mal_id;
    const matches = item => (item.isManual ? item.title.toLowerCase().trim() : item.mal_id) === key;
    let stored = null;
    Object.values(challengeData.days).forEach(day => {
        if (!day.watched) return;
        for (let i = day.watched.length - 1; i >= 0; i--) {
            if (matches(day.watched[i])) {
                if (!stored) stored = day.watched[i];
                day.watched.splice(i, 1);
            }
        }
    });
    if (stored) {
        challengeData.backlog = challengeData.backlog || [];
        challengeData.backlog.push(stored);
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
    let newlyUnlocked = false;
    achievements.forEach(ach => {
        if (!challengeData.unlockedAchievements.includes(ach.id) && ach.check(achievementData)) {
            challengeData.unlockedAchievements.push(ach.id);
            newlyUnlocked = true;
            showNotification(`Achievement Unlocked: ${ach.title}`, 'achievement');
        }
    });
    // Refresh the header stats (counter, XP, rank badge) right away, so a
    // new unlock shows immediately instead of waiting for the next render.
    if (newlyUnlocked) updateAllDisplays();
    saveData(); 
}


// --- ACHIEVEMENTS MODAL (redesigned) ---
// Rank tabs (always defaulting to Newbie) + a "Next up" row + clean
// category sections filtered on ach.category, never on ID substrings.

const ACHIEVEMENT_CATEGORIES = [
    { key: 'total', heading: '🎯 Milestones' },
    { key: 'genre', heading: '🌸 Genre Badges' },
    { key: 'decade', heading: '📅 Retro Decades' },
    { key: 'studio', heading: '🎬 Animation Studios' },
    { key: 'special', heading: '🔥 Special Challenges' }
];

function renderAchievementsModal() {
    const nextUpEl = document.getElementById('achievements-next-up');
    const tabsEl = document.getElementById('achievements-rank-tabs');
    const grid = document.getElementById('achievements-grid');
    const unlocked = challengeData.unlockedAchievements || [];
    const data = { allAnime: getUniqueAnime(), days: challengeData.days };

    // --- Rank progress: how far to the next rank (counts ALL anime) ---
    const rankProgressEl = document.getElementById('achievements-rank-progress');
    if (rankProgressEl) {
        const totalCount = getUniqueAnime().length;
        const currentRank = ranks.slice().reverse().find(r => totalCount >= r.min) || ranks[0];
        const nextRank = ranks.find(r => r.min > totalCount);
        if (!nextRank) {
            rankProgressEl.innerHTML = `<div class="ach-rank-progress"><div class="ach-rank-progress-text">🏆 Max rank — ${currentRank.title}! (${totalCount} anime)</div><div class="ach-progress-bar"><div class="ach-progress-fill" style="width:100%; background:#FFD700;"></div></div></div>`;
        } else {
            const away = nextRank.min - totalCount;
            const span = nextRank.min - currentRank.min;
            const pct = Math.min(100, Math.max(0, ((totalCount - currentRank.min) / span) * 100));
            rankProgressEl.innerHTML = `<div class="ach-rank-progress"><div class="ach-rank-progress-text">🎖️ ${currentRank.title} · ${totalCount} anime · <b>${away} away from ${nextRank.title}</b></div><div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${pct}%; background:var(--primary-color);"></div></div></div>`;
        }
    }

    // --- "Next up": the 3 locked achievements closest to being unlocked ---
    const locked = achievements.filter(a => !unlocked.includes(a.id));
    const nextUp = locked
        .map(a => ({ ach: a, progress: getAchievementProgress(a, data) }))
        .sort((x, y) => (y.progress.percent - x.progress.percent) || (x.ach.target - y.ach.target))
        .slice(0, 3);
    if (nextUp.length === 0) {
        nextUpEl.innerHTML = `<div class="ach-next-up"><div class="ach-next-up-title">🎉 All achievements unlocked!</div></div>`;
    } else {
        nextUpEl.innerHTML = `<div class="ach-next-up">
            <div class="ach-next-up-title">⏭️ Next up</div>
            <div class="ach-next-up-row">
                ${nextUp.map(({ ach, progress }) => `
                    <div class="ach-next-up-card" style="--ach-color:${ach.color}">
                        <span class="ach-icon">${ach.icon}</span>
                        <div class="ach-next-up-info">
                            <div class="ach-next-up-name">${ach.title}</div>
                            <div class="ach-next-up-progress">${progress.text} (${Math.floor(progress.percent)}%)</div>
                            <div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${progress.percent}%; background:${ach.color};"></div></div>
                        </div>
                        <span class="ach-xp">+${ach.xp} XP</span>
                    </div>`).join('')}
            </div>
        </div>`;
    }

    // --- Rank tabs ---
    tabsEl.innerHTML = '';
    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'ach-rank-tabs';
    ranks.forEach(rank => {
        const count = achievements.filter(a => a.rank === rank.title).length;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ach-rank-tab${rank.title === activeAchievementRank ? ' active' : ''}`;
        btn.textContent = `${rank.title} (${count})`;
        btn.onclick = () => {
            activeAchievementRank = rank.title;
            renderAchievementsModal();
        };
        tabsWrap.appendChild(btn);
    });
    tabsEl.appendChild(tabsWrap);

    // --- Category sections for the active rank tab ---
    grid.innerHTML = '';
    if (achievements.length === 0) {
        grid.innerHTML = `<div class="empty-state-message">No achievements defined.</div>`;
        return;
    }
    const rankAchievements = achievements.filter(a => a.rank === activeAchievementRank);
    ACHIEVEMENT_CATEGORIES.forEach(({ key, heading }) => {
        const categoryAchievements = rankAchievements.filter(a => a.category === key);
        if (categoryAchievements.length === 0) return;

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'achievement-category';
        categoryDiv.innerHTML = `<h3 class="achievement-category-heading">${heading}</h3>`;

        const subGrid = document.createElement('div');
        subGrid.className = 'achievement-subgrid';

        categoryAchievements.forEach(ach => {
            const isUnlocked = unlocked.includes(ach.id);
            const progress = getAchievementProgress(ach, data);
            const item = document.createElement('div');
            item.className = `achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`;
            item.style.setProperty('--ach-color', ach.color);
            item.innerHTML = `
                <div class="ach-card-head">
                    <span class="ach-icon">${ach.icon}</span>
                    <h4>${ach.title}</h4>
                    <span class="ach-xp">+${ach.xp} XP</span>
                </div>
                <p class="ach-desc">${ach.description}</p>
                <div class="ach-status">${isUnlocked ? '✅ Unlocked' : '🔒 Locked'}</div>
                <div class="ach-progress">
                    <div class="ach-progress-labels"><span>Progress</span><span>${progress.text} (${Math.floor(progress.percent)}%)</span></div>
                    <div class="ach-progress-bar"><div class="ach-progress-fill ${isUnlocked ? 'unlocked' : ''}" style="width:${progress.percent}%; background:${isUnlocked ? 'var(--success-color)' : ach.color};"></div></div>
                </div>
            `;
            subGrid.appendChild(item);
        });

        categoryDiv.appendChild(subGrid);
        grid.appendChild(categoryDiv);
    });
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
    desc.innerHTML = `Anime per day. <br>Proj. Comp: <strong>${formattedProjection}</strong>`;
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

function calculateUserXPAndLevel() {
    const challengeCount = getChallengeAnime().length;
    const backlogCount = getBacklogAnime().length;
    const achievementXP = calculateAchievementXP(challengeData.unlockedAchievements || []);
    const episodesCount = anipaceData.history ? anipaceData.history.reduce((sum, h) => sum + (h.episodes || 0), 0) : 0;

    // XP Weights: Completed Challenge: +100 XP, Backlog: +20 XP, Achievements: tiered XP (100/250/500/1000 each), AniPace ep: +10 XP
    const totalXP = (challengeCount * 100) + (backlogCount * 20) + achievementXP + (episodesCount * 10);
    const userLevel = Math.floor(totalXP / 1000) + 1;

    return { totalXP, userLevel };
}

function updateAllDisplays() {
    const challengeAnime = getChallengeAnime();
    const backlogAnime = getBacklogAnime();
    const allUniqueAnime = getUniqueAnime(); 
    const currentGoal = GOAL_TIERS.find(goal => goal > challengeAnime.length) || GOAL_TIERS[GOAL_TIERS.length - 1];

    const { totalXP, userLevel } = calculateUserXPAndLevel();

    document.getElementById('total-watched-card').querySelector('h3').textContent = `Challenge Anime / ${currentGoal}`;
    document.getElementById('total-watched-value').textContent = challengeAnime.length;
    document.getElementById('days-logged-value').textContent = Object.keys(challengeData.days).filter(key => (challengeData.days[key].watched || []).length > 0).length;
    document.getElementById('achievements-unlocked-value').textContent = `${challengeData.unlockedAchievements.length} / ${achievements.length}`;
    
    // Modern Display: Level + Rank Badge
    // Rank counts ALL anime (challenge days + backlog), not just challenge days.
    const calculatedRank = ranks.slice().reverse().find(r => allUniqueAnime.length >= r.min)?.title || 'Newbie';
    document.getElementById('rank-badge').textContent = `Lv.${userLevel} - ${calculatedRank} (${totalXP} XP)`;
    
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

    // The Backlog header stats describe the same collection the Backlog
    // view lists (all unique anime — the count above uses allUniqueAnime),
    // so Top Genre uses that set too. Using only challengeData.backlog
    // made it show "None" whenever every anime came from the challenge log.
    const backlogGenres = allUniqueAnime.flatMap(a => a.isManual ? [] : (a.genres || []).map(g => g.name));
    if (backlogGenres.length > 0) {
        const genreCounts = backlogGenres.reduce((counts, genre) => ({ ...counts, [genre]: (counts[genre] || 0) + 1 }), {});
        document.getElementById('backlog-top-genre-value').textContent = Object.keys(genreCounts).reduce((a, b) => genreCounts[a] > genreCounts[b] ? a : b, "None");
    } else {
        document.getElementById('backlog-top-genre-value').textContent = 'None';
    }
    
    document.getElementById('header-title').textContent = `Aniclipse`;

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
    if (analyticsChartInstance) { analyticsChartInstance.destroy(); analyticsChartInstance = null; }
    const uniqueAnime = getUniqueAnime().filter(a => !a.isManual); 
    const chartCanvas = document.getElementById('analytics-chart');
    const emptyState = document.getElementById('chart-empty-state');

    // If the Chart.js library failed to load (e.g. its CDN was unreachable),
    // say so instead of opening an empty chart area.
    if (typeof Chart === 'undefined') {
        chartCanvas.classList.add('hidden');
        emptyState.textContent = 'Analytics could not load — the chart library is unavailable. Check your connection and try again.';
        emptyState.classList.remove('hidden');
        return;
    }

    if (uniqueAnime.length === 0) {
        chartCanvas.classList.add('hidden');
        emptyState.textContent = 'Log some anime from online search to see your analytics!';
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

    // The collection can have anime but no data for this view (e.g. no
    // studios stored): show a message instead of a blank chart area.
    if (labels.length === 0) {
        chartCanvas.classList.add('hidden');
        emptyState.textContent = `No ${dataType} data yet — anime added from online search fills this in!`;
        emptyState.classList.remove('hidden');
        return;
    }

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
        if (!titleMatchesSearch(anime, searchTerm)) { return false; }
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
                const genres = animeLabelLine(anime);
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
                        <div class="backlog-synopsis-container" style="margin-top: 8px; width: 100%; box-sizing: border-box;">
                            <button class="backlog-synopsis-toggle-btn" onclick="toggleSynopsis(this, '${anime.mal_id}', '${anime.source || 'kitsu'}')">Read Story ▾</button>
                            <div class="backlog-synopsis-text hidden" style="margin: 6px 0 0 0; font-size: 12.5px; line-height: 1.5; color: var(--text-secondary); padding: 8px; border-radius: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); box-sizing: border-box; max-width: 100%; word-break: break-word; overflow-wrap: break-word; overflow-x: hidden;">
                                <!-- Global Ranking Badges & Age Guide -->
                                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                                    ${anime.ratingRank ? `<span style="background: rgba(255,193,7,0.1); border: 1px solid var(--primary-color); color: var(--primary-color); font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">🏆 Rating Rank #${anime.ratingRank}</span>` : ''}
                                    ${anime.popularityRank ? `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: var(--text-color); font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">👥 Popularity #${anime.popularityRank}</span>` : ''}
                                    ${anime.ageRating ? `<span style="background: rgba(239,68,68,0.1); border: 1px solid #EF4444; color: #EF4444; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;" title="${anime.ageRatingGuide || ''}">🔞 Rated ${anime.ageRating}</span>` : ''}
                                </div>

                                <!-- Episodes details -->
                                ${(anime.episodes || anime.episodeLength) ? `
                                <div style="font-size: 11px; margin-bottom: 10px; color: var(--text-color); font-weight: bold; display: flex; align-items: center; gap: 6px;">
                                    <span>⏱️ Watch Info:</span>
                                    <span style="color: var(--text-secondary); font-weight: normal;">
                                        ${anime.episodes ? `${anime.episodes} Episode${anime.episodes > 1 ? 's' : ''}` : ''}
                                        ${(anime.episodes && anime.episodeLength) ? ' • ' : ''}
                                        ${anime.episodeLength ? `${anime.episodeLength} mins each` : ''}
                                    </span>
                                </div>
                                ` : ''}

                                <p style="margin: 0 0 10px 0;">${synopsis}</p>
                                <div class="streaming-links-container" id="streaming-links-${anime.mal_id}" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-light);"></div>
                                <div class="characters-container" id="characters-${anime.mal_id}" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-light);"></div>

                                <!-- Trailer Integration -->
                                ${anime.youtubeVideoId ? `
                                <div class="trailer-trigger-container" style="margin-top: 10px; border-top: 1px solid var(--border-light); padding-top: 8px;">
                                    <button class="add-btn manual-add-btn" onclick="window.playTrailer(this, '${anime.youtubeVideoId}')" style="width: 100%; margin: 0; padding: 6px 12px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; height: auto; background: #FFFFFF !important; color: #000000 !important; border: none !important;">
                                        🎬 Watch Official Trailer
                                                    </button>
                                </div>
                                ` : ''}
                            </div>
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

            // Per-item controls: rate from here, and move the anime between
            // the backlog and today's challenge log, matching where it
            // currently lives. (Items in both places need no move.)
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'backlog-item-controls';
            controlsDiv.style.cssText = 'display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;';

            const rateBtn = document.createElement('button');
            rateBtn.className = 'add-btn manual-add-btn';
            rateBtn.style.cssText = 'padding: 4px 10px; font-size: 11px; height: auto; margin: 0;';
            rateBtn.textContent = anime.user_score ? `⭐ My Score: ${anime.user_score} — Change` : '⭐ Rate';
            rateBtn.onclick = () => {
                const rating = promptForRating(getEnglishTitle(anime));
                if (rating === null) return;
                setUserScoreEverywhere(anime, rating);
                saveData();
                renderAllAnimeList();
                updateAllDisplays();
                initializeChallengeLayout();
                processAchievements();
                showNotification(`Saved your score for ${getEnglishTitle(anime)}.`, 'success');
            };
            controlsDiv.appendChild(rateBtn);

            if (isBacklogSource && !isDailySource) {
                const moveBtn = document.createElement('button');
                moveBtn.className = 'add-btn manual-add-btn';
                moveBtn.style.cssText = 'padding: 4px 10px; font-size: 11px; height: auto; margin: 0;';
                moveBtn.textContent = '✔ Log as Watched Today';
                moveBtn.onclick = () => {
                    moveBacklogItemToToday(anime);
                    saveData();
                    renderAllAnimeList();
                    updateAllDisplays();
                    initializeChallengeLayout();
                    processAchievements();
                    showNotification(`Logged ${getEnglishTitle(anime)} to today's watch list!`);
                };
                controlsDiv.appendChild(moveBtn);
            } else if (isDailySource && !isBacklogSource) {
                const moveBtn = document.createElement('button');
                moveBtn.className = 'add-btn manual-add-btn';
                moveBtn.style.cssText = 'padding: 4px 10px; font-size: 11px; height: auto; margin: 0;';
                moveBtn.textContent = '📚 Move to Backlog';
                moveBtn.onclick = () => {
                    moveChallengeItemToBacklog(anime);
                    saveData();
                    renderAllAnimeList();
                    updateAllDisplays();
                    initializeChallengeLayout();
                    processAchievements();
                    showNotification(`Moved ${getEnglishTitle(anime)} to your backlog.`);
                };
                controlsDiv.appendChild(moveBtn);
            }

            const infoEl = itemDiv.querySelector('.backlog-info');
            (infoEl || itemDiv).appendChild(controlsDiv);
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
    
    div.innerHTML = `<h3>${dateDisplay}<span class="daily-total"></span></h3><div class="anime-list-container"></div><div class="add-controls entry-controls-group"><input type="text" placeholder="Type anime name to search and add..."><button class="add-btn">Add Anime</button><button class="add-btn manual-entry-btn" title="Add a title the search can't find, with your own name and episode count">+ Manual</button></div>`;
    const animeListContainer = div.querySelector('.anime-list-container');
    const animeInput = div.querySelector('input');
    const addOnlineBtn = div.querySelector('.add-btn');
    const addManualBtn = div.querySelector('.manual-entry-btn');
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
                const genres = animeLabelLine(anime);
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

    addManualBtn.onclick = () => {
        let title = animeInput.value.trim();
        if (!title) {
            const entered = prompt('Enter the anime title:');
            if (!entered || !entered.trim()) return;
            title = entered.trim();
        }
        const entry = createManualAnimeEntry(title, null);
        if (isDuplicateAnime(entry)) {
            showNotification("This anime is already in your backlog or challenge watch list!", "error");
            return;
        }
        const epInput = prompt(`How many episodes does "${title}" have? (Leave blank if unknown)`);
        const epCount = parseInt(epInput);
        if (!isNaN(epCount) && epCount > 0) entry.episodes = epCount;
        const rating = promptForRating(title);
        if (rating !== null) entry.user_score = rating;

        savedDayData.watched.push(entry);
        animeInput.value = '';
        saveData();
        renderWatchedList();
        updateAllDisplays();
        processAchievements();
        showNotification(`Added ${title} as a manual entry.`);
    };

    addOnlineBtn.onclick = async () => { 
        const title = animeInput.value.trim(); 
        if (!title) return; 
        addOnlineBtn.textContent = 'Searching...'; 
        addOnlineBtn.disabled = true; 
        try { 
            const normalizedData = await searchAniList(title, 10);
            showSearchResults(normalizedData, (selectedAnime) => {
                if (isDuplicateAnime(selectedAnime)) {
                    showNotification("This anime is already in your backlog or challenge watch list!", "error");
                    return;
                }
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
    if (screenId !== 'lounge') {
        if (typeof stopLoungeListeners === 'function') {
            stopLoungeListeners();
        }
    }

    const challengeScreen = document.getElementById('challenge-screen');
    const backlogScreen = document.getElementById('backlog-manager-screen');
    const anipaceScreen = document.getElementById('anipace-log-screen');
    const scheduleScreen = document.getElementById('schedule-screen');
    const loungeScreen = document.getElementById('anime-social-lounge');
    
    const switchToChallengeBtn = document.getElementById('switch-to-challenge-btn');
    const switchToBacklogBtn = document.getElementById('switch-to-backlog-btn');
    const switchToAniPaceBtn = document.getElementById('switch-to-anipace-btn');
    const switchToScheduleBtn = document.getElementById('switch-to-schedule-btn');
    const switchToLoungeBtn = document.getElementById('switch-to-lounge-btn');
    const jumpToTodayBtn = document.getElementById('jump-to-today-btn');
    const headerTitle = document.getElementById('header-title');
    const body = document.body;
    const currentGoal = GOAL_TIERS.find(goal => goal > getChallengeAnime().length) || GOAL_TIERS[GOAL_TIERS.length - 1];
    
    challengeScreen.classList.add('hidden');
    backlogScreen.classList.add('hidden');
    anipaceScreen.classList.add('hidden');
    scheduleScreen.classList.add('hidden');
    if (loungeScreen) loungeScreen.classList.add('hidden');

    switchToChallengeBtn.classList.remove('hidden');
    switchToBacklogBtn.classList.remove('hidden');
    switchToAniPaceBtn.classList.remove('hidden');
    switchToScheduleBtn.classList.remove('hidden');
    if (switchToLoungeBtn) switchToLoungeBtn.classList.remove('hidden');
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
    } else if (screenId === 'schedule') {
        scheduleScreen.classList.remove('hidden');
        switchToScheduleBtn.classList.add('hidden');
        jumpToTodayBtn.classList.add('hidden');
        headerTitle.textContent = 'Discover & Trends';
        initScheduleScreen();
    } else if (screenId === 'lounge') {
        if (loungeScreen) loungeScreen.classList.remove('hidden');
        if (switchToLoungeBtn) switchToLoungeBtn.classList.add('hidden');
        jumpToTodayBtn.classList.add('hidden');
        headerTitle.textContent = 'Anime Social Lounge';

        // Dispatch custom event to notify activation
        const event = new CustomEvent('lounge-screen-active');
        document.dispatchEvent(event);
    } else {
        challengeScreen.classList.remove('hidden');
        switchToChallengeBtn.classList.add('hidden');
        headerTitle.textContent = `Aniclipse`;
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

// --- RELEASES & SCHEDULE LOGIC ---
let upcomingDataCache = {};
let trendDataCache = {};
let activeDiscoverFormat = 'all';
let activeDiscoverGenre = 'all';
let activeDiscoverEpisodes = 'all';
let activeDiscoverTag = 'all';
// Episode-count ranges for the Discover length filter (Kitsu range syntax).
const DISCOVER_EPISODE_RANGES = { 'short': '1..12', 'medium': '13..24', 'long': '25..50', 'very-long': '50..9999' };
let discoverCacheTimestamp = null;
let trendPageOffset = 0;
let upcomingPageOffset = 0;

function handleSurpriseMe() {
    const btn = document.getElementById('surprise-me-btn');
    if (btn) {
        btn.textContent = 'Picking... 🎲';
        btn.disabled = true;
    }

    // Pick a random page from the most popular anime on AniList.
    const randomPage = 1 + Math.floor(Math.random() * 100);

    anilistGraphQL(ANILIST_PAGE_QUERY, { page: randomPage, perPage: 1, sort: ['POPULARITY_DESC'] })
        .then(data => {
            const normalized = normalizeAniListResponse(data.Page);
            if (!normalized || normalized.length === 0) {
                showNotification("Surprise generator couldn't find an anime. Try again!", "error");
                return;
            }
            const anime = normalized[0];
            renderSurpriseModal(anime);
        })
        .catch(err => {
            console.error("Surprise Me fetch error:", err);
            showNotification("Failed to fetch surprise anime. Check internet connection.", "error");
        })
        .finally(() => {
            if (btn) {
                btn.textContent = 'Surprise Me 🎲';
                btn.disabled = false;
            }
        });
}

function renderSurpriseModal(anime) {
    const modal = document.getElementById('surprise-modal');
    const container = document.getElementById('surprise-anime-card-container');
    if (!modal || !container) return;

    const title = getEnglishTitle(anime);
    const imageUrl = anime.images?.jpg?.image_url || 'https://via.placeholder.com/150x210?text=No+Image';
    const genresStr = animeLabelLine(anime);

    let actionButtonsHtml = `
        <div style="display: flex; gap: 10px; width: 100%; margin-top: 20px;">
            <button id="surprise-add-challenge-btn" style="flex: 1; background: #FFFFFF !important; color: #000000 !important; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; transition: transform 0.2s;">+ Log Today</button>
            <button id="surprise-add-backlog-btn" style="flex: 1; background: #FFFFFF !important; color: #000000 !important; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; transition: transform 0.2s;">+ Backlog</button>
        </div>
    `;

    const trackStatus = getAnimeTrackedStatus(anime);
    if (trackStatus === 'completed') {
        actionButtonsHtml = `
            <div style="margin-top: 20px; padding: 12px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success-color); color: var(--success-color); font-weight: bold; font-size: 13px; text-align: center; box-shadow: inset 0 0 4px rgba(16,185,129,0.15);">
                ✓ Completed Challenge
            </div>
        `;
    } else if (trackStatus === 'backlog') {
        actionButtonsHtml = `
            <div style="margin-top: 20px; padding: 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid #A0AEC0; color: #FFFFFF; font-weight: bold; font-size: 13px; text-align: center;">
                ✓ Tracked in Backlog
            </div>
        `;
    }

    const formattedRating = anime.averageRating ? `⭐ ${parseFloat(anime.averageRating).toFixed(0)}%` : '⭐ N/A';
    const formattedMembers = anime.userCount ? (anime.userCount >= 1000000 ? `${(anime.userCount / 1000000).toFixed(1)}M` : (anime.userCount >= 1000 ? `${(anime.userCount / 1000).toFixed(0)}K` : anime.userCount)) : 'N/A';

    container.innerHTML = `
        <div class="search-result-item" style="border: none; background: none; box-shadow: none; padding: 0; width: 100%; max-width: 100%; margin: 0;">
            <div class="trend-image-container" style="position: relative; width: 150px; height: 210px; margin-bottom: 15px; margin-left: auto; margin-right: auto; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <img src="${imageUrl}" alt="Poster" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <h3 style="color: var(--text-color); margin-bottom: 10px; text-align: center; font-size: 18px;">${title}</h3>
            <div class="search-result-meta" style="font-size: 12px; font-weight: bold; color: var(--primary-color); margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <span>${formattedRating}</span>
                <span>•</span>
                <span>👥 ${formattedMembers}</span>
                <span>•</span>
                <span>${anime.type || 'N/A'}</span>
            </div>
            <div class="search-result-genres" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; text-align: center;">
                <strong>Genres:</strong> ${genresStr}
            </div>
            ${anime.synopsis ? `
            <div class="anime-synopsis-container" style="margin-top: 10px; margin-bottom: 12px; width: 100%; text-align: left;">
                <button class="synopsis-toggle-btn" onclick="toggleSynopsis(this, '${anime.mal_id}', '${anime.source || 'kitsu'}')" style="font-size: 11px; font-weight: bold; background: none; border: none; padding: 0; color: var(--primary-color); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Read Story ▾</button>
                <div class="anime-synopsis-text hidden" style="margin: 6px 0 0 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border-left: 2px solid var(--primary-color); text-align: left; ${anime.coverImage ? `background-image: linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url('${anime.coverImage}'); background-size: cover; background-position: center;` : ''}">
                    <!-- Global Ranking Badges & Age Guide -->
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                        ${anime.ratingRank ? `<span style="background: rgba(255,193,7,0.1); border: 1px solid var(--primary-color); color: var(--primary-color); font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">🏆 Rating Rank #${anime.ratingRank}</span>` : ''}
                        ${anime.popularityRank ? `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #FFF; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">👥 Popularity #${anime.popularityRank}</span>` : ''}
                        ${anime.ageRating ? `<span style="background: rgba(239,68,68,0.1); border: 1px solid #EF4444; color: #EF4444; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;" title="${anime.ageRatingGuide || ''}">🔞 Rated ${anime.ageRating}</span>` : ''}
                    </div>

                    <!-- Episodes details -->
                    ${(anime.episodes || anime.episodeLength) ? `
                    <div style="font-size: 11px; margin-bottom: 10px; color: var(--text-color); font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        <span>⏱️ Watch Info:</span>
                        <span style="color: var(--text-secondary); font-weight: normal;">
                            ${anime.episodes ? `${anime.episodes} Episode${anime.episodes > 1 ? 's' : ''}` : ''}
                            ${(anime.episodes && anime.episodeLength) ? ' • ' : ''}
                            ${anime.episodeLength ? `${anime.episodeLength} mins each` : ''}
                        </span>
                    </div>
                    ` : ''}

                    <p style="margin: 0 0 10px 0;">${anime.synopsis}</p>
                    <div class="streaming-links-container" id="streaming-links-${anime.mal_id}" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"></div>
                    <div class="characters-container" id="characters-${anime.mal_id}" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"></div>

                    <!-- Trailer Integration -->
                    ${anime.youtubeVideoId ? `
                    <div class="trailer-trigger-container" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        <button class="add-btn manual-add-btn" onclick="window.playTrailer(this, '${anime.youtubeVideoId}')" style="width: 100%; margin: 0; padding: 6px 12px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; height: auto; background: #FFFFFF !important; color: #000000 !important; border: none !important;">
                            🎬 Watch Official Trailer
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            ${actionButtonsHtml}
        </div>
    `;

    // Bind event handlers
    const challengeBtn = document.getElementById('surprise-add-challenge-btn');
    if (challengeBtn) {
        challengeBtn.onclick = () => {
            if (isDuplicateAnime(anime)) {
                showNotification("This anime is already in your backlog or challenge watch list!", "error");
                return;
            }
            const rating = promptForRating(title);
            const newAnime = { ...anime, date_added: new Date().toISOString() };
            if (rating !== null) newAnime.user_score = rating;

            const todayKey = getLocalDateString(new Date());
            challengeData.days[todayKey] = challengeData.days[todayKey] || { watched: [] };
            challengeData.days[todayKey].watched.push(newAnime);

            saveData();
            updateAllDisplays();
            processAchievements();
            showNotification(`Logged ${title} to today's watch list!`);
            modal.classList.add('hidden');
        };
    }

    const backlogBtn = document.getElementById('surprise-add-backlog-btn');
    if (backlogBtn) {
        backlogBtn.onclick = () => {
            if (isDuplicateAnime(anime)) {
                showNotification("This anime is already in your backlog or challenge watch list!", "error");
                return;
            }
            const rating = promptForRating(title);
            const newAnime = { ...anime, date_added: new Date().toISOString() };
            if (rating !== null) newAnime.user_score = rating;

            challengeData.backlog.push(newAnime);
            saveData();
            updateAllDisplays();
            processAchievements();
            showNotification(`Added ${title} to your backlog watch list!`);
            modal.classList.add('hidden');
        };
    }

    modal.classList.remove('hidden');
}

function initScheduleScreen() {
    const upcomingLoadingEl = document.getElementById('upcoming-loading');
    const upcomingGrid = document.getElementById('upcoming-grid');

    // Helper to format/display Last Updated status
    function updateDiscoverLastUpdatedText(timestamp) {
        const el = document.getElementById('discover-last-updated');
        if (!el) return;
        if (!timestamp) {
            el.textContent = 'Last updated: Never';
            return;
        }
        const diffMs = Date.now() - timestamp;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) {
            el.textContent = 'Last updated: Just now';
        } else if (diffMins < 60) {
            el.textContent = `Last updated: ${diffMins}m ago`;
        } else {
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) {
                el.textContent = `Last updated: ${diffHours}h ago`;
            } else {
                const diffDays = Math.floor(diffHours / 24);
                el.textContent = `Last updated: ${diffDays}d ago`;
            }
        }
    }

    // Save cache to localStorage
    function saveDiscoverCache() {
        discoverCacheTimestamp = Date.now();
        const payload = {
            timestamp: discoverCacheTimestamp,
            upcoming: upcomingDataCache,
            trends: trendDataCache
        };
        localStorage.setItem('aniclipse_discover_cache_v3', JSON.stringify(payload));
        updateDiscoverLastUpdatedText(discoverCacheTimestamp);
    }

    // Load cache on init
    const cachedData = localStorage.getItem('aniclipse_discover_cache_v3');
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if (parsed) {
                if (parsed.upcoming && typeof parsed.upcoming === 'object' && !Array.isArray(parsed.upcoming)) {
                    upcomingDataCache = parsed.upcoming;
                }
                if (parsed.trends && typeof parsed.trends === 'object' && !Array.isArray(parsed.trends)) {
                    trendDataCache = parsed.trends;
                }
                discoverCacheTimestamp = parsed.timestamp;
                updateDiscoverLastUpdatedText(discoverCacheTimestamp);
            }
        } catch (e) {
            console.error("Failed to parse discover cache", e);
        }
    }

    function loadDiscoverCategories() {
        const genreContainer = document.getElementById('discover-genre-tags');
        if (!genreContainer) return;

        // AniList's genre list is fixed, so the filter buttons are
        // rendered straight from it — no fetch, and Kitsu's place/
        // setting tags can never appear here.
        const renderGenres = (genresList) => {
            genreContainer.innerHTML = '';
            genresList.forEach(genre => {
                const btn = document.createElement('button');
                btn.className = 'genre-tab-btn' + (genre.slug === activeDiscoverGenre ? ' active' : '');
                btn.dataset.genre = genre.slug;
                btn.textContent = genre.title;
                btn.onclick = () => {
                    const allBtns = genreContainer.querySelectorAll('.genre-tab-btn');
                    allBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    activeDiscoverGenre = genre.slug;
                    trendPageOffset = 0;
                    upcomingPageOffset = 0;
                    const loadMoreTrendsBtn = document.getElementById('load-more-trends-btn');
                    if (loadMoreTrendsBtn) loadMoreTrendsBtn.classList.add('hidden');
                    const loadMoreUpcomingBtn = document.getElementById('load-more-upcoming-btn');
                    if (loadMoreUpcomingBtn) loadMoreUpcomingBtn.classList.add('hidden');

                    const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
                    const trendType = activeTrendBtn ? activeTrendBtn.dataset.trend : 'trending';
                    loadTrend(trendType);
                    loadUpcomingSeasonal();
                };
                genreContainer.appendChild(btn);
            });
        };

        renderGenres([{ title: 'All Genres', slug: 'all' }, ...ANILIST_GENRES]);
    }

    // Call loadDiscoverCategories on init
    loadDiscoverCategories();

    // Trend Tabs Wiring
    const trendButtons = document.querySelectorAll('.trend-tab-btn');
    trendButtons.forEach(btn => {
        btn.onclick = () => {
            trendButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            trendPageOffset = 0;
            const loadMoreBtn = document.getElementById('load-more-trends-btn');
            if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
            loadTrend(btn.dataset.trend);
        };
    });

    // Format Selector Tabs Wiring
    const formatButtons = document.querySelectorAll('.format-tab-btn');
    formatButtons.forEach(btn => {
        btn.onclick = () => {
            formatButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDiscoverFormat = btn.dataset.format;
            trendPageOffset = 0;
            upcomingPageOffset = 0;
            const loadMoreTrendsBtn = document.getElementById('load-more-trends-btn');
            if (loadMoreTrendsBtn) loadMoreTrendsBtn.classList.add('hidden');
            const loadMoreUpcomingBtn = document.getElementById('load-more-upcoming-btn');
            if (loadMoreUpcomingBtn) loadMoreUpcomingBtn.classList.add('hidden');

            const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
            const trendType = activeTrendBtn ? activeTrendBtn.dataset.trend : 'trending';
            loadTrend(trendType);
            loadUpcomingSeasonal();
        };
    });

    // Episode Count Selector Tabs Wiring
    const episodeButtons = document.querySelectorAll('.episode-tab-btn');
    episodeButtons.forEach(btn => {
        btn.onclick = () => {
            episodeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDiscoverEpisodes = btn.dataset.episodes;
            trendPageOffset = 0;
            upcomingPageOffset = 0;
            const loadMoreTrendsBtn = document.getElementById('load-more-trends-btn');
            if (loadMoreTrendsBtn) loadMoreTrendsBtn.classList.add('hidden');
            const loadMoreUpcomingBtn = document.getElementById('load-more-upcoming-btn');
            if (loadMoreUpcomingBtn) loadMoreUpcomingBtn.classList.add('hidden');

            const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
            const trendType = activeTrendBtn ? activeTrendBtn.dataset.trend : 'trending';
            loadTrend(trendType);
            loadUpcomingSeasonal();
        };
    });

    // Tag Selector Tabs Wiring (AniList tags, e.g. Harem / Isekai / School)
    const tagButtons = document.querySelectorAll('.tag-tab-btn');
    tagButtons.forEach(btn => {
        btn.onclick = () => {
            tagButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDiscoverTag = btn.dataset.tag;
            trendPageOffset = 0;
            upcomingPageOffset = 0;
            const loadMoreTrendsBtn = document.getElementById('load-more-trends-btn');
            if (loadMoreTrendsBtn) loadMoreTrendsBtn.classList.add('hidden');
            const loadMoreUpcomingBtn = document.getElementById('load-more-upcoming-btn');
            if (loadMoreUpcomingBtn) loadMoreUpcomingBtn.classList.add('hidden');

            const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
            const trendType = activeTrendBtn ? activeTrendBtn.dataset.trend : 'trending';
            loadTrend(trendType);
            loadUpcomingSeasonal();
        };
    });

    // Load More Buttons Wiring
    const loadMoreTrendsBtn = document.getElementById('load-more-trends-btn');
    if (loadMoreTrendsBtn) {
        loadMoreTrendsBtn.onclick = () => {
            const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
            const trendType = activeTrendBtn ? activeTrendBtn.dataset.trend : 'trending';
            trendPageOffset += 12;
            loadMoreTrendsBtn.textContent = 'Loading...';
            loadTrend(trendType, true, true);
        };
    }

    const loadMoreUpcomingBtn = document.getElementById('load-more-upcoming-btn');
    if (loadMoreUpcomingBtn) {
        loadMoreUpcomingBtn.onclick = () => {
            upcomingPageOffset += 12;
            loadMoreUpcomingBtn.textContent = 'Loading...';
            loadUpcomingSeasonal(true, true);
        };
    }

    // Surprise Me Button Wiring
    const surpriseBtn = document.getElementById('surprise-me-btn');
    if (surpriseBtn) {
        surpriseBtn.onclick = handleSurpriseMe;
    }

    // Manual Refresh Button Wiring
    const refreshBtn = document.getElementById('refresh-discover-btn');
    if (refreshBtn) {
        refreshBtn.onclick = () => {
            showNotification("Refreshing Discover Feed...");
            const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
            const trendType = activeTrendBtn ? activeTrendBtn.dataset.trend : 'trending';
            loadTrend(trendType, true);
            loadUpcomingSeasonal(true);
        };
    }

    function loadTrend(trendType, forceLive = false, isLoadMore = false) {
        const trendLoadingEl = document.getElementById('trend-loading');
        const trendGrid = document.getElementById('trend-grid');
        const loadMoreBtn = document.getElementById('load-more-trends-btn');

        const cacheKey = `${trendType}_${activeDiscoverGenre}_${activeDiscoverFormat}_${activeDiscoverEpisodes}_${activeDiscoverTag}`;

        if (!isLoadMore) {
            trendPageOffset = 0;
        }

        if (!forceLive && !isLoadMore && trendDataCache[cacheKey]) {
            trendLoadingEl.classList.add('hidden');
            renderFilteredLists();
            if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
            return;
        }

        if (!isLoadMore) {
            trendLoadingEl.classList.remove('hidden');
            trendLoadingEl.textContent = 'Loading live global rankings...';
            trendGrid.classList.add('hidden');
        }

        const vars = buildDiscoverVariables(Math.floor(trendPageOffset / 12) + 1);
        if (trendType === 'trending') {
            vars.sort = ['TRENDING_DESC'];
        } else if (trendType === 'airing') {
            vars.status = 'RELEASING';
            vars.sort = ['POPULARITY_DESC'];
        } else if (trendType === 'highest-rated') {
            vars.sort = ['SCORE_DESC'];
        } else if (trendType === 'anticipated') {
            vars.status = 'NOT_YET_RELEASED';
            vars.sort = ['POPULARITY_DESC'];
        }

        anilistGraphQL(ANILIST_PAGE_QUERY, vars)
            .then(data => {
                const normalized = normalizeAniListResponse(data.Page);
                if (isLoadMore) {
                    trendDataCache[cacheKey] = (trendDataCache[cacheKey] || []).concat(normalized);
                } else {
                    trendDataCache[cacheKey] = normalized;
                }
                trendLoadingEl.classList.add('hidden');
                if (loadMoreBtn) {
                    loadMoreBtn.classList.remove('hidden');
                    loadMoreBtn.textContent = 'Load More Trends ▾';
                }
                saveDiscoverCache();
                renderFilteredLists();
            })
            .catch(err => {
                console.error(err);
                trendLoadingEl.classList.add('hidden');
                if (loadMoreBtn) {
                    loadMoreBtn.classList.remove('hidden');
                    loadMoreBtn.textContent = 'Load More Trends ▾';
                }
                showNotification("Failed to fetch fresh live trends. Displaying saved feed.", "error");
                if (trendDataCache[cacheKey]) {
                    renderFilteredLists();
                } else {
                    trendLoadingEl.textContent = 'Failed to load live trends. Check internet connection.';
                    trendLoadingEl.classList.remove('hidden');
                }
            });
    }

    function loadUpcomingSeasonal(forceLive = false, isLoadMore = false) {
        const cacheKey = `upcoming_${activeDiscoverGenre}_${activeDiscoverFormat}_${activeDiscoverEpisodes}_${activeDiscoverTag}`;
        const loadMoreBtn = document.getElementById('load-more-upcoming-btn');

        if (!isLoadMore) {
            upcomingPageOffset = 0;
        }

        if (!forceLive && !isLoadMore && upcomingDataCache[cacheKey]) {
            renderScheduleGrid('upcoming-grid', upcomingDataCache[cacheKey]);
            if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
            return;
        }

        if (!isLoadMore) {
            upcomingLoadingEl.classList.remove('hidden');
            upcomingGrid.classList.add('hidden');
        }

        const vars = buildDiscoverVariables(Math.floor(upcomingPageOffset / 12) + 1);
        vars.status = 'NOT_YET_RELEASED';
        vars.sort = ['POPULARITY_DESC'];

        anilistGraphQL(ANILIST_PAGE_QUERY, vars)
            .then(data => {
                const normalized = normalizeAniListResponse(data.Page);
                if (isLoadMore) {
                    upcomingDataCache[cacheKey] = (upcomingDataCache[cacheKey] || []).concat(normalized);
                } else {
                    upcomingDataCache[cacheKey] = normalized;
                }
                upcomingLoadingEl.classList.add('hidden');
                if (loadMoreBtn) {
                    loadMoreBtn.classList.remove('hidden');
                    loadMoreBtn.textContent = 'Load More Upcoming ▾';
                }
                saveDiscoverCache();
                renderScheduleGrid('upcoming-grid', upcomingDataCache[cacheKey]);
            })
            .catch(err => {
                console.error(err);
                upcomingLoadingEl.classList.add('hidden');
                if (loadMoreBtn) {
                    loadMoreBtn.classList.remove('hidden');
                    loadMoreBtn.textContent = 'Load More Upcoming ▾';
                }
                showNotification("Failed to fetch seasonal releases. Displaying saved feed.", "error");
                if (upcomingDataCache[cacheKey]) {
                    renderScheduleGrid('upcoming-grid', upcomingDataCache[cacheKey]);
                } else {
                    upcomingLoadingEl.textContent = 'Failed to load upcoming seasonal releases.';
                    upcomingLoadingEl.classList.remove('hidden');
                }
            });
    }

    function renderFilteredLists() {
        const filterText = document.getElementById('schedule-search-input').value.toLowerCase().trim();

        const matchesFilters = (anime) => {
            const titleMatch = titleMatchesSearch(anime, filterText);

            // Format match
            let formatMatch = true;
            if (activeDiscoverFormat !== 'all') {
                formatMatch = anime.type && anime.type.toLowerCase() === activeDiscoverFormat.toLowerCase();
            }

            // Genre match - still keep a backup client filter in case
            let genreMatch = true;
            if (activeDiscoverGenre !== 'all') {
                const cleanGenre = activeDiscoverGenre.toLowerCase().replace(/[^a-z0-9]/g, '');
                genreMatch = anime.genres && anime.genres.some(g => g.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanGenre);
            }

            // Episode-count match - backup client filter, same ranges as the API query
            let episodeMatch = true;
            if (activeDiscoverEpisodes !== 'all' && DISCOVER_EPISODE_RANGES[activeDiscoverEpisodes]) {
                const [minEp, maxEp] = DISCOVER_EPISODE_RANGES[activeDiscoverEpisodes].split('..').map(Number);
                const eps = anime.episodes || 0;
                episodeMatch = eps >= minEp && eps <= maxEp;
            }

            // Tag match - backup client filter, mirrors the API query
            let tagMatch = true;
            if (activeDiscoverTag !== 'all') {
                tagMatch = (anime.tags || []).some(t => t.name && t.name.toLowerCase() === activeDiscoverTag.toLowerCase());
            }

            return titleMatch && formatMatch && genreMatch && episodeMatch && tagMatch;
        };

        // 1. Filter and render active trend
        const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
        if (activeTrendBtn) {
            const trendType = activeTrendBtn.dataset.trend;
            const cacheKey = `${trendType}_${activeDiscoverGenre}_${activeDiscoverFormat}_${activeDiscoverEpisodes}_${activeDiscoverTag}`;
            if (trendDataCache[cacheKey]) {
                const rawList = trendDataCache[cacheKey] || [];
                const filteredList = rawList.filter(matchesFilters);
                renderTrendGrid('trend-grid', filteredList);
            }
        }

        // 2. Filter and render upcoming seasonal showcases
        const upcomingCacheKey = `upcoming_${activeDiscoverGenre}_${activeDiscoverFormat}_${activeDiscoverEpisodes}_${activeDiscoverTag}`;
        if (upcomingDataCache[upcomingCacheKey]) {
            const filteredList = upcomingDataCache[upcomingCacheKey].filter(matchesFilters);
            renderScheduleGrid('upcoming-grid', filteredList);
        }
    }

    // Wire up Search Input to do a live global search engine (just like adding anime!)
    const scheduleSearchInput = document.getElementById('schedule-search-input');
    scheduleSearchInput.oninput = debounce(() => {
        const query = scheduleSearchInput.value.trim();
        const resultsSection = document.getElementById('schedule-search-results-section');
        const resultsLoading = document.getElementById('schedule-search-results-loading');
        const resultsGrid = document.getElementById('schedule-search-results-grid');
        const defaultViews = document.getElementById('schedule-default-views');

        if (!query) {
            resultsSection.classList.add('hidden');
            resultsGrid.classList.add('hidden');
            defaultViews.classList.remove('hidden');
            renderFilteredLists();
            return;
        }

        // Switch views
        defaultViews.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        resultsLoading.classList.remove('hidden');
        resultsGrid.classList.add('hidden');

        // Fetch live global AniList search results
        searchAniList(query, 12)
            .then(normalized => {
                resultsLoading.classList.add('hidden');
                renderTrendGrid('schedule-search-results-grid', normalized);
            })
            .catch(err => {
                console.error("Global schedule search error:", err);
                resultsLoading.textContent = 'Search failed. Check your internet connection.';
            });
    }, 300);

    // Initial triggers or cache usage
    const upcomingCacheKey = `upcoming_${activeDiscoverGenre}_${activeDiscoverFormat}_${activeDiscoverEpisodes}_${activeDiscoverTag}`;
    if (upcomingDataCache && upcomingDataCache[upcomingCacheKey]) {
        renderScheduleGrid('upcoming-grid', upcomingDataCache[upcomingCacheKey]);
        const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
        if (activeTrendBtn) loadTrend(activeTrendBtn.dataset.trend);
        return;
    }

    loadUpcomingSeasonal();
    const activeTrendBtn = document.querySelector('.trend-tab-btn.active');
    if (activeTrendBtn) loadTrend(activeTrendBtn.dataset.trend);
}

function renderScheduleGrid(gridId, animeList) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';

    if (animeList.length === 0) {
        grid.innerHTML = '<div class="empty-state-message" style="grid-column: 1/-1;">No anime scheduled for this day. Check other days!</div>';
        grid.classList.remove('hidden');
        return;
    }

    animeList.forEach(anime => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const title = getEnglishTitle(anime);
        const imageUrl = anime.images?.jpg?.image_url || 'https://via.placeholder.com/105x145?text=No+Image';
        const genresStr = animeLabelLine(anime);

        let actionButtonsHtml = `
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: auto;">
                <button class="add-to-challenge-quick-btn" style="background: linear-gradient(135deg, var(--success-color), #059669); color: #FFF; width: 100%; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; transition: transform 0.2s;">+ Log Today</button>
                <button class="add-to-backlog-quick-btn" style="background: linear-gradient(135deg, var(--primary-color), #FFA000); color: #000; width: 100%; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; transition: transform 0.2s;">+ Backlog</button>
            </div>
        `;

        const trackStatus = getAnimeTrackedStatus(anime);
        if (trackStatus === 'completed') {
            actionButtonsHtml = `
                <div style="margin-top: auto; padding: 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success-color); color: var(--success-color); font-weight: bold; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: inset 0 0 4px rgba(16,185,129,0.15);">
                    ✓ Completed Challenge
                </div>
            `;
        } else if (trackStatus === 'backlog') {
            actionButtonsHtml = `
                <div style="margin-top: auto; padding: 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid #A0AEC0; color: #FFFFFF; font-weight: bold; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ✓ Tracked in Backlog
                </div>
            `;
        }

        item.innerHTML = `
            <img src="${imageUrl}" alt="Poster">
            <h4 style="color: var(--text-color);">${title}</h4>
            <div class="search-result-meta" style="font-size: 11.5px; font-weight: bold; color: var(--primary-color); margin-bottom: 2px;">
                ${anime.type || 'N/A'} • ${anime.year || 'N/A'}
            </div>
            <div class="search-result-genres" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
                <strong>Genres:</strong> ${genresStr}
            </div>
            ${anime.synopsis ? `
            <div class="anime-synopsis-container" style="margin-top: 4px; margin-bottom: 12px; width: 100%; text-align: left;">
                <button class="synopsis-toggle-btn" onclick="toggleSynopsis(this, '${anime.mal_id}', '${anime.source || 'kitsu'}')" style="font-size: 11px; font-weight: bold; background: none; border: none; padding: 0; color: var(--primary-color); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Read Story ▾</button>
                <div class="anime-synopsis-text hidden" style="margin: 6px 0 0 0; font-size: 11.5px; line-height: 1.4; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border-left: 2px solid var(--primary-color); text-align: left; ${anime.coverImage ? `background-image: linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url('${anime.coverImage}'); background-size: cover; background-position: center;` : ''}">
                    <!-- Global Ranking Badges & Age Guide -->
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                        ${anime.ratingRank ? `<span style="background: rgba(255,193,7,0.1); border: 1px solid var(--primary-color); color: var(--primary-color); font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">🏆 Rating Rank #${anime.ratingRank}</span>` : ''}
                        ${anime.popularityRank ? `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #FFF; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">👥 Popularity #${anime.popularityRank}</span>` : ''}
                        ${anime.ageRating ? `<span style="background: rgba(239,68,68,0.1); border: 1px solid #EF4444; color: #EF4444; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;" title="${anime.ageRatingGuide || ''}">🔞 Rated ${anime.ageRating}</span>` : ''}
                    </div>

                    <!-- Episodes details -->
                    ${(anime.episodes || anime.episodeLength) ? `
                    <div style="font-size: 11px; margin-bottom: 10px; color: var(--text-color); font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        <span>⏱️ Watch Info:</span>
                        <span style="color: var(--text-secondary); font-weight: normal;">
                            ${anime.episodes ? `${anime.episodes} Episode${anime.episodes > 1 ? 's' : ''}` : ''}
                            ${(anime.episodes && anime.episodeLength) ? ' • ' : ''}
                            ${anime.episodeLength ? `${anime.episodeLength} mins each` : ''}
                        </span>
                    </div>
                    ` : ''}

                    <p style="margin: 0 0 10px 0;">${anime.synopsis}</p>
                    <div class="streaming-links-container" id="streaming-links-${anime.mal_id}" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"></div>
                    <div class="characters-container" id="characters-${anime.mal_id}" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"></div>

                    <!-- Trailer Integration -->
                    ${anime.youtubeVideoId ? `
                    <div class="trailer-trigger-container" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        <button class="add-btn manual-add-btn" onclick="window.playTrailer(this, '${anime.youtubeVideoId}')" style="width: 100%; margin: 0; padding: 6px 12px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; height: auto; background: #FFFFFF !important; color: #000000 !important; border: none !important;">
                            🎬 Watch Official Trailer
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            ${actionButtonsHtml}
        `;

        const chalBtn = item.querySelector('.add-to-challenge-quick-btn');
        if (chalBtn) {
            chalBtn.onclick = () => {
                if (isDuplicateAnime(anime)) {
                    showNotification("This anime is already in your backlog or challenge watch list!", "error");
                    return;
                }
                const rating = promptForRating(title);
                const newAnime = { ...anime, date_added: new Date().toISOString() };
                if (rating !== null) newAnime.user_score = rating;

                const todayKey = getLocalDateString(new Date());
                challengeData.days[todayKey] = challengeData.days[todayKey] || { watched: [] };
                challengeData.days[todayKey].watched.push(newAnime);

                saveData();
                updateAllDisplays();
                processAchievements();
                showNotification(`Logged ${title} to today's watch list!`);
            };
        }

        const blBtn = item.querySelector('.add-to-backlog-quick-btn');
        if (blBtn) {
            blBtn.onclick = () => {
                if (isDuplicateAnime(anime)) {
                    showNotification("This anime is already in your backlog or challenge watch list!", "error");
                    return;
                }
                const rating = promptForRating(title);
                const newAnime = { ...anime, date_added: new Date().toISOString() };
                if (rating !== null) newAnime.user_score = rating;

                challengeData.backlog.push(newAnime);
                saveData();
                updateAllDisplays();
                processAchievements();
                showNotification(`Added ${title} to your backlog watch list!`);
            };
        }

        grid.appendChild(item);
    });
    grid.classList.remove('hidden');
}

function renderTrendGrid(gridId, animeList) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';

    if (animeList.length === 0) {
        grid.innerHTML = '<div class="empty-state-message" style="grid-column: 1/-1;">No trending anime found. Check back soon!</div>';
        grid.classList.remove('hidden');
        return;
    }

    animeList.forEach((anime, index) => {
        const item = document.createElement('div');
        item.className = 'search-result-item trend-card';
        const title = getEnglishTitle(anime);
        const imageUrl = anime.images?.jpg?.image_url || 'https://via.placeholder.com/105x145?text=No+Image';
        const genresStr = (anime.genres || []).slice(0, 2).map(g => g.name).join(', ') || 'N/A';

        let rankBadgeHtml = '';
        if (index === 0) rankBadgeHtml = '<div class="trend-rank-badge rank-1">🏆 #1</div>';
        else if (index === 1) rankBadgeHtml = '<div class="trend-rank-badge rank-2">🥈 #2</div>';
        else if (index === 2) rankBadgeHtml = '<div class="trend-rank-badge rank-3">🥉 #3</div>';
        else rankBadgeHtml = `<div class="trend-rank-badge rank-other">#${index + 1}</div>`;

        let statusHtml = '';
        if (anime.airingStatus === 'current') statusHtml = '<span class="status-pill status-airing">● Airing</span>';
        else if (anime.airingStatus === 'upcoming') statusHtml = '<span class="status-pill status-upcoming">● Upcoming</span>';
        else statusHtml = '<span class="status-pill status-finished">● Finished</span>';

        const formattedMembers = anime.userCount ? (anime.userCount >= 1000000 ? `${(anime.userCount / 1000000).toFixed(1)}M` : (anime.userCount >= 1000 ? `${(anime.userCount / 1000).toFixed(0)}K` : anime.userCount)) : 'N/A';
        const formattedRating = anime.averageRating ? `⭐ ${parseFloat(anime.averageRating).toFixed(0)}%` : '⭐ N/A';

        const allGenresStr = animeLabelLine(anime);

        let actionButtonsHtml = `
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: auto;">
                <button class="add-to-challenge-quick-btn" style="background: linear-gradient(135deg, var(--success-color), #059669); color: #FFF; width: 100%; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; transition: transform 0.2s;">+ Log Today</button>
                <button class="add-to-backlog-quick-btn" style="background: linear-gradient(135deg, var(--primary-color), #FFA000); color: #000; width: 100%; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; transition: transform 0.2s;">+ Backlog</button>
            </div>
        `;

        const trackStatus = getAnimeTrackedStatus(anime);
        if (trackStatus === 'completed') {
            actionButtonsHtml = `
                <div style="margin-top: auto; padding: 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success-color); color: var(--success-color); font-weight: bold; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: inset 0 0 4px rgba(16,185,129,0.15);">
                    ✓ Completed Challenge
                </div>
            `;
        } else if (trackStatus === 'backlog') {
            actionButtonsHtml = `
                <div style="margin-top: auto; padding: 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid #A0AEC0; color: #FFFFFF; font-weight: bold; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ✓ Tracked in Backlog
                </div>
            `;
        }

        item.innerHTML = `
            <div class="trend-image-container" style="position: relative; width: 105px; height: 145px; margin-bottom: 12px; margin-left: auto; margin-right: auto;">
                <img src="${imageUrl}" alt="Poster" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
                ${rankBadgeHtml}
            </div>
            <h4 style="color: var(--text-color);">${title}</h4>
            <div class="search-result-meta" style="font-size: 11px; font-weight: bold; color: var(--primary-color); margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>${formattedRating}</span>
                <span>•</span>
                <span>👥 ${formattedMembers}</span>
            </div>
            <div style="margin-bottom: 8px; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                ${statusHtml}
                <span style="color: var(--text-secondary);">•</span>
                <span style="color: var(--text-secondary);">${anime.type || 'N/A'}</span>
            </div>
            <div class="search-result-genres" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
                <strong>Genres:</strong> ${allGenresStr}
            </div>
            ${anime.synopsis ? `
            <div class="anime-synopsis-container" style="margin-top: 4px; margin-bottom: 12px; width: 100%; text-align: left;">
                <button class="synopsis-toggle-btn" onclick="toggleSynopsis(this, '${anime.mal_id}', '${anime.source || 'kitsu'}')" style="font-size: 11px; font-weight: bold; background: none; border: none; padding: 0; color: var(--primary-color); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Read Story ▾</button>
                <div class="anime-synopsis-text hidden" style="margin: 6px 0 0 0; font-size: 11.5px; line-height: 1.4; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border-left: 2px solid var(--primary-color); text-align: left; ${anime.coverImage ? `background-image: linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url('${anime.coverImage}'); background-size: cover; background-position: center;` : ''}">
                    <!-- Global Ranking Badges & Age Guide -->
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                        ${anime.ratingRank ? `<span style="background: rgba(255,193,7,0.1); border: 1px solid var(--primary-color); color: var(--primary-color); font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">🏆 Rating Rank #${anime.ratingRank}</span>` : ''}
                        ${anime.popularityRank ? `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #FFF; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;">👥 Popularity #${anime.popularityRank}</span>` : ''}
                        ${anime.ageRating ? `<span style="background: rgba(239,68,68,0.1); border: 1px solid #EF4444; color: #EF4444; font-size: 10px; padding: 3px 6px; border-radius: 4px; font-weight: bold;" title="${anime.ageRatingGuide || ''}">🔞 Rated ${anime.ageRating}</span>` : ''}
                    </div>

                    <!-- Episodes details -->
                    ${(anime.episodes || anime.episodeLength) ? `
                    <div style="font-size: 11px; margin-bottom: 10px; color: var(--text-color); font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        <span>⏱️ Watch Info:</span>
                        <span style="color: var(--text-secondary); font-weight: normal;">
                            ${anime.episodes ? `${anime.episodes} Episode${anime.episodes > 1 ? 's' : ''}` : ''}
                            ${(anime.episodes && anime.episodeLength) ? ' • ' : ''}
                            ${anime.episodeLength ? `${anime.episodeLength} mins each` : ''}
                        </span>
                    </div>
                    ` : ''}

                    <p style="margin: 0 0 10px 0;">${anime.synopsis}</p>
                    <div class="streaming-links-container" id="streaming-links-${anime.mal_id}" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"></div>
                    <div class="characters-container" id="characters-${anime.mal_id}" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"></div>

                    <!-- Trailer Integration -->
                    ${anime.youtubeVideoId ? `
                    <div class="trailer-trigger-container" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        <button class="add-btn manual-add-btn" onclick="window.playTrailer(this, '${anime.youtubeVideoId}')" style="width: 100%; margin: 0; padding: 6px 12px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; height: auto; background: #FFFFFF !important; color: #000000 !important; border: none !important;">
                            🎬 Watch Official Trailer
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            ${actionButtonsHtml}
        `;

        const chalBtn = item.querySelector('.add-to-challenge-quick-btn');
        if (chalBtn) {
            chalBtn.onclick = () => {
                if (isDuplicateAnime(anime)) {
                    showNotification("This anime is already in your backlog or challenge watch list!", "error");
                    return;
                }
                const rating = promptForRating(title);
                const newAnime = { ...anime, date_added: new Date().toISOString() };
                if (rating !== null) newAnime.user_score = rating;

                const todayKey = getLocalDateString(new Date());
                challengeData.days[todayKey] = challengeData.days[todayKey] || { watched: [] };
                challengeData.days[todayKey].watched.push(newAnime);

                saveData();
                updateAllDisplays();
                processAchievements();
                showNotification(`Logged ${title} to today's watch list!`);
            };
        }

        const blBtn = item.querySelector('.add-to-backlog-quick-btn');
        if (blBtn) {
            blBtn.onclick = () => {
                if (isDuplicateAnime(anime)) {
                    showNotification("This anime is already in your backlog or challenge watch list!", "error");
                    return;
                }
                const rating = promptForRating(title);
                const newAnime = { ...anime, date_added: new Date().toISOString() };
                if (rating !== null) newAnime.user_score = rating;

                challengeData.backlog.push(newAnime);
                saveData();
                updateAllDisplays();
                processAchievements();
                showNotification(`Added ${title} to your backlog watch list!`);
            };
        }

        grid.appendChild(item);
    });
    grid.classList.remove('hidden');
}

// --- INITIALIZATION & EVENT LISTENERS ---
function initializeApp() {
    challengeData = loadChallengeData();
    anipaceData = loadAniPaceData();
    
    document.getElementById('challenge-start-date').value = challengeData.challengeStart;
    document.getElementById('challenge-end-date').value = challengeData.challengeEnd;
    
    document.getElementById('content-area').classList.remove('hidden');
    initializeChallengeLayout();
    // Re-check achievements on open (e.g. backlog anime added earlier) so
    // rank, level and unlocks refresh without needing a new action first.
    // processAchievements only notifies for newly unlocked achievements.
    processAchievements();
    updateAllDisplays(); 
    
    document.getElementById('switch-to-backlog-btn').onclick = () => switchToScreen('backlog');
    document.getElementById('switch-to-challenge-btn').onclick = () => switchToScreen('challenge');
    document.getElementById('switch-to-anipace-btn').onclick = () => switchToScreen('anipace');
    document.getElementById('switch-to-schedule-btn').onclick = () => switchToScreen('schedule');
    const loungeBtn = document.getElementById('switch-to-lounge-btn');
    if (loungeBtn) {
        loungeBtn.onclick = () => switchToScreen('lounge');
    }
    
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
    const exportBackupBtn = document.getElementById('export-backup-btn');
    if (exportBackupBtn) exportBackupBtn.onclick = exportBackupData;
    const importBackupBtn = document.getElementById('import-backup-btn');
    const importBackupInput = document.getElementById('import-backup-input');
    if (importBackupBtn && importBackupInput) {
        importBackupBtn.onclick = () => importBackupInput.click();
        importBackupInput.onchange = handleBackupFileSelect;
    }
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
            // Show the modal BEFORE creating the chart: Chart.js measures
            // the canvas when the chart is created, and a still-hidden
            // modal gives it zero size, which left the chart area blank.
            document.getElementById('chart-modal').classList.remove('hidden');
            createOrUpdateChart('genres');
        };
    });
    
    document.getElementById('achievements-card').onclick = () => {
        // ALWAYS open on the Newbie tab, every time the modal opens.
        activeAchievementRank = 'Newbie';
        renderAchievementsModal();
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
    if (addBacklogManualBtn) {
        addBacklogManualBtn.onclick = () => {
            const titleInput = document.getElementById('backlog-manual-title-input');
            const episodesInput = document.getElementById('backlog-manual-episodes-input');
            const title = titleInput.value.trim();
            if (!title) {
                showNotification('Type a title first, then tap Add Manually.', 'error');
                return;
            }
            const entry = createManualAnimeEntry(title, parseInt(episodesInput.value) || null);
            if (isDuplicateAnime(entry)) {
                showNotification("This anime is already in your backlog or challenge watch list!", "error");
                return;
            }
            const rating = promptForRating(title);
            if (rating !== null) entry.user_score = rating;
            challengeData.backlog = challengeData.backlog || [];
            challengeData.backlog.push(entry);
            titleInput.value = '';
            episodesInput.value = '';
            saveData();
            renderAllAnimeList();
            updateAllDisplays();
            processAchievements();
            showNotification(`Added ${title} to your backlog as a manual entry.`);
        };
    }

    addBacklogOnlineBtn.onclick = async () => {
        const title = backlogInput.value.trim(); 
        if (!title) return; 
        addBacklogOnlineBtn.textContent = 'Searching...'; 
        addBacklogOnlineBtn.disabled = true; 
        try { 
            const normalizedData = await searchAniList(title, 10);
            showSearchResults(normalizedData, (selectedAnime) => {
                if (isDuplicateAnime(selectedAnime)) {
                    showNotification("This anime is already in your backlog or challenge watch list!", "error");
                    return;
                }
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
        showNotification(`Logged ${episodes} episode${episodes === 1 ? '' : 's'} of ${animeName} in AniPace.`);
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

    // Initialize lounge components as part of the app loading
    initLoungeComponents();
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
            window.firebaseUser = user;
            const authEvent = new CustomEvent('auth-changed', { detail: { user: user } });
            document.dispatchEvent(authEvent);
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
                        // Re-check achievements after the cloud merge so
                        // rank, level and unlocks refresh from cloud data too.
                        processAchievements();
                        updateAllDisplays();
                    }
                } else {
                    // First-time sync: Upload existing local progress to the cloud database
            const { totalXP, userLevel } = calculateUserXPAndLevel();
            const storageKey = 'animeDashboard_v6_combined';
            const rawLocal = localStorage.getItem(storageKey);
            let watchedListSync = [];
            let backlogListSync = [];
            if (rawLocal) {
                try {
                    const parsed = JSON.parse(rawLocal);
                    const dailyWatchedAnime = Object.values(parsed.days || {}).flatMap(day => day.watched || []);
                    const uniqueMap = new Map();
                    dailyWatchedAnime.forEach(item => {
                        const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
                        if (!uniqueMap.has(key)) {
                            uniqueMap.set(key, {
                                mal_id: item.mal_id || null,
                                title: item.title,
                                user_score: item.user_score || null,
                                type: item.type || 'TV',
                                isManual: !!item.isManual
                            });
                        }
                    });
                    watchedListSync = Array.from(uniqueMap.values());
                    backlogListSync = (parsed.backlog || []).map(item => ({
                        mal_id: item.mal_id || null,
                        title: item.title,
                        user_score: item.user_score || null,
                        type: item.type || 'TV',
                        isManual: !!item.isManual
                    }));
                } catch(e) {}
            }

            const challengeAnime = getChallengeAnime();
            // Rank counts ALL anime (challenge days + backlog), not just challenge days.
            const calculatedRank = ranks.slice().reverse().find(r => getUniqueAnime().length >= r.min)?.title || 'Newbie';

                    firebase.database().ref(`users/${user.uid}`).set({
                        challengeData: challengeData,
                        anipaceData: anipaceData
            }).then(() => {
                // Initialize default profile values to avoid empty details
                firebase.database().ref(`users/${user.uid}/profile`).update({
                    displayName: user.displayName || `Otaku#${user.uid.substring(0,4)}`,
                    avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
                    title: calculatedRank,
                    completedCount: challengeAnime.length,
                    totalCount: challengeAnime.length + backlogListSync.length,
                    xp: totalXP,
                    level: userLevel,
                    watchedList: watchedListSync,
                    backlogList: backlogListSync
                });
                firebase.database().ref(`leaderboard/${user.uid}`).update({
                    displayName: user.displayName || `Otaku#${user.uid.substring(0,4)}`,
                    avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
                    title: calculatedRank,
                    completedCount: challengeAnime.length,
                    totalCount: challengeAnime.length + backlogListSync.length,
                    xp: totalXP,
                    level: userLevel,
                    watchedList: watchedListSync,
                    backlogList: backlogListSync
                });
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
            window.firebaseUser = null;
            const authEvent = new CustomEvent('auth-changed', { detail: { user: null } });
            document.dispatchEvent(authEvent);
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

initializeFirebase();
initializeApp();

// Expose core variables and functions globally for module access (e.g., from lounge.js)
window.challengeData = challengeData;
Object.defineProperty(window, 'anipaceData', {
    get: () => anipaceData,
    set: (val) => { anipaceData = val; }
});
window.saveData = saveData;
window.updateAllDisplays = updateAllDisplays;
window.processAchievements = processAchievements;

// ==========================================
// PORTED LOUNGE.JS FUNCTIONALITIES (COMBINED)
// ==========================================

// --- MOBILE VIEW CONTROLLER ---
function updateMobileLoungeView() {
    const leftPane = document.getElementById('lounge-left-pane');
    const rightPane = document.getElementById('lounge-right-pane');
    const backBtn = document.getElementById('lounge-chat-back-btn');

    if (!leftPane || !rightPane) return;

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        if (activeChatId) {
            leftPane.style.display = 'none';
            rightPane.style.display = 'flex';
            if (backBtn) backBtn.style.display = 'block';
        } else {
            leftPane.style.display = 'flex';
            rightPane.style.display = 'none';
            if (backBtn) backBtn.style.display = 'none';
        }
    } else {
        leftPane.style.display = 'flex';
        rightPane.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'none';
    }
}
window.updateMobileLoungeView = updateMobileLoungeView;
window.addEventListener('resize', updateMobileLoungeView);

// --- TOAST UTILITY ---
function showToast(message, type = "success") {
    const containerId = "toast-container";
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 320px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.style.cssText = `
        background: rgba(21, 28, 44, 0.95);
        border-left: 4px solid ${type === "error" ? "var(--error-color)" : type === "achievement" ? "var(--primary-color)" : "var(--success-color)"};
        color: var(--text-color);
        padding: 12px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    // Icon/prefix based on type
    const prefix = type === "achievement" ? "🏆 " : type === "error" ? "❌ " : "💬 ";
    toast.textContent = prefix + message;

    container.appendChild(toast);

    // Trigger transition
    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 50);

    // Remove toast
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- UTILS: GET ALL PROFILE FIELDS ---
const profilePromises = {};
function getProfileData(uid, callback) {
    if (otherUsersProfiles[uid]) {
        callback(otherUsersProfiles[uid]);
        return;
    }
    if (profilePromises[uid]) {
        profilePromises[uid].then(profile => callback(profile));
        return;
    }
    profilePromises[uid] = new Promise((resolve) => {
        firebase.database().ref(`users/${uid}/profile`).once('value', snapshot => {
            const data = snapshot.val() || {};
            const profile = {
                displayName: data.displayName || `User#${uid.substring(0, 4)}`,
                avatarUrl: data.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${uid}`,
                title: data.title || "Newbie Tracker",
                username: data.username || null,
                friendCode: data.friendCode || null,
                level: data.level || 1,
                completedCount: data.completedCount || 0,
                xp: data.xp || 0
            };
            otherUsersProfiles[uid] = profile;
            resolve(profile);
        });
    });
    profilePromises[uid].then(profile => callback(profile));
}

// Get raw challenge and backlog counts for a user
function getUserCounts(callback) {
    const storageKey = 'animeDashboard_v6_combined';
    const rawLocal = localStorage.getItem(storageKey);
    let completedCount = 0;
    let backlogCount = 0;

    if (rawLocal) {
        try {
            const parsed = JSON.parse(rawLocal);
            // Count unique challenge anime
            const dailyWatchedAnime = Object.values(parsed.days || {}).flatMap(day => day.watched || []);
            const uniqueMap = new Set();
            dailyWatchedAnime.forEach(item => {
                uniqueMap.add(item.isManual ? item.title.toLowerCase().trim() : item.mal_id);
            });
            completedCount = uniqueMap.size;

            // Count backlog
            backlogCount = (parsed.backlog || []).length;
        } catch(e) {
            console.error(e);
        }
    }
    callback({ completedCount, totalCount: completedCount + backlogCount });
}

let mutualFriends = new Set();
let mutualListeners = {}; // friendUid -> DB reference

// Real-time mutual friendship sync (No Full-Table Reads, No Loops)
function syncMutualFriends(candidateFriendsObj) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const myUid = user.uid;

    const candidateUids = Object.keys(candidateFriendsObj).filter(key => candidateFriendsObj[key] === true);

    // 1. Clean up old listeners for UIDs that are no longer candidates
    Object.keys(mutualListeners).forEach(friendUid => {
        if (!candidateUids.includes(friendUid)) {
            if (mutualListeners[friendUid]) {
                mutualListeners[friendUid].off();
            }
            delete mutualListeners[friendUid];
            mutualFriends.delete(friendUid);
        }
    });

    // 2. Set up new listeners for new candidates
    candidateUids.forEach(friendUid => {
        if (!mutualListeners[friendUid]) {
            const ref = firebase.database().ref(`friends/${friendUid}/${myUid}`);
            mutualListeners[friendUid] = ref;
            ref.on('value', snapshot => {
                const isMutual = snapshot.val() === true;
                if (isMutual) {
                    if (!mutualFriends.has(friendUid)) {
                        mutualFriends.add(friendUid);
                        renderFriendsList();
                    }
                } else {
                    if (mutualFriends.has(friendUid)) {
                        // They unfriended us! Clean up our side
                        mutualFriends.delete(friendUid);
                        firebase.database().ref(`friends/${myUid}/${friendUid}`).set(null)
                            .then(() => {
                                renderFriendsList();
                            })
                            .catch(err => console.error("Unfriend sync error:", err));
                    } else {
                        // Not mutual yet (pending request)
                        renderFriendsList();
                    }
                }
            });
        }
    });

    // Initial or fallback render
    renderFriendsList();
}

// --- LAZY-LOAD LOUNGE CONTROLLER ---
function initLoungeListeners() {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;

    const uid = currentUser.uid;

    // Load/Display identity: full ID, friend code and username
    const fullIdInput = document.getElementById('user-full-id');
    if (fullIdInput) fullIdInput.value = uid;
    setupLoungeIdentity(uid);

    // Update mobile sub-views
    updateMobileLoungeView();

    // 1. Friends list Listener
    if (friendsListenerRef) friendsListenerRef.off();
    friendsListenerRef = firebase.database().ref(`friends/${uid}`);
    friendsListenerRef.on('value', snapshot => {
        syncMutualFriends(snapshot.val() || {});
    });

    // 2. Incoming Requests Listener
    if (requestsListenerRef) requestsListenerRef.off();
    requestsListenerRef = firebase.database().ref(`friendRequests/${uid}`);
    requestsListenerRef.on('value', snapshot => {
        renderIncomingRequests(snapshot.val() || {});
    });

    // 2b. Sent Requests Listener
    if (sentRequestsListenerRef) sentRequestsListenerRef.off();
    sentRequestsListenerRef = firebase.database().ref(`sentRequests/${uid}`);
    sentRequestsListenerRef.on('value', snapshot => {
        renderSentRequests(snapshot.val() || {});
    });

    // 3. Presence Listener
    if (presenceListenerRef) presenceListenerRef.off();
    presenceListenerRef = firebase.database().ref(`status`);
    presenceListenerRef.on('value', snapshot => {
        updatePresenceDisplays(snapshot.val() || {});
    });

    // Lazy load the active leaderboard
    loadLeaderboard();
}

function stopLoungeListeners() {
    if (friendsListenerRef) friendsListenerRef.off();
    if (requestsListenerRef) requestsListenerRef.off();
    if (sentRequestsListenerRef) sentRequestsListenerRef.off();
    if (presenceListenerRef) presenceListenerRef.off();
    if (chatListenerRef) chatListenerRef.off();
    if (leaderboardListenerRef) leaderboardListenerRef.off();

    friendsListenerRef = null;
    requestsListenerRef = null;
    sentRequestsListenerRef = null;
    presenceListenerRef = null;
    chatListenerRef = null;
    leaderboardListenerRef = null;
}

// --- PROFILE CUSTOMIZATION & PRESENCE ---
function initProfileSettings() {
    const presetContainer = document.getElementById('profile-avatar-presets');
    const customUrlInput = document.getElementById('profile-custom-avatar-url');
    const nameInput = document.getElementById('profile-display-name');
    const fileInput = document.getElementById('profile-avatar-file');
    const saveBtn = document.getElementById('save-profile-settings-btn');

    if (!presetContainer || !saveBtn) return;

    presetContainer.innerHTML = '';
    let selectedAvatarUrl = '';

    AVATAR_PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.type = "button";
        btn.style.cssText = `
            width: 50px;
            height: 50px;
            padding: 2px;
            background: #222;
            border: 2px solid #444;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            transition: all 0.2s;
        `;
        btn.innerHTML = `<img src="${preset.url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

        btn.onclick = () => {
            presetContainer.querySelectorAll('button').forEach(b => b.style.borderColor = '#444');
            btn.style.borderColor = 'var(--primary-color)';
            selectedAvatarUrl = preset.url;
            customUrlInput.value = '';
            if (fileInput) fileInput.value = ''; // Clear file input
        };

        presetContainer.appendChild(btn);
    });

    customUrlInput.oninput = () => {
        if (customUrlInput.value.trim()) {
            presetContainer.querySelectorAll('button').forEach(b => b.style.borderColor = '#444');
            selectedAvatarUrl = customUrlInput.value.trim();
            if (fileInput) fileInput.value = ''; // Clear file input
        }
    };

    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Check file storage size (Max 150KB = 153600 bytes)
            if (file.size > 153600) {
                showToast("Profile image must be under 150KB in size.", "error");
                fileInput.value = ''; // reset file input
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                // Clear any preset highlight and custom URL text
                presetContainer.querySelectorAll('button').forEach(b => b.style.borderColor = '#444');
                customUrlInput.value = '';

                // Set Base64 string as avatar URL
                selectedAvatarUrl = event.target.result;
            };
            reader.readAsDataURL(file);
        };
    }

    // Load existing profile values
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            firebase.database().ref(`users/${user.uid}/profile`).once('value', snapshot => {
                const profile = snapshot.val() || {};
                if (profile.displayName) nameInput.value = profile.displayName;
                if (profile.avatarUrl) {
                    selectedAvatarUrl = profile.avatarUrl;
                    const match = AVATAR_PRESETS.find(p => p.url === selectedAvatarUrl);
                    if (match) {
                        const index = AVATAR_PRESETS.indexOf(match);
                        const btns = presetContainer.querySelectorAll('button');
                        if (btns[index]) btns[index].style.borderColor = 'var(--primary-color)';
                    } else if (selectedAvatarUrl.startsWith('data:image/')) {
                        // User uploaded a Base64 image previously
                        if (fileInput) fileInput.value = ''; // reset file input visuals
                    } else {
                        customUrlInput.value = selectedAvatarUrl;
                    }
                }
            });
        }
    });

    saveBtn.onclick = () => {
        const user = firebase.auth().currentUser;
        if (!user) {
            showToast("You must be logged in to save your profile.", "error");
            return;
        }

        const rawName = nameInput.value.trim();
        const finalName = rawName || `Otaku#${user.uid.substring(0, 4)}`;
        const finalAvatar = selectedAvatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`;

        // Get unlocked titles based on achievements
        const storageKey = 'animeDashboard_v6_combined';
        const rawLocal = localStorage.getItem(storageKey);
        let unlockedAchievements = [];
        let completedCount = 0;

        if (rawLocal) {
            try {
                const parsed = JSON.parse(rawLocal);
                unlockedAchievements = parsed.unlockedAchievements || [];
                const dailyWatchedAnime = Object.values(parsed.days || {}).flatMap(day => day.watched || []);
                const uniqueSet = new Set();
                dailyWatchedAnime.forEach(item => {
                    uniqueSet.add(item.isManual ? item.title.toLowerCase().trim() : item.mal_id);
                });
                completedCount = uniqueSet.size;
            } catch(e) {}
        }

        let bestTitle = "Newbie Tracker";
        if (unlockedAchievements.includes('streak_master')) bestTitle = "🔥 Streak Master";
        else if (unlockedAchievements.includes('binge_watcher')) bestTitle = "🍿 Binge King";
        else if (unlockedAchievements.includes('completionist')) bestTitle = "👑 Completionist";
        else if (unlockedAchievements.includes('speed_demon')) bestTitle = "⚡ Speed Demon";
        else if (completedCount >= 50) bestTitle = "🎬 Anime Legend";
        else if (completedCount >= 25) bestTitle = "🌸 Otaku Veteran";
        else if (completedCount >= 10) bestTitle = "🌟 Anime Novice";

        // Save to profile and leaderboard
        getUserCounts(counts => {
            // Read watchlist and backlog lists to serialize and sync comparison data
            let watchedListSync = [];
            let backlogListSync = [];
            const storageKey = 'animeDashboard_v6_combined';
            const rawLocal = localStorage.getItem(storageKey);
            if (rawLocal) {
                try {
                    const parsed = JSON.parse(rawLocal);
                    const dailyWatchedAnime = Object.values(parsed.days || {}).flatMap(day => day.watched || []);
                    const uniqueMap = new Map();
                    dailyWatchedAnime.forEach(item => {
                        const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
                        if (!uniqueMap.has(key)) {
                            uniqueMap.set(key, {
                                mal_id: item.mal_id || null,
                                title: item.title,
                                user_score: item.user_score || null,
                                type: item.type || 'TV',
                                isManual: !!item.isManual
                            });
                        }
                    });
                    watchedListSync = Array.from(uniqueMap.values());
                    backlogListSync = (parsed.backlog || []).map(item => ({
                        mal_id: item.mal_id || null,
                        title: item.title,
                        user_score: item.user_score || null,
                        type: item.type || 'TV',
                        isManual: !!item.isManual
                    }));
                } catch(e) {}
            }

            // XP Progression Formula
            const currentAnipaceData = window.anipaceData;
            const episodesCount = currentAnipaceData && currentAnipaceData.history ? currentAnipaceData.history.reduce((sum, h) => sum + (h.episodes || 0), 0) : 0;
            const achievementXP = calculateAchievementXP(unlockedAchievements || []);
            const computedXP = (counts.completedCount * 100) + (backlogListSync.length * 20) + achievementXP + (episodesCount * 10);
            const computedLevel = Math.floor(computedXP / 1000) + 1;

            const profileUpdate = {
                displayName: finalName,
                avatarUrl: finalAvatar,
                title: bestTitle,
                completedCount: counts.completedCount,
                totalCount: counts.totalCount,
                xp: computedXP,
                level: computedLevel,
                watchedList: watchedListSync,
                backlogList: backlogListSync
            };

            const updates = {};
            updates[`users/${user.uid}/profile`] = profileUpdate;
            updates[`leaderboard/${user.uid}`] = profileUpdate;

            firebase.database().ref().update(updates)
                .then(() => {
                    showToast("Profile updated successfully!");
                    // Refresh current displays if needed
                    loadLeaderboard();
                })
                .catch(err => showToast(err.message, "error"));
        });
    };
}

// Set up online presence detection via Firebase Realtime Database
function initPresenceSystem() {
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            const uid = user.uid;
            const myConnectionsRef = firebase.database().ref(`.info/connected`);
            const presenceRef = firebase.database().ref(`status/${uid}`);

            myConnectionsRef.on('value', snapshot => {
                if (snapshot.val() === true) {
                    // Set status to online on connect
                    presenceRef.onDisconnect().remove();

                    // Track what user is currently watching/doing
                    // Let's look up their most recent logged entry from localStorage
                    const rawLocal = localStorage.getItem('animeDashboard_v6_combined');
                    let lastWatched = "Roaming the Lounge";
                    if (rawLocal) {
                        try {
                            const parsed = JSON.parse(rawLocal);
                            const dates = Object.keys(parsed.days || {}).sort();
                            if (dates.length > 0) {
                                const lastDate = dates[dates.length - 1];
                                const watched = parsed.days[lastDate].watched || [];
                                if (watched.length > 0) {
                                    const item = watched[watched.length - 1];
                                    lastWatched = `Watching: ${item.title}`;
                                }
                            }
                        } catch (e) {}
                    }

                    presenceRef.set({
                        state: 'online',
                        lastActive: firebase.database.ServerValue.TIMESTAMP,
                        watching: lastWatched
                    });
                }
            });
        }
    });
}

// --- FRIEND SYSTEM ---
function renderFriendsList() {
    const listContainer = document.getElementById('my-friends-list');
    if (!listContainer) return;

    const uids = Array.from(mutualFriends);

    if (uids.length === 0) {
        listContainer.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">No friends added yet.</p>`;
        return;
    }

    listContainer.innerHTML = '';
    uids.forEach(friendUid => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'anipace-history-item';
        itemDiv.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background-color: rgba(255,255,255,0.02);
            border: 1px solid var(--border-light);
            border-radius: 10px;
            margin-bottom: 8px;
        `;

        getProfileData(friendUid, profile => {
            itemDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="position: relative;">
                        <img src="${escapeHTML(profile.avatarUrl)}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                        <span class="presence-dot-${escapeHTML(friendUid)}" style="position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; border-radius: 50%; background-color: var(--text-secondary); border: 1.5px solid var(--surface-color);"></span>
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 13px; color: var(--text-color);">${escapeHTML(profile.displayName)} <span style="font-size: 10px; font-weight:800; color:var(--success-color); margin-left:4px;">Lv.${profile.level || 1}</span></h4>
                        <p style="margin: 0; font-size: 10px; color: var(--text-secondary);">${escapeHTML(profile.title)}${profile.username ? ' &middot; @' + escapeHTML(profile.username) : ''}</p>
                        <span class="presence-watching-${escapeHTML(friendUid)}" style="font-size: 9px; color: var(--success-color); display: block; margin-top: 1px;"></span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px; align-items:center;">
                    <button class="add-btn" style="padding: 4px 10px; font-size: 11px; height: auto; margin: 0; background: var(--primary-color); color: #000;" onclick="window.startLoungeChat('${escapeHTML(friendUid)}')">Chat</button>
                    <button class="add-btn manual-add-btn" style="padding: 4px 10px; font-size: 11px; height: auto; margin: 0;" onclick="window.openLoungeComparison('${escapeHTML(friendUid)}')">Compare</button>
                    <div class="friend-menu-wrap">
                        <button class="remove-btn" style="padding: 0 5px; font-size: 16px;" onclick="window.toggleFriendMenu('${escapeHTML(friendUid)}', event)">&#8942;</button>
                        <div class="friend-menu hidden" id="friend-menu-${escapeHTML(friendUid)}">
                            <button onclick="window.removeLoungeFriend('${escapeHTML(friendUid)}')">Remove friend</button>
                        </div>
                    </div>
                </div>
            `;
            // Trigger update of online dots
            firebase.database().ref(`status/${friendUid}`).once('value', s => {
                const presence = s.val();
                const dot = itemDiv.querySelector(`.presence-dot-${friendUid}`);
                const w = itemDiv.querySelector(`.presence-watching-${friendUid}`);
                if (presence && presence.state === 'online') {
                    if (dot) dot.style.backgroundColor = 'var(--success-color)';
                    if (w) w.textContent = presence.watching || 'Online';
                } else {
                    if (dot) dot.style.backgroundColor = 'var(--text-secondary)';
                }
            });
        });

        listContainer.appendChild(itemDiv);
    });
}

function renderIncomingRequests(requestsObj) {
    const listContainer = document.getElementById('incoming-requests-list');
    if (!listContainer) return;

    const uids = Object.keys(requestsObj).filter(key => requestsObj[key] === true);
    updateRequestsBadge(uids.length);

    if (uids.length === 0) {
        listContainer.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">No incoming requests. When someone adds you, their request will show here.</p>`;
        return;
    }

    listContainer.innerHTML = '';
    uids.forEach(senderUid => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'anipace-history-item';
        itemDiv.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background-color: rgba(255,255,255,0.02);
            border: 1px solid var(--border-light);
            border-radius: 10px;
            margin-bottom: 8px;
        `;

        getProfileData(senderUid, profile => {
            itemDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${escapeHTML(profile.avatarUrl)}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <h4 style="margin: 0; font-size: 12px; color: var(--text-color);">${escapeHTML(profile.displayName)}</h4>
                        <p style="margin: 0; font-size: 9px; color: var(--text-secondary);">${escapeHTML(profile.title)} &middot; Lv.${profile.level || 1}${profile.username ? ' &middot; @' + escapeHTML(profile.username) : ''}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin: 0; background: var(--success-color); color: #FFF;" onclick="window.acceptLoungeRequest('${escapeHTML(senderUid)}')">Accept</button>
                    <button class="add-btn manual-add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin: 0; border-color: var(--error-color); color: var(--error-color);" onclick="window.rejectLoungeRequest('${escapeHTML(senderUid)}')">Reject</button>
                </div>
            `;
        });

        listContainer.appendChild(itemDiv);
    });
}

function updatePresenceDisplays(statusObj) {
    // Update online status indicator dots for any friend lists or items currently drawn on screen
    Object.keys(statusObj).forEach(uid => {
        const data = statusObj[uid];
        const dots = document.querySelectorAll(`.presence-dot-${uid}`);
        const wTexts = document.querySelectorAll(`.presence-watching-${uid}`);

        dots.forEach(dot => {
            if (data && data.state === 'online') {
                dot.style.backgroundColor = 'var(--success-color)';
            } else {
                dot.style.backgroundColor = 'var(--text-secondary)';
            }
        });
        wTexts.forEach(el => {
            if (data && data.state === 'online') {
                el.textContent = data.watching || 'Online';
            } else {
                el.textContent = '';
            }
        });
    });
}

// --- DIRECT MESSAGING (DMs) ---
function startChat(friendUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    activeChatId = [user.uid, friendUid].sort().join('_');

    // Switch on Chat UI input area
    const inputArea = document.getElementById('dm-input-area');
    if (inputArea) inputArea.classList.remove('hidden');

    // Draw Chat Friend details in Header
    getProfileData(friendUid, profile => {
        const hName = document.getElementById('dm-friend-name');
        const hAvatar = document.getElementById('dm-friend-avatar');
        const hStatusDot = document.getElementById('dm-friend-status-dot');
        const hStatusText = document.getElementById('dm-friend-status-text');

        if (hName) hName.textContent = profile.displayName;
        if (hAvatar) hAvatar.src = profile.avatarUrl;

        firebase.database().ref(`status/${friendUid}`).once('value', s => {
            const presence = s.val();
            if (presence && presence.state === 'online') {
                if (hStatusDot) hStatusDot.style.backgroundColor = 'var(--success-color)';
                if (hStatusText) hStatusText.textContent = presence.watching || 'Online';
            } else {
                if (hStatusDot) hStatusDot.style.backgroundColor = 'var(--text-secondary)';
                if (hStatusText) hStatusText.textContent = 'Offline';
            }
        });
    });

    // Load Messages with live database listener
    if (chatListenerRef) chatListenerRef.off();

    const messagesContainer = document.getElementById('dm-messages-container');
    if (messagesContainer) {
        messagesContainer.innerHTML = `<p class="empty-state-message" style="margin: auto; font-size: 12px;">Connecting thread...</p>`;
    }

    chatListenerRef = firebase.database().ref(`chats/${activeChatId}`).limitToLast(50);
    chatListenerRef.on('value', snapshot => {
        renderChatMessages(snapshot.val() || {});
    });

    // Handle mobile sub-view switching
    if (typeof updateMobileLoungeView === "function") {
        updateMobileLoungeView();
    }
}

function renderChatMessages(messagesObj) {
    const container = document.getElementById('dm-messages-container');
    if (!container) return;

    const keys = Object.keys(messagesObj).sort();
    if (keys.length === 0) {
        container.innerHTML = `<p class="empty-state-message" style="margin: auto; font-size: 12px;">No messages. Send a message to start binging together!</p>`;
        return;
    }

    container.innerHTML = '';
    const user = firebase.auth().currentUser;
    if (!user) return;

    keys.forEach(msgId => {
        const msg = messagesObj[msgId];
        const isMe = msg.senderUid === user.uid;

        const messageWrapper = document.createElement('div');
        messageWrapper.style.cssText = `
            display: flex;
            justify-content: ${isMe ? 'flex-end' : 'flex-start'};
            width: 100%;
        `;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.style.cssText = `
            max-width: 75%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 12.5px;
            background-color: ${isMe ? 'rgba(255, 193, 7, 0.15)' : 'rgba(255, 255, 255, 0.05)'};
            border: 1px solid ${isMe ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255,255,255,0.03)'};
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        getProfileData(msg.senderUid, profile => {
            // Render basic text or inline shared anime card
            let bodyHtml = '';
            if (msg.type === 'anime-embed' && msg.anime) {
                bodyHtml = `
                    <div style="display: flex; gap: 8px; background-color: rgba(0,0,0,0.3); padding: 8px; border-radius: 8px; border-left: 2px solid var(--primary-color);">
                        <img src="${escapeHTML(msg.anime.imageUrl || 'https://via.placeholder.com/40x55?text=N/A')}" style="width: 40px; height: 55px; object-fit: cover; border-radius: 4px;">
                        <div style="display: flex; flex-direction: column; justify-content: space-between;">
                            <h5 style="margin: 0; font-size: 11.5px; color: var(--primary-color); font-weight: 700;">${escapeHTML(msg.anime.title || '')}</h5>
                            <span style="font-size: 10px; color: var(--text-secondary);">${escapeHTML(msg.anime.type || 'TV')} • ⭐ ${escapeHTML(String(msg.anime.score || 'N/A'))}</span>
                        </div>
                    </div>
                `;
            } else {
                bodyHtml = `<span style="color: var(--text-color); line-height: 1.4; word-break: break-word;">${escapeHTML(msg.text || '')}</span>`;
            }

            bubbleDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <img src="${escapeHTML(profile.avatarUrl)}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: bold; font-size: 11px; color: var(--primary-color);">${escapeHTML(profile.displayName)}</span>
                    <span style="font-size: 9px; color: var(--text-secondary); margin-left: auto;">${escapeHTML(timeStr)}</span>
                </div>
                ${bodyHtml}
            `;
        });

        messageWrapper.appendChild(bubbleDiv);
        container.appendChild(messageWrapper);
    });

    // Auto-scroll to bottom of chat
    container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function sendTextMessage() {
    const user = firebase.auth().currentUser;
    const input = document.getElementById('dm-message-input');
    if (!user || !activeChatId || !input) return;

    const text = input.value.trim();
    if (!text) return;

    const message = {
        senderUid: user.uid,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        type: 'text'
    };

    firebase.database().ref(`chats/${activeChatId}`).push(message)
        .then(() => {
            input.value = '';
        })
        .catch(err => showToast(err.message, "error"));
}

// --- EMOJI PICKER POPUP ---
function initEmojiPicker() {
    const trigger = document.getElementById('emoji-picker-btn');
    const popup = document.getElementById('emoji-picker-popup');
    const input = document.getElementById('dm-message-input');

    if (!trigger || !popup || !input) return;

    // Load emojis
    popup.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.style.cssText = `
            font-size: 16px;
            cursor: pointer;
            padding: 4px;
            transition: transform 0.1s;
        `;
        span.onmouseover = () => span.style.transform = 'scale(1.2)';
        span.onmouseout = () => span.style.transform = 'scale(1)';
        span.onclick = (e) => {
            e.stopPropagation();
            input.value += emoji;
            popup.classList.add('hidden');
            input.focus();
        };
        popup.appendChild(span);
    });

    trigger.onclick = (e) => {
        e.stopPropagation();
        popup.classList.toggle('hidden');
    };

    document.addEventListener('click', () => {
        popup.classList.add('hidden');
    });
}

// --- SHARE ANIME EMBED MODAL ---
function initAnimeEmbedShare() {
    const shareBtn = document.getElementById('share-anime-embed-btn');
    const modal = document.getElementById('share-anime-modal');
    const closeBtn = document.getElementById('close-share-anime-modal');
    const container = document.getElementById('share-anime-list-container');

    if (!shareBtn || !modal || !closeBtn || !container) return;

    shareBtn.onclick = () => {
        // Read unique anime from local storage
        const storageKey = 'animeDashboard_v6_combined';
        const rawLocal = localStorage.getItem(storageKey);
        let listHtml = '';

        if (rawLocal) {
            try {
                const parsed = JSON.parse(rawLocal);

                // Construct combined unique array
                const dailyWatchedAnime = Object.values(parsed.days || {}).flatMap(day => day.watched || []);
                const allWatchedAnime = [...dailyWatchedAnime, ...(parsed.backlog || [])];

                const uniqueMap = new Map();
                allWatchedAnime.forEach(item => {
                    const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
                    if (!uniqueMap.has(key)) {
                        uniqueMap.set(key, item);
                    }
                });

                const combinedList = Array.from(uniqueMap.values());

                if (combinedList.length === 0) {
                    container.innerHTML = `<p class="empty-state-message" style="font-size:12px; padding:10px;">Your backlog and logged days are empty! Add some shows first.</p>`;
                    modal.classList.remove('hidden');
                    return;
                }

                container.innerHTML = '';
                combinedList.forEach(anime => {
                    const title = anime.titles?.find(t => t.type === 'English')?.title || anime.title || 'Unknown Title';
                    const imageUrl = anime.images?.jpg?.small_image_url || anime.images?.jpg?.image_url || 'https://via.placeholder.com/40x55?text=N/A';

                    const rowDiv = document.createElement('div');
                    rowDiv.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        background: rgba(255,255,255,0.03);
                        border: 1px solid var(--border-light);
                        border-radius: 8px;
                        padding: 8px;
                        cursor: pointer;
                        transition: background-color 0.1s;
                    `;
                    rowDiv.onmouseover = () => rowDiv.style.backgroundColor = 'rgba(255,255,255,0.06)';
                    rowDiv.onmouseout = () => rowDiv.style.backgroundColor = 'rgba(255,255,255,0.03)';

                    rowDiv.innerHTML = `
                        <img src="${imageUrl}" style="width: 30px; height: 42px; object-fit: cover; border-radius: 4px;">
                        <div style="flex-grow: 1;">
                            <h5 style="margin: 0; font-size: 12px; color: var(--primary-color);">${title}</h5>
                            <span style="font-size: 10px; color: var(--text-secondary);">${anime.type || 'TV'} • ⭐ ${anime.score || 'N/A'}</span>
                        </div>
                        <button class="add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin:0; width: auto;">Embed</button>
                    `;

                    rowDiv.onclick = () => {
                        embedAnimeMessage(title, imageUrl, anime.type || 'TV', anime.score || 'N/A');
                        modal.classList.add('hidden');
                    };

                    container.appendChild(rowDiv);
                });

            } catch (e) {
                container.innerHTML = `<p class="empty-state-message" style="font-size:12px;">Error mapping list.</p>`;
            }
        } else {
            container.innerHTML = `<p class="empty-state-message" style="font-size:12px;">No logged anime found to share.</p>`;
        }

        modal.classList.remove('hidden');
    };

    closeBtn.onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    };
}

function embedAnimeMessage(title, imageUrl, type, score) {
    const user = firebase.auth().currentUser;
    if (!user || !activeChatId) return;

    const message = {
        senderUid: user.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        type: 'anime-embed',
        anime: {
            title: title,
            imageUrl: imageUrl,
            type: type,
            score: score
        }
    };

    firebase.database().ref(`chats/${activeChatId}`).push(message)
        .catch(err => showToast(err.message, "error"));
}

// --- LEADERBOARD ---
let leaderboardListenerRef = null;
let leaderboardLoadTimeout = null;
function loadLeaderboard() {
    const tbody = document.getElementById('leaderboard-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Loading rankings...</td></tr>`;

    if (leaderboardListenerRef) leaderboardListenerRef.off();
    if (leaderboardLoadTimeout) { clearTimeout(leaderboardLoadTimeout); leaderboardLoadTimeout = null; }
    // If no data ever arrives (e.g. local-only mode, where cloud sync is
    // off), land on a clear message instead of "Loading rankings..." forever.
    leaderboardLoadTimeout = setTimeout(() => {
        leaderboardLoadTimeout = null;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Could not load the leaderboard. It needs cloud sync and an internet connection — in local-only mode rankings are unavailable.</td></tr>`;
    }, 10000);
    leaderboardListenerRef = firebase.database().ref('leaderboard');
    leaderboardListenerRef.on('value', snapshot => {
        if (leaderboardLoadTimeout) { clearTimeout(leaderboardLoadTimeout); leaderboardLoadTimeout = null; }
        const records = snapshot.val() || {};
        tbody.innerHTML = '';

        const sortedUsers = Object.keys(records).map(uid => ({
            uid,
            ...records[uid]
        })).sort((a, b) => {
            // Sort by XP/Level descending
            return (b.xp || 0) - (a.xp || 0);
        });

        if (sortedUsers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Leaderboard is currently empty. Update your profile to join!</td></tr>`;
            return;
        }

        sortedUsers.forEach((record, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid var(--border-light)";

            let rankBadge = `${index + 1}`;
            if (index === 0) rankBadge = "👑 1";
            else if (index === 1) rankBadge = "⚔️ 2";
            else if (index === 2) rankBadge = "🛡️ 3";

            const userXP = record.xp || 0;
            const userLevel = record.level || Math.floor(userXP / 1000) + 1;
            const totalCount = record.totalCount || record.completedCount || 0;

            const currentUser = firebase.auth().currentUser;
            const isMe = currentUser && currentUser.uid === record.uid;

            let actionHtml = '';
            if (isMe) {
                actionHtml = `<span style="font-size: 11px; color: var(--text-secondary); font-style: italic;">You</span>`;
            } else {
                actionHtml = `
                    <div style="display:flex; gap: 4px; justify-content: center; align-items:center;">
                        <button class="add-btn manual-add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin:0;" onclick="window.sendLoungeRequest('${escapeHTML(record.uid)}')">Add</button>
                        <button class="add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin:0; background: var(--primary-color); color: #000;" onclick="window.openLoungeComparison('${escapeHTML(record.uid)}')">Compare</button>
                    </div>
                `;
            }

            tr.innerHTML = `
                <td style="padding: 12px 8px; font-weight: bold; color: var(--primary-color);">${escapeHTML(rankBadge)}</td>
                <td style="padding: 12px 8px; display: flex; align-items: center; gap: 8px;">
                    <img src="${escapeHTML(record.avatarUrl || 'https://via.placeholder.com/25')}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: 600; color: ${isMe ? 'var(--primary-color)' : 'inherit'};">${escapeHTML(record.displayName || 'Guest')}</span>
                </td>
                <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: var(--success-color);">Lv.${escapeHTML(String(userLevel))}</td>
                <td style="padding: 12px 8px; text-align: center; font-weight: 500; color: var(--text-secondary);">${escapeHTML(String(userXP))} XP</td>
                <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: var(--primary-color);">${escapeHTML(String(totalCount))} Anime</td>
                <td style="padding: 12px 8px; color: var(--text-secondary); font-size: 12px;">${escapeHTML(record.title || 'Newbie Tracker')}</td>
                <td style="padding: 12px 8px; text-align: center;">
                    ${actionHtml}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }, error => {
        console.error('Leaderboard load error:', error);
        if (leaderboardLoadTimeout) { clearTimeout(leaderboardLoadTimeout); leaderboardLoadTimeout = null; }
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Could not load the leaderboard. It needs cloud sync and an internet connection — in local-only mode rankings are unavailable.</td></tr>`;
    });
}

// --- SMART BINGE PLANNER (LOUNGE BACKLOG SCANNER) ---
function initSmartBingePlanner() {
    const calculateBtn = document.getElementById('lounge-calculate-planner-btn');
    if (!calculateBtn) return;

    calculateBtn.onclick = () => {
        const inputMinutes = parseInt(document.getElementById('lounge-planner-minutes').value);
        const outputBox = document.getElementById('lounge-planner-output');
        const summaryBox = document.getElementById('lounge-planner-summary');
        const listContainer = document.getElementById('lounge-planner-list');

        if (isNaN(inputMinutes) || inputMinutes < 1) {
            showToast("Please enter a valid amount of minutes.", "error");
            return;
        }

        // Use the same collection the Backlog view lists (challenge log +
        // backlog combined). Reading only the stored "backlog" array here
        // made the planner claim the list was empty while the Backlog view
        // was showing anime.
        const backlogArray = getUniqueAnime();

        if (backlogArray.length === 0) {
            showToast("Your anime list is empty! Add some anime first.", "error");
            return;
        }

        // Filter and calculate how many backlog items fit
        // Assume episode duration is 24 mins. If we have movie formats, assume typical duration of 100 mins.
        // We will greedily pack as many series or films as possible!
        let remainingMinutes = inputMinutes;
        const selectedShows = [];
        let totalEpisodes = 0;

        // Sort items: movies first, then TV shows to maximize variety, or just order of backlog
        backlogArray.forEach(item => {
            const isMovie = item.type === 'Movie';
            const durationPerUnit = isMovie ? 100 : 24;

            if (isMovie) {
                if (remainingMinutes >= durationPerUnit) {
                    remainingMinutes -= durationPerUnit;
                    selectedShows.push({
                        title: item.title,
                        type: 'Movie',
                        details: '1 movie'
                    });
                }
            } else {
                // TV Show: check how many episodes fit
                const epLimit = item.episodes || 12; // fallback to 12 episodes
                const maxEpisodesFitting = Math.floor(remainingMinutes / 24);
                if (maxEpisodesFitting > 0) {
                    const actualEps = Math.min(epLimit, maxEpisodesFitting);
                    remainingMinutes -= (actualEps * 24);
                    totalEpisodes += actualEps;
                    selectedShows.push({
                        title: item.title,
                        type: item.type || 'TV Series',
                        details: `${actualEps} episode(s)`
                    });
                }
            }
        });

        listContainer.innerHTML = '';
        if (selectedShows.length === 0) {
            summaryBox.textContent = `You have ${inputMinutes} mins, but no individual episode (24 mins) or movie (100 mins) can fit. Try adding more available minutes!`;
            listContainer.innerHTML = '';
        } else {
            const usedMinutes = inputMinutes - remainingMinutes;
            summaryBox.innerHTML = `Within your available <strong>${inputMinutes} mins</strong>, you can binge <strong>${selectedShows.length} titles</strong> (utilizing ${usedMinutes} mins, leaving ${remainingMinutes} mins free):`;

            selectedShows.forEach(show => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid var(--border-light);
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                `;
                row.innerHTML = `
                    <span style="color: var(--primary-color); font-weight: bold;">${show.title}</span>
                    <span style="color: var(--text-secondary);">${show.type} (${show.details})</span>
                `;
                listContainer.appendChild(row);
            });
        }

        outputBox.classList.remove('hidden');
    };
}

// --- FRIEND IDENTITY: USERNAME + SHORT FRIEND CODE + SEARCH ---
let lastFriendSearchUid = null;

function generateFriendCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'AC-' + code;
}

function assignFriendCode(uid, attempts) {
    attempts = attempts || 0;
    if (attempts > 6) return;
    const code = generateFriendCode();
    const db = firebase.database();
    db.ref(`friendCodes/${code}`).once('value').then(snap => {
        if (snap.exists()) { assignFriendCode(uid, attempts + 1); return; }
        const updates = {};
        updates[`friendCodes/${code}`] = uid;
        updates[`users/${uid}/profile/friendCode`] = code;
        return db.ref().update(updates).then(() => {
            myLoungeProfile.friendCode = code;
            const codeInput = document.getElementById('user-share-code');
            if (codeInput) codeInput.value = code;
        });
    }).catch(() => {});
}

function setupLoungeIdentity(uid) {
    const db = firebase.database();
    db.ref(`users/${uid}/profile`).once('value').then(snap => {
        const p = snap.val() || {};
        myLoungeProfile.username = p.username || null;
        myLoungeProfile.friendCode = p.friendCode || null;

        const avatarEl = document.getElementById('my-lounge-avatar');
        if (avatarEl) avatarEl.src = p.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${uid}`;
        const nameEl = document.getElementById('my-lounge-name');
        if (nameEl) nameEl.textContent = p.displayName || 'You';
        const userLabel = document.getElementById('my-lounge-username');
        if (userLabel) userLabel.textContent = p.username ? '@' + p.username : 'No username yet — set one so friends can find you';
        const usernameInput = document.getElementById('my-username-input');
        if (usernameInput && p.username) usernameInput.value = p.username;

        const codeInput = document.getElementById('user-share-code');
        if (p.friendCode) {
            if (codeInput) codeInput.value = p.friendCode;
        } else {
            assignFriendCode(uid);
        }
    }).catch(() => {});

    const saveBtn = document.getElementById('save-username-btn');
    if (saveBtn && !saveBtn.dataset.wired) {
        saveBtn.dataset.wired = '1';
        saveBtn.onclick = () => window.saveMyUsername();
    }
    const usernameInput = document.getElementById('my-username-input');
    if (usernameInput && !usernameInput.dataset.wired) {
        usernameInput.dataset.wired = '1';
        usernameInput.onkeydown = (e) => { if (e.key === 'Enter') window.saveMyUsername(); };
    }
}

window.saveMyUsername = function() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const input = document.getElementById('my-username-input');
    const name = (input ? input.value : '').trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(name)) {
        showToast("Username needs 3-20 characters: lowercase letters, numbers or _ only.", "error");
        return;
    }
    if (myLoungeProfile.username === name) {
        showToast("That's already your username.");
        return;
    }
    const db = firebase.database();
    // Claim the name atomically: only succeeds if it is free or already mine.
    db.ref(`usernames/${name}`).transaction(current => {
        if (current === null || current === user.uid) return user.uid;
        return; // abort — taken by someone else
    }).then(result => {
        if (!result.committed) {
            showToast("That username is taken — try another one.", "error");
            return;
        }
        const updates = {};
        updates[`users/${user.uid}/profile/username`] = name;
        if (myLoungeProfile.username && myLoungeProfile.username !== name) {
            updates[`usernames/${myLoungeProfile.username}`] = null;
        }
        return db.ref().update(updates).then(() => {
            myLoungeProfile.username = name;
            const label = document.getElementById('my-lounge-username');
            if (label) label.textContent = '@' + name;
            showToast("Username saved: @" + name);
        });
    }).catch(err => showToast(loungeErrorMessage(err, "Couldn't save the username. Please try again."), "error"));
};

// Accepts an @username, a short friend code (AC-XXXXXX), or a full user ID.
async function resolveFriendIdentifier(rawInput) {
    const db = firebase.database();
    const raw = (rawInput || '').trim();
    if (!raw) return null;

    const asUsername = raw.replace(/^@+/, '').toLowerCase();
    if (/^[a-z0-9_]{3,20}$/.test(asUsername)) {
        const snap = await db.ref(`usernames/${asUsername}`).once('value');
        if (snap.exists()) return snap.val();
    }

    const norm = raw.toUpperCase().replace(/[\s-]/g, '');
    if (/^[A-Z0-9]{6}$/.test(norm) || /^AC[A-Z0-9]{6}$/.test(norm)) {
        const code = norm.length === 8 ? 'AC-' + norm.slice(2) : 'AC-' + norm;
        const snap = await db.ref(`friendCodes/${code}`).once('value');
        if (snap.exists()) return snap.val();
    }

    if (raw.length >= 20) {
        const snap = await db.ref(`users/${raw}/profile`).once('value');
        if (snap.exists()) return raw;
    }
    return null;
}

window.searchLoungeFriend = function() {
    const user = firebase.auth().currentUser;
    const box = document.getElementById('friend-search-result');
    if (!box) return;
    if (!user) { showToast("You must log in to add friends.", "error"); return; }
    const input = document.getElementById('friend-search-input');
    const raw = input ? input.value.trim() : '';
    if (!raw) {
        box.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">Type a friend's @username, friend code, or full ID, then tap Search.</p>`;
        return;
    }
    box.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">Searching...</p>`;
    resolveFriendIdentifier(raw).then(foundUid => {
        if (!foundUid) {
            box.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">No user found for "${escapeHTML(raw)}". Check the spelling and try again.</p>`;
            return;
        }
        if (foundUid === user.uid) {
            box.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">That's you! Share your @username or friend code with a friend instead.</p>`;
            return;
        }
        lastFriendSearchUid = foundUid;
        renderFriendSearchResult(foundUid);
    }).catch(() => {
        box.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">Search failed — check your connection and try again.</p>`;
    });
};

window.refreshFriendSearchResult = function() {
    if (lastFriendSearchUid) renderFriendSearchResult(lastFriendSearchUid);
};

function renderFriendSearchResult(foundUid) {
    const user = firebase.auth().currentUser;
    const box = document.getElementById('friend-search-result');
    if (!user || !box) return;
    const db = firebase.database();
    Promise.all([
        db.ref(`friends/${user.uid}/${foundUid}`).once('value'),
        db.ref(`sentRequests/${user.uid}/${foundUid}`).once('value'),
        db.ref(`friendRequests/${user.uid}/${foundUid}`).once('value')
    ]).then(([friendSnap, sentSnap, incomingSnap]) => {
        getProfileData(foundUid, profile => {
            const uidArg = escapeHTML(foundUid);
            let action;
            if (friendSnap.exists()) {
                action = `<button class="add-btn manual-add-btn" disabled style="padding: 6px 12px; font-size: 12px; height: auto; margin: 0; opacity: 0.7;">✓ Friends</button>`;
            } else if (incomingSnap.exists()) {
                action = `<button class="add-btn" style="padding: 6px 12px; font-size: 12px; height: auto; margin: 0; background: var(--success-color); color: #FFF;" onclick="window.acceptLoungeRequest('${uidArg}'); setTimeout(window.refreshFriendSearchResult, 700);">Accept Request</button>`;
            } else if (sentSnap.exists()) {
                action = `<button class="add-btn manual-add-btn" disabled style="padding: 6px 12px; font-size: 12px; height: auto; margin: 0; opacity: 0.7;">Request Sent</button>
                          <button class="add-btn manual-add-btn" style="padding: 6px 12px; font-size: 12px; height: auto; margin: 0; border-color: var(--error-color); color: var(--error-color);" onclick="window.cancelLoungeRequest('${uidArg}'); setTimeout(window.refreshFriendSearchResult, 700);">Cancel</button>`;
            } else {
                action = `<button class="add-btn" style="padding: 6px 12px; font-size: 12px; height: auto; margin: 0;" onclick="window.sendLoungeRequest('${uidArg}').then(() => setTimeout(window.refreshFriendSearchResult, 300));">Add Friend</button>`;
            }
            box.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; background-color: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${escapeHTML(profile.avatarUrl)}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
                        <div>
                            <h4 style="margin: 0; font-size: 13px; color: var(--text-color);">${escapeHTML(profile.displayName)} <span style="font-size: 10px; font-weight: 800; color: var(--success-color); margin-left: 4px;">Lv.${profile.level || 1}</span></h4>
                            <p style="margin: 0; font-size: 10px; color: var(--text-secondary);">${escapeHTML(profile.title)}${profile.username ? ' · @' + escapeHTML(profile.username) : ''}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">${action}</div>
                </div>
            `;
        });
    }).catch(() => {
        box.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">Couldn't load that profile — try again.</p>`;
    });
}

function renderSentRequests(requestsObj) {
    const listContainer = document.getElementById('sent-requests-list');
    if (!listContainer) return;

    const uids = Object.keys(requestsObj).filter(key => requestsObj[key] === true);

    if (uids.length === 0) {
        listContainer.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">No sent requests waiting.</p>`;
        return;
    }

    listContainer.innerHTML = '';
    uids.forEach(recipientUid => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'anipace-history-item';
        itemDiv.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background-color: rgba(255,255,255,0.02);
            border: 1px solid var(--border-light);
            border-radius: 10px;
            margin-bottom: 8px;
        `;

        getProfileData(recipientUid, profile => {
            itemDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${escapeHTML(profile.avatarUrl)}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <h4 style="margin: 0; font-size: 12px; color: var(--text-color);">${escapeHTML(profile.displayName)}</h4>
                        <p style="margin: 0; font-size: 9px; color: var(--text-secondary);">${escapeHTML(profile.title)} · Waiting for them to accept</p>
                    </div>
                </div>
                <button class="add-btn manual-add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin: 0; border-color: var(--error-color); color: var(--error-color);" onclick="window.cancelLoungeRequest('${escapeHTML(recipientUid)}')">Cancel</button>
            `;
        });

        listContainer.appendChild(itemDiv);
    });
}

function updateRequestsBadge(count) {
    const badge = document.getElementById('requests-count-badge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function initFriendsSubtabs() {
    const btns = document.querySelectorAll('.friends-subtab-btn');
    if (!btns.length) return;
    btns.forEach(btn => {
        btn.onclick = () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ['friends', 'requests', 'add'].forEach(key => {
                const panel = document.getElementById('ftab-' + key);
                if (panel) panel.classList.toggle('hidden', key !== btn.dataset.ftab);
            });
        };
    });
    if (!document.body.dataset.friendMenuCloser) {
        document.body.dataset.friendMenuCloser = '1';
        document.addEventListener('click', () => {
            document.querySelectorAll('.friend-menu').forEach(m => m.classList.add('hidden'));
        });
    }
}

window.toggleFriendMenu = function(friendUid, event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('friend-menu-' + friendUid);
    if (!menu) return;
    const wasHidden = menu.classList.contains('hidden');
    document.querySelectorAll('.friend-menu').forEach(m => m.classList.add('hidden'));
    if (wasHidden) menu.classList.remove('hidden');
};


// --- GLOBAL ATTACHMENTS TO WINDOW (FOR INLINE ACTIONS) ---
// Turn raw Firebase errors into friendly, honest messages for the Lounge.
function loungeErrorMessage(err, fallback) {
    const code = (err && err.code) || '';
    const msg = (err && err.message) || '';
    if (code.indexOf('PERMISSION_DENIED') !== -1 || /permission/i.test(msg)) {
        return "Blocked by the database rules — the friend-system rules update is still needed in Firebase.";
    }
    if (/network|unavailable|disconnected/i.test(msg)) {
        return "Network problem — check your connection and try again.";
    }
    return fallback;
}

window.sendLoungeRequest = function(recipientUid) {
    const user = firebase.auth().currentUser;
    if (!user) {
        showToast("You must log in to add friends.", "error");
        return Promise.resolve();
    }
    if (user.uid === recipientUid) {
        showToast("You can't add yourself.", "error");
        return Promise.resolve();
    }
    const db = firebase.database();
    return Promise.all([
        db.ref(`friends/${user.uid}/${recipientUid}`).once('value'),
        db.ref(`sentRequests/${user.uid}/${recipientUid}`).once('value'),
        db.ref(`friendRequests/${user.uid}/${recipientUid}`).once('value')
    ]).then(([friendSnap, sentSnap, incomingSnap]) => {
        if (friendSnap.exists()) {
            showToast("You're already friends with this user.", "error");
            return;
        }
        if (sentSnap.exists()) {
            showToast("Request already sent — waiting for them to accept.", "error");
            return;
        }
        if (incomingSnap.exists()) {
            showToast("They already sent you a request — accept it under Requests.", "error");
            return;
        }
        const updates = {};
        updates[`friendRequests/${recipientUid}/${user.uid}`] = true;
        updates[`sentRequests/${user.uid}/${recipientUid}`] = true;
        return db.ref().update(updates)
            .then(() => showToast("Friend request sent!"));
    }).catch(err => showToast(loungeErrorMessage(err, "Couldn't send the request. Please try again."), "error"));
};

window.cancelLoungeRequest = function(recipientUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const updates = {};
    updates[`friendRequests/${recipientUid}/${user.uid}`] = null;
    updates[`sentRequests/${user.uid}/${recipientUid}`] = null;

    firebase.database().ref().update(updates)
        .then(() => showToast("Request cancelled."))
        .catch(err => showToast(loungeErrorMessage(err, "Couldn't cancel the request. Please try again."), "error"));
};

window.acceptLoungeRequest = function(senderUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const db = firebase.database();
    // Write BOTH sides of the friendship (the old code wrote only one side,
    // so accepted friends never showed up as mutual friends).
    const updates = {};
    updates[`friends/${user.uid}/${senderUid}`] = true;
    updates[`friends/${senderUid}/${user.uid}`] = true;
    updates[`friendRequests/${user.uid}/${senderUid}`] = null;

    db.ref().update(updates)
        .then(() => {
            showToast("Friend added!");
            // Best-effort: clear their "sent" entry too (ignore failure)
            db.ref(`sentRequests/${senderUid}/${user.uid}`).remove().catch(() => {});
        })
        .catch(err => showToast(loungeErrorMessage(err, "Couldn't accept the request. Please try again."), "error"));
};

window.rejectLoungeRequest = function(senderUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    firebase.database().ref(`friendRequests/${user.uid}/${senderUid}`).remove()
        .then(() => {
            showToast("Friend request declined.");
            // Best-effort: clear their "sent" entry too (ignore failure)
            firebase.database().ref(`sentRequests/${senderUid}/${user.uid}`).remove().catch(() => {});
        })
        .catch(err => showToast(loungeErrorMessage(err, "Couldn't decline the request. Please try again."), "error"));
};

window.removeLoungeFriend = function(friendUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    if (confirm("Are you sure you want to remove this friend?")) {
        const updates = {};
        updates[`friends/${user.uid}/${friendUid}`] = null;

        firebase.database().ref().update(updates)
            .then(() => {
                showToast("Friend removed.");
                // Best-effort: clear the other side too (ignore failure)
                firebase.database().ref(`friends/${friendUid}/${user.uid}`).remove().catch(() => {});
                if (activeChatId && activeChatId.includes(friendUid)) {
                    document.getElementById('dm-input-area')?.classList.add('hidden');
                    document.getElementById('dm-friend-name').textContent = 'No Active Chat';
                    document.getElementById('dm-messages-container').innerHTML = `<p class="empty-state-message" style="margin: auto; font-size: 12px;">No active chat session selected.</p>`;
                }
            })
            .catch(err => showToast(loungeErrorMessage(err, "Couldn't remove this friend. Please try again."), "error"));
    }
};

window.startLoungeChat = function(friendUid) {
    startChat(friendUid);
};

// --- COMPARISON ENGINE & SIDE DRAWER ---
let activeCompareFriendUid = null;
let currentComparisonTab = "mutual";
let comparativeCache = {
    myWatched: [],
    friendWatched: []
};

window.openLoungeComparison = function(friendUid) {
    const user = firebase.auth().currentUser;
    if (!user) {
        showToast("Please log in to compare profiles.", "error");
        return;
    }

    activeCompareFriendUid = friendUid;
    currentComparisonTab = "mutual";

    // Set avatars
    const myAvatar = document.getElementById('compare-my-avatar');
    const friendAvatar = document.getElementById('compare-friend-avatar');
    if (myAvatar) {
        myAvatar.src = user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`;
    }

    const container = document.getElementById('compare-list-container');
    if (container) {
        container.innerHTML = `<p class="empty-state-message" style="font-size:12px; margin:auto;">Crunching lists...</p>`;
    }

    document.getElementById('comparison-drawer')?.classList.remove('hidden');

    // Load friend's data from leaderboard profile
    firebase.database().ref(`leaderboard/${friendUid}`).once('value', snapshot => {
        const friendProfile = snapshot.val() || {};
        if (friendAvatar) {
            friendAvatar.src = friendProfile.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${friendUid}`;
        }

        // Read my watched list safely (including backlog list)
        let myWatched = [];
        const storageKey = 'animeDashboard_v6_combined';
        const rawLocal = localStorage.getItem(storageKey);
        if (rawLocal) {
            try {
                const parsed = JSON.parse(rawLocal);
                const dailyWatchedAnime = Object.values(parsed.days || {}).flatMap(day => day.watched || []);
                const backlogAnime = parsed.backlog || [];
                const allWatchedAnime = [...dailyWatchedAnime, ...backlogAnime];
                const uniqueMap = new Map();
                allWatchedAnime.forEach(item => {
                    const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
                    if (!uniqueMap.has(key)) {
                        uniqueMap.set(key, {
                            mal_id: item.mal_id || null,
                            title: item.title,
                            user_score: item.user_score || null,
                            type: item.type || 'TV',
                            isManual: !!item.isManual
                        });
                    }
                });
                myWatched = Array.from(uniqueMap.values());
            } catch(e) {}
        }

        // Friend's watched list (including backlog list)
        const rawFriendWatched = [
            ...(friendProfile.watchedList || []),
            ...(friendProfile.backlogList || [])
        ];

        // Remove duplicates from friend's combined list
        const friendUniqueMap = new Map();
        rawFriendWatched.forEach(item => {
            const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
            if (!friendUniqueMap.has(key)) {
                friendUniqueMap.set(key, item);
            }
        });
        const friendWatched = Array.from(friendUniqueMap.values());

        comparativeCache.myWatched = myWatched;
        comparativeCache.friendWatched = friendWatched;

        // Calculate Compatibility Algorithmic Jaccard Match + Rating Overlap
        const myKeys = new Set(myWatched.map(a => a.isManual ? a.title.toLowerCase().trim() : a.mal_id));
        const friendKeys = new Set(friendWatched.map(a => a.isManual ? a.title.toLowerCase().trim() : a.mal_id));

        let intersectionSize = 0;
        let scoreDeviationSum = 0;
        let ratedCount = 0;

        myWatched.forEach(a => {
            const key = a.isManual ? a.title.toLowerCase().trim() : a.mal_id;
            if (friendKeys.has(key)) {
                intersectionSize++;
                const fbMatch = friendWatched.find(f => (f.isManual ? f.title.toLowerCase().trim() : f.mal_id) === key);
                if (fbMatch && a.user_score && fbMatch.user_score) {
                    scoreDeviationSum += Math.abs(a.user_score - fbMatch.user_score);
                    ratedCount++;
                }
            }
        });

        const unionSize = myKeys.size + friendKeys.size - intersectionSize;
        const jaccardMatch = unionSize > 0 ? (intersectionSize / unionSize) : 0;

        // 100% minus deviation penalty (average rating variance can penalize up to 30%)
        let ratingPenalty = 0;
        if (ratedCount > 0) {
            const avgDev = scoreDeviationSum / ratedCount; // 0 to 9 max dev
            ratingPenalty = Math.min(0.3, (avgDev / 10));
        }

        const compatibilityFactor = Math.round(((jaccardMatch * 0.7) + (0.3 - ratingPenalty)) * 100);
        const scoreEl = document.getElementById('compare-compatibility-score');
        if (scoreEl) {
            scoreEl.textContent = `${Math.max(10, Math.min(100, compatibilityFactor))}%`;
        }

        renderComparisonTabContent();
    });
};

function renderComparisonTabContent() {
    const container = document.getElementById('compare-list-container');
    if (!container) return;

    container.innerHTML = '';
    const myWatched = comparativeCache.myWatched;
    const friendWatched = comparativeCache.friendWatched;

    const myKeysMap = new Map(myWatched.map(a => [a.isManual ? a.title.toLowerCase().trim() : a.mal_id, a]));
    const friendKeysMap = new Map(friendWatched.map(a => [a.isManual ? a.title.toLowerCase().trim() : a.mal_id, a]));

    if (currentComparisonTab === "mutual") {
        const mutuals = myWatched.filter(a => friendKeysMap.has(a.isManual ? a.title.toLowerCase().trim() : a.mal_id));
        if (mutuals.length === 0) {
            container.innerHTML = `<p class="empty-state-message" style="font-size:12px; margin:auto;">No shared completed titles yet. Watch some anime together!</p>`;
            return;
        }

        mutuals.forEach(a => {
            const key = a.isManual ? a.title.toLowerCase().trim() : a.mal_id;
            const match = friendKeysMap.get(key);
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(255,255,255,0.02);
                border: 1px solid var(--border-light);
                padding: 10px;
                border-radius: 8px;
                font-size: 12px;
            `;
            row.innerHTML = `
                <div>
                    <h5 style="margin:0; font-size:12px; color:var(--primary-color); font-weight:700;">${escapeHTML(a.title)}</h5>
                    <span style="font-size:10px; color:var(--text-secondary);">${escapeHTML(a.type || 'TV')}</span>
                </div>
                <div style="font-size:11px; font-weight:bold; color:var(--success-color);">
                    My: ${escapeHTML(String(a.user_score || 'N/A'))} ★ • Theirs: ${escapeHTML(String(match.user_score || 'N/A'))} ★
                </div>
            `;
            container.appendChild(row);
        });
    } else if (currentComparisonTab === "unique-them") {
        const uniqueThem = friendWatched.filter(a => !myKeysMap.has(a.isManual ? a.title.toLowerCase().trim() : a.mal_id));
        if (uniqueThem.length === 0) {
            container.innerHTML = `<p class="empty-state-message" style="font-size:12px; margin:auto;">They haven't completed any titles that you haven't seen!</p>`;
            return;
        }

        uniqueThem.forEach(a => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(255,255,255,0.02);
                border: 1px solid var(--border-light);
                padding: 10px;
                border-radius: 8px;
                font-size: 12px;
            `;
            row.innerHTML = `
                <div>
                    <h5 style="margin:0; font-size:12px; color:var(--primary-color); font-weight:700;">${escapeHTML(a.title)}</h5>
                    <span style="font-size:10px; color:var(--text-secondary);">${escapeHTML(a.type || 'TV')} • Score: ${escapeHTML(String(a.user_score || 'N/A'))}</span>
                </div>
                <button class="add-btn" style="padding: 4px 8px; font-size: 10px; height:auto; margin:0;" onclick="window.quickAddBacklogTitle('${escapeHTML(a.title)}', ${a.mal_id || 'null'}, '${escapeHTML(a.type || 'TV')}')">Add Backlog</button>
            `;
            container.appendChild(row);
        });
    } else if (currentComparisonTab === "unique-me") {
        const uniqueMe = myWatched.filter(a => !friendKeysMap.has(a.isManual ? a.title.toLowerCase().trim() : a.mal_id));
        if (uniqueMe.length === 0) {
            container.innerHTML = `<p class="empty-state-message" style="font-size:12px; margin:auto;">You haven't completed any unique titles yet!</p>`;
            return;
        }

        uniqueMe.forEach(a => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(255,255,255,0.02);
                border: 1px solid var(--border-light);
                padding: 10px;
                border-radius: 8px;
                font-size: 12px;
            `;
            row.innerHTML = `
                <div>
                    <h5 style="margin:0; font-size:12px; color:var(--primary-color); font-weight:700;">${escapeHTML(a.title)}</h5>
                    <span style="font-size:10px; color:var(--text-secondary);">${escapeHTML(a.type || 'TV')} • Score: ${escapeHTML(String(a.user_score || 'N/A'))}</span>
                </div>
                <button class="add-btn manual-add-btn" style="padding: 4px 8px; font-size: 10px; height:auto; margin:0;" onclick="window.recommendLoungeTitle('${escapeHTML(activeCompareFriendUid)}', '${escapeHTML(a.title)}')">Recommend</button>
            `;
            container.appendChild(row);
        });
    }
}

window.quickAddBacklogTitle = function(title, malId, type) {
    const isManual = !malId;
    if (window.challengeData) {
        window.challengeData.backlog = window.challengeData.backlog || [];
        const duplicate = window.challengeData.backlog.some(item =>
            isManual ? item.title.toLowerCase().trim() === title.toLowerCase().trim() : item.mal_id === malId
        );
        if (duplicate) {
            showToast("This item is already in your backlog!", "error");
            return;
        }

        const item = {
            mal_id: malId,
            title: title,
            type: type,
            isManual: isManual,
            date_added: new Date().toISOString()
        };

        window.challengeData.backlog.push(item);
        if (typeof window.saveData === "function") {
            window.saveData();
        }
        if (typeof window.updateAllDisplays === "function") {
            window.updateAllDisplays();
        }
        if (typeof window.processAchievements === "function") {
            window.processAchievements();
        }
        showToast(`Added ${title} to your backlog!`);
    } else {
        const storageKey = 'animeDashboard_v6_combined';
        const rawLocal = localStorage.getItem(storageKey);
        if (rawLocal) {
            try {
                const parsed = JSON.parse(rawLocal);
                const duplicate = (parsed.backlog || []).some(item =>
                    isManual ? item.title.toLowerCase().trim() === title.toLowerCase().trim() : item.mal_id === malId
                );
                if (duplicate) {
                    showToast("This item is already in your backlog!", "error");
                    return;
                }

                const item = {
                    mal_id: malId,
                    title: title,
                    type: type,
                    isManual: isManual,
                    date_added: new Date().toISOString()
                };

                parsed.backlog = parsed.backlog || [];
                parsed.backlog.push(item);
                localStorage.setItem(storageKey, JSON.stringify(parsed));
                showToast(`Added ${title} to your backlog!`);
            } catch(e) {}
        }
    }
};

window.recommendLoungeTitle = function(friendUid, title) {
    const user = firebase.auth().currentUser;
    if (!user || !friendUid) return;

    const activeChat = [user.uid, friendUid].sort().join('_');
    const message = {
        senderUid: user.uid,
        text: `Hey, check out this recommendation: "${title}"! You should totally log this!`,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        type: 'text'
    };

    firebase.database().ref(`chats/${activeChat}`).push(message)
        .then(() => {
            showToast(`Recommended "${title}" in your active chat thread!`);
            startLoungeChat(friendUid);
            document.getElementById('comparison-drawer')?.classList.add('hidden');

            // Switch screen to lounge and friends tab if not there
            const loungeBtn = document.getElementById('switch-to-lounge-btn');
            if (loungeBtn) {
                loungeBtn.click();
            }
        })
        .catch(err => showToast(err.message, "error"));
};

// --- INITIALIZE SOCIAL LOUNGE ---
function initLoungeTabSwitching() {
    const tabBtns = document.querySelectorAll('.lounge-tab-btn');
    const tabContents = document.querySelectorAll('.lounge-tab-content');

    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));

            btn.classList.add('active');
            const target = btn.dataset.tab;

            if (target === 'friends') {
                document.getElementById('lounge-friends-tab').classList.remove('hidden');
                updateMobileLoungeView();
            } else if (target === 'leaderboard') {
                document.getElementById('lounge-leaderboard-tab').classList.remove('hidden');
                loadLeaderboard();
            } else if (target === 'lounge-tools') {
                document.getElementById('lounge-tools-tab').classList.remove('hidden');
            }
        };
    });
}

// Listen to screen switches to lazy-load real-time listeners
document.addEventListener('lounge-screen-active', () => {
    initLoungeListeners();
});

// Setup hook for direct authentication changes
document.addEventListener('auth-changed', (e) => {
    const user = e.detail.user;
    if (user) {
        // Trigger profile count and details sync
        getUserCounts(counts => {
            firebase.database().ref(`users/${user.uid}/profile`).update({
                completedCount: counts.completedCount,
                totalCount: counts.totalCount
            }).catch(() => {});
        });

        // Also load listeners if currently viewing lounge screen
        const loungeScreen = document.getElementById('anime-social-lounge');
        if (loungeScreen && !loungeScreen.classList.contains('hidden')) {
            initLoungeListeners();
        }
    } else {
        stopLoungeListeners();
    }
});

// Setup document-level initializer for Lounge components
function initLoungeComponents() {
    // Wire up "← Back" button for mobile view switching
    const backBtn = document.getElementById('lounge-chat-back-btn');
    if (backBtn) {
        backBtn.onclick = () => {
            activeChatId = null;
            if (chatListenerRef) chatListenerRef.off();
            chatListenerRef = null;
            const messagesContainer = document.getElementById('dm-messages-container');
            if (messagesContainer) {
                messagesContainer.innerHTML = `<p class="empty-state-message" style="margin: auto; font-size: 12px;">No active chat session selected.</p>`;
            }
            const inputArea = document.getElementById('dm-input-area');
            if (inputArea) inputArea.classList.add('hidden');
            const hName = document.getElementById('dm-friend-name');
            if (hName) hName.textContent = 'No Active Chat';
            updateMobileLoungeView();
        };
    }

    initLoungeTabSwitching();
    initProfileSettings();
    initPresenceSystem();
    initEmojiPicker();
    initAnimeEmbedShare();
    initSmartBingePlanner();

    // Wire up Otaku Comparison Close and Tab clicks
    const compareClose = document.getElementById('close-comparison-drawer');
    const comparisonDrawer = document.getElementById('comparison-drawer');
    if (compareClose) {
        compareClose.onclick = () => {
            comparisonDrawer?.classList.add('hidden');
        };
    }
    if (comparisonDrawer) {
        comparisonDrawer.onclick = (e) => {
            if (e.target === comparisonDrawer) {
                comparisonDrawer.classList.add('hidden');
            }
        };
    }

    const compareTabs = document.querySelectorAll('.compare-tab-btn');
    compareTabs.forEach(btn => {
        btn.onclick = () => {
            compareTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentComparisonTab = btn.dataset.tab;
            renderComparisonTabContent();
        };
    });

    // Wire up text chat send buttons
    const sendBtn = document.getElementById('send-dm-btn');
    const inputMsg = document.getElementById('dm-message-input');
    if (sendBtn) sendBtn.onclick = sendTextMessage;
    if (inputMsg) {
        inputMsg.onkeydown = (e) => {
            if (e.key === 'Enter') sendTextMessage();
        };
    }

    // Copy Share Code click handler
    const copyBtn = document.getElementById('copy-share-code-btn');
    const shareInput = document.getElementById('user-share-code');
    if (copyBtn && shareInput) {
        copyBtn.onclick = () => {
            shareInput.select();
            document.execCommand('copy');
            showToast("Friend Code copied to clipboard!");
        };
    }

    // Add friend: search by @username, friend code, or full ID
    const friendSearchBtn = document.getElementById('search-friend-btn');
    const friendSearchInput = document.getElementById('friend-search-input');
    if (friendSearchBtn) friendSearchBtn.onclick = () => window.searchLoungeFriend();
    if (friendSearchInput) {
        friendSearchInput.onkeydown = (e) => {
            if (e.key === 'Enter') window.searchLoungeFriend();
        };
    }
    initFriendsSubtabs();
}
// ============================================================
// DESIGN V2 — Step 1 (design-v2 branch): bottom nav, Menu screen,
// Today's Challenge hero. ADDITIVE ONLY.
// Navigation reuses the existing switchToScreen() and the existing
// click handlers on #achievements-card / #avg-score-card /
// #settings-btn / .lounge-tab-btn — nothing here changes how any
// existing feature works, and no data is read for writing or stored.
// ============================================================
function dv2SetNav(key) {
    document.querySelectorAll('.dv2-nav-btn').forEach(btn => {
        btn.classList.toggle('dv2-active', btn.dataset.dv2Nav === key);
    });
}

function dv2HideMenu() {
    const menu = document.getElementById('dv2-menu-screen');
    if (menu) menu.classList.add('hidden');
}

function dv2Go(screen) {
    dv2HideMenu();
    switchToScreen(screen);
    dv2SetNav(screen);
    if (screen === 'challenge') dv2RefreshHero();
}

function dv2ShowMenu() {
    // Mirror what switchToScreen() does when leaving the lounge.
    const loungeScreen = document.getElementById('anime-social-lounge');
    if (loungeScreen && !loungeScreen.classList.contains('hidden') && typeof stopLoungeListeners === 'function') {
        stopLoungeListeners();
    }
    ['challenge-screen', 'backlog-manager-screen', 'anipace-log-screen', 'schedule-screen', 'anime-social-lounge'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const menu = document.getElementById('dv2-menu-screen');
    if (menu) menu.classList.remove('hidden');
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = 'Menu';
    dv2FillMenuProfile();
    dv2SetNav('menu');
    window.scrollTo(0, 0);
}

// Profile strip: rank text is copied from the existing #rank-badge;
// name/avatar come from the existing getProfileData() helper.
function dv2FillMenuProfile() {
    const rankEl = document.getElementById('rank-badge');
    const rankTarget = document.getElementById('dv2-menu-rank');
    if (rankEl && rankTarget && rankEl.textContent.trim()) {
        rankTarget.textContent = rankEl.textContent.trim();
    }
    try {
        const user = (window.firebase && firebase.auth) ? firebase.auth().currentUser : null;
        if (user && typeof getProfileData === 'function') {
            getProfileData(user.uid, profile => {
                if (!profile) return;
                const nameEl = document.getElementById('dv2-menu-name');
                const avatarEl = document.getElementById('dv2-menu-avatar');
                if (nameEl && profile.displayName) nameEl.textContent = profile.displayName;
                if (avatarEl && profile.avatarUrl) avatarEl.src = profile.avatarUrl;
            });
        }
    } catch (e) { /* profile strip keeps its defaults */ }
}

// Hero values come only from existing app state/DOM:
// anipaceData.episodesToday, challengeData.days[today].watched,
// the existing #daily-pace-value and #progress-fill displays.
function dv2RefreshHero() {
    try {
        const epEl = document.getElementById('dv2-hero-episodes');
        if (epEl && typeof anipaceData !== 'undefined' && anipaceData) {
            epEl.textContent = anipaceData.episodesToday || 0;
        }
        const anEl = document.getElementById('dv2-hero-anime');
        if (anEl && typeof challengeData !== 'undefined' && challengeData && typeof getLocalDateString === 'function') {
            const today = challengeData.days ? challengeData.days[getLocalDateString(new Date())] : null;
            anEl.textContent = (today && today.watched) ? today.watched.length : 0;
        }
        const paceEl = document.getElementById('dv2-hero-pace');
        const paceVal = document.getElementById('daily-pace-value');
        if (paceEl && paceVal && paceVal.textContent.trim()) {
            paceEl.textContent = 'Daily pace: ' + paceVal.textContent.trim();
        }
        const fill = document.getElementById('progress-fill');
        if (fill) {
            const pct = (fill.textContent || '0%').trim();
            const bar = document.getElementById('dv2-hero-bar');
            const pctEl = document.getElementById('dv2-hero-progress');
            if (bar) bar.style.width = pct;
            if (pctEl) pctEl.textContent = pct;
        }
    } catch (e) { /* hero keeps its defaults until app data is ready */ }
}

function dv2ClickById(id) {
    const el = document.getElementById(id);
    if (el) el.click();
}

// --- DESIGN V2 wiring (script.js loads at the end of <body>, so the DOM exists) ---
document.querySelectorAll('.dv2-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.dv2Nav;
        if (target === 'menu') dv2ShowMenu();
        else dv2Go(target);
    });
});

document.querySelectorAll('[data-dv2-go]').forEach(row => {
    row.addEventListener('click', () => dv2Go(row.dataset.dv2Go));
});

document.querySelectorAll('[data-dv2-open]').forEach(row => {
    row.addEventListener('click', () => {
        const target = row.dataset.dv2Open;
        if (target === 'achievements') {
            // Reuses the achievements card's own handler (always opens on the Newbie tab).
            dv2HideMenu();
            dv2ClickById('achievements-card');
        } else if (target === 'analytics') {
            // Analytics lives in the existing chart modal; the stat cards open it.
            dv2HideMenu();
            dv2ClickById('avg-score-card');
        } else if (target === 'settings') {
            dv2HideMenu();
            dv2ClickById('settings-btn');
        } else if (target === 'leaderboard') {
            // The leaderboard is a tab inside the Social Lounge.
            dv2Go('lounge');
            const tab = document.querySelector('.lounge-tab-btn[data-tab="leaderboard"]');
            if (tab) tab.click();
        }
    });
});

const dv2HeroLogBtn = document.getElementById('dv2-hero-log-btn');
if (dv2HeroLogBtn) dv2HeroLogBtn.addEventListener('click', () => dv2Go('anipace'));

// Keep the bottom nav highlight in sync when the existing top bar is used,
// and never leave the Menu screen open over another screen.
[['switch-to-challenge-btn', 'challenge'], ['switch-to-backlog-btn', 'backlog'], ['switch-to-anipace-btn', 'anipace'], ['switch-to-schedule-btn', 'schedule'], ['switch-to-lounge-btn', 'lounge']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => {
        dv2HideMenu();
        dv2SetNav(key);
        if (key === 'challenge') dv2RefreshHero();
    });
});
const dv2SettingsBtn = document.getElementById('settings-btn');
if (dv2SettingsBtn) dv2SettingsBtn.addEventListener('click', () => dv2HideMenu());
const dv2JumpBtn = document.getElementById('jump-to-today-btn');
if (dv2JumpBtn) dv2JumpBtn.addEventListener('click', () => dv2Go('challenge'));

document.addEventListener('DOMContentLoaded', () => {
    dv2SetNav('challenge');
    dv2RefreshHero();
});
