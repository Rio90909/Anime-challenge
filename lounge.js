/**
 * lounge.js - Smart Binge Planner helper
 */

// Custom Toast notification system
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert ${type}`;

    let emoji = '🔔';
    if (type === 'success') emoji = '✨';

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

// Dummy onSocialLoungeOpened to prevent any script calling errors
function onSocialLoungeOpened() {
    console.log("Smart Binge Planner view activated.");
}

// Bind smart binge planner controls on load safely
document.addEventListener('DOMContentLoaded', () => {
    const calcBtn = document.getElementById('smart-planner-calc-btn');
    if (calcBtn) {
        calcBtn.onclick = () => {
            const minsInput = document.getElementById('smart-planner-mins');
            if (!minsInput) return;
            const availableMinutes = parseInt(minsInput.value);

            if (isNaN(availableMinutes) || availableMinutes <= 0) {
                showToast('Please enter a valid amount of minutes!', 'error');
                return;
            }

            // Retrieve backlog list
            const backlogList = (typeof challengeData !== 'undefined' && challengeData.backlog) || [];
            const resultsContainer = document.getElementById('smart-planner-result');
            const epsCountEl = document.getElementById('smart-planner-eps-count');
            const detailsEl = document.getElementById('smart-planner-details');

            if (backlogList.length === 0) {
                showToast('Your backlog is empty! Add anime to your backlog first.', 'info');
                return;
            }

            // Average episode duration defaults to 24 minutes, playback speed is loaded from setting
            const playbackSpeed = (typeof anipaceData !== 'undefined' && anipaceData.playbackSpeed) || 1.0;
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

            if (epsCountEl) epsCountEl.textContent = fitCount;
            if (detailsEl) detailsEl.textContent = `This takes about ${Math.round(totalMinutesSum)} minutes of screen time and completes approx. ${percentage}% of your current backlog.`;
            if (resultsContainer) resultsContainer.classList.remove('hidden');

            showToast(`Planner computed: ${fitCount} backlog episodes fit!`, 'success');
        };
    }
});
