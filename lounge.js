/**
 * lounge.js - Anime Social Lounge (v2.0)
 * Handles modular Profile Settings, Friend Requests, Direct Messaging (DMs), Live Presence,
 * Binge Planner utilities, and Global Leaderboard integrations cleanly using Firebase.
 */

// Global state for Social Lounge
let activeChatFriendUid = null;
let activeChatListener = null;
let globalFriendsListener = null;
let globalRequestsListener = null;
let globalLeaderboardListener = null;
let presenceIntervalId = null;

// Preset SVG Avatars mapping
const AVATAR_PRESETS = {
    red: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23FF5733'/><text x='50' y='65' font-size='40' font-family='Arial' font-weight='bold' text-anchor='middle' fill='white'>A</text></svg>",
    green: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2333FF57'/><text x='50' y='65' font-size='40' font-family='Arial' font-weight='bold' text-anchor='middle' fill='white'>B</text></svg>",
    blue: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%233357FF'/><text x='50' y='65' font-size='40' font-family='Arial' font-weight='bold' text-anchor='middle' fill='white'>C</text></svg>",
    yellow: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23F1C40F'/><text x='50' y='65' font-size='40' font-family='Arial' font-weight='bold' text-anchor='middle' fill='white'>D</text></svg>",
    purple: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%239B59B6'/><text x='50' y='65' font-size='40' font-family='Arial' font-weight='bold' text-anchor='middle' fill='white'>E</text></svg>"
};

// Achievement title mapping
const ACHIEVEMENT_TITLES = {
    'total_1': 'First Step Otaku',
    'total_10': 'Novice Collector',
    'total_25': 'Anime Journeyman',
    'total_50': 'Binge King',
    'total_100': 'Isekai Master',
    'completionist': 'Completionist Sage',
    'streak_7': 'Consistency Legend'
};

// Selected avatar variable (tracks custom URL or preset ID)
let selectedAvatarId = 'red';

// Custom Toast notification system
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert ${type}`;

    let emoji = '🔔';
    if (type === 'success') emoji = '✨';
    if (type === 'dm') emoji = '💬';

    toast.innerHTML = `<span style="font-size: 16px;">${emoji}</span> <span style="flex: 1;">${message}</span>`;
    container.appendChild(toast);

    // Fade out and remove toast after 4s
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

// Generate fallback / default username
function generateDefaultDisplayName(uid) {
    if (!uid) return 'Otaku_Anon';
    const shortened = uid.substring(0, 5).toUpperCase();
    return `Otaku_#${shortened}`;
}

// Map a profile node to an avatar URL (handling presets vs custom URLs)
function getAvatarUrl(profile) {
    if (profile && profile.customAvatarUrl && profile.customAvatarUrl.trim()) {
        return profile.customAvatarUrl.trim();
    }
    const id = (profile && profile.avatarId) || 'red';
    return AVATAR_PRESETS[id] || AVATAR_PRESETS['red'];
}

// Determine unlocked titles based on local achievements
function getUnlockedTitles() {
    const unlocked = ['Newbie'];
    if (challengeData && challengeData.unlockedAchievements) {
        challengeData.unlockedAchievements.forEach(achId => {
            if (ACHIEVEMENT_TITLES[achId]) {
                unlocked.push(ACHIEVEMENT_TITLES[achId]);
            }
        });
    }
    return unlocked;
}

// Populate the Profile Titles Drop-down dynamically
function populateTitleDropdown() {
    const titleSelect = document.getElementById('profile-title-select');
    if (!titleSelect) return;

    const unlocked = getUnlockedTitles();
    const currentValue = titleSelect.value || 'Newbie';

    titleSelect.innerHTML = '';
    unlocked.forEach(title => {
        const option = document.createElement('option');
        option.value = title;
        option.textContent = title;
        titleSelect.appendChild(option);
    });

    // Attempt to retain previous selected title if it is still unlocked
    if (unlocked.includes(currentValue)) {
        titleSelect.value = currentValue;
    }
}

// Lazy loaded social lounge initialisation on tab click
function onSocialLoungeOpened() {
    console.log("Anime Social Lounge opened - lazy loading real-time listeners...");

    // Bind UI tabs
    const friendsTabBtn = document.getElementById('lounge-friends-tab-btn');
    const requestsTabBtn = document.getElementById('lounge-requests-tab-btn');
    const friendsView = document.getElementById('lounge-friends-view');
    const requestsView = document.getElementById('lounge-requests-view');

    friendsTabBtn.onclick = () => {
        friendsTabBtn.classList.add('active');
        requestsTabBtn.classList.remove('active');
        friendsTabBtn.style.borderBottomColor = 'var(--primary-color)';
        requestsTabBtn.style.borderBottomColor = 'transparent';
        friendsView.classList.remove('hidden');
        requestsView.classList.add('hidden');
    };

    requestsTabBtn.onclick = () => {
        requestsTabBtn.classList.add('active');
        friendsTabBtn.classList.remove('active');
        requestsTabBtn.style.borderBottomColor = 'var(--primary-color)';
        friendsTabBtn.style.borderBottomColor = 'transparent';
        requestsView.classList.remove('hidden');
        friendsView.classList.add('hidden');
    };

    // Populate user's profile settings controls
    populateTitleDropdown();
    loadUserProfileInputs();

    // Check Firebase authentication state
    const user = firebase.auth().currentUser;
    if (!user) {
        // Fallback to offline warning
        document.getElementById('user-active-presence').textContent = "🔴 Offline (Local Mode)";
        document.getElementById('your-share-code-v2').textContent = "Sign in to get code";
        document.getElementById('lounge-friends-loading').classList.add('hidden');
        document.getElementById('lounge-friends-empty').classList.remove('hidden');
        document.getElementById('leaderboard-loading-v2').classList.add('hidden');
        document.getElementById('leaderboard-container-v2').innerHTML = `<div class="empty-state-message">Sign in to sync database features and view the live Leaderboard!</div>`;
        document.getElementById('leaderboard-container-v2').classList.remove('hidden');
        return;
    }

    // Set online indicators
    document.getElementById('user-active-presence').textContent = "🟢 Online";
    document.getElementById('user-active-presence').style.color = "var(--success-color)";
    document.getElementById('your-share-code-v2').textContent = user.uid;

    // Start Presence tracking
    startPresenceTracking(user.uid);

    // Start real-time sync listeners
    syncFriendsList(user.uid);
    syncFriendRequests(user.uid);
    syncGlobalLeaderboard();
}

// Bind avatar selector clickable options inside Profile Settings block
function initAvatarSelectors() {
    const presets = document.querySelectorAll('.avatar-preset');
    const customUrlInput = document.getElementById('profile-custom-avatar');

    presets.forEach(preset => {
        preset.onclick = () => {
            presets.forEach(p => p.style.borderColor = 'transparent');
            preset.style.borderColor = 'var(--primary-color)';
            selectedAvatarId = preset.getAttribute('data-avatar-id');
            customUrlInput.value = ''; // Clear custom url if preset selected
        };
    });

    customUrlInput.oninput = () => {
        if (customUrlInput.value.trim() !== '') {
            presets.forEach(p => p.style.borderColor = 'transparent');
            selectedAvatarId = ''; // Custom avatar selected
        }
    };
}

// Load current user profile details into input boxes
function loadUserProfileInputs() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    firebase.database().ref(`users/${user.uid}/profile`).once('value').then(snap => {
        const profile = snap.val();
        if (profile) {
            document.getElementById('profile-display-name').value = profile.displayName || '';
            document.getElementById('profile-title-select').value = profile.selectedTitle || 'Newbie';
            document.getElementById('profile-custom-avatar').value = profile.customAvatarUrl || '';

            // Set active preset
            const presets = document.querySelectorAll('.avatar-preset');
            presets.forEach(p => p.style.borderColor = 'transparent');

            if (profile.customAvatarUrl) {
                selectedAvatarId = '';
            } else {
                selectedAvatarId = profile.avatarId || 'red';
                const activePreset = document.querySelector(`.avatar-preset[data-avatar-id="${selectedAvatarId}"]`);
                if (activePreset) {
                    activePreset.style.borderColor = 'var(--primary-color)';
                }
            }
            updateLoungeProfileBadge(profile);
        } else {
            // First time load fallback
            const defaultName = generateDefaultDisplayName(user.uid);
            document.getElementById('profile-display-name').value = defaultName;
            updateLoungeProfileBadge({
                displayName: defaultName,
                avatarId: 'red',
                selectedTitle: 'Newbie'
            });
        }
    });
}

// Update the Profile Badge at the top of Social Lounge
function updateLoungeProfileBadge(profile) {
    const nameEl = document.getElementById('lounge-user-name');
    const titleEl = document.getElementById('lounge-user-title');
    const avatarEl = document.getElementById('lounge-user-avatar');
    const statusEl = document.getElementById('lounge-watching-status');

    if (nameEl) nameEl.textContent = profile.displayName || 'Guest';
    if (titleEl) titleEl.textContent = profile.selectedTitle || 'Newbie';
    if (avatarEl) avatarEl.src = getAvatarUrl(profile);

    // Get last logged watching status
    const unique = typeof getUniqueAnime === 'function' ? getUniqueAnime() : [];
    const lastWatched = unique.length > 0 ? getEnglishTitle(unique[unique.length - 1]) : 'None';
    if (statusEl) statusEl.textContent = lastWatched;
}

// Start tracking current user's live presence & last active status
function startPresenceTracking(uid) {
    if (presenceIntervalId) clearInterval(presenceIntervalId);

    const updatePresenceNode = () => {
        const unique = typeof getUniqueAnime === 'function' ? getUniqueAnime() : [];
        const lastWatched = unique.length > 0 ? getEnglishTitle(unique[unique.length - 1]) : 'None';
        const dispNameInput = document.getElementById('profile-display-name');
        const displayName = (dispNameInput && dispNameInput.value.trim()) || generateDefaultDisplayName(uid);
        const titleSelect = document.getElementById('profile-title-select');
        const selectedTitle = (titleSelect && titleSelect.value) || 'Newbie';
        const customUrl = document.getElementById('profile-custom-avatar').value.trim();

        const profileData = {
            displayName: displayName,
            avatarId: selectedAvatarId,
            customAvatarUrl: customUrl,
            selectedTitle: selectedTitle,
            lastActive: Date.now(),
            currentlyWatching: lastWatched
        };

        // Write to user profile node
        firebase.database().ref(`users/${uid}/profile`).set(profileData).catch(err => console.error(err));

        // Write to leaderboard node for instant live stats
        firebase.database().ref(`leaderboard/${uid}`).set({
            uid: uid,
            displayName: displayName,
            avatarId: selectedAvatarId,
            customAvatarUrl: customUrl,
            selectedTitle: selectedTitle,
            challengeCount: (typeof getChallengeAnime === 'function') ? getChallengeAnime().length : 0,
            unlockedAchievementsCount: (challengeData && challengeData.unlockedAchievements) ? challengeData.unlockedAchievements.length : 0,
            lastActive: Date.now(),
            currentlyWatching: lastWatched
        }).catch(err => console.error(err));
    };

    updatePresenceNode();
    // Update every 2 minutes
    presenceIntervalId = setInterval(updatePresenceNode, 2 * 60 * 1000);
}

// Global leaderboard rendering
function syncGlobalLeaderboard() {
    const loadingEl = document.getElementById('leaderboard-loading-v2');
    const containerEl = document.getElementById('leaderboard-container-v2');

    if (globalLeaderboardListener) {
        firebase.database().ref('leaderboard').off('value', globalLeaderboardListener);
    }

    globalLeaderboardListener = firebase.database().ref('leaderboard').orderByChild('challengeCount').on('value', snap => {
        loadingEl.classList.add('hidden');
        containerEl.classList.remove('hidden');
        containerEl.innerHTML = '';

        let rankings = [];
        snap.forEach(child => {
            rankings.push(child.val());
        });

        // Reverse rankings because orderByChild sorts in ascending order
        rankings.reverse();

        // Slice top 10
        const top10 = rankings.slice(0, 10);

        if (top10.length === 0) {
            containerEl.innerHTML = `<div class="empty-state-message">No standings on the leaderboard yet! Make sure you are signed in to be listed.</div>`;
            return;
        }

        top10.forEach((row, index) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = `leaderboard-row rank-${index + 1}`;

            const avatarUrl = getAvatarUrl({
                avatarId: row.avatarId,
                customAvatarUrl: row.customAvatarUrl
            });

            // Online status indicator inside leaderboard
            const isOnline = (Date.now() - row.lastActive) <= 5 * 60 * 1000;
            const presenceDot = isOnline ? `<span style="color:var(--success-color); font-size:11px; margin-left:5px;">🟢</span>` : '';

            rowDiv.innerHTML = `
                <div class="leaderboard-user-info">
                    <span class="leaderboard-rank">${index + 1}</span>
                    <img src="${avatarUrl}" class="leaderboard-avatar" alt="User avatar">
                    <div>
                        <div style="display:flex; align-items:center;">
                            <span class="leaderboard-username">${row.displayName || 'Unknown'}</span>
                            ${presenceDot}
                            <span class="leaderboard-title-badge">${row.selectedTitle || 'Newbie'}</span>
                        </div>
                        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">
                            Watching: ${row.currentlyWatching || 'None'}
                        </div>
                    </div>
                </div>
                <div class="leaderboard-score-info">
                    <strong style="color:var(--primary-color); font-size:15px;">${row.challengeCount || 0}</strong> Anime
                    <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">
                        ${row.unlockedAchievementsCount || 0} Achievements
                    </div>
                </div>
            `;
            containerEl.appendChild(rowDiv);
        });
    }, err => {
        console.error("Leaderboard Sync failed:", err);
    });
}

// Send Friend Request Handler
document.getElementById('send-request-btn-v2').onclick = () => {
    const inputField = document.getElementById('friend-request-input-v2');
    const friendUid = inputField.value.trim();
    const currentUser = firebase.auth().currentUser;

    if (!currentUser) {
        showToast('Please sign in to send friend requests.', 'error');
        return;
    }
    if (!friendUid) {
        showToast('Please enter a valid share code.', 'error');
        return;
    }
    if (friendUid === currentUser.uid) {
        showToast('You cannot add your own share code!', 'error');
        return;
    }

    // Verify recipient profile exists first
    firebase.database().ref(`users/${friendUid}/profile`).once('value').then(snap => {
        if (!snap.exists()) {
            showToast('Invalid share code! User profile not found.', 'error');
            return;
        }

        // Check if already friends
        firebase.database().ref(`users/${currentUser.uid}/friends/${friendUid}`).once('value').then(friendSnap => {
            if (friendSnap.exists()) {
                showToast('You are already friends with this user!', 'error');
                return;
            }

            // Get sender profile to embed in friend request
            firebase.database().ref(`users/${currentUser.uid}/profile`).once('value').then(senderProfileSnap => {
                const profile = senderProfileSnap.val() || {};
                const senderName = profile.displayName || generateDefaultDisplayName(currentUser.uid);
                const avatarId = profile.avatarId || 'red';
                const customAvatarUrl = profile.customAvatarUrl || '';
                const selectedTitle = profile.selectedTitle || 'Newbie';

                // Send request
                firebase.database().ref(`friendRequests/${friendUid}/${currentUser.uid}`).set({
                    senderUid: currentUser.uid,
                    senderName: senderName,
                    avatarId: avatarId,
                    customAvatarUrl: customAvatarUrl,
                    selectedTitle: selectedTitle,
                    timestamp: Date.now()
                }).then(() => {
                    showToast('Friend request sent successfully!', 'success');
                    inputField.value = '';
                }).catch(err => {
                    console.error(err);
                    showToast('Failed to send request. Check database rules.', 'error');
                });
            });
        });
    });
};

// Sync Friend Requests in Real-Time
function syncFriendRequests(uid) {
    const loadingEl = document.getElementById('lounge-requests-loading');
    const listEl = document.getElementById('lounge-requests-list');
    const emptyEl = document.getElementById('lounge-requests-empty');
    const badgeEl = document.getElementById('requests-count-badge');

    if (globalRequestsListener) {
        firebase.database().ref(`friendRequests/${uid}`).off('value', globalRequestsListener);
    }

    globalRequestsListener = firebase.database().ref(`friendRequests/${uid}`).on('value', snap => {
        loadingEl.classList.add('hidden');
        listEl.innerHTML = '';

        const requests = [];
        snap.forEach(child => {
            requests.push(child.val());
        });

        // Set requests count badge
        if (requests.length > 0) {
            badgeEl.textContent = requests.length;
            badgeEl.classList.remove('hidden');
            emptyEl.classList.add('hidden');
        } else {
            badgeEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
        }

        requests.forEach(req => {
            const reqDiv = document.createElement('div');
            reqDiv.className = 'friend-item-row';

            const avatarUrl = getAvatarUrl({
                avatarId: req.avatarId,
                customAvatarUrl: req.customAvatarUrl
            });

            reqDiv.innerHTML = `
                <div class="friend-item-left">
                    <img src="${avatarUrl}" class="friend-item-avatar" alt="Sender avatar">
                    <div class="friend-info-block">
                        <div class="friend-name-text">${req.senderName}</div>
                        <div class="friend-title-text">${req.selectedTitle || 'Newbie'}</div>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="add-btn accept-req-btn" data-sender-uid="${req.senderUid}" style="height:32px; padding:0 12px; margin:0; font-size:12px; width:auto;">Accept</button>
                    <button class="manual-add-btn reject-req-btn" data-sender-uid="${req.senderUid}" style="height:32px; padding:0 12px; margin:0; font-size:12px; width:auto; border-color:var(--error-color); color:var(--error-color);">Reject</button>
                </div>
            `;

            // Attach Click handlers
            reqDiv.querySelector('.accept-req-btn').onclick = () => acceptFriendRequest(uid, req);
            reqDiv.querySelector('.reject-req-btn').onclick = () => rejectFriendRequest(uid, req.senderUid);

            listEl.appendChild(reqDiv);
        });
    });
}

// Accept Friend Request logic
function acceptFriendRequest(myUid, request) {
    const friendUid = request.senderUid;

    // Add friend link to my friends list
    const myFriendsRef = firebase.database().ref(`users/${myUid}/friends/${friendUid}`);
    const friendFriendsRef = firebase.database().ref(`users/${friendUid}/friends/${myUid}`);

    const friendData = {
        uid: friendUid,
        addedAt: Date.now()
    };

    const myData = {
        uid: myUid,
        addedAt: Date.now()
    };

    Promise.all([
        myFriendsRef.set(friendData),
        friendFriendsRef.set(myData),
        firebase.database().ref(`friendRequests/${myUid}/${friendUid}`).remove()
    ]).then(() => {
        showToast(`Accepted friend request from ${request.senderName}!`, 'success');
    }).catch(err => {
        console.error(err);
        showToast('Failed to accept request.', 'error');
    });
}

// Reject Friend Request logic
function rejectFriendRequest(myUid, senderUid) {
    firebase.database().ref(`friendRequests/${myUid}/${senderUid}`).remove().then(() => {
        showToast('Friend request rejected.', 'info');
    }).catch(err => {
        console.error(err);
        showToast('Failed to reject request.', 'error');
    });
}

// Sync Friend list and display
function syncFriendsList(uid) {
    const loadingEl = document.getElementById('lounge-friends-loading');
    const listEl = document.getElementById('lounge-friends-list');
    const emptyEl = document.getElementById('lounge-friends-empty');
    const countBadge = document.getElementById('friends-count-badge');

    if (globalFriendsListener) {
        firebase.database().ref(`users/${uid}/friends`).off('value', globalFriendsListener);
    }

    globalFriendsListener = firebase.database().ref(`users/${uid}/friends`).on('value', snap => {
        loadingEl.classList.add('hidden');
        listEl.innerHTML = '';

        const friendsKeys = [];
        snap.forEach(child => {
            friendsKeys.push(child.val().uid);
        });

        countBadge.textContent = friendsKeys.length;

        if (friendsKeys.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');

        // Retrieve each friend profile
        friendsKeys.forEach(fUid => {
            firebase.database().ref(`users/${fUid}/profile`).once('value').then(profileSnap => {
                const profile = profileSnap.val();
                if (!profile) return;

                const friendRow = document.createElement('div');
                friendRow.className = 'friend-item-row';

                const avatarUrl = getAvatarUrl(profile);
                const isOnline = (Date.now() - profile.lastActive) <= 5 * 60 * 1000;
                const presenceClass = isOnline ? '' : 'offline';
                const statusDot = `<div class="friend-presence-dot ${presenceClass}"></div>`;

                friendRow.innerHTML = `
                    <div class="friend-item-left">
                        <div style="position:relative;">
                            <img src="${avatarUrl}" class="friend-item-avatar" alt="Friend avatar">
                            ${statusDot}
                        </div>
                        <div class="friend-info-block">
                            <div class="friend-name-text">${profile.displayName || 'Friend'}</div>
                            <div class="friend-title-text">${profile.selectedTitle || 'Newbie'}</div>
                            <div class="friend-watching-text">Watching: <span style="color:var(--text-color); font-weight:500;">${profile.currentlyWatching || 'None'}</span></div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="add-btn chat-friend-btn" style="height:32px; padding:0 12px; margin:0; font-size:12px; width:auto;">Chat</button>
                        <button class="manual-add-btn compare-friend-btn" style="height:32px; padding:0 12px; margin:0; font-size:12px; width:auto; border-color:var(--primary-color); color:var(--primary-color);">Compare</button>
                    </div>
                `;

                // Chat click action
                friendRow.querySelector('.chat-friend-btn').onclick = () => openChatWindow(fUid, profile);

                // Compare click action (reusing standard layout / side-by-side watches)
                friendRow.querySelector('.compare-friend-btn').onclick = () => openFriendComparison(fUid, profile);

                listEl.appendChild(friendRow);
            });
        });
    });
}

// 1-on-1 Direct Messaging (DMs) - Open Chat Window
function openChatWindow(friendUid, profile) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    activeChatFriendUid = friendUid;

    // Hide default text, show DM Box
    document.getElementById('lounge-dm-closed').classList.add('hidden');
    const dmBox = document.getElementById('lounge-dm-box');
    dmBox.classList.remove('hidden');

    // Set Chat Header
    document.getElementById('chat-friend-name').textContent = profile.displayName || 'Friend';
    document.getElementById('chat-friend-title').textContent = profile.selectedTitle || 'Newbie';

    const avatarEl = document.getElementById('chat-friend-avatar');
    avatarEl.src = getAvatarUrl(profile);
    avatarEl.style.display = 'block';

    const onlineIndicator = document.getElementById('chat-friend-online');
    const isOnline = (Date.now() - profile.lastActive) <= 5 * 60 * 1000;
    if (isOnline) {
        onlineIndicator.classList.remove('hidden');
    } else {
        onlineIndicator.classList.add('hidden');
    }

    // Determine combined chat room ID
    const combinedId = user.uid < friendUid ? `${user.uid}_${friendUid}` : `${friendUid}_${user.uid}`;

    // Establish real-time database DM listener
    const chatContainer = document.getElementById('chat-messages-container');
    chatContainer.innerHTML = '<div class="empty-state-message" style="margin:auto;">Loading messages...</div>';

    if (activeChatListener) {
        firebase.database().ref(`chats/${combinedId}`).off('value', activeChatListener);
    }

    activeChatListener = firebase.database().ref(`chats/${combinedId}`).on('value', snap => {
        chatContainer.innerHTML = '';
        const messages = [];
        snap.forEach(child => {
            messages.push(child.val());
        });

        if (messages.length === 0) {
            chatContainer.innerHTML = '<div class="empty-state-message" style="margin:auto;">Send a friendly message to start the conversation!</div>';
            return;
        }

        messages.forEach(msg => {
            const bubble = document.createElement('div');
            const isMe = msg.senderUid === user.uid;
            bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;

            const dateStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let embedHtml = '';
            if (msg.embed) {
                embedHtml = `
                    <div class="chat-shared-card">
                        <img src="${msg.embed.image || ''}" class="chat-shared-img" alt="Embed cover">
                        <div class="chat-shared-info">
                            <h4 class="chat-shared-title">${msg.embed.title}</h4>
                            <p class="chat-shared-episodes">${msg.embed.episodesCount}</p>
                        </div>
                    </div>
                `;
            }

            bubble.innerHTML = `
                <img src="${msg.senderAvatar}" class="chat-bubble-avatar" alt="Sender avatar">
                <div class="chat-bubble-content">
                    <div style="font-size:10px; opacity:0.6; margin-bottom:2px; font-weight:bold;">${msg.senderName}</div>
                    <div>${msg.text}</div>
                    ${embedHtml}
                    <div class="chat-bubble-time">${dateStr}</div>
                </div>
            `;
            chatContainer.appendChild(bubble);
        });

        // Auto Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

// Close DM Chat Window button action
document.getElementById('close-chat-btn').onclick = () => {
    document.getElementById('lounge-dm-closed').classList.remove('hidden');
    document.getElementById('lounge-dm-box').classList.add('hidden');

    const user = firebase.auth().currentUser;
    if (user && activeChatFriendUid) {
        const combinedId = user.uid < activeChatFriendUid ? `${user.uid}_${activeChatFriendUid}` : `${activeChatFriendUid}_${user.uid}`;
        firebase.database().ref(`chats/${combinedId}`).off('value', activeChatListener);
    }

    activeChatFriendUid = null;
    activeChatListener = null;
};

// Send direct message action
function sendChatMessage(text = '', embed = null) {
    const user = firebase.auth().currentUser;
    const inputField = document.getElementById('chat-message-input');

    if (!user || !activeChatFriendUid) return;

    const msgText = text ? text : inputField.value.trim();
    if (!msgText && !embed) return;

    const combinedId = user.uid < activeChatFriendUid ? `${user.uid}_${activeChatFriendUid}` : `${activeChatFriendUid}_${user.uid}`;

    // Get my profile details
    firebase.database().ref(`users/${user.uid}/profile`).once('value').then(profileSnap => {
        const profile = profileSnap.val() || {};
        const myName = profile.displayName || generateDefaultDisplayName(user.uid);
        const myAvatar = getAvatarUrl(profile);

        const msgData = {
            senderUid: user.uid,
            senderName: myName,
            senderAvatar: myAvatar,
            text: msgText,
            timestamp: Date.now()
        };

        if (embed) {
            msgData.embed = embed;
        }

        firebase.database().ref(`chats/${combinedId}`).push(msgData).then(() => {
            if (!text) inputField.value = ''; // Reset input only if text came from field

            // Increment friend online watching activity indicator or notifications
            firebase.database().ref(`users/${activeChatFriendUid}/profile`).once('value').then(friendProfileSnap => {
                const friendProfile = friendProfileSnap.val();
                if (friendProfile && friendProfile.displayName) {
                    console.log(`Sent message to ${friendProfile.displayName}`);
                }
            });
        }).catch(err => {
            console.error(err);
            showToast('Failed to send message. Access denied.', 'error');
        });
    });
}

// Chat Send Button trigger
document.getElementById('chat-send-btn').onclick = () => sendChatMessage();

// Input Enter Key trigger
document.getElementById('chat-message-input').onkeydown = (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
};

// Emoji Picker Popover Toggle
document.getElementById('chat-emoji-btn').onclick = (e) => {
    e.stopPropagation();
    const popover = document.getElementById('emoji-picker-popover');
    popover.classList.toggle('hidden');
};

// Hide popover clicking outside
document.addEventListener('click', () => {
    const popover = document.getElementById('emoji-picker-popover');
    if (popover) popover.classList.add('hidden');
});

// Appending Emojis into input
document.querySelectorAll('.emoji-option').forEach(emojiSpan => {
    emojiSpan.onclick = (e) => {
        e.stopPropagation();
        const inputField = document.getElementById('chat-message-input');
        inputField.value += emojiSpan.textContent;
        document.getElementById('emoji-picker-popover').classList.add('hidden');
        inputField.focus();
    };
});

// Direct Messages - Share Anime Embed feature
document.getElementById('chat-share-embed-btn').onclick = () => {
    const modal = document.getElementById('share-anime-modal');
    modal.classList.remove('hidden');

    const container = document.getElementById('share-anime-list-container');
    const emptyState = document.getElementById('share-anime-empty-state');
    container.innerHTML = '';

    const uniqueAnime = typeof getUniqueAnime === 'function' ? getUniqueAnime() : [];

    if (uniqueAnime.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    uniqueAnime.forEach(anime => {
        const row = document.createElement('div');
        row.className = 'share-anime-row';

        const title = getEnglishTitle(anime);
        const image = anime.image || anime.images?.jpg?.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150';
        const epsCount = anime.episodes ? `${anime.episodes} episodes` : 'Format: TV/Movie';

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${image}" style="width:30px; height:40px; object-fit:cover; border-radius:4px;">
                <div style="text-align:left;">
                    <div style="font-size:12px; font-weight:bold; color:var(--primary-color);">${title}</div>
                    <div style="font-size:10px; color:var(--text-secondary);">${epsCount}</div>
                </div>
            </div>
            <button class="add-btn" style="height:28px; width:auto; padding:0 10px; margin:0; font-size:11px;">Share</button>
        `;

        row.onclick = () => {
            // Close modal
            modal.classList.add('hidden');
            // Send embed
            sendChatMessage('Shared an Anime Recommendation:', {
                title: title,
                image: image,
                episodesCount: epsCount
            });
        };

        container.appendChild(row);
    });
};

// Modal Close triggers for newly created elements
document.querySelectorAll('#share-anime-modal .close-btn').forEach(btn => {
    btn.onclick = () => {
        document.getElementById('share-anime-modal').classList.add('hidden');
    };
});

// SMART BINGE PLANNER:
// Input available minutes (e.g., "120 mins"), and auto-calculate how many episodes fit from the backlog.
document.getElementById('smart-planner-calc-btn').onclick = () => {
    const minsInput = document.getElementById('smart-planner-mins');
    const availableMinutes = parseInt(minsInput.value);

    if (isNaN(availableMinutes) || availableMinutes <= 0) {
        showToast('Please enter a valid amount of minutes!', 'error');
        return;
    }

    // Retrieve backlog list
    const backlogList = (challengeData && challengeData.backlog) || [];
    const resultsContainer = document.getElementById('smart-planner-result');
    const epsCountEl = document.getElementById('smart-planner-eps-count');
    const detailsEl = document.getElementById('smart-planner-details');

    if (backlogList.length === 0) {
        showToast('Your backlog is empty! Add anime to your backlog first.', 'info');
        return;
    }

    // Average episode duration defaults to 24 minutes, playback speed is loaded from setting
    const playbackSpeed = (anipaceData && anipaceData.playbackSpeed) || 1.0;
    const standardEpisodeDuration = 24 / playbackSpeed;

    // Figure out how many fit
    let fitCount = 0;
    let totalMinutesSum = 0;

    // Loop backlog items
    for (let i = 0; i < backlogList.length; i++) {
        const item = backlogList[i];
        const episodesCount = item.episodes || 12; // default to standard 12

        for (let ep = 1; ep <= episodesCount; ep++) {
            if (totalMinutesSum + standardEpisodeDuration <= availableMinutes) {
                totalMinutesSum += standardEpisodeDuration;
                fitCount++;
            } else {
                break;
            }
        }
        if (totalMinutesSum >= availableMinutes) break;
    }

    // Percentage of backlog complete
    const totalBacklogEpisodes = backlogList.reduce((sum, item) => sum + (item.episodes || 12), 0);
    const percentage = totalBacklogEpisodes > 0 ? Math.round((fitCount / totalBacklogEpisodes) * 100) : 0;

    epsCountEl.textContent = fitCount;
    detailsEl.textContent = `This takes about ${Math.round(totalMinutesSum)} minutes of screen time and completes approx. ${percentage}% of your current backlog.`;
    resultsContainer.classList.remove('hidden');

    showToast(`Planner computed: ${fitCount} backlog episodes fit!`, 'success');
};

// Profile settings - save custom profile changes
document.getElementById('save-profile-btn').onclick = () => {
    const user = firebase.auth().currentUser;
    if (!user) {
        showToast('You must be signed in to customize your cloud profile!', 'error');
        return;
    }

    const dispName = document.getElementById('profile-display-name').value.trim();
    const titleSelect = document.getElementById('profile-title-select');
    const customUrl = document.getElementById('profile-custom-avatar').value.trim();

    const displayName = dispName ? dispName : generateDefaultDisplayName(user.uid);
    const selectedTitle = titleSelect ? titleSelect.value : 'Newbie';

    // Save profile to database
    firebase.database().ref(`users/${user.uid}/profile`).set({
        displayName: displayName,
        avatarId: selectedAvatarId,
        customAvatarUrl: customUrl,
        selectedTitle: selectedTitle,
        lastActive: Date.now()
    }).then(() => {
        showToast('Profile updated successfully!', 'success');

        // Hide settings modal
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.add('hidden');

        // Immediately sync presence and badge
        startPresenceTracking(user.uid);
        updateLoungeProfileBadge({
            displayName: displayName,
            avatarId: selectedAvatarId,
            customAvatarUrl: customUrl,
            selectedTitle: selectedTitle
        });
    }).catch(err => {
        console.error(err);
        showToast('Failed to save profile. Check security rules.', 'error');
    });
};

// Side-by-Side Friend Comparison View Modal Loader
function openFriendComparison(friendUid, friendProfile) {
    const modal = document.getElementById('comparison-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Header Text
    document.getElementById('comparison-title').textContent = `Progress Comparison`;
    document.getElementById('comp-friend-name').textContent = friendProfile.displayName || 'Friend';

    // Retrieve My Info
    const myWatchedAnime = typeof getChallengeAnime === 'function' ? getChallengeAnime() : [];
    const myUniqueAnime = typeof getUniqueAnime === 'function' ? getUniqueAnime() : [];
    const myUnlockedAchievements = (challengeData && challengeData.unlockedAchievements) ? challengeData.unlockedAchievements.length : 0;

    document.getElementById('comp-user-name').textContent = 'You';
    document.getElementById('comp-user-stats').innerHTML = `
        <strong>🏆 Challenge Goal Progress:</strong> ${myWatchedAnime.length} / 100<br>
        <strong>📚 Total Logged (Unique):</strong> ${myUniqueAnime.length}<br>
        <strong>✨ Achievements Unlocked:</strong> ${myUnlockedAchievements}<br>
        <strong>🎬 Currently Watching:</strong> ${document.getElementById('lounge-watching-status').textContent}
    `;

    // Retrieve Friend's Info
    const friendStatsEl = document.getElementById('comp-friend-stats');
    friendStatsEl.innerHTML = `Loading friend statistics...`;

    const sideBySideWatchesContainer = document.getElementById('comparison-watches-container');
    sideBySideWatchesContainer.innerHTML = `<div class="empty-state-message">Syncing comparison data...</div>`;

    // Access Friend's challengeData in database
    firebase.database().ref(`users/${friendUid}/challengeData`).once('value').then(snap => {
        const cloudData = snap.val() || {};
        const friendDays = cloudData.days || {};
        const friendBacklog = cloudData.backlog || [];

        // Count friend watched
        const friendDailyWatched = Object.values(friendDays).flatMap(day => day.watched || []);
        const friendWatchedCount = friendDailyWatched.length;
        const friendUnlockedAchievements = cloudData.unlockedAchievements ? cloudData.unlockedAchievements.length : 0;

        // Display statistics comparison
        friendStatsEl.innerHTML = `
            <strong>🏆 Challenge Goal Progress:</strong> ${friendWatchedCount} / 100<br>
            <strong>📚 Total Logged (Unique):</strong> ${friendDailyWatched.length + friendBacklog.length}<br>
            <strong>✨ Achievements Unlocked:</strong> ${friendUnlockedAchievements}<br>
            <strong>🎬 Currently Watching:</strong> ${friendProfile.currentlyWatching || 'None'}
        `;

        // Load side-by-side watches list
        sideBySideWatchesContainer.innerHTML = '';

        // Find common items (shared mal_ids or lower-cased titles)
        const myKeys = new Set(myUniqueAnime.map(item => item.isManual ? item.title.toLowerCase().trim() : item.mal_id));

        const friendUniqueList = [];
        const uniqueFriendMap = new Map();
        const allFriendAnime = [...friendDailyWatched, ...friendBacklog];
        allFriendAnime.forEach(item => {
            const key = item.isManual ? item.title.toLowerCase().trim() : item.mal_id;
            if (!uniqueFriendMap.has(key)) {
                uniqueFriendMap.set(key, item);
            }
        });
        const friendUniqueAnime = Array.from(uniqueFriendMap.values());

        const commonItems = [];
        friendUniqueAnime.forEach(fItem => {
            const key = fItem.isManual ? fItem.title.toLowerCase().trim() : fItem.mal_id;
            if (myKeys.has(key)) {
                commonItems.push(fItem);
            }
        });

        if (commonItems.length === 0) {
            sideBySideWatchesContainer.innerHTML = `<div class="empty-state-message" style="margin:auto;">You don't share any watched/backlog anime in common with this friend yet! Recommended together: write a recommendation in DMs.</div>`;
            return;
        }

        commonItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'share-anime-row';
            card.style.cursor = 'default';
            card.style.marginBottom = '8px';

            const title = getEnglishTitle(item);
            const image = item.image || item.images?.jpg?.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150';

            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <img src="${image}" style="width:35px; height:50px; object-fit:cover; border-radius:4px;">
                    <div style="text-align:left;">
                        <div style="font-size:13px; font-weight:bold; color:var(--primary-color);">${title}</div>
                        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Format: ${item.type || 'TV Series'}</div>
                    </div>
                </div>
                <div style="font-size:11px; color:var(--success-color); font-weight:bold; background:rgba(46,204,113,0.1); padding:4px 8px; border-radius:4px; border:1px solid rgba(46,204,113,0.2);">
                    Shared Watch Mutual
                </div>
            `;
            sideBySideWatchesContainer.appendChild(card);
        });

    }).catch(err => {
        console.error(err);
        friendStatsEl.innerHTML = `Failed to retrieve friend database stats. (They might be offline/unlinked)`;
        sideBySideWatchesContainer.innerHTML = `<div class="empty-state-message">Unable to compare lists.</div>`;
    });
}

// Side-by-Side comparison modal close handlers
document.querySelectorAll('#comparison-modal .close-btn').forEach(btn => {
    btn.onclick = () => {
        document.getElementById('comparison-modal').classList.add('hidden');
    };
});

// Bind general firebase auth triggers to lounge inputs
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        initAvatarSelectors();
        loadUserProfileInputs();
    }
});

// Observe unlocks from local script to trigger nice toasts
setInterval(() => {
    if (challengeData && challengeData.unlockedAchievements) {
        // Simple watcher to verify if we unlocked any achievements in the session
        const currentCount = challengeData.unlockedAchievements.length;
        const previousCount = parseInt(localStorage.getItem('__last_notified_ach_count') || '0');
        if (currentCount > previousCount) {
            localStorage.setItem('__last_notified_ach_count', currentCount.toString());
            // Show custom premium alert
            const newestId = challengeData.unlockedAchievements[currentCount - 1];
            const name = ACHIEVEMENT_TITLES[newestId] || 'Rare Achievement!';
            showToast(`Achievement Unlocked: ${name}`, 'success');
        }
    }
}, 5000);
