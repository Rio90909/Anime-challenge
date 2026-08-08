// ==========================================
// LOUNGE.JS - ANIME SOCIAL LOUNGE (v2.0)
// ==========================================

// Global state for lounge
let activeChatId = null;
let chatListenerRef = null;
let friendsListenerRef = null;
let presenceListenerRef = null;
let requestsListenerRef = null;
let otherUsersProfiles = {}; // Cache of user profiles

const AVATAR_PRESETS = [
    { name: "🦊 Naruto", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Naruto" },
    { name: "👒 Luffy", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Luffy" },
    { name: "⚡ Goku", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Goku" },
    { name: "🌸 Usagi", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Usagi" },
    { name: "🎒 Deku", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Deku" }
];

const EMOJIS = ["😊", "😂", "🔥", "✨", "🍿", "🎉", "💖", "🤩", "🤔", "😭", "😤", "🌸", "🍥", "⚔️", "🦊", "👒", "⚡", "🎒", "👽", "🤖"];

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

    // Load/Display User Share Code
    const shareCodeInput = document.getElementById('user-share-code');
    if (shareCodeInput) shareCodeInput.value = uid;

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
    if (presenceListenerRef) presenceListenerRef.off();
    if (chatListenerRef) chatListenerRef.off();

    friendsListenerRef = null;
    requestsListenerRef = null;
    presenceListenerRef = null;
    chatListenerRef = null;
}

// --- PROFILE CUSTOMIZATION & PRESENCE ---
function initProfileSettings() {
    const presetContainer = document.getElementById('profile-avatar-presets');
    const customUrlInput = document.getElementById('profile-custom-avatar-url');
    const nameInput = document.getElementById('profile-display-name');
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
        };

        presetContainer.appendChild(btn);
    });

    customUrlInput.oninput = () => {
        if (customUrlInput.value.trim()) {
            presetContainer.querySelectorAll('button').forEach(b => b.style.borderColor = '#444');
            selectedAvatarUrl = customUrlInput.value.trim();
        }
    };

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
            const profileUpdate = {
                displayName: finalName,
                avatarUrl: finalAvatar,
                title: bestTitle,
                completedCount: counts.completedCount,
                totalCount: counts.totalCount
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
                        <img src="${profile.avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                        <span class="presence-dot-${friendUid}" style="position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; border-radius: 50%; background-color: var(--text-secondary); border: 1.5px solid var(--surface-color);"></span>
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 13px; color: var(--text-color);">${profile.displayName}</h4>
                        <p style="margin: 0; font-size: 10px; color: var(--text-secondary);">${profile.title}</p>
                        <span class="presence-watching-${friendUid}" style="font-size: 9px; color: var(--success-color); display: block; margin-top: 1px;"></span>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="add-btn" style="padding: 4px 10px; font-size: 11px; height: auto; margin: 0; background: var(--primary-color); color: #000;" onclick="window.startLoungeChat('${friendUid}')">Chat</button>
                    <button class="remove-btn" style="padding: 0 5px; font-size: 16px;" onclick="window.removeLoungeFriend('${friendUid}')">&times;</button>
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

    if (uids.length === 0) {
        listContainer.innerHTML = `<p class="empty-state-message" style="padding: 10px; font-size: 12px;">No incoming requests.</p>`;
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
                    <img src="${profile.avatarUrl}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <h4 style="margin: 0; font-size: 12px; color: var(--text-color);">${profile.displayName}</h4>
                        <p style="margin: 0; font-size: 9px; color: var(--text-secondary);">${profile.title}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin: 0; background: var(--success-color); color: #FFF;" onclick="window.acceptLoungeRequest('${senderUid}')">Accept</button>
                    <button class="add-btn manual-add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin: 0; border-color: var(--error-color); color: var(--error-color);" onclick="window.rejectLoungeRequest('${senderUid}')">Reject</button>
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
                        <img src="${msg.anime.imageUrl || 'https://via.placeholder.com/40x55?text=N/A'}" style="width: 40px; height: 55px; object-fit: cover; border-radius: 4px;">
                        <div style="display: flex; flex-direction: column; justify-content: space-between;">
                            <h5 style="margin: 0; font-size: 11.5px; color: var(--primary-color); font-weight: 700;">${msg.anime.title}</h5>
                            <span style="font-size: 10px; color: var(--text-secondary);">${msg.anime.type || 'TV'} • ⭐ ${msg.anime.score || 'N/A'}</span>
                        </div>
                    </div>
                `;
            } else {
                bodyHtml = `<span style="color: var(--text-color); line-height: 1.4; word-break: break-word;">${escapeHTML(msg.text || '')}</span>`;
            }

            bubbleDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <img src="${profile.avatarUrl}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: bold; font-size: 11px; color: var(--primary-color);">${profile.displayName}</span>
                    <span style="font-size: 9px; color: var(--text-secondary); margin-left: auto;">${timeStr}</span>
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
function loadLeaderboard() {
    const tbody = document.getElementById('leaderboard-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">Loading rankings...</td></tr>`;

    firebase.database().ref('leaderboard').once('value', snapshot => {
        const records = snapshot.val() || {};
        tbody.innerHTML = '';

        const sortedUsers = Object.keys(records).map(uid => ({
            uid,
            ...records[uid]
        })).sort((a, b) => {
            // Sort by completed count descending, then by XP/total
            return (b.completedCount || 0) - (a.completedCount || 0);
        });

        if (sortedUsers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">Leaderboard is currently empty. Update your profile to join!</td></tr>`;
            return;
        }

        sortedUsers.forEach((record, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid var(--border-light)";

            let rankBadge = `${index + 1}`;
            if (index === 0) rankBadge = "🏆 1";
            else if (index === 1) rankBadge = "🥈 2";
            else if (index === 2) rankBadge = "🥉 3";

            tr.innerHTML = `
                <td style="padding: 12px 8px; font-weight: bold; color: var(--primary-color);">${rankBadge}</td>
                <td style="padding: 12px 8px; display: flex; align-items: center; gap: 8px;">
                    <img src="${record.avatarUrl || 'https://via.placeholder.com/25'}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: 600;">${record.displayName || 'Guest'}</span>
                </td>
                <td style="padding: 12px 8px; color: var(--text-secondary); font-size: 12px;">${record.title || 'Newbie Tracker'}</td>
                <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: var(--success-color);">${record.completedCount || 0} Anime</td>
                <td style="padding: 12px 8px; text-align: center;">
                    <button class="add-btn manual-add-btn" style="padding: 3px 8px; font-size: 11px; height: auto; margin:0;" onclick="window.sendLoungeRequest('${record.uid}')">Add Friend</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
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

        const storageKey = 'animeDashboard_v6_combined';
        const rawLocal = localStorage.getItem(storageKey);
        let backlogArray = [];

        if (rawLocal) {
            try {
                const parsed = JSON.parse(rawLocal);
                backlogArray = parsed.backlog || [];
            } catch(e) {}
        }

        if (backlogArray.length === 0) {
            showToast("Your Backlog list is empty! Add anime to Backlog first.", "error");
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
                        type: 'TV Series',
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

// --- GLOBAL ATTACHMENTS TO WINDOW (FOR INLINE ACTIONS) ---
window.sendLoungeRequest = function(recipientUid) {
    const user = firebase.auth().currentUser;
    if (!user) {
        showToast("You must log in to add friends.", "error");
        return;
    }
    if (user.uid === recipientUid) {
        showToast("You cannot send a friend request to yourself!", "error");
        return;
    }

    firebase.database().ref(`friendRequests/${recipientUid}/${user.uid}`).set(true)
        .then(() => showToast("Friend request sent successfully!"))
        .catch(err => showToast(err.message, "error"));
};

window.acceptLoungeRequest = function(senderUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    // Only write to nodes we have write permissions for (our own friends list and our incoming requests)
    const updates = {};
    updates[`friends/${user.uid}/${senderUid}`] = true;
    updates[`friendRequests/${user.uid}/${senderUid}`] = null;

    firebase.database().ref().update(updates)
        .then(() => {
            showToast("Friend request accepted!");
        })
        .catch(err => showToast(err.message, "error"));
};

window.rejectLoungeRequest = function(senderUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    firebase.database().ref(`friendRequests/${user.uid}/${senderUid}`).remove()
        .then(() => showToast("Friend request rejected."))
        .catch(err => showToast(err.message, "error"));
};

window.removeLoungeFriend = function(friendUid) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    if (confirm("Are you sure you want to remove this friend?")) {
        // Only write to friends node we have permission for (our own friends list)
        const updates = {};
        updates[`friends/${user.uid}/${friendUid}`] = null;

        firebase.database().ref().update(updates)
            .then(() => {
                showToast("Friend removed.");
                if (activeChatId && activeChatId.includes(friendUid)) {
                    document.getElementById('dm-input-area')?.classList.add('hidden');
                    document.getElementById('dm-friend-name').textContent = 'No Active Chat';
                    document.getElementById('dm-messages-container').innerHTML = `<p class="empty-state-message" style="margin: auto; font-size: 12px;">No active chat session selected.</p>`;
                }
            })
            .catch(err => showToast(err.message, "error"));
    }
};

window.startLoungeChat = function(friendUid) {
    startChat(friendUid);
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

// Clean up listeners when screen is switched away
const originalSwitchToScreen = window.switchToScreen;
window.switchToScreen = function(screenId) {
    if (screenId !== 'lounge') {
        stopLoungeListeners();
    }
    originalSwitchToScreen(screenId);
};

// Initialize everything on module load
document.addEventListener('DOMContentLoaded', () => {
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
            showToast("Share Code copied to clipboard!");
        };
    }

    // Add friend click handler
    const addFriendBtn = document.getElementById('send-friend-request-btn');
    const searchInput = document.getElementById('friend-search-input');
    if (addFriendBtn && searchInput) {
        addFriendBtn.onclick = () => {
            const val = searchInput.value.trim();
            if (val) {
                window.sendLoungeRequest(val);
                searchInput.value = '';
            } else {
                showToast("Please paste a friend's Share Code.", "error");
            }
        };
    }
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
