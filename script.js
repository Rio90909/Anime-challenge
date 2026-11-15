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
                            <button class="backlog-synopsis-toggle-btn" onclick="openAnimePage('${anime.mal_id}', '${anime.source || 'kitsu'}')">Read Story ▾</button>
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

            // Full anime page (added with the Anime Page build): every
            // backlog entry — manual ones included, they have no Read
            // Story button — gets a Details button opening the page.
            const detailsBtn = document.createElement('button');
            detailsBtn.className = 'add-btn manual-add-btn';
            detailsBtn.style.cssText = 'padding: 4px 10px; font-size: 11px; height: auto; margin: 0;';
            detailsBtn.textContent = '📖 Details';
            detailsBtn.onclick = () => { if (typeof window.openAnimePageEntry === 'function') window.openAnimePageEntry(anime); };
            controlsDiv.appendChild(detailsBtn);

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
                            <button class="synopsis-toggle-btn" onclick="openAnimePage('${anime.mal_id}', '${anime.source || 'kitsu'}')">Read Story ▾</button>
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
                <button class="synopsis-toggle-btn" onclick="openAnimePage('${anime.mal_id}', '${anime.source || 'kitsu'}')" style="font-size: 11px; font-weight: bold; background: none; border: none; padding: 0; color: var(--primary-color); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Read Story ▾</button>
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
        // Items revived from the saved Discover feed (localStorage)
        // never passed through the response normalizer in this
        // session, so register them here — otherwise the details
        // resolver cannot find them and the full page cannot open.
        registerAnimeForDetails(anime);
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
                <button class="synopsis-toggle-btn" onclick="openAnimePage('${anime.mal_id}', '${anime.source || 'kitsu'}')" style="font-size: 11px; font-weight: bold; background: none; border: none; padding: 0; color: var(--primary-color); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Read Story ▾</button>
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
        // Same saved-feed registration as renderScheduleGrid:
        // cached items must be resolvable by the details loader.
        registerAnimeForDetails(anime);
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
                <button class="synopsis-toggle-btn" onclick="openAnimePage('${anime.mal_id}', '${anime.source || 'kitsu'}')" style="font-size: 11px; font-weight: bold; background: none; border: none; padding: 0; color: var(--primary-color); cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">Read Story ▾</button>
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
// THEME SONGS + EPISODE GRID — ported into the OG app from
// the design-v2 build (user-approved 2026-11-15). Both blocks
// live inside the Read Story details panel, hooked additively
// onto window.lazyLoadDetails; no existing code is modified.
// Styling uses the OG palette/variables only (styles.css:
// "THEME SONGS + EPISODE GRID (OG port)" section).
// ============================================================

// ============================================================
// THEMES — "🎵 Theme Songs" block in the Read Story details
// panel: the show's opening/ending themes with playable
// video, powered by the AnimeThemes GraphQL API
// (POST https://rs.animethemes.moe/graphql, no auth).
//
// Query shape VERIFIED LIVE (2026-11-14) against AniList id
// 16498 (Attack on Titan): filterAnimeByExternalSite(site:
// ANILIST, id: [id]) returns a LIST of Anime; Anime.themes ->
// Theme { type (OP / ED / IN), sequence, song { title {
// native romaji }, staff { ... } }, entries { version,
// videos { nodes { basename link resolution nc } } } }.
// Real sample: OP1 "Guren no Yumiya" — Linked Horizon —
// https://v.animethemes.moe/ShingekiNoKyojin-OP1.webm
// (1080p, creditless). One POST per title; results —
// including empty ones — are cached 30 days in
// aniclipse_themes_cache_v1; network/GraphQL errors are
// never cached and stay fully silent. Videos are never
// preloaded: the <video> element (and its src) is only
// created when the user taps Play.
//
// OG ADAPTATION: the AniList id comes from the entry
// itself — source 'anilist' means mal_id IS the AniList id,
// and legacy (Kitsu-era) entries repaired by the Settings
// "Fix Old Shows" tool (end of this file) carry it in a
// separate anilist_id field. Unrepaired legacy and manual
// entries render no block at all: a non-AniList id is never
// sent to AnimeThemes.
// ============================================================

const THEMES_CACHE_KEY = 'aniclipse_themes_cache_v1';
const THEMES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const THEMES_API_URL = 'https://rs.animethemes.moe/graphql';

const THEMES_QUERY = `
query ($id: [Int!]) {
    filterAnimeByExternalSite(site: ANILIST, id: $id) {
        id
        themes {
            type
            sequence
            song {
                title { native romaji }
                staff {
                    role
                    as
                    memberAs
                    artist { name { main native } }
                    member { name { main native } }
                }
            }
            entries {
                version
                videos { nodes { basename link resolution nc audio { link mimetype size } } }
            }
        }
    }
}`;

const themesInFlight = new Set();

function themesLoadCache() {
    try {
        const raw = localStorage.getItem(THEMES_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function themesSaveCache(cache) {
    try {
        localStorage.setItem(THEMES_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable — the feature degrades silently */ }
}

function themesEscapeHtml(text) {
    return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Display name of one song-staff credit: the credited alias
// wins (group member alias, then the performer's "as"
// alias), then the member's name, then the artist's name.
function themesArtistName(staffEntry) {
    if (!staffEntry) return null;
    if (staffEntry.memberAs) return staffEntry.memberAs;
    if (staffEntry.as) return staffEntry.as;
    const pick = (n) => (n ? (n.main || n.native || null) : null);
    if (staffEntry.member && staffEntry.member.name) return pick(staffEntry.member.name);
    if (staffEntry.artist && staffEntry.artist.name) return pick(staffEntry.artist.name);
    return null;
}

// Performer names for a song (the "Performance" role in
// AnimeThemes data); falls back to every credited name
// when a song has no explicit performance credits.
function themesArtistsFor(song) {
    const staff = (song && Array.isArray(song.staff)) ? song.staff : [];
    let names = staff.filter(s => s && s.role === 'Performance').map(themesArtistName).filter(Boolean);
    if (!names.length) names = staff.map(themesArtistName).filter(Boolean);
    return names.filter((name, i) => names.indexOf(name) === i);
}

// Choose the one playable video for a theme: canonical
// entry version first (v1 before v2…), then the best
// resolution at or under 1080p (higher resolutions are
// penalized, not preferred), then creditless (nc) cuts.
function themesPickVideo(theme) {
    const candidates = [];
    ((theme && theme.entries) || []).forEach(entry => {
        const version = (entry && typeof entry.version === 'number') ? entry.version : 1;
        const nodes = (entry && entry.videos && Array.isArray(entry.videos.nodes)) ? entry.videos.nodes : [];
        nodes.forEach(v => {
            if (v && v.link) candidates.push({ link: v.link, res: (typeof v.resolution === 'number') ? v.resolution : null, nc: !!v.nc, version: version, audio: (v.audio && v.audio.link) ? v.audio.link : null });
        });
    });
    if (!candidates.length) return null;
    const resScore = (res) => {
        if (!res) return 0;
        return res <= 1080 ? res : 1080 - (res - 1080);
    };
    candidates.sort((a, b) =>
        (a.version - b.version) ||
        (resScore(b.res) - resScore(a.res)) ||
        ((b.nc ? 1 : 0) - (a.nc ? 1 : 0)));
    const best = candidates[0];
    // The winning node's own audio track rides along: the 🎧
    // button (Music Player block, end of file) plays this
    // light audio file instead of the full video.
    return { link: best.link, res: best.res, nc: best.nc, audio: best.audio || null };
}

// Flatten the GraphQL response into render-ready rows:
// OPs first, then EDs, each by sequence. IN (insert songs)
// are left out — the block is openings and endings only.
function themesProcessResponse(data) {
    const list = (data && Array.isArray(data.filterAnimeByExternalSite)) ? data.filterAnimeByExternalSite : [];
    const anime = list[0];
    if (!anime || !Array.isArray(anime.themes)) return [];
    const out = [];
    anime.themes.forEach(t => {
        if (!t || (t.type !== 'OP' && t.type !== 'ED')) return;
        const song = t.song || {};
        const titleObj = song.title || {};
        const video = themesPickVideo(t);
        out.push({
            type: t.type,
            seq: (typeof t.sequence === 'number') ? t.sequence : null,
            title: titleObj.romaji || titleObj.native || '',
            artists: themesArtistsFor(song),
            video: video,
            audio: video ? (video.audio || null) : null
        });
    });
    out.sort((a, b) => (a.type === b.type)
        ? ((a.seq || 0) - (b.seq || 0))
        : (a.type === 'OP' ? -1 : 1));
    return out;
}

// Close whichever theme (if any) is currently playing in
// this block: pause it, drop the element (which also drops
// the buffered video bytes) and reset its button.
function themesClosePlayer(block) {
    block.querySelectorAll('.themes-row').forEach(row => {
        const player = row.querySelector('.themes-player');
        const btn = row.querySelector('.themes-play-btn');
        if (player) {
            const video = player.querySelector('video');
            if (video) { try { video.pause(); } catch (e) { /* already gone */ } }
            player.innerHTML = '';
            player.hidden = true;
        }
        if (btn && btn.dataset.open === '1') {
            btn.dataset.open = '';
            btn.textContent = btn.dataset.label || '▶ Play';
        }
    });
}

function themesTogglePlay(block, idx) {
    const themes = block._themesList || [];
    const theme = themes[idx];
    if (!theme || !theme.video) return;
    const row = block.querySelector(`.themes-row[data-idx="${idx}"]`);
    if (!row) return;
    const btn = row.querySelector('.themes-play-btn');
    const player = row.querySelector('.themes-player');
    if (!btn || !player) return;
    if (btn.dataset.open === '1') {
        themesClosePlayer(block);
        return;
    }
    themesClosePlayer(block);
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'none';
    video.playsInline = true;
    video.src = theme.video.link; // set only now — on the user's tap
    player.appendChild(video);
    player.hidden = false;
    btn.dataset.open = '1';
    btn.textContent = '✕ Close';
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === 'function') playAttempt.catch(() => { /* user can press the native play button */ });
}

function themesRenderBlock(animeId, themes, animeTitle) {
    const linksContainer = document.getElementById(`streaming-links-${animeId}`);
    if (!linksContainer || !linksContainer.parentElement) return;
    const parent = linksContainer.parentElement;
    let block = parent.querySelector('.themes-block');
    if (!themes || !themes.length) {
        if (block) block.remove();
        return;
    }
    if (!block) {
        block = document.createElement('div');
        block.className = 'themes-block';
        parent.insertBefore(block, linksContainer);
    }
    block._themesList = themes;
    block._themesAnimeTitle = animeTitle || '';
    const rows = themes.map((t, idx) => {
        const chipLabel = t.seq ? `${t.type}${t.seq}` : t.type;
        const chipClass = t.type === 'OP' ? 'themes-chip themes-chip-op' : 'themes-chip';
        const title = t.title || (t.type === 'OP' ? 'Opening theme' : 'Ending theme');
        const artistLine = t.artists && t.artists.length
            ? `<div class="themes-artist">${themesEscapeHtml(t.artists.join(', '))}</div>`
            : '';
        const playBtn = t.video
            ? `<button class="themes-play-btn" type="button" data-idx="${idx}" data-label="▶ Play${t.video.res ? ` · ${t.video.res}p` : ''}">▶ Play${t.video.res ? ` · ${t.video.res}p` : ''}</button>`
            : '';
        const audioBtn = t.audio
            ? `<button class="themes-audio-btn" type="button" data-idx="${idx}">🎧 Audio</button>`
            : '';
        return `
        <div class="themes-row" data-idx="${idx}">
            <span class="${chipClass}">${chipLabel}</span>
            <div class="themes-meta">
                <div class="themes-title">${themesEscapeHtml(title)}</div>
                ${artistLine}
            </div>
            ${playBtn}
            ${audioBtn}
            <div class="themes-player" hidden></div>
        </div>`;
    }).join('');
    block.innerHTML = `
        <div class="themes-head"><strong>🎵 Theme Songs</strong></div>
        ${rows}`;
    block.querySelectorAll('.themes-play-btn').forEach(btn => {
        btn.addEventListener('click', () => themesTogglePlay(block, parseInt(btn.dataset.idx, 10)));
    });
    block.querySelectorAll('.themes-audio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (typeof musicPlayThemesQueue === 'function') musicPlayThemesQueue(block, parseInt(btn.dataset.idx, 10));
        });
    });
}

// The entry's AniList id, OG rules: (a) AniList-sourced
// entries carry it in mal_id; (b) legacy Kitsu-era entries
// repaired by the Settings "Fix Old Shows" tool carry it in
// the anilist_id field that tool adds. Anything else
// (unrepaired legacy, manual) has no AniList id here and
// gets no lookup — never send a foreign id space to
// AnimeThemes.
function themesAniListId(anime) {
    // Shared resolution ladder (defined in the ANIME PAGE block
    // at the end of this file): source 'anilist' → mal_id; else
    // a positive anilist_id (the Fix Old Shows repair field);
    // else null. Manual entries resolve to null.
    return animePageAniListId(anime);
}

function themesMaybeLoad(animeId, animeSource) {
    const anime = (typeof resolveAnimeForDetails === 'function') ? resolveAnimeForDetails(animeId, animeSource) : null;
    if (!anime || anime.isManual) return;
    const idNum = themesAniListId(anime);
    if (!idNum) return;
    const animeTitle = (() => { try { return getEnglishTitle(anime); } catch (e) { return ''; } })();
    const cache = themesLoadCache();
    const hit = cache[String(idNum)];
    if (hit && (Date.now() - (hit.t || 0)) < THEMES_CACHE_TTL_MS) {
        // Entries cached before the 🎧 audio upgrade carry no
        // audio links at all — treat those as stale and refetch
        // once, so the audio buttons appear without waiting out
        // the 30-day TTL.
        const lacksAudio = Array.isArray(hit.themes) && hit.themes.length > 0
            && hit.themes.some(t => t && t.video && t.audio === undefined);
        if (!lacksAudio) {
            themesRenderBlock(animeId, hit.themes, animeTitle);
            return;
        }
    }
    if (themesInFlight.has(idNum)) return;
    themesInFlight.add(idNum);
    fetch(THEMES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: THEMES_QUERY, variables: { id: [idNum] } })
    })
        .then(res => {
            if (!res || !res.ok) throw new Error('AnimeThemes HTTP error');
            return res.json();
        })
        .then(json => {
            if (!json || (!json.data && json.errors)) throw new Error('AnimeThemes GraphQL error');
            const themes = themesProcessResponse(json.data);
            // Cache the result — including "no themes" — so
            // each title is asked about at most once a month.
            const store = themesLoadCache();
            store[String(idNum)] = { t: Date.now(), themes: themes };
            themesSaveCache(store);
            themesRenderBlock(animeId, themes, animeTitle);
        })
        .catch(() => { /* silent: offline / API down — no block is better than an error */ })
        .finally(() => { themesInFlight.delete(idNum); });
}

// Hook the details lazy-loader additively: the theme songs
// land in the same panel, at the same moment, above the
// streaming links.
if (typeof window.lazyLoadDetails === 'function') {
    const themesPrevLazyLoadDetails = window.lazyLoadDetails;
    window.lazyLoadDetails = function(animeId, animeSource) {
        const result = themesPrevLazyLoadDetails.apply(this, arguments);
        try { themesMaybeLoad(animeId, animeSource); } catch (e) { /* never break details */ }
        return result;
    };
}
// End THEMES

// ============================================================
// EPISODE GRID — "📺 Episodes" tap-to-log check-off grid in
// the Read Story details panel. One numbered cell per
// episode: cells already logged are filled, the next episode
// carries an accent outline, and tapping any unwatched
// released cell logs every episode up to it through the
// app's ONE canonical log path — the AniPace quick-log form,
// exactly like the app's other quick-log flows. ADVANCE
// ONLY, by design: AniPace history is append-only, so there
// is deliberately no un-log — un-logging would desync XP,
// streaks and achievements. While a show is airing, cells
// past the released count (nextAiringEpisode on the resolved
// object — no new API calls anywhere in this feature)
// render dimmed and are not tappable. Long shows render in
// chunks of 100 behind a "Show more" button. Manual entries
// are included (their total is the count typed at creation).
// Every failure silent.
// ============================================================

// EPGRID PURE LOGIC START — plain-number helpers only; this
// section is exercised by the Node harness, so it must stay
// free of DOM / app-state references.
const EPGRID_CHUNK = 100;

function epgridSanitizeTotal(rawTotal) {
    const t = parseInt(rawTotal, 10);
    return (!isNaN(t) && t > 0) ? t : 0;
}

// Episodes actually out: the next airing episode number
// minus one when the resolved object carries
// nextAiringEpisode, otherwise the full total (unknown =
// everything tappable).
function epgridReleasedCount(total, nextEpEpisode) {
    const t = epgridSanitizeTotal(total);
    const n = parseInt(nextEpEpisode, 10);
    if (!isNaN(n) && n > 0) return Math.max(0, Math.min(t, n - 1));
    return t;
}

function epgridClampWatched(watched, total) {
    const w = parseInt(watched, 10);
    const t = epgridSanitizeTotal(total);
    if (isNaN(w) || w < 0) return 0;
    return Math.min(w, t);
}

// Cells rendered initially: one full chunk, widened in whole
// chunks so the next unwatched cell (watched + 1) is always
// on screen even when progress sits deep inside a long show.
function epgridInitialShown(total, watched) {
    const t = epgridSanitizeTotal(total);
    const need = epgridClampWatched(watched, t) + 1;
    const chunks = Math.max(1, Math.ceil(need / EPGRID_CHUNK));
    return Math.min(t, chunks * EPGRID_CHUNK);
}

// Cells rendered after one "Show more" tap.
function epgridMoreShown(total, shown) {
    const t = epgridSanitizeTotal(total);
    const s = parseInt(shown, 10);
    return Math.min(t, (isNaN(s) || s < 0 ? 0 : s) + EPGRID_CHUNK);
}

// Cell states: watched (already logged) / locked (not out
// yet) / next (the very next episode) / open (released and
// unwatched). A logged cell stays "watched" even past the
// released cap — the log is the truth.
function epgridCellState(n, watched, released) {
    if (n <= watched) return 'watched';
    if (n > released) return 'locked';
    if (n === watched + 1) return 'next';
    return 'open';
}

// Episodes a tap on cell n would log; 0 = not tappable
// (already watched, or not released yet). Advance only: the
// result is never negative.
function epgridDelta(n, watched, released) {
    const st = epgridCellState(n, watched, released);
    if (st !== 'next' && st !== 'open') return 0;
    return n - watched;
}
// EPGRID PURE LOGIC END

// --- Watched-count support (ported with the grid): the
// per-title episode record is the AniPace history, matched
// against every title variant, raised to any stored
// watched_episodes found on the title's own copies. ---

// Same identity rule getUniqueAnime() merges by: manual
// entries by title, everything else by mal_id.
function upnextEntryKey(item) {
    if (!item) return '';
    return item.isManual
        ? 'manual:' + String(item.title || '').toLowerCase().trim()
        : 'id:' + String(item.mal_id);
}

// Every stored copy of a title (challenge days + backlog) —
// progress physically lives on the copies, not on the merged
// library entry.
function upnextAllCopies(anime) {
    const key = upnextEntryKey(anime);
    const copies = [];
    try {
        Object.values(challengeData.days || {}).forEach(day => {
            (day.watched || []).forEach(item => { if (upnextEntryKey(item) === key) copies.push(item); });
        });
        (challengeData.backlog || []).forEach(item => { if (upnextEntryKey(item) === key) copies.push(item); });
    } catch (e) { /* return whatever was collected */ }
    return copies;
}

function upnextTitleVariants(anime) {
    const variants = new Set();
    const add = t => { const n = normalizeSearchText(t || ''); if (n) variants.add(n); };
    add(anime.title);
    add(getEnglishTitle(anime));
    (anime.titles || []).forEach(t => { if (t && t.title) add(t.title); });
    return variants;
}

// AniPace history is the app's per-title episode record: how
// many episodes were logged under this title (matched
// against every title variant, normalized like the app's own
// search), and when the most recent log happened.
function upnextHistoryStats(anime) {
    const variants = upnextTitleVariants(anime);
    let episodes = 0;
    let lastTs = 0;
    try {
        const history = (typeof anipaceData !== 'undefined' && anipaceData && Array.isArray(anipaceData.history)) ? anipaceData.history : [];
        history.forEach(h => {
            if (!h || !h.animeName) return;
            if (!variants.has(normalizeSearchText(h.animeName))) return;
            episodes += (parseInt(h.episodes, 10) || 0);
            const ts = h.timestamp ? new Date(h.timestamp).getTime() : 0;
            if (!isNaN(ts) && ts > lastTs) lastTs = ts;
        });
    } catch (e) { /* unreadable history reads as no logs */ }
    return { episodes: episodes, lastTs: lastTs };
}

// Per-title watched count: AniPace history summed over
// every title variant, raised to any stored
// watched_episodes found on the title's own copies.
function epgridWatchedCount(anime) {
    let watched = 0;
    try {
        watched = upnextHistoryStats(anime).episodes;
        upnextAllCopies(anime).forEach(copy => {
            const w = parseInt(copy.watched_episodes, 10);
            if (!isNaN(w) && w > watched) watched = w;
        });
    } catch (e) { /* unreadable progress reads as zero */ }
    return watched;
}

// Logs `count` episodes of the title through the AniPace
// quick-log form — the canonical submit, so XP / challenge /
// streak / achievements / sync all update identically. The
// duration box is cleared first so the default per-episode
// length applies. This function writes no data itself; the
// form's own handler does everything.
function epgridLogEpisodes(anime, count) {
    const form = document.getElementById('anipace-log-form');
    const nameInput = document.getElementById('anipace-anime-name-input');
    const countInput = document.getElementById('anipace-episode-count-input');
    const durationInput = document.getElementById('anipace-episode-duration-input');
    if (!form || !nameInput || !countInput || !(count > 0)) return false;
    nameInput.value = getEnglishTitle(anime);
    countInput.value = String(count);
    if (durationInput) durationInput.value = '';
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
}

function epgridRender(animeId, animeSource) {
    const anime = (typeof resolveAnimeForDetails === 'function') ? resolveAnimeForDetails(animeId, animeSource) : null;
    if (!anime) return;
    const linksContainer = document.getElementById(`streaming-links-${animeId}`);
    const charsContainer = document.getElementById(`characters-${animeId}`);
    const anchor = linksContainer || charsContainer;
    if (!anchor || !anchor.parentElement) return;
    const parent = anchor.parentElement;
    let block = parent.querySelector('.epgrid-block');
    // Total episodes come from the resolved object itself:
    // AniList-era entries carry it, manual entries carry the
    // count typed at creation. Unknown total renders nothing.
    const total = epgridSanitizeTotal(anime.episodes);
    if (!total) { if (block) block.remove(); return; }

    const released = epgridReleasedCount(total, anime.nextAiringEpisode ? anime.nextAiringEpisode.episode : null);
    const watched = epgridClampWatched(epgridWatchedCount(anime), total);

    if (!block) {
        block = document.createElement('div');
        block.className = 'epgrid-block';
        // Directly above the streaming links, where every
        // other details enrichment block anchors.
        parent.insertBefore(block, anchor);
    }

    // The chunk window lives on the element so it survives
    // the re-render after every log; it always covers
    // progress plus the next unwatched cell.
    let shown = parseInt(block.dataset.epgridShown, 10);
    if (isNaN(shown) || shown <= 0) shown = epgridInitialShown(total, watched);
    shown = Math.min(total, Math.max(shown, epgridInitialShown(total, watched)));
    block.dataset.epgridShown = String(shown);

    let cells = '';
    for (let n = 1; n <= shown; n++) {
        const st = epgridCellState(n, watched, released);
        const tip = st === 'watched' ? 'Already logged'
            : st === 'locked' ? 'Not out yet'
            : `Log up to episode ${n}`;
        cells += `<button type="button" class="epgrid-cell epgrid-cell-${st}" data-epgrid-n="${n}" title="${tip}">${n}</button>`;
    }
    const remaining = total - shown;
    const progressText = released < total
        ? `${watched}/${total} watched · ${released} out so far`
        : `${watched}/${total} watched`;
    const hint = watched >= total
        ? 'All episodes logged 🎉'
        : watched >= released
            ? 'All released episodes logged 🎉'
            : `Tap a number to log up to it — next is Ep ${watched + 1}`;
    block.innerHTML = `
        <div class="epgrid-head"><strong>📺 Episodes</strong><span class="epgrid-progress">${progressText}</span></div>
        <div class="epgrid-hint">${hint}</div>
        <div class="epgrid-grid">${cells}</div>
        ${remaining > 0 ? `<button type="button" class="epgrid-more-btn">Show more (${remaining} more)</button>` : ''}`;

    block.querySelectorAll('.epgrid-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            if (block.dataset.epgridBusy === '1') return;
            const n = parseInt(cell.dataset.epgridN, 10);
            // Recompute against the freshest state at tap time.
            const fresh = (typeof resolveAnimeForDetails === 'function') ? resolveAnimeForDetails(animeId, animeSource) : anime;
            if (!fresh) return;
            const wNow = epgridClampWatched(epgridWatchedCount(fresh), total);
            const rNow = epgridReleasedCount(total, fresh.nextAiringEpisode ? fresh.nextAiringEpisode.episode : null);
            const delta = epgridDelta(n, wNow, rNow);
            if (delta <= 0) return; // watched or not out yet — advance only, never un-log
            block.dataset.epgridBusy = '1';
            if (!epgridLogEpisodes(fresh, delta)) { delete block.dataset.epgridBusy; return; }
            // The canonical handler takes effect synchronously;
            // re-render on the next tick so the new count shows.
            setTimeout(() => {
                try { epgridRender(animeId, animeSource); } catch (e) { /* silent */ }
                delete block.dataset.epgridBusy;
            }, 0);
        });
    });
    const moreBtn = block.querySelector('.epgrid-more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            block.dataset.epgridShown = String(epgridMoreShown(total, parseInt(block.dataset.epgridShown, 10) || shown));
            try { epgridRender(animeId, animeSource); } catch (e) { /* silent */ }
        });
    }
}

// Hook the details lazy-loader additively, chaining after
// the original loader and the themes wrapper: the grid
// lands in the same panel, above the streaming links.
if (typeof window.lazyLoadDetails === 'function') {
    const epgridPrevLazyLoadDetails = window.lazyLoadDetails;
    window.lazyLoadDetails = function(animeId, animeSource) {
        const result = epgridPrevLazyLoadDetails.apply(this, arguments);
        try { epgridRender(animeId, animeSource); } catch (e) { /* never break details */ }
        return result;
    };
}
// End EPISODE GRID

// ============================================================
// ID REPAIR TOOL (Settings → "🔧 Fix Old Shows for Songs &
// Extras") — ported into the OG app from the design-v2 build
// (user-requested 2026-11-15). Legacy entries added in the
// Kitsu era carry a Kitsu id in mal_id, so AniList-powered
// extras (theme songs, and anything else that resolves an
// AniList id via themesAniListId above) skip them. Kitsu's
// own API publishes the translation: GET
// /anime/{kitsuId}/mappings returns JSON:API data[] whose
// attributes include externalSite "anilist/anime" with the
// AniList id in externalId (verified live from the build
// sandbox: Kitsu 7442 → AniList 16498, over both kitsu.app
// and kitsu.io). For each candidate this tool stores that
// id as a NEW field, anilist_id, on every stored copy of
// the entry — mirroring setUserScoreEverywhere's walk over
// challenge days + backlog. mal_id, source and every other
// existing field are never touched, and the only save is
// the app's own saveData(). The run is resumable: entries
// that already have anilist_id are skipped, so re-tapping
// the button continues where the last run stopped. Manual
// entries (mal_id null) have no id to translate and are
// always skipped.
// ============================================================
const IDREPAIR_KITSU_BASES = ['https://kitsu.app/api/edge', 'https://kitsu.io/api/edge'];
const IDREPAIR_DELAY_MS = 350;
let idRepairRunning = false;

// Pure parser (unit-tested in node): pull the AniList id
// out of a Kitsu JSON:API mappings response, or null when
// Kitsu has no AniList mapping for the title. Kitsu spells
// the site "anilist/anime"; bare "anilist" is accepted too.
function idRepairParseMappings(json) {
    const list = (json && Array.isArray(json.data)) ? json.data : [];
    for (const item of list) {
        const attrs = (item && item.attributes) || {};
        if (attrs.externalSite === 'anilist/anime' || attrs.externalSite === 'anilist') {
            const id = parseInt(attrs.externalId, 10);
            return (id && !isNaN(id)) ? id : null;
        }
    }
    return null;
}

// One mappings lookup, trying kitsu.app first and the
// kitsu.io domain as fallback. A parsed answer (including
// "no AniList mapping") is final; only transport/HTTP
// failures fall through, and if every base fails the lookup
// throws so the run counts it as failed and a later tap can
// retry it.
async function idRepairFetchAniListId(kitsuId) {
    for (const base of IDREPAIR_KITSU_BASES) {
        try {
            const res = await fetch(`${base}/anime/${kitsuId}/mappings`, { headers: { 'Accept': 'application/vnd.api+json' } });
            if (!res || !res.ok) continue;
            const json = await res.json();
            return idRepairParseMappings(json);
        } catch (e) { /* fall through to the next base */ }
    }
    throw new Error('Kitsu mappings unreachable');
}

// Unique legacy shows still missing an AniList id, keyed by
// their Kitsu mal_id. Scanned from the raw stored copies
// (challenge days + backlog), not the deduped unique view,
// so a show stays a candidate until all its copies are
// fixed.
function idRepairCollectCandidates() {
    const byKitsuId = new Map();
    const visit = (item) => {
        if (!item || item.isManual) return;
        if ((item.source || 'kitsu') === 'anilist') return;
        const kitsuId = parseInt(item.mal_id, 10);
        if (!kitsuId || isNaN(kitsuId)) return;
        if (themesAniListId(item)) return; // already repaired
        if (!byKitsuId.has(kitsuId)) byKitsuId.set(kitsuId, item.title || 'Unknown title');
    };
    Object.values(challengeData.days || {}).forEach(day => (day.watched || []).forEach(visit));
    (challengeData.backlog || []).forEach(visit);
    return Array.from(byKitsuId.entries()).map(([kitsuId, title]) => ({ kitsuId: kitsuId, title: title }));
}

// Distinct legacy shows that already carry an anilist_id
// (repaired by an earlier run) — for the summary line.
function idRepairCountAlreadyRepaired() {
    const seen = new Set();
    const visit = (item) => {
        if (!item || item.isManual) return;
        if ((item.source || 'kitsu') === 'anilist') return;
        const kitsuId = parseInt(item.mal_id, 10);
        if (!kitsuId || isNaN(kitsuId)) return;
        const repaired = parseInt(item.anilist_id, 10);
        if (repaired && !isNaN(repaired)) seen.add(kitsuId);
    };
    Object.values(challengeData.days || {}).forEach(day => (day.watched || []).forEach(visit));
    (challengeData.backlog || []).forEach(visit);
    return seen.size;
}

// Mirrors setUserScoreEverywhere: same key (mal_id for
// non-manual entries), same walk over every stored copy.
// The only write is the NEW anilist_id field, and only on
// non-AniList copies of the legacy entry.
function idRepairApplyToAllCopies(kitsuId, anilistId) {
    const matches = item => !!item && !item.isManual
        && (item.source || 'kitsu') !== 'anilist'
        && parseInt(item.mal_id, 10) === kitsuId;
    let touched = 0;
    Object.values(challengeData.days || {}).forEach(day => {
        (day.watched || []).forEach(item => { if (matches(item)) { item.anilist_id = anilistId; touched++; } });
    });
    (challengeData.backlog || []).forEach(item => { if (matches(item)) { item.anilist_id = anilistId; touched++; } });
    return touched;
}

async function idRepairRun(btn) {
    if (idRepairRunning) return;
    const candidates = idRepairCollectCandidates();
    if (candidates.length === 0) {
        showNotification('All your old shows already have their online ids — nothing to fix.');
        return;
    }
    const ok = confirm(`Fix ${candidates.length} old show${candidates.length === 1 ? '' : 's'}?\n\nEach show added a while ago is looked up in the official id mappings, and its current online id is added — nothing you already have is changed. This unlocks theme songs and other extras for them.\n\nIt runs one show at a time and is safe to interrupt: tap the button again later to continue where it left off.`);
    if (!ok) return;
    idRepairRunning = true;
    const originalText = btn ? btn.textContent : '';
    if (btn) btn.disabled = true;
    let fixed = 0;
    let noMatch = 0;
    let failed = 0;
    try {
        for (let i = 0; i < candidates.length; i++) {
            if (btn) btn.textContent = `Fixing ${i + 1}/${candidates.length}…`;
            try {
                const anilistId = await idRepairFetchAniListId(candidates[i].kitsuId);
                if (anilistId) {
                    idRepairApplyToAllCopies(candidates[i].kitsuId, anilistId);
                    fixed++;
                } else {
                    noMatch++;
                }
            } catch (e) {
                failed++; // never fatal: count it and keep going
            }
            if (i < candidates.length - 1) await new Promise(resolve => setTimeout(resolve, IDREPAIR_DELAY_MS));
        }
        if (fixed > 0) saveData();
        const alreadyFine = idRepairCountAlreadyRepaired() - fixed;
        const parts = [`Fixed ${fixed} show${fixed === 1 ? '' : 's'}`];
        if (alreadyFine > 0) parts.push(`${alreadyFine} already fine`);
        if (noMatch > 0) parts.push(`${noMatch} had no online match`);
        if (failed > 0) parts.push(`${failed} failed — tap again to retry the rest`);
        showNotification(parts.join(' · '), failed > 0 ? 'error' : 'success');
    } finally {
        idRepairRunning = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// Wire the Settings button (guarded, like the other
// additive blocks, in case the markup is ever absent).
(function idRepairInit() {
    const btn = document.getElementById('id-repair-btn');
    if (btn) btn.addEventListener('click', () => { idRepairRun(btn); });
})();
// End ID REPAIR TOOL

// ============================================================
// FULL ANIME PAGE — clicking any anime (Backlog, watched/day
// lists, Discover, search results) now opens a dedicated
// full-screen page for that title instead of the small inline
// Read Story pop-up (user-confirmed 2026-11-15). The old
// toggleSynopsis machinery stays intact underneath; only the
// user-facing buttons were re-routed (openAnimePage /
// openAnimePageEntry). The page is a sixth app screen in
// index.html (#anime-page-screen), shown/hidden with the same
// hidden-class mechanism switchToScreen uses, with a Back
// button returning to the screen the user came from.
//
// SECTIONS: header (banner + poster + titles), the user's own
// score/progress line, Story, Details grid, Genres & Tags
// chips, 📊 score distribution, 🎭 characters & voice actors,
// then the existing lazyLoadDetails chain panel (🎵 Theme
// Songs + 📺 Episode Grid + streaming links — those blocks
// anchor on the page's own streaming-links container), 🔗
// franchise chain + recommendations, and 📝 private notes.
//
// API DISCIPLINE: ONE combined AniList Media query per page
// open carries the page's own fields; score distribution /
// cast / recommendations keep their proven separate CACHED
// calls (7d / 30d / 7d); everything is lazy — nothing fetches
// until the page opens — and entries with no AniList id
// (manual, unrepaired legacy) open with local data only and
// fire zero API requests. Styling: OG palette only (styles.css
// "FULL ANIME PAGE" section).
// ============================================================

// The one shared AniList-id resolution ladder, used by the
// theme songs block above and by every page section below:
// (a) AniList-sourced entries carry the id in mal_id;
// (b) legacy Kitsu-era entries repaired by the Settings "Fix
// Old Shows" tool carry it in the anilist_id field;
// (c) anything else (unrepaired legacy, manual) has no
// AniList id — a foreign id is never sent to AniList.
function animePageAniListId(anime) {
    if (!anime) return null;
    if ((anime.source || '') === 'anilist') {
        const n = parseInt(anime.mal_id, 10);
        return (!isNaN(n) && n > 0) ? n : null;
    }
    const repaired = parseInt(anime.anilist_id, 10);
    return (!isNaN(repaired) && repaired > 0) ? repaired : null;
}

// ---------- 📊 SCORE DISTRIBUTION (ported) ----------
// AniList community score histogram for the page. Logic and
// cache are the proven Read Story port: Media.stats
// .scoreDistribution buckets (score 10..100), results —
// including empty ones — cached 7 days in
// aniclipse_stats_cache_v1; errors never cached, fully silent.

const SCOREDIST_CACHE_KEY = 'aniclipse_stats_cache_v1';
const SCOREDIST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCOREDIST_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        id
        averageScore
        stats {
            scoreDistribution { score amount }
        }
    }
}`;

const scoredistInFlight = new Set();

function scoredistLoadCache() {
    try {
        const raw = localStorage.getItem(SCOREDIST_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function scoredistSaveCache(cache) {
    try {
        localStorage.setItem(SCOREDIST_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable — the feature degrades silently */ }
}

// Average on AniList's 0–100 scale: the fetched value first,
// then the normalized object's own fields (averageRating is
// the 0–100 value as a string; score is the same on 0–10).
function scoredistAvgFor(anime, fetchedAvg) {
    if (typeof fetchedAvg === 'number' && !isNaN(fetchedAvg) && fetchedAvg > 0) return Math.round(fetchedAvg);
    if (anime) {
        const ar = parseFloat(anime.averageRating);
        if (!isNaN(ar) && ar > 0) return Math.round(ar);
        if (typeof anime.score === 'number' && anime.score > 0) return Math.round(anime.score * 10);
    }
    return null;
}

function animePageRenderScoreDist(anime, avg, dist) {
    const container = document.getElementById('anime-page-scoredist');
    if (!container) return;
    const buckets = [];
    let maxAmount = 0;
    let totalVotes = 0;
    for (let s = 10; s <= 100; s += 10) {
        const found = (dist || []).find(d => d && d.s === s);
        const amount = found ? (parseInt(found.a, 10) || 0) : 0;
        buckets.push({ score: s, amount: amount });
        if (amount > maxAmount) maxAmount = amount;
        totalVotes += amount;
    }
    if (totalVotes <= 0 || maxAmount <= 0) {
        container.innerHTML = '';
        return;
    }
    const avgText = (avg !== null && avg !== undefined) ? `<span class="scoredist-avg">Avg ${avg}</span>` : '';
    const bars = buckets.map(b => {
        const pct = Math.max(3, Math.round((b.amount / maxAmount) * 100));
        return `<div class="scoredist-bar" style="height: ${pct}%" title="Score ${b.score / 10}: ${b.amount} votes"></div>`;
    }).join('');
    const labels = buckets.map(b => `<span>${b.score / 10}</span>`).join('');
    container.innerHTML = `
    <div class="scoredist-block">
        <div class="scoredist-head"><strong>📊 Community scores</strong>${avgText}</div>
        <div class="scoredist-bars">${bars}</div>
        <div class="scoredist-labels">${labels}</div>
    </div>`;
}

function animePageLoadScoreDist(anime, idNum, token) {
    const cache = scoredistLoadCache();
    const hit = cache[String(idNum)];
    if (hit && (Date.now() - (hit.t || 0)) < SCOREDIST_CACHE_TTL_MS) {
        animePageRenderScoreDist(anime, scoredistAvgFor(anime, hit.avg), hit.dist);
        return;
    }
    if (scoredistInFlight.has(idNum)) return;
    scoredistInFlight.add(idNum);
    anilistGraphQL(SCOREDIST_QUERY, { id: idNum })
        .then(data => {
            const media = (data && data.Media) ? data.Media : null;
            const rawDist = (media && media.stats && Array.isArray(media.stats.scoreDistribution)) ? media.stats.scoreDistribution : null;
            // Cache the result — including "no distribution" —
            // so each title is asked about at most once a week.
            const dist = rawDist ? rawDist.map(d => ({ s: d.score, a: d.amount })) : null;
            const avg = (media && typeof media.averageScore === 'number') ? media.averageScore : null;
            const store = scoredistLoadCache();
            store[String(idNum)] = { t: Date.now(), avg: avg, dist: dist };
            scoredistSaveCache(store);
            if (token === animePageToken) animePageRenderScoreDist(anime, scoredistAvgFor(anime, avg), dist);
        })
        .catch(() => { /* silent: offline / rate limited — no block is better than an error */ })
        .finally(() => { scoredistInFlight.delete(idNum); });
}

// ---------- 🎭 CHARACTERS & VOICE ACTORS (ported) ----------
// Top-12 characters with their Japanese voice actors, from
// AniList. One GraphQL call per title through the app's own
// anilistGraphQL(); results — including empty ones — are
// cached 30 days in aniclipse_characters_cache_v1; errors are
// never cached and stay fully silent.

const CAST_CACHE_KEY = 'aniclipse_characters_cache_v1';
const CAST_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CAST_LIMIT = 12;

const CAST_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 12) {
            edges {
                role
                node { id name { full } image { medium } }
                voiceActors(language: JAPANESE, sort: [RELEVANCE]) { id name { full } image { medium } }
            }
        }
    }
}`;

const castInFlight = new Set();

function castLoadCache() {
    try {
        const raw = localStorage.getItem(CAST_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function castSaveCache(cache) {
    try {
        localStorage.setItem(CAST_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable — the feature degrades silently */ }
}

// Chip bucket for an AniList CharacterRole: MAIN gets the
// gradient chip; SUPPORTING and BACKGROUND share the glass
// "Supporting" chip.
function castRoleBucket(role) {
    return role === 'MAIN' ? 'MAIN' : 'SUPPORTING';
}

// Flatten an AniList Media.characters response into
// render-ready rows, capped at CAST_LIMIT. Defensive: any
// malformed level degrades to fewer/simpler rows, never a
// throw. The first listed Japanese VA is the credited voice.
function castProcessResponse(data) {
    const media = (data && typeof data === 'object') ? data.Media : null;
    const edges = (media && media.characters && Array.isArray(media.characters.edges)) ? media.characters.edges : [];
    const out = [];
    edges.forEach(edge => {
        if (!edge || !edge.node) return;
        const node = edge.node;
        const name = (node.name && typeof node.name.full === 'string' && node.name.full.trim()) ? node.name.full.trim() : '';
        if (!name) return;
        const vas = Array.isArray(edge.voiceActors) ? edge.voiceActors : [];
        const va = vas.find(v => v && v.name && typeof v.name.full === 'string' && v.name.full.trim()) || null;
        out.push({
            name: name,
            img: (node.image && typeof node.image.medium === 'string') ? node.image.medium : '',
            role: castRoleBucket(edge.role),
            vaName: va ? va.name.full.trim() : '',
            vaImg: (va && va.image && typeof va.image.medium === 'string') ? va.image.medium : ''
        });
    });
    return out.slice(0, CAST_LIMIT);
}

function animePageRenderCast(chars) {
    const container = document.getElementById('anime-page-cast');
    if (!container) return;
    if (!chars || !chars.length) {
        container.innerHTML = '';
        return;
    }
    const cards = chars.map(c => {
        const chipClass = c.role === 'MAIN' ? 'cast-chip cast-chip-main' : 'cast-chip';
        const chipLabel = c.role === 'MAIN' ? 'Main' : 'Supporting';
        const vaLine = c.vaName ? `
            <div class="cast-va">
                <img class="cast-va-img" src="${themesEscapeHtml(c.vaImg || 'https://via.placeholder.com/28x28?text=CV')}" alt="" loading="lazy">
                <span class="cast-va-name"><span class="cast-va-label">CV</span> ${themesEscapeHtml(c.vaName)}</span>
            </div>` : '';
        return `
        <div class="cast-card">
            <img class="cast-img" src="${themesEscapeHtml(c.img || 'https://via.placeholder.com/92x112?text=No+Image')}" alt="${themesEscapeHtml(c.name)}" loading="lazy">
            <div class="cast-name" title="${themesEscapeHtml(c.name)}">${themesEscapeHtml(c.name)}</div>
            <span class="${chipClass}">${chipLabel}</span>
            ${vaLine}
        </div>`;
    }).join('');
    container.innerHTML = `
    <div class="cast-block">
        <div class="cast-head"><strong>🎭 Characters & Voice Actors</strong></div>
        <div class="cast-scroll">${cards}</div>
    </div>`;
}

function animePageLoadCast(anime, idNum, token) {
    const cache = castLoadCache();
    const hit = cache[String(idNum)];
    if (hit && (Date.now() - (hit.t || 0)) < CAST_CACHE_TTL_MS) {
        animePageRenderCast(hit.chars);
        return;
    }
    if (castInFlight.has(idNum)) return;
    castInFlight.add(idNum);
    anilistGraphQL(CAST_QUERY, { id: idNum })
        .then(data => {
            const chars = castProcessResponse(data);
            // Cache the result — including "no cast listed" —
            // so each title is asked about at most once a month.
            const store = castLoadCache();
            store[String(idNum)] = { t: Date.now(), chars: chars };
            castSaveCache(store);
            if (token === animePageToken) animePageRenderCast(chars);
        })
        .catch(() => { /* silent: offline / rate limited — errors are never cached */ })
        .finally(() => { castInFlight.delete(idNum); });
}

// ---------- 🔗 STORY SO FAR + ✨ BECAUSE YOU WATCHED (ported) ----------
// Franchise chain ("🔗 The Story So Far") + recommendations
// rail ("✨ Because you watched …") for the page. ONE combined
// AniList query per title carries both connections; results
// (including empty ones) are cached for 7 days in
// aniclipse_recs_cache_v1; network errors are never cached and
// stay fully silent. The "+ Add" buttons run the app's
// canonical Discover add (duplicate guard, rating prompt,
// backlog push, saveData / updateAllDisplays /
// processAchievements, same notification).

const RECS_CACHE_KEY = 'aniclipse_recs_cache_v1';
const RECS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// AniList schema: Media.recommendations is a
// RecommendationConnection; each edge's node is a
// Recommendation whose `rating` is the community score for
// that pairing and whose `mediaRecommendation` is the
// suggested Media. Media.relations is a MediaConnection whose
// edges carry `relationType` + `node`. Both media selections
// reuse ANILIST_MEDIA_FIELDS so normalizeAniListResponse
// rebuilds the exact object shape Discover adds.
const RECS_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        id
        recommendations(page: 1, perPage: 25) {
            edges {
                node {
                    rating
                    mediaRecommendation {
                        ${ANILIST_MEDIA_FIELDS}
                    }
                }
            }
        }
        relations {
            edges {
                relationType
                node {
                    ${ANILIST_MEDIA_FIELDS}
                }
            }
        }
    }
}`;

// Used only when an "+ Add" is clicked on a card that was
// rendered from the cache in a later session (the full
// normalized object is no longer in memory).
const RECS_SINGLE_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        ${ANILIST_MEDIA_FIELDS}
    }
}`;

// Relation types worth showing; CHARACTER / OTHER / SOURCE /
// ADAPTATION / CONTAINS / COMPILATION are noise for a viewer.
const RECS_KEEP_RELATIONS = ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'ALTERNATIVE', 'SPIN_OFF', 'SUMMARY'];
const RECS_RELATION_LABELS = {
    PREQUEL: 'Prequel',
    SEQUEL: 'Sequel',
    PARENT: 'Parent story',
    SIDE_STORY: 'Side story',
    ALTERNATIVE: 'Alternative',
    SPIN_OFF: 'Spin-off',
    SUMMARY: 'Summary'
};
// Order for the relations that sit outside the main
// prequel → sequel line.
const RECS_OTHER_ORDER = ['PARENT', 'SIDE_STORY', 'ALTERNATIVE', 'SPIN_OFF', 'SUMMARY'];

const recsInFlight = new Set();
// Full normalized media objects behind the rendered cards,
// keyed by AniList id, so an "+ Add" click reuses the exact
// object (and object shape) a Discover add would use.
const recsMediaById = new Map();

function recsLoadCache() {
    try {
        const raw = localStorage.getItem(RECS_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function recsSaveCache(cache) {
    try {
        localStorage.setItem(RECS_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable — the feature degrades silently */ }
}

// Genre names of a normalized/stored anime, tolerant of both
// [{ name }] objects and plain strings.
function recsGenreNames(anime) {
    return ((anime && anime.genres) || [])
        .map(g => (typeof g === 'string' ? g : (g && g.name)))
        .filter(Boolean);
}

// The reason a title is recommended: shared genres with the
// source title first (its two strongest overlaps), then the
// shared format, then the generic fan line.
function recsReasonFor(sourceAnime, recAnime) {
    const sourceGenres = recsGenreNames(sourceAnime);
    const recGenres = recsGenreNames(recAnime);
    const shared = sourceGenres.filter(name => recGenres.indexOf(name) !== -1);
    if (shared.length >= 2) return `${shared[0]} · ${shared[1]} in common`;
    if (shared.length === 1) return `${shared[0]} in common`;
    if (sourceAnime && recAnime && sourceAnime.type && sourceAnime.type === recAnime.type) {
        const label = { TV: 'TV series', Movie: 'movie', OVA: 'OVA', ONA: 'ONA', Special: 'special', Music: 'music video' }[recAnime.type] || 'series';
        return `Another ${label} to try`;
    }
    return 'Loved by fans of this show';
}

// AniList ids (as strings) of everything in the user's
// library with a known AniList id — drives the
// "✓ In your library" state.
function recsLibraryIdSet() {
    const set = new Set();
    try {
        getUniqueAnime().forEach(item => {
            const id = animePageAniListId(item);
            if (id) set.add(String(id));
        });
    } catch (e) { /* library unavailable — everything just shows "+ Add" */ }
    return set;
}

function recsNormalizeOne(media) {
    if (!media) return null;
    try {
        const normalized = normalizeAniListResponse({ media: [media] });
        return (normalized && normalized[0]) || null;
    } catch (e) {
        return null;
    }
}

function recsTrimRec(normalized, rating, reason) {
    return {
        id: normalized.mal_id,
        rating: (typeof rating === 'number' && !isNaN(rating)) ? rating : 0,
        title: getEnglishTitle(normalized),
        img: (normalized.images && normalized.images.jpg && (normalized.images.jpg.small_image_url || normalized.images.jpg.image_url)) || '',
        avg: (normalized.averageRating !== null && normalized.averageRating !== undefined && normalized.averageRating !== '')
            ? Math.round(parseFloat(normalized.averageRating)) : null,
        reason: reason
    };
}

function recsTrimChainItem(normalized, relationType) {
    return {
        id: normalized.mal_id,
        rel: relationType,
        title: getEnglishTitle(normalized),
        img: (normalized.images && normalized.images.jpg && (normalized.images.jpg.small_image_url || normalized.images.jpg.image_url)) || '',
        type: normalized.type || '',
        year: normalized.year || null,
        eps: (typeof normalized.episodes === 'number' && normalized.episodes > 0) ? normalized.episodes : null,
        status: normalized.airingStatus || 'unknown'
    };
}

// Turns the combined query response into the trimmed records
// the cache stores, registering every full normalized object
// in recsMediaById along the way. Adult titles are dropped,
// matching Discover's isAdult: false filter.
function recsProcessMedia(media, sourceAnime, sourceId) {
    const recEdges = (media && media.recommendations && media.recommendations.edges) || [];
    const bestById = new Map();
    recEdges.forEach(edge => {
        const node = edge && edge.node;
        const raw = node && node.mediaRecommendation;
        if (!raw || !raw.id || raw.id === sourceId || raw.isAdult) return;
        const prev = bestById.get(raw.id);
        if (!prev || (node.rating || 0) > (prev.rating || 0)) {
            bestById.set(raw.id, { raw: raw, rating: node.rating || 0 });
        }
    });
    const recs = Array.from(bestById.values())
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 12)
        .map(entry => {
            const normalized = recsNormalizeOne(entry.raw);
            if (!normalized) return null;
            recsMediaById.set(normalized.mal_id, normalized);
            return recsTrimRec(normalized, entry.rating, recsReasonFor(sourceAnime, normalized));
        })
        .filter(Boolean);

    const relEdges = (media && media.relations && media.relations.edges) || [];
    const chainById = new Map();
    relEdges.forEach(edge => {
        const raw = edge && edge.node;
        const rel = edge && edge.relationType;
        if (!raw || !raw.id || raw.id === sourceId || raw.isAdult) return;
        if (RECS_KEEP_RELATIONS.indexOf(rel) === -1) return;
        const prev = chainById.get(raw.id);
        if (prev && RECS_KEEP_RELATIONS.indexOf(prev.rel) <= RECS_KEEP_RELATIONS.indexOf(rel)) return;
        chainById.set(raw.id, { raw: raw, rel: rel });
    });
    const byYearAsc = (a, b) => ((a.year || 9999) - (b.year || 9999)) || a.title.localeCompare(b.title);
    const chainItems = Array.from(chainById.values())
        .map(entry => {
            const normalized = recsNormalizeOne(entry.raw);
            if (!normalized) return null;
            recsMediaById.set(normalized.mal_id, normalized);
            return recsTrimChainItem(normalized, entry.rel);
        })
        .filter(Boolean);
    const prequels = chainItems.filter(i => i.rel === 'PREQUEL').sort(byYearAsc);
    const sequels = chainItems.filter(i => i.rel === 'SEQUEL').sort(byYearAsc);
    const others = chainItems
        .filter(i => RECS_OTHER_ORDER.indexOf(i.rel) !== -1)
        .sort((a, b) => (RECS_OTHER_ORDER.indexOf(a.rel) - RECS_OTHER_ORDER.indexOf(b.rel)) || byYearAsc(a, b));

    return { recs: recs, chain: prequels.concat(sequels, others), mainCount: prequels.length + sequels.length };
}

function recsCardButtonHtml(item, ownedSet) {
    if (ownedSet.has(String(item.id))) {
        return `<button class="recs-owned-btn" disabled>✓ In your library</button>`;
    }
    return `<button class="recs-add-btn" data-media-id="${item.id}">+ Add</button>`;
}

function animePageRenderRecs(sourceAnime, data) {
    const container = document.getElementById('anime-page-recs');
    if (!container) return;
    const recs = (data && data.recs) || [];
    const chain = (data && data.chain) || [];
    if (recs.length === 0 && chain.length === 0) {
        container.innerHTML = '';
        return;
    }
    const ownedSet = recsLibraryIdSet();
    const sourceTitle = getEnglishTitle(sourceAnime);
    let html = '';

    if (recs.length > 0) {
        const cards = recs.map(item => `
            <div class="recs-card">
                <img class="recs-card-img" src="${escapeHTML(item.img || 'https://via.placeholder.com/92x128?text=No+Image')}" alt="Poster" loading="lazy">
                <div class="recs-card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</div>
                <div class="recs-card-score">${item.avg !== null && item.avg !== undefined ? `⭐ ${item.avg}%` : '⭐ N/A'}</div>
                <div class="recs-card-reason">${escapeHTML(item.reason || 'Loved by fans of this show')}</div>
                ${recsCardButtonHtml(item, ownedSet)}
            </div>`).join('');
        html += `
            <div class="recs-head"><strong>✨ Because you watched ${escapeHTML(sourceTitle)}</strong></div>
            <div class="recs-rail">${cards}</div>`;
    }

    if (chain.length > 0) {
        const currentItem = {
            id: animePageAniListId(sourceAnime),
            rel: 'CURRENT',
            title: sourceTitle,
            img: (sourceAnime.images && sourceAnime.images.jpg && (sourceAnime.images.jpg.small_image_url || sourceAnime.images.jpg.image_url)) || '',
            type: sourceAnime.type || '',
            year: sourceAnime.year || null,
            eps: (typeof sourceAnime.episodes === 'number' && sourceAnime.episodes > 0) ? sourceAnime.episodes : null
        };
        const mainCount = (data && typeof data.mainCount === 'number') ? data.mainCount : 0;
        const prequels = chain.filter(i => i.rel === 'PREQUEL');
        const sequels = chain.filter(i => i.rel === 'SEQUEL');
        const others = chain.filter(i => RECS_OTHER_ORDER.indexOf(i.rel) !== -1);
        const sequence = prequels.concat([currentItem], sequels);
        const itemHtml = (item) => {
            const isCurrent = item.rel === 'CURRENT';
            const label = isCurrent ? 'You are here' : (RECS_RELATION_LABELS[item.rel] || item.rel);
            const meta = [item.year, item.type, item.eps ? `${item.eps} eps` : ''].filter(Boolean).join(' · ');
            return `
            <div class="recs-chain-item${isCurrent ? ' recs-chain-current' : ''}">
                <div class="recs-chain-label${isCurrent ? ' recs-chain-label-current' : ''}">${label}</div>
                <img class="recs-card-img" src="${escapeHTML(item.img || 'https://via.placeholder.com/92x128?text=No+Image')}" alt="Poster" loading="lazy">
                <div class="recs-card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</div>
                <div class="recs-chain-meta">${escapeHTML(meta)}</div>
                ${isCurrent ? '' : recsCardButtonHtml(item, ownedSet)}
            </div>`;
        };
        let strip = '';
        sequence.forEach((item, idx) => {
            if (idx > 0) strip += '<div class="recs-chain-arrow">→</div>';
            strip += itemHtml(item);
        });
        if (others.length > 0) {
            if (mainCount > 0 || sequence.length > 1) strip += '<div class="recs-chain-divider"></div>';
            strip += others.map(itemHtml).join('');
        }
        html += `
            <div class="recs-head"><strong>🔗 The Story So Far</strong></div>
            <div class="recs-chain">${strip}</div>`;
    }

    container.innerHTML = `<div class="recs-block">${html}</div>`;
    container.querySelectorAll('.recs-add-btn').forEach(btn => {
        btn.onclick = () => { recsHandleAdd(parseInt(btn.getAttribute('data-media-id'), 10), btn); };
    });
}

// The "+ Add" click: run the app's canonical Discover add —
// duplicate guard, rating prompt, backlog push, saveData /
// updateAllDisplays / processAchievements, same notification —
// on the normalized object for this title.
function recsHandleAdd(mediaId, btn) {
    const anime = recsMediaById.get(mediaId);
    if (anime) {
        recsAddNormalized(anime);
        return;
    }
    // Rendered from the cache in a later session: fetch the one
    // title, normalize it, then add it the same way.
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    anilistGraphQL(RECS_SINGLE_QUERY, { id: mediaId })
        .then(data => {
            const normalized = recsNormalizeOne(data && data.Media);
            if (!normalized) throw new Error('No media');
            recsMediaById.set(normalized.mal_id, normalized);
            recsAddNormalized(normalized);
        })
        .catch(() => {
            if (btn) { btn.disabled = false; btn.textContent = '+ Add'; }
            showNotification('Failed to add. Check internet connection.', 'error');
        });
}

function recsAddNormalized(anime) {
    const title = getEnglishTitle(anime);
    if (isDuplicateAnime(anime)) {
        showNotification('This anime is already in your backlog or challenge watch list!', 'error');
        recsMarkOwnedEverywhere(anime.mal_id);
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
    recsMarkOwnedEverywhere(anime.mal_id);
}

function recsMarkOwnedEverywhere(mediaId) {
    document.querySelectorAll(`.recs-add-btn[data-media-id="${mediaId}"]`).forEach(btn => {
        btn.disabled = true;
        btn.textContent = '✓ In your library';
        btn.classList.remove('recs-add-btn');
        btn.classList.add('recs-owned-btn');
        btn.onclick = null;
    });
}

function animePageLoadRecs(anime, idNum, token) {
    const cache = recsLoadCache();
    const hit = cache[String(idNum)];
    if (hit && (Date.now() - (hit.t || 0)) < RECS_CACHE_TTL_MS) {
        animePageRenderRecs(anime, { recs: hit.recs, chain: hit.chain, mainCount: hit.mainCount });
        return;
    }
    if (recsInFlight.has(idNum)) return;
    recsInFlight.add(idNum);
    anilistGraphQL(RECS_QUERY, { id: idNum })
        .then(data => {
            const media = (data && data.Media) ? data.Media : null;
            const processed = media ? recsProcessMedia(media, anime, idNum) : { recs: [], chain: [], mainCount: 0 };
            // Cache the result — including "nothing useful" —
            // so each title is asked about at most once a week.
            const store = recsLoadCache();
            store[String(idNum)] = { t: Date.now(), recs: processed.recs, chain: processed.chain, mainCount: processed.mainCount };
            recsSaveCache(store);
            if (token === animePageToken) animePageRenderRecs(anime, processed);
        })
        .catch(() => { /* silent: offline / rate limited — no block is better than an error */ })
        .finally(() => { recsInFlight.delete(idNum); });
}

// ---------- 📝 MY NOTES (ported) ----------
// A private free-text note per anime, written and read on the
// anime page, with a small 📝 chip on backlog cards that carry
// a note.
//
// STORAGE: a new top-level field on challengeData,
// customNotes = { [storeKey]: { key, text, updatedAt } },
// keyed by the app identity rule (upnextEntryKey: manual →
// 'manual:' + lowercased trimmed title, else 'id:' + mal_id)
// — NOT by AniList id, so notes work for every library title:
// AniList-era, repaired, legacy and manual alike. The load
// paths spread-merge challengeData without whitelisting, and
// saves go ONLY through saveData(), so notes sync to the
// cloud and ride along in backups like the other custom
// fields.
//
// FIREBASE KEY SAFETY: saveData() writes via Firebase .set(),
// where object keys become path segments and . $ # [ ] / are
// illegal — a manual entry titled e.g. "Fate/stay night" used
// verbatim as a property name would break the WHOLE cloud
// save. Property names are therefore the entryKey with those
// characters (and % itself) %-escaped (notesStoreKey);
// ordinary keys like "id:16498" pass through unchanged, and
// every record also stores its true key, which lookups verify
// — an escaped-key collision reads as a miss, never as another
// show's note.
//
// PRIVACY: notes live only inside the user's own
// challengeData. syncUserProfileAndLeaderboard() builds its
// profile/leaderboard payloads from explicit field lists
// (each entry mapped to mal_id/title/user_score/type/
// isManual), so a note can never leak onto the public
// surfaces friends see.

// NOTES PURE LOGIC START — plain-data helpers only; this
// section is exercised by the Node harness, so it must stay
// free of DOM / app-state references.
const NOTES_MAX_LEN = 2000;

// Firebase path segments cannot contain . $ # [ ] / — escape
// those (and the escape character % itself) as %XX. Identity
// for every ordinary key.
const NOTES_UNSAFE_KEY_CHARS = /[%.$#\[\]\/]/g;
function notesStoreKey(entryKey) {
    return String(entryKey == null ? '' : entryKey).replace(NOTES_UNSAFE_KEY_CHARS, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

function notesNormalizeText(raw) {
    if (typeof raw !== 'string') return '';
    return raw.length > NOTES_MAX_LEN ? raw.slice(0, NOTES_MAX_LEN) : raw;
}

// One stored record, cleaned. A record whose text is empty
// (or not a string at all) is not a note — it normalizes to
// null and drops out of the map.
function notesNormalizeRecord(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const text = notesNormalizeText(raw.text);
    if (!text.trim()) return null;
    return {
        key: typeof raw.key === 'string' ? raw.key : null,
        text: text,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
    };
}

// Accepts the stored value in any shape it can plausibly
// come back in (object map, Firebase numeric-keyed object,
// array, garbage) and always returns a clean map. Corrupt
// entries are dropped — never a throw.
function notesNormalizeMap(raw) {
    let src = raw;
    if (Array.isArray(src)) {
        const obj = {};
        src.forEach((v, i) => { obj[String(i)] = v; });
        src = obj;
    }
    if (!src || typeof src !== 'object') return {};
    const out = {};
    Object.keys(src).forEach(prop => {
        const rec = notesNormalizeRecord(src[prop]);
        if (!rec) return;
        // A record that knows its true key is filed under that
        // key's canonical property — for well-formed data that
        // IS the property it arrived under, and for odd shapes
        // (e.g. an array, whose records sit under numeric
        // properties) it makes the note findable again.
        out[rec.key ? notesStoreKey(rec.key) : prop] = rec;
    });
    return out;
}

function notesGetRecord(map, entryKey) {
    if (!entryKey) return null;
    const rec = (map || {})[notesStoreKey(entryKey)] || null;
    // Paranoia: if the stored record carries a true key that
    // is not this title's, treat it as a miss (escaped-key
    // collision) rather than showing another show's note.
    if (rec && rec.key && rec.key !== entryKey) return null;
    return rec;
}

// Returns a NEW map with the note for entryKey set — or
// removed, when the trimmed text is empty (an emptied note
// is a deleted note). The input map is never mutated.
function notesUpsert(map, entryKey, text, nowIso) {
    const out = {};
    const src = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
    Object.keys(src).forEach(k => { out[k] = src[k]; });
    if (!entryKey) return out;
    const prop = notesStoreKey(entryKey);
    const clean = (typeof text === 'string' ? text : '').trim();
    if (!clean) {
        delete out[prop];
        return out;
    }
    out[prop] = {
        key: entryKey,
        text: clean.length > NOTES_MAX_LEN ? clean.slice(0, NOTES_MAX_LEN) : clean,
        updatedAt: typeof nowIso === 'string' ? nowIso : null
    };
    return out;
}

// Builds a normalized-title → entryKey index from
// [{ key, titles: [normalizedTitle, ...] }] pairs. A title
// claimed by two DIFFERENT keys is ambiguous: it is removed
// from the index and reported in `ambiguous`, so callers can
// skip it instead of guessing which show a card belongs to.
function notesBuildTitleIndex(pairs) {
    const index = {};
    const ambiguous = {};
    (Array.isArray(pairs) ? pairs : []).forEach(pair => {
        if (!pair || !pair.key || !Array.isArray(pair.titles)) return;
        pair.titles.forEach(t => {
            if (!t || typeof t !== 'string') return;
            if (Object.prototype.hasOwnProperty.call(ambiguous, t)) return;
            if (Object.prototype.hasOwnProperty.call(index, t) && index[t] !== pair.key) {
                delete index[t];
                ambiguous[t] = true;
                return;
            }
            index[t] = pair.key;
        });
    });
    return { index: index, ambiguous: ambiguous };
}

function notesKeyFromTitle(titleIndex, normalizedTitle) {
    if (!titleIndex || !normalizedTitle) return null;
    if (titleIndex.ambiguous && titleIndex.ambiguous[normalizedTitle]) return null;
    return (titleIndex.index && titleIndex.index[normalizedTitle]) || null;
}
// NOTES PURE LOGIC END

function notesLoad() {
    try {
        return notesNormalizeMap(typeof challengeData !== 'undefined' ? challengeData.customNotes : undefined);
    } catch (e) {
        return {};
    }
}

// Saves go ONLY through the app's saveData() (localStorage +
// Firebase), exactly like the other custom fields.
function notesSave(map) {
    try {
        challengeData.customNotes = map;
        if (typeof saveData === 'function') saveData();
    } catch (e) { /* notes are best-effort — never break the app over them */ }
}

function notesHandleSave(entryKey, textarea, btn) {
    const next = notesUpsert(notesLoad(), entryKey, textarea ? textarea.value : '', new Date().toISOString());
    notesSave(next);
    // Keep any visible backlog 📝 chips truthful right away.
    try { notesDecorateBacklog(); } catch (e) { /* silent */ }
    if (btn) {
        if (btn._notesTimer) clearTimeout(btn._notesTimer);
        btn.textContent = 'Saved ✓';
        btn.disabled = true;
        btn._notesTimer = setTimeout(() => {
            btn.textContent = 'Save Note';
            btn.disabled = false;
        }, 1500);
    }
}

// ---------- 📝 BACKLOG CHIP ----------
// Cards carry no data attributes, so a card is matched to
// its entry by the most robust signals the rendered DOM
// offers, in order: (1) the streaming-links container id,
// which is literally `streaming-links-${anime.mal_id}` from
// the same entry object the identity key is built from;
// (2) the card's displayed title, resolved through a
// normalized-title index of the library — a title shared by
// two different entries is ambiguous and its cards are
// skipped rather than guessed. Every step is fail-safe.

// The title index costs a full library walk plus title
// normalization per entry, and the backlog re-renders often
// (every screen switch, search keystroke, sort, rate, remove).
// Memoize it: the index depends only on the library's keys and
// titles, and library contents change exclusively through
// saveData() writes — so a save-stamp plus the stored-entry
// count is a sound cache key. The stamp wrapper delegates
// untouched; it only counts.
let notesTitleIndexCache = null;
let notesTitleIndexCacheKey = null;
let notesSaveStamp = 0;
if (typeof saveData === 'function') {
    const notesPrevSaveData = saveData;
    saveData = function() {
        notesSaveStamp++;
        return notesPrevSaveData.apply(this, arguments);
    };
}
function notesLibraryCount() {
    try {
        let n = 0;
        const days = (typeof challengeData !== 'undefined' && challengeData && challengeData.days) || {};
        Object.keys(days).forEach(k => {
            const d = days[k];
            if (d && Array.isArray(d.watched)) n += d.watched.length;
        });
        if (typeof challengeData !== 'undefined' && challengeData && Array.isArray(challengeData.backlog)) n += challengeData.backlog.length;
        return n;
    } catch (e) {
        return -1;
    }
}

function notesTitleIndex() {
    const cacheKey = notesSaveStamp + ':' + notesLibraryCount();
    if (notesTitleIndexCache && notesTitleIndexCacheKey === cacheKey) return notesTitleIndexCache;
    const pairs = [];
    try {
        getUniqueAnime().forEach(anime => {
            if (!anime) return;
            const key = (typeof upnextEntryKey === 'function') ? upnextEntryKey(anime) : '';
            if (!key) return;
            const titles = [];
            const push = t => {
                const n = (typeof normalizeSearchText === 'function')
                    ? normalizeSearchText(t || '')
                    : String(t || '').toLowerCase().trim();
                if (n && titles.indexOf(n) === -1) titles.push(n);
            };
            if (typeof getEnglishTitle === 'function') push(getEnglishTitle(anime));
            push(anime.title);
            if (titles.length) pairs.push({ key: key, titles: titles });
        });
    } catch (e) { /* an unbuildable index just means title matching is unavailable */ }
    const built = notesBuildTitleIndex(pairs);
    notesTitleIndexCache = built;
    notesTitleIndexCacheKey = cacheKey;
    return built;
}

function notesCardKey(card, titleIndex) {
    const linksEl = card.querySelector('[id^="streaming-links-"]');
    if (linksEl && linksEl.id) {
        const suffix = linksEl.id.slice('streaming-links-'.length);
        if (suffix && suffix !== 'null' && suffix !== 'undefined') return 'id:' + suffix;
    }
    const titleEl = card.querySelector('.backlog-title');
    if (titleEl) {
        const n = (typeof normalizeSearchText === 'function')
            ? normalizeSearchText(titleEl.textContent || '')
            : String(titleEl.textContent || '').toLowerCase().trim();
        return notesKeyFromTitle(titleIndex, n);
    }
    return null;
}

function notesDecorateBacklog() {
    const container = document.getElementById('all-anime-list-container');
    if (!container) return;
    const map = notesLoad();
    if (!Object.keys(map).length) return;
    const titleIndex = notesTitleIndex();
    container.querySelectorAll('.backlog-anime-list-item').forEach(card => {
        try {
            if (card.querySelector('.notes-chip')) return; // idempotent
            const key = notesCardKey(card, titleIndex);
            if (!key) return;
            if (!notesGetRecord(map, key)) return;
            const badges = card.querySelector('.backlog-badges-container');
            if (!badges) return;
            const chip = document.createElement('span');
            chip.className = 'backlog-tag notes-chip';
            chip.textContent = '📝 Note';
            chip.title = 'You have a private note on this show';
            badges.appendChild(chip);
        } catch (e) { /* one bad card must never break the grid */ }
    });
}

// Chain after the backlog renderer: after every grid render,
// cards whose entry has a note get their 📝 chip.
if (typeof window.renderAllAnimeList === 'function') {
    const notesPrevRenderAllAnimeList = window.renderAllAnimeList;
    window.renderAllAnimeList = function() {
        const result = notesPrevRenderAllAnimeList.apply(this, arguments);
        try { notesDecorateBacklog(); } catch (e) { /* chips must never break the grid */ }
        return result;
    };
}
try { notesDecorateBacklog(); } catch (e) { /* backlog may not be rendered yet on some paths */ }

// ---------- THE PAGE ----------

// ONE combined AniList query per page open carries every
// field the page itself renders (header art, story, details
// grid, genres/tags). Relations deliberately stay with the
// cached recommendations query above — fetching them twice
// would waste the user's rate budget.
const ANIME_PAGE_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        bannerImage
        coverImage { extraLarge large medium }
        description
        format
        status
        season
        seasonYear
        episodes
        duration
        source
        averageScore
        meanScore
        popularity
        genres
        tags { name rank isGeneralSpoiler isMediaSpoiler }
        nextAiringEpisode { episode at }
        studios { edges { isMain node { name } } nodes { name } }
    }
}`;

const ANIME_PAGE_FORMAT_LABELS = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special', MUSIC: 'Music' };
const ANIME_PAGE_STATUS_LABELS = { FINISHED: 'Finished', RELEASING: 'Currently Airing', NOT_YET_RELEASED: 'Not Yet Released', CANCELLED: 'Cancelled' };
const ANIME_PAGE_STORED_STATUS_LABELS = { current: 'Currently Airing', finished: 'Finished', upcoming: 'Not Yet Released', unknown: '' };
const ANIME_PAGE_SEASON_LABELS = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
const ANIME_PAGE_SOURCE_LABELS = { ORIGINAL: 'Original', MANGA: 'Manga', LIGHT_NOVEL: 'Light Novel', VISUAL_NOVEL: 'Visual Novel', VIDEO_GAME: 'Video Game', NOVEL: 'Novel', WEB_NOVEL: 'Web Novel', DOUJINSHI: 'Doujinshi', GAME: 'Game', PICTURE_BOOK: 'Picture Book', RADIO: 'Radio', COMIC: 'Comic', OTHER: 'Other' };

let animePageToken = 0;
let animePageOrigin = 'challenge';
let animePageCurrentKey = null;
let animePageCurrentSource = null;
// Ids whose page was opened from a bare online id (the entry
// object itself was never registered this session — see the
// fallback in openAnimePage). Their entry objects are upgraded
// with real data when the page's Media query returns.
const animePageSyntheticIds = new Set();

function animePageDetectOrigin() {
    const map = {
        'challenge-screen': 'challenge',
        'backlog-manager-screen': 'backlog',
        'anipace-log-screen': 'anipace',
        'schedule-screen': 'schedule',
        'anime-social-lounge': 'lounge'
    };
    const ids = Object.keys(map);
    for (let i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el && !el.classList.contains('hidden')) return map[ids[i]];
    }
    return 'challenge';
}

// The enrichment chain (base loader + themes + episode grid)
// looks its containers up by document id, and the old inline
// panels use the same ids. Any container with the page's ids
// that lives OUTSIDE the page (a stale search-results detail
// view, an inline backlog panel) is renamed aside so the
// chain renders into the page. Those panels are never opened
// any more — every details button routes here — and the
// lists re-render fresh containers on their next render.
function animePageDedupeContainers(pageKey) {
    const page = document.getElementById('anime-page-screen');
    if (!page) return;
    ['streaming-links-', 'characters-'].forEach(prefix => {
        const id = prefix + pageKey;
        document.querySelectorAll('[id="' + id + '"]').forEach(el => {
            if (!page.contains(el)) el.id = id + '__inline';
        });
    });
}

function animePageBuildSkeleton(pageKey) {
    const content = document.getElementById('anime-page-content');
    if (!content) return;
    content.innerHTML = `
        <div class="anime-page-banner" id="anime-page-banner"></div>
        <div class="anime-page-head">
            <img class="anime-page-poster" id="anime-page-poster" alt="Poster">
            <div class="anime-page-titles">
                <h2 class="anime-page-title" id="anime-page-title"></h2>
                <div class="anime-page-romaji" id="anime-page-romaji"></div>
                <div class="anime-page-userline" id="anime-page-userline"></div>
            </div>
        </div>
        <div id="anime-page-actions"></div>
        <div class="anime-page-section" id="anime-page-story-section">
            <div class="anime-page-section-head"><strong>📖 Story</strong></div>
            <p class="anime-page-story" id="anime-page-story"></p>
        </div>
        <div class="anime-page-section" id="anime-page-meta-section">
            <div class="anime-page-section-head"><strong>ℹ️ Details</strong></div>
            <div class="anime-page-meta-grid" id="anime-page-meta"></div>
        </div>
        <div class="anime-page-section" id="anime-page-labels-section">
            <div class="anime-page-section-head"><strong>🏷️ Genres & Tags</strong></div>
            <div class="anime-page-chips" id="anime-page-chips"></div>
        </div>
        <div id="anime-page-scoredist"></div>
        <div id="anime-page-cast"></div>
        <div class="anime-page-chain-panel" id="anime-page-chain-panel">
            <div class="anime-tags-row" style="display: none;"></div>
            <div class="streaming-links-container" id="streaming-links-${pageKey}"></div>
        </div>
        <div id="anime-page-recs"></div>
        <div id="anime-page-notes"></div>`;
}

// The chain panel carries an (empty, hidden) .anime-tags-row
// marker: the base loader inserts its own plain-text tags row
// into the panel only when the panel has none — the page
// shows genres/tags properly as chips in their own section,
// so the marker keeps the panel free of a duplicate row.

function animePageMetaHtml(rows) {
    return rows
        .filter(r => r[1] !== null && r[1] !== undefined && String(r[1]).trim() !== '')
        .map(r => `<div class="anime-page-meta-item"><div class="anime-page-meta-label">${themesEscapeHtml(r[0])}</div><div class="anime-page-meta-value">${themesEscapeHtml(String(r[1]))}</div></div>`)
        .join('');
}

function animePageChipsHtml(genres, tags) {
    const g = (genres || []).map(name => `<span class="anime-page-chip">${themesEscapeHtml(name)}</span>`).join('');
    const t = (tags || []).map(name => `<span class="anime-page-chip anime-page-chip-tag">${themesEscapeHtml(name)}</span>`).join('');
    return g + t;
}

function animePageSetBannerAndPoster(bannerUrl, posterUrl) {
    const banner = document.getElementById('anime-page-banner');
    if (banner) {
        banner.innerHTML = bannerUrl ? `<img class="anime-page-banner-img" src="${themesEscapeHtml(bannerUrl)}" alt="">` : '';
    }
    const poster = document.getElementById('anime-page-poster');
    if (poster) poster.src = posterUrl || 'https://via.placeholder.com/160x224?text=No+Image';
}

function animePageSetTitles(englishTitle, romajiTitle) {
    const titleEl = document.getElementById('anime-page-title');
    if (titleEl) titleEl.textContent = englishTitle || 'Unknown Title';
    const romajiEl = document.getElementById('anime-page-romaji');
    if (romajiEl) {
        if (romajiTitle && romajiTitle !== englishTitle) {
            romajiEl.textContent = romajiTitle;
            romajiEl.style.display = '';
        } else {
            romajiEl.textContent = '';
            romajiEl.style.display = 'none';
        }
    }
}

function animePageSetStory(text) {
    const section = document.getElementById('anime-page-story-section');
    const storyEl = document.getElementById('anime-page-story');
    if (!section || !storyEl) return;
    if (text && String(text).trim()) {
        storyEl.textContent = String(text);
        section.style.display = '';
    } else {
        storyEl.textContent = '';
        section.style.display = 'none';
    }
}

function animePageSetMeta(rows) {
    const section = document.getElementById('anime-page-meta-section');
    const grid = document.getElementById('anime-page-meta');
    if (!section || !grid) return;
    const html = animePageMetaHtml(rows);
    grid.innerHTML = html;
    section.style.display = html ? '' : 'none';
}

function animePageSetChips(genres, tags) {
    const section = document.getElementById('anime-page-labels-section');
    const chips = document.getElementById('anime-page-chips');
    if (!section || !chips) return;
    const html = animePageChipsHtml(genres, tags);
    chips.innerHTML = html;
    section.style.display = html ? '' : 'none';
}

// The user's own data for this title: his score (stored on
// the library copies) and his watched progress (the AniPace
// history via the episode grid's counter). Fresh Discover
// results that are not in his library show no line.
function animePagePaintUserLine(anime) {
    const el = document.getElementById('anime-page-userline');
    if (!el) return;
    let stored = null;
    try {
        const key = upnextEntryKey(anime);
        stored = getUniqueAnime().find(item => upnextEntryKey(item) === key) || null;
    } catch (e) { stored = null; }
    const score = (stored && stored.user_score) || anime.user_score || null;
    let watched = 0;
    try { watched = epgridWatchedCount(anime); } catch (e) { watched = 0; }
    const total = epgridSanitizeTotal(anime.episodes);
    const parts = [];
    if (score) parts.push(`⭐ My Score: ${score}`);
    if (total > 0 && watched > 0) parts.push(`📺 Watched ${watched}/${total} episodes`);
    else if (total > 0 && stored) parts.push(`📺 0/${total} episodes watched`);
    if (!parts.length && stored) parts.push('📚 In your library');
    el.textContent = parts.join(' · ');
    el.style.display = parts.length ? '' : 'none';
}

// The card action area, carried onto the page so opening a
// fresh Discover / Trends / search result never loses the
// affordances its card offered: the tracked-status badge for
// titles already in the library, or the very same + Log Today
// / + Backlog buttons (same handlers, same notifications) for
// titles that are not. Library entries reached from Backlog
// or the day lists already report a tracked status, so they
// simply get the badge. Bare-id fallback entries have no data
// yet — their actions render once the Media query upgrades
// the entry (see animePageLoadMedia).
function animePageRenderActions(anime) {
    const container = document.getElementById('anime-page-actions');
    if (!container) return;
    container.innerHTML = '';
    if (!anime || anime.isManual) return;
    let status = null;
    try { status = getAnimeTrackedStatus(anime); } catch (e) { status = null; }
    if (status === 'completed') {
        container.innerHTML = `
            <div style="margin-top: 14px; padding: 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success-color); color: var(--success-color); font-weight: bold; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: inset 0 0 4px rgba(16,185,129,0.15);">
                ✓ Completed Challenge
            </div>`;
        return;
    }
    if (status === 'backlog') {
        container.innerHTML = `
            <div style="margin-top: 14px; padding: 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid #A0AEC0; color: #FFFFFF; font-weight: bold; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
                ✓ Tracked in Backlog
            </div>`;
        return;
    }
    if (!anime.mal_id) return;
    if (animePageSyntheticIds.has(parseInt(anime.mal_id, 10))) return; // data still loading
    const title = getEnglishTitle(anime);
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 14px;">
            <button class="add-to-challenge-quick-btn" style="background: linear-gradient(135deg, var(--success-color), #059669); color: #FFF; width: 100%; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; transition: transform 0.2s;">+ Log Today</button>
            <button class="add-to-backlog-quick-btn" style="background: linear-gradient(135deg, var(--primary-color), #FFA000); color: #000; width: 100%; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; transition: transform 0.2s;">+ Backlog</button>
        </div>`;
    const chalBtn = container.querySelector('.add-to-challenge-quick-btn');
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
            animePageRenderActions(anime);
            animePagePaintUserLine(anime);
        };
    }
    const blBtn = container.querySelector('.add-to-backlog-quick-btn');
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
            animePageRenderActions(anime);
            animePagePaintUserLine(anime);
        };
    }
}

// First paint, from the resolved object alone (stored data
// for library entries, the normalized API object for fresh
// results) — the page is complete before any fetch returns.
function animePagePaintStored(anime) {
    const english = getEnglishTitle(anime);
    const romajiEntry = (anime.titles || []).find(t => t && t.type === 'Default');
    const romaji = romajiEntry ? romajiEntry.title : (anime.title && anime.title !== english ? anime.title : '');
    animePageSetTitles(english, romaji);
    const posterUrl = (anime.images && anime.images.jpg && (anime.images.jpg.image_url || anime.images.jpg.small_image_url)) || '';
    animePageSetBannerAndPoster(anime.coverImage || '', posterUrl);
    animePageSetStory(anime.synopsis || '');
    const studioName = (anime.studios && anime.studios[0] && anime.studios[0].name) || '';
    animePageSetMeta([
        ['Format', anime.type || ''],
        ['Status', ANIME_PAGE_STORED_STATUS_LABELS[anime.airingStatus] || ''],
        ['Year', anime.year || ''],
        ['Episodes', (anime.episodes !== null && anime.episodes !== undefined && anime.episodes !== '') ? String(anime.episodes) : ''],
        ['Duration', anime.episodeLength ? `${anime.episodeLength} min / ep` : ''],
        ['Studio', studioName],
        ['Score', (anime.score !== null && anime.score !== undefined && anime.score !== '') ? String(anime.score) : '']
    ]);
    const genres = (anime.genres || []).map(g => (typeof g === 'string' ? g : (g && g.name))).filter(Boolean);
    const tags = (anime.tags || []).slice(0, 10).map(t => (typeof t === 'string' ? t : (t && t.name))).filter(Boolean);
    animePageSetChips(genres, tags);
    animePagePaintUserLine(anime);
}

// Upgrade paint, from the page's one combined Media query:
// bigger art, the full description, and the complete details
// grid (season, source material, mean score, popularity).
function animePagePaintMedia(anime, media) {
    const english = (media.title && (media.title.english || media.title.romaji)) || getEnglishTitle(anime);
    const romaji = (media.title && media.title.romaji) || '';
    animePageSetTitles(english, romaji);
    const posterUrl = (media.coverImage && (media.coverImage.extraLarge || media.coverImage.large || media.coverImage.medium))
        || (anime.images && anime.images.jpg && anime.images.jpg.image_url) || '';
    animePageSetBannerAndPoster(media.bannerImage || (media.coverImage && media.coverImage.extraLarge) || '', posterUrl);
    animePageSetStory(stripHtmlTags(media.description || '') || anime.synopsis || '');
    const mainStudios = ((media.studios && media.studios.edges) || []).filter(e => e && e.isMain && e.node).map(e => e.node.name);
    const studioName = mainStudios[0] || ((media.studios && media.studios.nodes && media.studios.nodes[0]) ? media.studios.nodes[0].name : '')
        || (anime.studios && anime.studios[0] && anime.studios[0].name) || '';
    const seasonText = media.season ? `${ANIME_PAGE_SEASON_LABELS[media.season] || media.season}${media.seasonYear ? ' ' + media.seasonYear : ''}` : (media.seasonYear ? String(media.seasonYear) : '');
    animePageSetMeta([
        ['Format', ANIME_PAGE_FORMAT_LABELS[media.format] || media.format || ''],
        ['Status', ANIME_PAGE_STATUS_LABELS[media.status] || ''],
        ['Season', seasonText],
        ['Episodes', (media.episodes !== null && media.episodes !== undefined) ? String(media.episodes) : ''],
        ['Duration', media.duration ? `${media.duration} min / ep` : ''],
        ['Studio', studioName],
        ['Source', ANIME_PAGE_SOURCE_LABELS[media.source] || ''],
        ['Average Score', (media.averageScore !== null && media.averageScore !== undefined) ? `${media.averageScore}%` : ''],
        ['Mean Score', (media.meanScore !== null && media.meanScore !== undefined) ? `${media.meanScore}%` : ''],
        ['Popularity', (media.popularity !== null && media.popularity !== undefined) ? Number(media.popularity).toLocaleString('en-US') + ' members' : '']
    ]);
    const genres = Array.isArray(media.genres) ? media.genres : [];
    const tags = (media.tags || [])
        .filter(t => t && t.name && !t.isGeneralSpoiler && !t.isMediaSpoiler)
        .sort((a, b) => (b.rank || 0) - (a.rank || 0))
        .slice(0, 12)
        .map(t => t.name);
    animePageSetChips(genres, tags);
}

function animePageLoadMedia(anime, idNum, token) {
    anilistGraphQL(ANIME_PAGE_QUERY, { id: idNum })
        .then(data => {
            if (token !== animePageToken) return;
            const media = (data && data.Media) ? data.Media : null;
            if (!media) return;
            animePagePaintMedia(anime, media);
            // Bare-id fallback entries (opened from an id alone):
            // upgrade the entry object with the real normalized
            // data so the add-to-library actions and the chain's
            // title-based streaming lookup work with true data,
            // then re-run the chain for this page (the streaming
            // container's loaded flag is cleared first, since its
            // lookup ran before the title existed).
            if (animePageSyntheticIds.has(idNum)) {
                animePageSyntheticIds.delete(idNum);
                try {
                    const normalized = normalizeAniListResponse({ media: [media] });
                    if (normalized && normalized[0]) {
                        Object.assign(anime, normalized[0]);
                        registerAnimeForDetails(anime);
                        animePageRenderActions(anime);
                        const linksEl = document.getElementById('streaming-links-' + animePageCurrentKey);
                        if (linksEl) delete linksEl.dataset.loaded;
                        try { window.lazyLoadDetails(animePageCurrentKey, animePageCurrentSource); } catch (e) { /* the chain is best-effort */ }
                    }
                } catch (e) { /* the painted page stays as-is */ }
            }
            // Airing shows: hand the grid the released-count
            // marker (in memory only, exactly like the old
            // Read Story enrichment) and re-render it so
            // unreleased cells lock.
            if (media.nextAiringEpisode) {
                try {
                    anime.nextAiringEpisode = media.nextAiringEpisode;
                    if (typeof epgridRender === 'function' && animePageCurrentKey !== null) {
                        epgridRender(animePageCurrentKey, animePageCurrentSource);
                    }
                } catch (e) { /* the grid keeps its total-only state */ }
            }
        })
        .catch(() => { /* silent: the stored-data paint stays */ });
}

// 📝 Notes section of the page (works for every entry type).
function animePageRenderNotes(anime) {
    const container = document.getElementById('anime-page-notes');
    if (!container) return;
    const entryKey = (typeof upnextEntryKey === 'function') ? upnextEntryKey(anime) : '';
    if (!entryKey) { container.innerHTML = ''; return; }
    container.innerHTML = `
    <div class="notes-block">
        <div class="notes-head"><strong>📝 My Notes</strong><span class="notes-private">Private · only you can see these</span></div>
        <textarea class="notes-textarea" rows="3" maxlength="${NOTES_MAX_LEN}" placeholder="Your private notes on this show…"></textarea>
        <div class="notes-actions"><button type="button" class="notes-save-btn">Save Note</button></div>
    </div>`;
    const textarea = container.querySelector('.notes-textarea');
    const rec = notesGetRecord(notesLoad(), entryKey);
    if (textarea && rec) textarea.value = rec.text;
    const btn = container.querySelector('.notes-save-btn');
    if (btn) btn.addEventListener('click', () => notesHandleSave(entryKey, textarea, btn));
}

// Run fn on the next frame (setTimeout fallback for
// environments without requestAnimationFrame).
function animePageRaf(fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else setTimeout(fn, 16);
}

// The body carries a 0.5s background transition (the OG theme
// fade). During a screen switch that fade reads as lag — most
// visibly on the dark→light Backlog switch, where the whole
// screen washed from black to white over half a second. While
// switching, suppress the transition so the new theme applies
// atomically with the switch itself; restore it two frames
// later, once the new theme has painted.
function animePageInstantTheme() {
    document.body.classList.add('theme-instant');
    animePageRaf(() => animePageRaf(() => {
        document.body.classList.remove('theme-instant');
    }));
}

function animePageHide() {
    const page = document.getElementById('anime-page-screen');
    // Leaving the page always restores the app chrome, whatever
    // path was taken to leave. When the page is already hidden
    // there is nothing more to do — this runs on every screen
    // switch, so it stays near-free in that case.
    document.body.classList.remove('anime-page-open');
    if (!page || page.classList.contains('hidden')) return;
    page.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { /* already gone */ } });
    page.classList.add('hidden');
}

function animePageOpen(anime, animeId, animeSource) {
    const page = document.getElementById('anime-page-screen');
    if (!page || !anime) return;
    const token = ++animePageToken;
    // Remember where the user came from (if the page itself is
    // somehow already showing, keep the earlier origin).
    if (page.classList.contains('hidden')) animePageOrigin = animePageDetectOrigin();
    // The page replaces whatever modal was open (e.g. the
    // search-results detail the button was tapped in).
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    if (animePageOrigin === 'lounge' && typeof stopLoungeListeners === 'function') {
        try { stopLoungeListeners(); } catch (e) { /* silent */ }
    }

    // The chain key: the entry's own id for regular entries; a
    // synthetic registry key for manual entries (their mal_id
    // is null, so id-based resolution could never find them —
    // and several manual entries share mal_id null, so a naive
    // lookup could even find the WRONG one).
    let pageKey;
    let pageSource;
    if (anime.isManual || animeId === null || animeId === undefined) {
        pageKey = 'manual-' + normalizeSearchText(getEnglishTitle(anime)).replace(/\s+/g, '-');
        pageSource = 'manual';
        ANIME_DETAILS_REGISTRY['manual:' + pageKey] = anime;
    } else {
        pageKey = String(animeId);
        pageSource = animeSource || anime.source || 'kitsu';
    }
    animePageCurrentKey = pageKey;
    animePageCurrentSource = pageSource;

    animePageDedupeContainers(pageKey);
    animePageBuildSkeleton(pageKey);
    animePagePaintStored(anime);
    animePageRenderActions(anime);
    animePageRenderNotes(anime);

    // Show the page in place of every app screen (same
    // hidden-class mechanism as switchToScreen), and hide ALL
    // app chrome while it is open (the anime-page-open body
    // class): the page is a true full-screen takeover whose
    // only app control is its fixed ← Back button.
    ['challenge-screen', 'backlog-manager-screen', 'anipace-log-screen', 'schedule-screen', 'anime-social-lounge'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    animePageInstantTheme();
    document.body.classList.remove('backlog-active');
    page.classList.remove('hidden');
    document.body.classList.add('anime-page-open');
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = getEnglishTitle(anime);
    window.scrollTo(0, 0);

    // Enrichment runs one frame later, so the tap paints the
    // page shell (header art, story, details, notes) first and
    // the heavier synchronous work — the lazyLoadDetails chain
    // (streaming links, 🎵 theme songs, 📺 episode grid) and
    // the cached section loads — fills in right after, instead
    // of blocking the tap itself. The token + visibility guard
    // keeps a stale open from filling a page already left.
    animePageRaf(() => {
        if (token !== animePageToken) return;
        if (page.classList.contains('hidden')) return;
        try { window.lazyLoadDetails(pageKey, pageSource); } catch (e) { /* never break the page */ }

        // Online-powered sections, all lazy and cached. No id →
        // no fetches at all: the page stays with its local data.
        const idNum = animePageAniListId(anime);
        if (idNum) {
            animePageLoadMedia(anime, idNum, token);
            animePageLoadScoreDist(anime, idNum, token);
            animePageLoadCast(anime, idNum, token);
            animePageLoadRecs(anime, idNum, token);
        }
    });
}

// Entry point used by every re-routed Read Story / details
// button (Backlog, watched/day lists, Discover, trends,
// search results): resolve the entry the same way the old
// details loader did, then open the page.
window.openAnimePage = function(animeId, animeSource) {
    let anime = (typeof resolveAnimeForDetails === 'function') ? resolveAnimeForDetails(animeId, animeSource) : null;
    if (!anime) {
        // Belt-and-braces for feed cards: an item rendered from
        // the saved feed may never have been registered in this
        // session (the renderers register what they draw, but no
        // card carrying an online id may ever dead-end here).
        // A bare online id is enough to open the page — the
        // combined Media query fills in every section, and the
        // entry object is upgraded with real data when it lands.
        const src = animeSource || 'kitsu';
        const idNum = parseInt(animeId, 10);
        if (src === 'anilist' && !isNaN(idNum) && idNum > 0) {
            anime = { mal_id: idNum, source: 'anilist', title: '', titles: [], genres: [], tags: [], studios: [], isManual: false };
            animePageSyntheticIds.add(idNum);
            registerAnimeForDetails(anime);
        }
    }
    if (!anime) {
        // Reserved for genuinely unresolvable entries: no usable
        // id at all and no local copy anywhere.
        showNotification('Could not open the full page for this anime.', 'error');
        return;
    }
    animePageOpen(anime, animeId, animeSource || anime.source || 'kitsu');
};

// Entry point for callers that already hold the entry object
// (the Backlog Details buttons) — the only path that can open
// manual entries, whose mal_id is null.
window.openAnimePageEntry = function(anime) {
    if (!anime) return;
    animePageOpen(anime, anime.mal_id, anime.source || 'kitsu');
};

window.closeAnimePage = function() {
    animePageHide();
    switchToScreen(animePageOrigin || 'challenge');
};

// Any ordinary navigation (the top-bar buttons call
// switchToScreen directly) must also leave the page —
// otherwise the page would stay visible next to the target
// screen. Wrap the switcher: hide the page first, then run
// the original logic untouched.
if (typeof window.switchToScreen === 'function') {
    const animePagePrevSwitchToScreen = window.switchToScreen;
    window.switchToScreen = function(screenId) {
        try { animePageHide(); } catch (e) { /* never break navigation */ }
        // The theme (dark ⇄ light Backlog) applies atomically
        // with the switch — no half-second background fade.
        try { animePageInstantTheme(); } catch (e) { /* never break navigation */ }
        return animePagePrevSwitchToScreen.apply(this, arguments);
    };
}

(function animePageInit() {
    const backBtn = document.getElementById('anime-page-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => { window.closeAnimePage(); });
})();
// End FULL ANIME PAGE

// ============================================================
// MUSIC PLAYER — a "🎵 Music" screen (song search + this
// season's songs) feeding ONE shared audio player for the
// whole app, plus 🎧 audio buttons on the anime page's
// Theme Songs rows. Appended at end of file like the other
// ports; no existing code is modified except the themes
// query/render (audio field) above and the two wrappers at
// the bottom of this block. Styling: styles.css "MUSIC
// PLAYER" section, OG variables only.
//
// Song data comes from a community song database with a
// public, keyless API (POST /api/search_request and
// /api/season_request); its entries carry direct audio file
// basenames that resolve on the database's file host.
// Responses are cached 7 days in aniclipse_music_cache_v1.
// The anime page's 🎧 buttons instead play the light native
// audio file the themes query already returns per theme.
//
// USER-VISIBLE COPY RULE: no provider is ever named in a
// rendered string, label or toast — the UI says "songs",
// "this season", "the database" at most. (Code comments and
// URLs are not user-visible.)
//
// Playback model: ONE <audio id="music-audio"> element and
// one queue. Tapping a row makes that list the queue (in
// displayed order) and plays the row; 'ended' auto-advances;
// ⏭/⏮ stop at the ends (no wrap); ⏮ restarts the track
// when more than 3 seconds in. Screen switches never stop
// the music; a theme VIDEO (or trailer) starting pauses the
// audio, and audio starting pauses any playing video —
// never two sounds at once.
//
// Playback resolution: the song database stays the
// catalogue, but its file host is unreachable on some
// networks, so a database track that links to an anime id
// first tries to play the SAME song (same type, same
// sequence number) from the themes service's light audio
// file — resolved through the shared themes cache, so
// repeat plays cost no fetch — and only falls back to the
// database's own file link when there is no match, no id,
// or the lookup fails. Until the audio element's real
// duration arrives, the bar's total time shows the
// database's song length.
// ============================================================

const MUSIC_CACHE_KEY = 'aniclipse_music_cache_v1';
const MUSIC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MUSIC_DB_BASE = 'https://anisongdb.com/api';
const MUSIC_FILE_BASE = 'https://files.catbox.moe/';
const MUSIC_SEASON_CAP = 100;

// ---------- cache (same pattern as the themes cache) ----------

function musicLoadCache() {
    try {
        const raw = localStorage.getItem(MUSIC_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function musicSaveCache(cache) {
    try {
        localStorage.setItem(MUSIC_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable — the feature degrades silently */ }
}

// Returns the cached track array for a key, or null on a
// miss / expired entry. An empty array is a valid hit (the
// season steps back over it without refetching).
function musicCacheGet(key) {
    const entry = musicLoadCache()[key];
    if (!entry || typeof entry.t !== 'number') return null;
    if (Date.now() - entry.t >= MUSIC_CACHE_TTL_MS) return null;
    if (!Array.isArray(entry.tracks)) return null;
    // Entries written before queue rows carried their linked
    // anime id can't feed the playback resolver — treat them
    // as a miss so they refetch once, in the new shape.
    if (entry.tracks.length && !('anilistId' in entry.tracks[0])) return null;
    return entry.tracks;
}

function musicCacheSet(key, tracks) {
    const cache = musicLoadCache();
    cache[key] = { t: Date.now(), tracks: tracks };
    musicSaveCache(cache);
}

// ---------- seasons ----------

// The app's season convention (the same one its online
// queries use): WINTER = Dec–Feb, SPRING = Mar–May,
// SUMMER = Jun–Aug, FALL = Sep–Nov, with December counting
// as the FOLLOWING year's Winter.
function musicCurrentSeason(fromDate) {
    const d = fromDate || new Date();
    const m = d.getMonth();
    const y = d.getFullYear();
    if (m === 11) return { name: 'Winter', year: y + 1 };
    if (m <= 1) return { name: 'Winter', year: y };
    if (m <= 4) return { name: 'Spring', year: y };
    if (m <= 7) return { name: 'Summer', year: y };
    return { name: 'Fall', year: y };
}

function musicPrevSeason(season) {
    const order = ['Winter', 'Spring', 'Summer', 'Fall'];
    const i = order.indexOf(season.name);
    if (i <= 0) return { name: 'Fall', year: season.year - 1 };
    return { name: order[i - 1], year: season.year };
}

function musicSeasonKey(season) {
    return season.name + ' ' + season.year;
}

// ---------- song-database entries → render-ready tracks ----------

function musicParseType(songType) {
    const s = String(songType || '');
    let m = s.match(/Opening\s*(\d+)?/i);
    if (m) return { kind: 'OP', seq: m[1] ? parseInt(m[1], 10) : null };
    m = s.match(/Ending\s*(\d+)?/i);
    if (m) return { kind: 'ED', seq: m[1] ? parseInt(m[1], 10) : null };
    return { kind: 'IN', seq: null };
}

// Flatten + dedupe + sort: Openings, then Endings, then
// Insert Songs; within a group by anime, then number, then
// title. Duplicates of the same song (the database lists
// broadcast/dub variants) collapse to the best copy:
// playable first, then the normal broadcast, then non-dub.
function musicProcessEntries(entries) {
    const byKey = new Map();
    (Array.isArray(entries) ? entries : []).forEach(e => {
        if (!e) return;
        const t = musicParseType(e.songType);
        const track = {
            title: e.songName || 'Unknown Song',
            anime: e.animeENName || e.animeJPName || '',
            artist: e.songArtist || '',
            kind: t.kind,
            seq: t.seq,
            badge: t.kind === 'IN' ? 'IN' : (t.seq ? t.kind + t.seq : t.kind),
            src: e.audio ? (MUSIC_FILE_BASE + e.audio) : null,
            // Playback-resolver inputs: the entry's linked
            // anime id (when the database knows it), the raw
            // type string, and the song's length in seconds
            // (shown as the total time until the real audio
            // duration arrives).
            anilistId: (e.linked_ids && typeof e.linked_ids.anilist === 'number' && e.linked_ids.anilist > 0) ? e.linked_ids.anilist : null,
            songType: e.songType || '',
            length: (typeof e.songLength === 'number' && isFinite(e.songLength) && e.songLength > 0) ? e.songLength : null,
            fromDb: true,
            _dub: !!e.isDub,
            _reb: !!e.isRebroadcast
        };
        const key = (track.anime + '|' + track.badge + '|' + track.title + '|' + track.artist).toLowerCase();
        const prev = byKey.get(key);
        if (!prev) { byKey.set(key, track); return; }
        const score = (x) => (x.src ? 4 : 0) + (!x._reb ? 2 : 0) + (!x._dub ? 1 : 0);
        // Whichever copy wins, keep the resolver inputs from
        // the other copy when the winner lacks them (the id
        // and length are properties of the song, not of one
        // broadcast variant).
        if (score(track) > score(prev)) {
            if (!track.anilistId && prev.anilistId) track.anilistId = prev.anilistId;
            if (!track.length && prev.length) track.length = prev.length;
            byKey.set(key, track);
        } else {
            if (!prev.anilistId && track.anilistId) prev.anilistId = track.anilistId;
            if (!prev.length && track.length) prev.length = track.length;
        }
    });
    const tracks = Array.from(byKey.values());
    const kindOrder = { OP: 0, ED: 1, IN: 2 };
    tracks.sort((a, b) =>
        (kindOrder[a.kind] - kindOrder[b.kind]) ||
        (a.anime.toLowerCase() < b.anime.toLowerCase() ? -1 : a.anime.toLowerCase() > b.anime.toLowerCase() ? 1 : 0) ||
        ((a.seq || 0) - (b.seq || 0)) ||
        (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0));
    return tracks;
}

function musicDbPost(path, payload) {
    return fetch(MUSIC_DB_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
    }).then(res => {
        if (!res || !res.ok) throw new Error('song database HTTP error');
        return res.json();
    });
}

// ---------- shared player ----------

let musicQueue = [];
let musicIndex = -1;
let musicOwner = null; // { kind:'list', renderId } | { kind:'themes', block, idxMap }
let musicPlaying = false;
let musicSeeking = false;
let musicErrorStreak = 0;
let musicResolveToken = 0; // bumped on every playback-intent change; stale resolutions check it
let musicFailNotified = false; // the "couldn't play" note fires once per queue pass

function musicAudioEl() { return document.getElementById('music-audio'); }

function musicFormatTime(sec) {
    if (!isFinite(sec) || sec === null || sec === undefined || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function musicCurrentTrack() {
    return (musicIndex >= 0 && musicIndex < musicQueue.length) ? musicQueue[musicIndex] : null;
}

function musicSetBarVisible(visible) {
    const bar = document.getElementById('music-player-bar');
    if (bar) bar.hidden = !visible;
    document.body.classList.toggle('music-bar-open', !!visible);
}

function musicUpdateBar() {
    const track = musicCurrentTrack();
    const titleEl = document.getElementById('music-player-title');
    const subEl = document.getElementById('music-player-sub');
    const pp = document.getElementById('music-playpause-btn');
    if (titleEl) titleEl.textContent = track ? track.title : '—';
    if (subEl) subEl.textContent = track ? [track.anime, track.artist].filter(Boolean).join(' · ') : '';
    if (pp) pp.textContent = musicPlaying ? '⏸' : '▶';
}

// A new track starts at 0:00; its total shows the song
// length the database reported until the audio element's
// real duration replaces it (loadedmetadata / timeupdate).
function musicResetTimes(track) {
    const cur = document.getElementById('music-time-current');
    if (cur) cur.textContent = '0:00';
    const tot = document.getElementById('music-time-total');
    if (tot) tot.textContent = (track && typeof track.length === 'number' && track.length > 0) ? musicFormatTime(track.length) : '0:00';
    const seek = document.getElementById('music-seek');
    if (seek && !musicSeeking) seek.value = '0';
}

function musicHighlight() {
    document.querySelectorAll('.music-row-playing').forEach(r => r.classList.remove('music-row-playing'));
    document.querySelectorAll('.themes-row-playing').forEach(r => r.classList.remove('themes-row-playing'));
    document.querySelectorAll('.music-play-btn').forEach(b => { if (b.dataset.baseLabel) b.textContent = b.dataset.baseLabel; });
    if (musicIndex < 0 || !musicOwner) return;
    if (musicOwner.kind === 'list') {
        const row = document.querySelector('.music-row[data-render="' + musicOwner.renderId + '"][data-qidx="' + musicIndex + '"]');
        if (row) {
            row.classList.add('music-row-playing');
            const btn = row.querySelector('.music-play-btn');
            if (btn) btn.textContent = musicPlaying ? '⏸ Pause' : '▶ Play';
        }
    } else if (musicOwner.kind === 'themes') {
        const block = musicOwner.block;
        if (block && document.contains(block)) {
            const themeIdx = musicOwner.idxMap[musicIndex];
            const row = block.querySelector('.themes-row[data-idx="' + themeIdx + '"]');
            if (row) row.classList.add('themes-row-playing');
        }
    }
}

function musicUpdateMediaSession() {
    try {
        if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
        const track = musicCurrentTrack();
        if (!track) { navigator.mediaSession.metadata = null; return; }
        navigator.mediaSession.metadata = new window.MediaMetadata({
            title: track.title || '',
            artist: track.artist || '',
            album: track.anime || ''
        });
        navigator.mediaSession.setActionHandler('play', () => { const a = musicAudioEl(); if (a) { const p = a.play(); if (p && p.catch) p.catch(() => {}); } });
        navigator.mediaSession.setActionHandler('pause', () => { const a = musicAudioEl(); if (a) a.pause(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => musicPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => musicNext());
    } catch (e) { /* Media Session is a progressive enhancement */ }
}

function musicClearMediaSession() {
    try { if ('mediaSession' in navigator) navigator.mediaSession.metadata = null; } catch (e) { /* silent */ }
}

// ---------- playback resolution ----------

const musicThemesInFlight = new Map();

// The themes list for an AniList id when it is already
// cached and usable, else null (a fetch is needed). Mirrors
// the anime-page loader's staleness rule: fresh entries
// that predate the audio field count as unusable.
function musicThemesCached(idNum) {
    const hit = themesLoadCache()[String(idNum)];
    if (!hit || (Date.now() - (hit.t || 0)) >= THEMES_CACHE_TTL_MS) return null;
    if (!Array.isArray(hit.themes)) return null;
    const lacksAudio = hit.themes.length > 0
        && hit.themes.some(t => t && t.video && t.audio === undefined);
    return lacksAudio ? null : hit.themes;
}

// Promise of an anime's themes (cache first, one shared
// fetch per id, result cached exactly like the anime-page
// loader writes it — so the page and repeat plays reuse
// it). Resolves to null when the lookup fails; callers
// fall back gracefully. Failures are not cached.
function musicThemesFetch(idNum) {
    const cached = musicThemesCached(idNum);
    if (cached !== null) return Promise.resolve(cached);
    if (musicThemesInFlight.has(idNum)) return musicThemesInFlight.get(idNum);
    const p = fetch(THEMES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: THEMES_QUERY, variables: { id: [idNum] } })
    }).then(res => {
        if (!res || !res.ok) throw new Error('themes HTTP error');
        return res.json();
    }).then(json => {
        if (!json || (!json.data && json.errors)) throw new Error('themes GraphQL error');
        const themes = themesProcessResponse(json.data);
        const store = themesLoadCache();
        store[String(idNum)] = { t: Date.now(), themes: themes };
        themesSaveCache(store);
        return themes;
    }).catch(() => null)
        .finally(() => { musicThemesInFlight.delete(idNum); });
    musicThemesInFlight.set(idNum, p);
    return p;
}

// Match a database song to the theme of the same kind
// whose sequence equals it (an unnumbered song or theme
// counts as the first). Insert songs never match — the
// themes data covers openings and endings only. Only
// themes carrying an audio file can win.
function musicMatchTheme(track, themes) {
    if (!track || !Array.isArray(themes)) return null;
    if (track.kind !== 'OP' && track.kind !== 'ED') return null;
    const want = track.seq ? track.seq : 1;
    for (const t of themes) {
        if (!t || t.type !== track.kind || !t.audio) continue;
        const seq = t.seq ? t.seq : 1;
        if (seq === want) return t;
    }
    return null;
}

// Decide what actually plays for a queue track. Database
// tracks try the themes service's light audio first (via
// the shared themes cache) when the entry links to an
// anime id and a same-kind, same-sequence theme carries
// an audio file; anything else — no id, no match, lookup
// failed — falls back to the database's own file link.
// `done(url)` runs exactly once, synchronously whenever
// the answer is already known (themes-queue tracks, no
// id, warm cache), so plain taps never wait on the network.
function musicResolveTrackSrc(track, done) {
    if (!track) { done(null); return; }
    if (track._resolvedSrc) { done(track._resolvedSrc); return; }
    const fallback = track.src || null;
    if (!track.fromDb || !track.anilistId) { track._resolvedSrc = fallback; done(fallback); return; }
    const cached = musicThemesCached(track.anilistId);
    if (cached !== null) {
        const m = musicMatchTheme(track, cached);
        track._resolvedSrc = (m && m.audio) ? m.audio : fallback;
        done(track._resolvedSrc);
        return;
    }
    musicThemesFetch(track.anilistId).then(themes => {
        const m = musicMatchTheme(track, themes);
        track._resolvedSrc = (m && m.audio) ? m.audio : fallback;
        done(track._resolvedSrc);
    });
}

// One quiet note when a queue gives up on errors — never
// repeated within the same queue pass, never naming a
// provider.
function musicNotifyPlaybackFailure() {
    if (musicFailNotified) return;
    musicFailNotified = true;
    if (typeof showNotification === 'function') {
        showNotification("These songs couldn't play on this connection.", 'error');
    }
}

// A dead link (or a track with nothing playable) skips
// forward instead of stranding the listener; the streak
// guard keeps a fully-dead queue from looping, and giving
// up surfaces the one-time note above.
function musicSkipOnError() {
    if (musicIndex < 0) return;
    musicErrorStreak++;
    if (musicIndex < musicQueue.length - 1 && musicErrorStreak <= musicQueue.length) {
        musicPlayAt(musicIndex + 1, true);
    } else {
        musicPlaying = false;
        musicUpdateBar();
        musicHighlight();
        musicNotifyPlaybackFailure();
    }
}

function musicPlayAt(index, keepErrorStreak) {
    const a = musicAudioEl();
    if (!a || index < 0 || index >= musicQueue.length) return;
    musicIndex = index;
    if (!keepErrorStreak) { musicErrorStreak = 0; musicFailNotified = false; }
    const track = musicQueue[index];
    const token = ++musicResolveToken;
    // The bar appears immediately with the track's info;
    // resolution (below) never blocks it.
    musicPlaying = true;
    musicSetBarVisible(true);
    musicUpdateBar();
    musicResetTimes(track);
    musicHighlight();
    musicUpdateMediaSession();
    musicResolveTrackSrc(track, (url) => {
        if (token !== musicResolveToken) return; // superseded by a newer intent
        if (musicCurrentTrack() !== track) return; // the queue moved on
        if (!url) { musicSkipOnError(); return; }
        a.src = url;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* a later tap can retry */ });
    });
}

function musicPlayQueue(tracks, startIndex, owner) {
    if (!tracks || !tracks.length) return;
    musicQueue = tracks.slice();
    musicOwner = owner || null;
    const start = Math.min(Math.max(startIndex || 0, 0), musicQueue.length - 1);
    musicPlayAt(start);
}

function musicTogglePlay() {
    const a = musicAudioEl();
    if (!a || musicIndex < 0) return;
    if (musicPlaying) {
        // Pausing is a new intent: cancel any resolution
        // still in flight so it can't start the song after
        // the user has stopped it.
        musicResolveToken++;
        musicPlaying = false;
        try { a.pause(); } catch (e) { /* already gone */ }
        musicUpdateBar();
        musicHighlight();
    } else if (!a.getAttribute('src')) {
        // Nothing loaded yet (an earlier resolution was
        // cancelled before it landed) — resolve afresh.
        musicPlayAt(musicIndex);
    } else {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* a later tap can retry */ });
    }
}

// Ends are stops, not wraps: ⏭ on the last track does
// nothing, and ⏮ on the first track (or past 3 s in)
// restarts the current track.
function musicNext() {
    if (musicIndex >= 0 && musicIndex < musicQueue.length - 1) musicPlayAt(musicIndex + 1);
}

function musicPrev() {
    const a = musicAudioEl();
    if (!a || musicIndex < 0) return;
    if (a.currentTime > 3) { a.currentTime = 0; return; }
    if (musicIndex > 0) musicPlayAt(musicIndex - 1);
    else a.currentTime = 0;
}

function musicClose() {
    musicResolveToken++; // a pending resolution must not revive a closed player
    const a = musicAudioEl();
    if (a) {
        try { a.pause(); } catch (e) { /* already gone */ }
        a.removeAttribute('src');
        try { a.load(); } catch (e) { /* not critical */ }
    }
    musicQueue = [];
    musicIndex = -1;
    musicOwner = null;
    musicPlaying = false;
    musicErrorStreak = 0;
    musicFailNotified = false;
    musicSetBarVisible(false);
    musicHighlight();
    musicClearMediaSession();
}

function musicPauseAudio() {
    // A video starting is a new intent: cancel any song
    // resolution still in flight so the music can't start
    // over the video a moment later.
    musicResolveToken++;
    const a = musicAudioEl();
    if (a && musicPlaying) {
        try { a.pause(); } catch (e) { /* already gone */ }
        musicPlaying = false;
        musicUpdateBar();
        musicHighlight();
    }
}

function musicPauseVideos() {
    document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { /* already gone */ } });
}

// ---------- list rendering ----------

let musicRenderSeq = 0;

function musicRowHtml(track, qidx, renderId) {
    const sub = [track.anime, track.artist].filter(Boolean).join(' · ');
    const action = track.src
        ? `<button class="music-play-btn" type="button" data-qidx="${qidx}" data-base-label="▶ Play">▶ Play</button>`
        : `<span class="music-unavailable">No audio</span>`;
    return `
    <div class="music-row" data-render="${renderId}"${track.src ? ` data-qidx="${qidx}"` : ''}>
        <span class="music-badge${track.kind === 'OP' ? ' music-badge-op' : ''}">${themesEscapeHtml(track.badge)}</span>
        <div class="music-meta">
            <div class="music-title">${themesEscapeHtml(track.title)}</div>
            ${sub ? `<div class="music-sub">${themesEscapeHtml(sub)}</div>` : ''}
        </div>
        ${action}
    </div>`;
}

// Renders tracks into a container and wires the play
// buttons. The queue a tap builds is the PLAYABLE tracks in
// displayed order; each row's data-qidx is its index in
// that queue. Grouped mode adds Openings/Endings/Insert
// Songs headings (the queue order matches the grouping,
// since tracks arrive pre-sorted OP → ED → IN).
function musicRenderList(container, tracks, grouped) {
    const renderId = ++musicRenderSeq;
    const playable = tracks.filter(t => t.src);
    const qidxOf = new Map();
    playable.forEach((t, i) => qidxOf.set(t, i));
    let html = '';
    if (grouped) {
        [['OP', 'Openings'], ['ED', 'Endings'], ['IN', 'Insert Songs']].forEach(([kind, label]) => {
            const rows = tracks.filter(t => t.kind === kind);
            if (!rows.length) return;
            html += `<div class="music-group-head">${label}</div>`;
            rows.forEach(t => { html += musicRowHtml(t, t.src ? qidxOf.get(t) : -1, renderId); });
        });
    } else {
        tracks.forEach(t => { html += musicRowHtml(t, t.src ? qidxOf.get(t) : -1, renderId); });
    }
    container.innerHTML = html;
    container.querySelectorAll('.music-play-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const qi = parseInt(btn.dataset.qidx, 10);
            if (musicOwner && musicOwner.kind === 'list' && musicOwner.renderId === renderId && qi === musicIndex) {
                musicTogglePlay();
            } else {
                musicPlayQueue(playable, qi, { kind: 'list', renderId: renderId });
            }
        });
    });
    return renderId;
}

// ---------- search ----------

let musicSearchSeq = 0;

function musicDoSearch() {
    const input = document.getElementById('music-search-input');
    const status = document.getElementById('music-search-status');
    const results = document.getElementById('music-search-results');
    if (!input || !results) return;
    const q = (input.value || '').trim();
    if (!q) {
        if (status) status.textContent = '';
        results.innerHTML = '';
        return;
    }
    const seq = ++musicSearchSeq;
    const cacheKey = 'search:' + q.toLowerCase();
    const cached = musicCacheGet(cacheKey);
    if (cached) {
        if (status) status.textContent = cached.length ? '' : 'No songs found for that title.';
        musicRenderList(results, cached, true);
        return;
    }
    if (status) status.textContent = 'Searching…';
    musicDbPost('/search_request', {
        anime_search_filter: { search: q, partial_match: true, match_case: false },
        and_logic: true,
        ignore_duplicate: true
    }).then(list => {
        if (seq !== musicSearchSeq) return;
        const tracks = musicProcessEntries(Array.isArray(list) ? list : []);
        musicCacheSet(cacheKey, tracks);
        if (status) status.textContent = tracks.length ? '' : 'No songs found for that title.';
        musicRenderList(results, tracks, true);
    }).catch(() => {
        if (seq !== musicSearchSeq) return;
        if (status) status.textContent = 'Could not load songs right now. Please try again.';
    });
}

// ---------- this season ----------

let musicSeasonLoaded = false;
let musicSeasonLoading = false;

function musicOnShow() { musicLoadSeason(); }

function musicLoadSeason() {
    if (musicSeasonLoaded || musicSeasonLoading) return;
    const list = document.getElementById('music-season-list');
    const status = document.getElementById('music-season-status');
    const nameEl = document.getElementById('music-season-name');
    if (!list) return;
    musicSeasonLoading = true;
    if (status) status.textContent = 'Loading this season\'s songs…';
    const finish = (season, tracks) => {
        musicSeasonLoading = false;
        musicSeasonLoaded = true;
        if (nameEl) nameEl.textContent = '— ' + musicSeasonKey(season);
        if (status) status.textContent = tracks.length ? '' : 'No songs found for this season yet.';
        const shown = tracks.slice(0, MUSIC_SEASON_CAP);
        musicRenderList(list, shown, false);
        if (tracks.length > shown.length) {
            const note = document.createElement('div');
            note.className = 'music-note';
            note.textContent = `Showing the first ${shown.length} of ${tracks.length} songs.`;
            list.appendChild(note);
        }
    };
    const fail = () => {
        musicSeasonLoading = false;
        if (status) status.textContent = 'Could not load this season\'s songs right now.';
    };
    // The newest season's songs can lag a few weeks in the
    // database; when the current season comes back empty,
    // step back season by season (at most 4) to the most
    // recent season that has songs, and label it honestly.
    const attempt = (season, triesLeft) => {
        const cacheKey = 'season:' + musicSeasonKey(season);
        const cached = musicCacheGet(cacheKey);
        if (cached !== null) {
            if (cached.length || triesLeft <= 0) { finish(season, cached); return; }
            attempt(musicPrevSeason(season), triesLeft - 1);
            return;
        }
        musicDbPost('/season_request', { season: musicSeasonKey(season) })
            .then(list => {
                const tracks = musicProcessEntries(Array.isArray(list) ? list : []);
                musicCacheSet(cacheKey, tracks);
                if (tracks.length || triesLeft <= 0) { finish(season, tracks); return; }
                attempt(musicPrevSeason(season), triesLeft - 1);
            })
            .catch(fail);
    };
    attempt(musicCurrentSeason(), 4);
}

// ---------- anime-page themes → audio queue ----------

// Queue = the block's themes that carry an audio file, in
// row order; idxMap maps a queue index back to its theme
// row index for highlighting. Tapping 🎧 on the track that
// is already current toggles pause instead of restarting.
function musicPlayThemesQueue(block, idx) {
    const themes = (block && block._themesList) || [];
    const playable = [];
    const idxMap = [];
    themes.forEach((t, i) => {
        if (t && t.audio) {
            playable.push({
                title: t.title || (t.type === 'OP' ? 'Opening theme' : 'Ending theme'),
                anime: block._themesAnimeTitle || '',
                artist: (t.artists || []).join(', '),
                src: t.audio
            });
            idxMap.push(i);
        }
    });
    const start = idxMap.indexOf(idx);
    if (start < 0) return;
    if (musicOwner && musicOwner.kind === 'themes' && musicOwner.block === block && musicOwner.idxMap[musicIndex] === idx) {
        musicTogglePlay();
        return;
    }
    musicPlayQueue(playable, start, { kind: 'themes', block: block, idxMap: idxMap });
}

// ---------- navigation ----------

// Mirror of the base switcher's chrome management for the
// one screen it doesn't know about: hide every screen,
// restore every nav button except Music's own, hide the
// Jump-to-Today shortcut, drop the Backlog theme, retitle
// the header. Leaving the anime page goes through the
// page's own hide (pauses its videos, restores chrome).
function musicShowScreen() {
    try { if (typeof stopLoungeListeners === 'function') stopLoungeListeners(); } catch (e) { /* silent */ }
    try { animePageHide(); } catch (e) { /* page may not be open */ }
    ['challenge-screen', 'backlog-manager-screen', 'anipace-log-screen', 'schedule-screen', 'anime-social-lounge'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    ['switch-to-challenge-btn', 'switch-to-backlog-btn', 'switch-to-anipace-btn', 'switch-to-schedule-btn', 'switch-to-lounge-btn'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.remove('hidden');
    });
    const musicBtn = document.getElementById('switch-to-music-btn');
    if (musicBtn) musicBtn.classList.add('hidden');
    const jumpBtn = document.getElementById('jump-to-today-btn');
    if (jumpBtn) jumpBtn.classList.add('hidden');
    try { animePageInstantTheme(); } catch (e) { /* never break navigation */ }
    document.body.classList.remove('backlog-active');
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = 'Music';
    const screen = document.getElementById('music-screen');
    if (screen) screen.classList.remove('hidden');
    window.scrollTo(0, 0);
    musicOnShow();
}

// Chain onto the (already wrapped) screen switcher: the
// Music screen is ours to show/hide; every other target
// delegates untouched after the Music screen is put away.
if (typeof window.switchToScreen === 'function') {
    const musicPrevSwitchToScreen = window.switchToScreen;
    window.switchToScreen = function(screenId) {
        if (screenId === 'music') { musicShowScreen(); return; }
        const screen = document.getElementById('music-screen');
        if (screen) screen.classList.add('hidden');
        const musicBtn = document.getElementById('switch-to-music-btn');
        if (musicBtn) musicBtn.classList.remove('hidden');
        return musicPrevSwitchToScreen.apply(this, arguments);
    };
}

// ---------- never two sounds at once ----------

// A theme video (or the trailer) starting pauses the music.
if (typeof themesTogglePlay === 'function') {
    const musicPrevThemesTogglePlay = themesTogglePlay;
    themesTogglePlay = function(block, idx) {
        const result = musicPrevThemesTogglePlay.apply(this, arguments);
        try { if (block && block.querySelector('video')) musicPauseAudio(); } catch (e) { /* silent */ }
        return result;
    };
}
if (typeof window.playTrailer === 'function') {
    const musicPrevPlayTrailer = window.playTrailer;
    window.playTrailer = function() {
        try { musicPauseAudio(); } catch (e) { /* silent */ }
        return musicPrevPlayTrailer.apply(this, arguments);
    };
}

// ---------- init ----------

(function musicInit() {
    const navBtn = document.getElementById('switch-to-music-btn');
    if (navBtn) navBtn.onclick = () => window.switchToScreen('music');
    const searchBtn = document.getElementById('music-search-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => musicDoSearch());
    const input = document.getElementById('music-search-input');
    if (input) {
        input.addEventListener('input', debounce(() => musicDoSearch(), 400));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') musicDoSearch(); });
    }
    const pp = document.getElementById('music-playpause-btn');
    if (pp) pp.addEventListener('click', () => musicTogglePlay());
    const nx = document.getElementById('music-next-btn');
    if (nx) nx.addEventListener('click', () => musicNext());
    const pv = document.getElementById('music-prev-btn');
    if (pv) pv.addEventListener('click', () => musicPrev());
    const cl = document.getElementById('music-close-btn');
    if (cl) cl.addEventListener('click', () => musicClose());
    const seek = document.getElementById('music-seek');
    if (seek) {
        seek.addEventListener('input', () => {
            musicSeeking = true;
            const a = musicAudioEl();
            const cur = document.getElementById('music-time-current');
            if (a && cur && isFinite(a.duration) && a.duration > 0) {
                cur.textContent = musicFormatTime((parseInt(seek.value, 10) / 1000) * a.duration);
            }
        });
        seek.addEventListener('change', () => {
            const a = musicAudioEl();
            if (a && isFinite(a.duration) && a.duration > 0) {
                a.currentTime = (parseInt(seek.value, 10) / 1000) * a.duration;
            }
            musicSeeking = false;
        });
    }
    const a = musicAudioEl();
    if (a) {
        a.addEventListener('play', () => {
            musicPlaying = true;
            musicUpdateBar();
            musicHighlight();
            musicPauseVideos();
        });
        a.addEventListener('pause', () => {
            musicPlaying = false;
            musicUpdateBar();
            musicHighlight();
        });
        a.addEventListener('ended', () => {
            if (musicIndex >= 0 && musicIndex < musicQueue.length - 1) {
                musicPlayAt(musicIndex + 1);
            } else {
                musicPlaying = false;
                musicUpdateBar();
                musicHighlight();
            }
        });
        a.addEventListener('error', () => {
            // A dead file link skips forward instead of
            // stranding the listener; the streak guard keeps
            // a fully-dead queue from looping.
            musicSkipOnError();
        });
        a.addEventListener('loadedmetadata', () => {
            const tot = document.getElementById('music-time-total');
            if (tot) tot.textContent = musicFormatTime(a.duration);
        });
        a.addEventListener('timeupdate', () => {
            if (musicSeeking) return;
            const cur = document.getElementById('music-time-current');
            if (cur) cur.textContent = musicFormatTime(a.currentTime);
            if (isFinite(a.duration) && a.duration > 0) {
                if (seek) seek.value = String(Math.round((a.currentTime / a.duration) * 1000));
                const tot = document.getElementById('music-time-total');
                if (tot) tot.textContent = musicFormatTime(a.duration);
            }
        });
    }
})();
// End MUSIC PLAYER
