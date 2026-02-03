// ===============================================
// UTILITIES
// ===============================================

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

function getEnglishTitle(anime) {
    if (!anime) return 'Unknown Title';
    const englishTitle = (anime.titles || []).find(t => t.type === 'English');
    return englishTitle ? englishTitle.title : anime.title || 'Unknown Title';
}

function countGenre(allAnime, genre) {
    return allAnime.filter(a => !a.isManual && (a.genres || []).some(g => g.name === genre)).length;
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
