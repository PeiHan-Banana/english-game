const vocabularyDatabase = window.vocabularyDatabase || {};

if (!Object.keys(vocabularyDatabase).length) {
    console.warn('词库数据未加载，游戏将无法正常开始');
}

// 游戏状态
let currentMode = '';
let currentQuestionIndex = 0;
let score = 0;
let timer = 15;
let timerInterval = null;
let gameQuestions = [];

let totalQuestions = 15;

function getCurrentQuestionCount() {
    return gameQuestions.length || totalQuestions;
}
let selectedGrades = {
    grade3_semester1:true,grade3_semester2:true,grade4_semester1:true,grade4_semester2:true,
    grade5_semester1:true,grade5_semester2:true,grade6_semester1:true,grade6_semester2:true
};
let isAnswered = false;

let currentPlayerName = '';
let firebaseDB = null;
let isFirebaseReady = false;
let pendingAudioTimeouts = [];

const SCREEN_IDS = ['loginScreen', 'menuScreen', 'gameScreen', 'resultScreen', 'historyScreen', 'reportScreen', 'wrongNotebookScreen', 'leaderboardScreen'];

// ========== Firebase 配置 ==========
const firebaseConfig = {
    apiKey: "AIzaSyBsfUvwZFfmant1SNLm0WmX2Ixt9pX2wnk",
    authDomain: "english-game-20e46.firebaseapp.com",
    databaseURL: "https://english-game-20e46-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "english-game-20e46",
    storageBucket: "english-game-20e46.firebasestorage.app",
    messagingSenderId: "1045923983044",
    appId: "1:1045923983044:web:eff5364917102cc1dfe391",
    measurementId: "G-T2JXTBSRDR"
};

function initFirebase() {
    try {
        if (firebaseConfig.apiKey && firebaseConfig.databaseURL) {
            firebase.initializeApp(firebaseConfig);
            firebaseDB = firebase.database();
            isFirebaseReady = true;
            if (firebase.analytics) {
                firebase.analytics();
                console.log('Google Analytics 已启用');
            }
            updateSyncStatus(true);
            console.log('Firebase 已连接');
        } else {
            console.log('Firebase 未配置，使用本地存储');
            updateSyncStatus(false);
        }
    } catch (e) {
        console.log('Firebase 初始化失败，使用本地存储:', e);
        updateSyncStatus(false);
    }
}

function updateSyncStatus(online) {
    const el = document.getElementById('syncStatus');
    if (el) {
        if (online) {
            el.textContent = ' 云端同步已开启';
            el.className = 'sync-status online';
        } else {
            el.textContent = ' 本地存储模式';
            el.className = 'sync-status offline';
        }
    }
}

function loginPlayer() {
    const nameInput = document.getElementById('playerNameInput');
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.style.borderColor = '#f5576c';
        nameInput.placeholder = '请输入名字！';
        return;
    }
    currentPlayerName = name;
    localStorage.setItem('englishGameLastPlayer', name);
    nameInput.style.borderColor = '#e0e0e0';

    showMenuScreen();
    document.getElementById('playerInfo').style.display = 'flex';
    document.getElementById('playerNameDisplay').textContent = ' ' + name;

    loadPlayerData(name);
    updateWrongWordsBtn();
    loadCheckinData();
}

function switchPlayer() {
    clearInterval(timerInterval);
    clearPendingAudio();
    showOnlyScreen('loginScreen');
    document.getElementById('resumeBtn').style.display = 'none';
    currentPlayerName = '';
}

function getStorageKey(type) {
    return 'englishGame_' + currentPlayerName + '_' + type;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeAnswer(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function setAnswerControlsDisabled(disabled) {
    document.querySelectorAll('.option-btn').forEach(function(btn) {
        btn.disabled = disabled;
    });
    var input = document.getElementById('wordInput');
    var submitBtn = document.getElementById('submitBtn');
    if (input) input.disabled = disabled;
    if (submitBtn) submitBtn.disabled = disabled;
}

function getSettingsKey() {
    return 'englishGame_settings';
}

function saveUserSettings() {
    localStorage.setItem(getSettingsKey(), JSON.stringify({
        selectedGrades: selectedGrades,
        totalQuestions: totalQuestions
    }));
}

function loadUserSettings() {
    try {
        var settings = JSON.parse(localStorage.getItem(getSettingsKey()) || '{}');
        if (settings.selectedGrades && typeof settings.selectedGrades === 'object') {
            selectedGrades = Object.assign({}, selectedGrades, settings.selectedGrades);
        }
        if ([5, 10, 15, 20].indexOf(settings.totalQuestions) !== -1) {
            totalQuestions = settings.totalQuestions;
        }
    } catch (e) {
        console.log('读取设置失败，使用默认设置', e);
    }
}

function applyGradeSelectionToInputs() {
    var mapping = [['cb_g3s1','grade3_semester1'],['cb_g3s2','grade3_semester2'],['cb_g4s1','grade4_semester1'],['cb_g4s2','grade4_semester2'],['cb_g5s1','grade5_semester1'],['cb_g5s2','grade5_semester2'],['cb_g6s1','grade6_semester1'],['cb_g6s2','grade6_semester2']];
    mapping.forEach(function(pair) {
        var label = document.getElementById(pair[0]);
        if (!label) return;
        var checkbox = label.querySelector('input');
        checkbox.checked = !!selectedGrades[pair[1]];
    });
}

function clearPendingAudio() {
    pendingAudioTimeouts.forEach(function(timeoutId) {
        clearTimeout(timeoutId);
    });
    pendingAudioTimeouts = [];
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}

function scheduleQuestionAudio() {
    clearPendingAudio();
    pendingAudioTimeouts = [
        setTimeout(playAudio, 500),
        setTimeout(playAudio, 2000)
    ];
}

function showOnlyScreen(activeScreenId) {
    SCREEN_IDS.forEach(function(screenId) {
        const screen = document.getElementById(screenId);
        if (!screen) return;
        screen.style.display = screenId === activeScreenId ? 'block' : 'none';
    });
}

function showMenuScreen() {
    showOnlyScreen('menuScreen');
    const playerInfo = document.getElementById('playerInfo');
    if (playerInfo) {
        playerInfo.style.display = currentPlayerName ? 'flex' : 'none';
    }
}

function getEffectiveMode() {
    if (currentMode === 'challenge') {
        const question = gameQuestions[currentQuestionIndex];
        return question && question.questionMode ? question.questionMode : 'read';
    }
    if (currentMode === 'review') {
        return 'read';
    }
    return currentMode;
}

function getSessionRecordMode() {
    if (currentMode === 'challenge') return 'daily';
    if (currentMode === 'review') return 'review';
    return currentMode;
}

function getModeDisplayName(mode) {
    const modeNames = {
        listen: '听音选单词',
        read: '看单词选中文',
        write: '听音写单词',
        reverse: '看中文选英文',
        daily: '每日挑战',
        review: '智能复习'
    };
    return modeNames[mode] || mode;
}

function getWordStatsData() {
    return JSON.parse(localStorage.getItem(getStorageKey('wordStats')) || '{}');
}

function saveWordStatsData(data) {
    localStorage.setItem(getStorageKey('wordStats'), JSON.stringify(data));
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/wordStats').set(data).catch(function(err) {
            console.log('淇濆瓨鍗曡瘝缁熻澶辫触:', err);
        });
    }
}

function getDailyChallengeData() {
    return JSON.parse(localStorage.getItem(getStorageKey('dailyChallenge')) || '{}');
}

function saveDailyChallengeData(data) {
    localStorage.setItem(getStorageKey('dailyChallenge'), JSON.stringify(data));
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/dailyChallenge').set(data).catch(function(err) {
            console.log('淇濆瓨姣忔棩鎸戞垬澶辫触:', err);
        });
    }
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function hashStringToSeed(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seedValue) {
    let seed = seedValue >>> 0;
    return function() {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function seededShuffle(items, seedKey) {
    const random = createSeededRandom(hashStringToSeed(seedKey));
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function updateWordStats(question, isCorrect) {
    if (!question || !question.word || !currentPlayerName) return;
    const key = normalizeAnswer(question.word);
    const allStats = getWordStatsData();
    const now = Date.now();
    const reviewIntervals = [0.25, 1, 2, 4, 7, 15, 30];
    const entry = allStats[key] || {
        word: question.word,
        chinese: question.chinese,
        attempts: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        maxStreak: 0,
        lastSeen: 0,
        lastWrong: 0,
        reviewLevel: 0,
        nextReviewAt: 0,
        lastResult: ''
    };

    entry.word = question.word;
    entry.chinese = question.chinese;
    entry.attempts += 1;
    entry.lastSeen = now;
    entry.lastResult = isCorrect ? 'correct' : 'wrong';

    if (isCorrect) {
        entry.correct += 1;
        entry.streak = (entry.streak || 0) + 1;
        entry.maxStreak = Math.max(entry.maxStreak || 0, entry.streak);
        entry.reviewLevel = Math.min((entry.reviewLevel || 0) + 1, reviewIntervals.length - 1);
    } else {
        entry.wrong += 1;
        entry.streak = 0;
        entry.lastWrong = now;
        entry.reviewLevel = 0;
    }

    const hours = reviewIntervals[entry.reviewLevel] * 24;
    entry.nextReviewAt = now + hours * 60 * 60 * 1000;

    allStats[key] = entry;
    saveWordStatsData(allStats);
}

function getReviewState(stats) {
    const now = Date.now();
    const nextReviewAt = stats.nextReviewAt || 0;
    const attempts = stats.attempts || 0;
    const correct = stats.correct || 0;
    const accuracy = attempts ? correct / attempts : 0;
    const dueInMs = nextReviewAt ? nextReviewAt - now : 0;
    const isDue = !nextReviewAt || dueInMs <= 0;
    return {
        accuracy: accuracy,
        isDue: isDue,
        overdueMs: isDue ? Math.abs(Math.min(dueInMs, 0)) : 0,
        dueInHours: isDue ? 0 : Math.ceil(dueInMs / (60 * 60 * 1000))
    };
}

function getReviewOverview(wordStats) {
    return wordStats.reduce(function(summary, item) {
        const state = getReviewState(item);
        const attempts = item.attempts || 0;
        const correct = item.correct || 0;
        const accuracy = attempts ? correct / attempts : 0;

        if (attempts === 0 || accuracy < 0.6) {
            summary.learning += 1;
        }
        if (attempts >= 3 && accuracy >= 0.85 && (item.streak || 0) >= 3) {
            summary.mastered += 1;
        }
        if (state.isDue) {
            summary.dueNow += 1;
        } else if (state.dueInHours <= 24) {
            summary.dueSoon += 1;
        }
        return summary;
    }, { dueNow: 0, dueSoon: 0, learning: 0, mastered: 0 });
}

function buildRecentTrend(history, days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = [];

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        buckets.push({
            key: key,
            label: `${date.getMonth() + 1}/${date.getDate()}`,
            sessions: 0,
            bestScore: 0,
            totalScore: 0
        });
    }

    history.forEach(function(record) {
        const timestamp = getRecordTimestamp(record);
        if (!timestamp) return;
        const key = new Date(timestamp).toISOString().slice(0, 10);
        const bucket = buckets.find(function(item) { return item.key === key; });
        if (!bucket) return;
        bucket.sessions += 1;
        bucket.totalScore += record.score || 0;
        bucket.bestScore = Math.max(bucket.bestScore, record.score || 0);
    });

    return buckets.map(function(bucket) {
        return Object.assign(bucket, {
            avgScore: bucket.sessions ? Math.round(bucket.totalScore / bucket.sessions) : 0
        });
    });
}

function getChallengeSeed(count) {
    const scopeKey = Object.keys(selectedGrades).filter(function(key) { return selectedGrades[key]; }).join('|');
    return [getTodayKey(), scopeKey, count].join('|');
}

function buildDailyChallengeQuestions(count) {
    const seedKey = getChallengeSeed(count);
    const questionPool = seededShuffle(getAllVocabulary(), seedKey).slice(0, count);
    const modeOptions = ['listen', 'read', 'write', 'reverse'];
    const modeRandom = createSeededRandom(hashStringToSeed(seedKey + '|mode'));
    return questionPool.map(function(question) {
        return Object.assign({}, question, {
            questionMode: modeOptions[Math.floor(modeRandom() * modeOptions.length)]
        });
    });
}

function saveDailyChallengeResult(scoreValue, questionCount) {
    const dailyData = getDailyChallengeData();
    const todayKey = getTodayKey();
    const currentEntry = dailyData[todayKey] || { bestScore: 0, completedCount: 0, total: questionCount };
    const newBest = scoreValue > (currentEntry.bestScore || 0);
    dailyData[todayKey] = {
        bestScore: Math.max(currentEntry.bestScore || 0, scoreValue),
        lastScore: scoreValue,
        total: questionCount,
        completedCount: (currentEntry.completedCount || 0) + 1,
        updatedAt: Date.now()
    };
    saveDailyChallengeData(dailyData);
    return {
        isNewBest: newBest,
        bestScore: dailyData[todayKey].bestScore
    };
}

function calculateReviewWeight(question, statsMap, wrongWordMap) {
    const key = normalizeAnswer(question.word);
    const stats = statsMap[key] || {};
    const attempts = stats.attempts || 0;
    const correct = stats.correct || 0;
    const wrong = stats.wrong || 0;
    const accuracy = attempts ? correct / attempts : 0.55;
    const reviewState = getReviewState(stats);
    let weight = 1;

    if (reviewState.isDue) {
        weight += 6 + Math.min(6, reviewState.overdueMs / (24 * 60 * 60 * 1000));
    } else {
        weight += Math.max(0, 2 - reviewState.dueInHours / 12);
    }

    weight += (wrongWordMap[key] || 0) * 4;
    weight += wrong * 2;
    weight += attempts ? (1 - accuracy) * 5 : 2;

    if ((stats.streak || 0) >= 4 && accuracy >= 0.85 && !reviewState.isDue) {
        weight *= 0.55;
    }

    return weight;
}

function pickWeightedQuestions(pool, count) {
    const wrongWordMap = {};
    getWrongWordsData().forEach(function(item) {
        wrongWordMap[normalizeAnswer(item.word)] = item.count || 1;
    });
    const statsMap = getWordStatsData();
    const remaining = [...pool];
    const selected = [];

    while (selected.length < count && remaining.length) {
        const weights = remaining.map(function(question) {
            return calculateReviewWeight(question, statsMap, wrongWordMap);
        });
        const totalWeight = weights.reduce(function(sum, value) { return sum + value; }, 0);
        let roll = Math.random() * totalWeight;
        let pickedIndex = 0;
        for (let i = 0; i < remaining.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                pickedIndex = i;
                break;
            }
        }
        selected.push(remaining.splice(pickedIndex, 1)[0]);
    }

    return selected;
}

function startDailyChallenge() {
    const availableWords = getAllVocabulary();
    if (availableWords.length < 4) {
        alert('可用单词太少，请至少选择一个年级！');
        return;
    }
    clearPendingAudio();
    currentMode = 'challenge';
    currentQuestionIndex = 0;
    score = 0;
    const questionCount = Math.min(totalQuestions, availableWords.length);
    gameQuestions = buildDailyChallengeQuestions(questionCount);
    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';
    clearSavedProgress();
    displayQuestion();
}

function startSmartReview() {
    const availableWords = getAllVocabulary();
    if (availableWords.length < 4) {
        alert('可用单词太少，请至少选择一个年级！');
        return;
    }
    clearPendingAudio();
    currentMode = 'review';
    currentQuestionIndex = 0;
    score = 0;
    const questionCount = Math.min(totalQuestions, availableWords.length);
    gameQuestions = pickWeightedQuestions(availableWords, questionCount);
    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';
    clearSavedProgress();
    displayQuestion();
}

function showReport() {
    showOnlyScreen('reportScreen');

    const reportGrid = document.getElementById('reportGrid');
    const recentTrendChart = document.getElementById('recentTrendChart');
    const reviewSummaryGrid = document.getElementById('reviewSummaryGrid');
    const weakWordsList = document.getElementById('weakWordsList');
    const modePerformanceList = document.getElementById('modePerformanceList');
    const wordStats = Object.values(getWordStatsData());
    const history = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
    const wrongWords = getWrongWordsData();
    const checkinData = JSON.parse(localStorage.getItem(getStorageKey('checkin')) || '{"dates":[],"streak":0}');
    const dailyData = getDailyChallengeData()[getTodayKey()];
    const reviewOverview = getReviewOverview(wordStats);

    const totalAttempts = wordStats.reduce(function(sum, item) { return sum + (item.attempts || 0); }, 0);
    const totalCorrect = wordStats.reduce(function(sum, item) { return sum + (item.correct || 0); }, 0);
    const accuracy = totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0;
    const bestScore = history.length ? Math.max.apply(null, history.map(function(item) { return item.score || 0; })) : 0;
    const masteredWords = wordStats.filter(function(item) {
        const attempts = item.attempts || 0;
        const correct = item.correct || 0;
        return attempts >= 3 && correct / attempts >= 0.85 && (item.streak || 0) >= 3;
    }).length;

    const cards = [
        { title: '练习局数', value: history.length, subtitle: '累计完成的游戏轮次' },
        { title: '答题总数', value: totalAttempts, subtitle: '所有作答次数' },
        { title: '总体正确率', value: accuracy + '%', subtitle: '累计准确率' },
        { title: '掌握词数', value: masteredWords, subtitle: '练过且稳定掌握的词' },
        { title: '连续打卡', value: checkinData.streak || 0, subtitle: '坚持练习天数' },
        { title: '今日挑战', value: dailyData ? dailyData.bestScore + '分' : '未开始', subtitle: dailyData ? '今日最佳成绩' : '快去挑战一次吧' },
        { title: '错词本', value: wrongWords.length, subtitle: '待复习词汇' },
        { title: '历史最高分', value: bestScore, subtitle: '所有模式最高分' }
    ];

    reportGrid.innerHTML = cards.map(function(card) {
        return '<div class="report-card">' +
            '<div class="report-card-title">' + escapeHtml(card.title) + '</div>' +
            '<div class="report-card-value">' + escapeHtml(card.value) + '</div>' +
            '<div class="report-card-subtitle">' + escapeHtml(card.subtitle) + '</div>' +
            '</div>';
    }).join('');

    const trendData = buildRecentTrend(history, 7);
    const maxSessions = Math.max.apply(null, trendData.map(function(item) { return item.sessions; }).concat([1]));
    recentTrendChart.innerHTML = trendData.map(function(item) {
        const height = item.sessions ? Math.max(18, Math.round(item.sessions / maxSessions * 100)) : 12;
        const fillText = item.sessions ? item.sessions + '局' : '';
        return '<div class="trend-bar">' +
            '<div class="trend-bar-track">' +
            '<div class="trend-bar-fill" style="height:' + height + '%">' + fillText + '</div>' +
            '</div>' +
            '<div class="trend-bar-label">' + escapeHtml(item.label) + '</div>' +
            '<div class="trend-bar-meta">最佳 ' + item.bestScore + ' 分</div>' +
            '</div>';
    }).join('');

    const reviewCards = [
        { title: '现在该复习', value: reviewOverview.dueNow, subtitle: '优先练这些词', chip: '马上复习' },
        { title: '24小时内到期', value: reviewOverview.dueSoon, subtitle: '可以提前温习', chip: '即将到期' },
        { title: '学习中词汇', value: reviewOverview.learning, subtitle: '还不够稳定', chip: '继续巩固' },
        { title: '已掌握词汇', value: reviewOverview.mastered, subtitle: '保持节奏就好', chip: '掌握中' }
    ];
    reviewSummaryGrid.innerHTML = reviewCards.map(function(card) {
        return '<div class="report-card">' +
            '<div class="review-chip">' + escapeHtml(card.chip) + '</div>' +
            '<div class="report-card-title">' + escapeHtml(card.title) + '</div>' +
            '<div class="report-card-value">' + escapeHtml(card.value) + '</div>' +
            '<div class="report-card-subtitle">' + escapeHtml(card.subtitle) + '</div>' +
            '</div>';
    }).join('');

    const weakestWords = wordStats.slice().sort(function(a, b) {
        const aAttempts = a.attempts || 0;
        const bAttempts = b.attempts || 0;
        const aRate = aAttempts ? (a.correct || 0) / aAttempts : 0;
        const bRate = bAttempts ? (b.correct || 0) / bAttempts : 0;
        const aScore = (1 - aRate) * Math.max(aAttempts, 1);
        const bScore = (1 - bRate) * Math.max(bAttempts, 1);
        return bScore - aScore || bAttempts - aAttempts;
    }).slice(0, 8);

    if (!weakestWords.length) {
        weakWordsList.innerHTML = '<div class="report-empty">还没有足够的数据，先去玩几轮吧！</div>';
    } else {
        weakWordsList.innerHTML = weakestWords.map(function(item) {
            const attempts = item.attempts || 0;
            const correct = item.correct || 0;
            const rate = attempts ? Math.round(correct / attempts * 100) : 0;
            const reviewState = getReviewState(item);
            const reviewText = reviewState.isDue ? '现在适合复习' : '约 ' + reviewState.dueInHours + ' 小时后复习';
            return '<div class="report-item">' +
                '<div class="report-item-info">' +
                '<div class="report-item-label">' + escapeHtml(item.word) + '  ' + escapeHtml(item.chinese || '') + '</div>' +
                '<div class="report-item-meta">作答 ' + attempts + ' 次，正确率 ' + rate + '%，' + reviewText + '</div>' +
                '</div>' +
                '<div class="report-item-value">错 ' + (item.wrong || 0) + ' 次</div>' +
                '</div>';
        }).join('');
    }

    const modeStats = {};
    history.forEach(function(record) {
        const mode = record.mode || 'unknown';
        if (!modeStats[mode]) {
            modeStats[mode] = { count: 0, totalScore: 0, bestScore: 0 };
        }
        modeStats[mode].count += 1;
        modeStats[mode].totalScore += record.score || 0;
        modeStats[mode].bestScore = Math.max(modeStats[mode].bestScore, record.score || 0);
    });

    const modeItems = Object.keys(modeStats).map(function(mode) {
        const item = modeStats[mode];
        return {
            mode: mode,
            count: item.count,
            average: Math.round(item.totalScore / item.count),
            bestScore: item.bestScore
        };
    }).sort(function(a, b) {
        return b.average - a.average || b.bestScore - a.bestScore;
    });

    if (!modeItems.length) {
        modePerformanceList.innerHTML = '<div class="report-empty">还没有模式表现数据。</div>';
    } else {
        modePerformanceList.innerHTML = modeItems.map(function(item) {
            return '<div class="report-item">' +
                '<div class="report-item-info">' +
                '<div class="report-item-label">' + escapeHtml(getModeDisplayName(item.mode)) + '</div>' +
                '<div class="report-item-meta">共挑战 ' + item.count + ' 次，平均 ' + item.average + ' 分</div>' +
                '</div>' +
                '<div class="report-item-value">最高 ' + item.bestScore + ' 分</div>' +
                '</div>';
        }).join('');
    }
}

// 淇濆瓨娓告垙杩涘害锛堟柇鐐圭画鐜╋級
function saveGameProgress() {
    if (!currentPlayerName || currentQuestionIndex >= getCurrentQuestionCount()) return;
    const progressData = {
        mode: currentMode,
        questionIndex: currentQuestionIndex,
        score: score,
        questions: gameQuestions,
        questionCount: getCurrentQuestionCount(),
        timestamp: Date.now()
    };

    // 淇濆瓨鍒?localStorage
    localStorage.setItem(getStorageKey('progress'), JSON.stringify(progressData));

    // 淇濆瓨鍒?Firebase
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/progress').set(progressData)
            .catch(err => console.log('Firebase淇濆瓨杩涘害澶辫触:', err));
    }
}

// 鍔犺浇鐜╁鏁版嵁
function loadPlayerData(playerName) {
    // 鍏堜粠 localStorage 鍔犺浇
    const localProgress = localStorage.getItem(getStorageKey('progress'));
    if (localProgress) {
        const data = JSON.parse(localProgress);
        // 妫€鏌ヨ繘搴︽槸鍚︽湁鏁堬紙24灏忔椂鍐咃級
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
            document.getElementById('resumeBtn').style.display = 'block';
        }
    }

    // 濡傛灉 Firebase 鍙敤锛屼粠浜戠鍔犺浇
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + playerName).once('value')
            .then(snapshot => {
                const data = snapshot.val();
                if (data) {
                    // 鍚屾鍘嗗彶璁板綍
                    if (data.history) {
                        const localHistory = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
                        // 鍚堝苟浜戠鍜屾湰鍦拌褰曪紙鍘婚噸锛?
                        const merged = mergeHistory(localHistory, data.history);
                        localStorage.setItem(getStorageKey('history'), JSON.stringify(merged));
                    }
                    // 鍚屾娓告垙杩涘害
                    if (data.progress && Date.now() - data.progress.timestamp < 24 * 60 * 60 * 1000) {
                        localStorage.setItem(getStorageKey('progress'), JSON.stringify(data.progress));
                        document.getElementById('resumeBtn').style.display = 'block';
                    }
                    if(data.wordStats){localStorage.setItem(getStorageKey('wordStats'), JSON.stringify(Object.assign({}, getWordStatsData(), data.wordStats)));}
                    if(data.dailyChallenge){localStorage.setItem(getStorageKey('dailyChallenge'), JSON.stringify(Object.assign({}, getDailyChallengeData(), data.dailyChallenge)));}
                    if(data.wrongWords){var lw=JSON.parse(localStorage.getItem(getStorageKey('wrongWords'))||'[]');data.wrongWords.forEach(function(cw){var f=lw.find(function(m){return m.word===cw.word;});if(f)f.count=Math.max(f.count||1,cw.count||1);else lw.push(cw);});localStorage.setItem(getStorageKey('wrongWords'),JSON.stringify(lw));updateWrongWordsBtn();}
                    if(data.checkin&&data.checkin.dates){var lc=JSON.parse(localStorage.getItem(getStorageKey('checkin'))||'{"dates":[],"streak":0}');var as={};lc.dates.forEach(function(d){as[d]=1;});data.checkin.dates.forEach(function(d){as[d]=1;});var ad=Object.keys(as).sort();var st=ad.length>0?1:0;for(var i=ad.length-1;i>0;i--){if((new Date(ad[i])-new Date(ad[i-1]))/86400000===1)st++;else break;}localStorage.setItem(getStorageKey('checkin'),JSON.stringify({dates:ad,streak:st}));updateCheckinDisplay(st);}
                }
            })
            .catch(err => console.log('Firebase鍔犺浇澶辫触:', err));
    }
}

function getRecordTimestamp(record) {
    if (record && typeof record.timestamp === 'number') {
        return record.timestamp;
    }
    const parsed = Date.parse(record && record.date ? record.date : '');
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatRecordDate(record) {
    const timestamp = getRecordTimestamp(record);
    return timestamp ? new Date(timestamp).toLocaleString('zh-CN') : (record.date || '');
}

function mergeHistory(local, cloud) {
    const all = [...local];
    cloud.forEach(item => {
        const itemTimestamp = getRecordTimestamp(item);
        const exists = all.some(a => {
            const currentTimestamp = getRecordTimestamp(a);
            if (itemTimestamp && currentTimestamp) {
                return currentTimestamp === itemTimestamp;
            }
            return a.date === item.date && a.score === item.score && a.mode === item.mode;
        });
        if (!exists) all.push(item);
    });
    all.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    return all.slice(0, 30);
}

// 缁х画涓婃娓告垙
function resumeGame() {
    const savedProgress = localStorage.getItem(getStorageKey('progress'));
    if (!savedProgress) return;

    const data = JSON.parse(savedProgress);
    currentMode = data.mode;
    currentQuestionIndex = data.questionIndex;
    score = data.score;
    gameQuestions = Array.isArray(data.questions) ? data.questions : [];
    totalQuestions = data.questionCount || gameQuestions.length || totalQuestions;

    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';

    displayQuestion();
}

// 娓呴櫎宸蹭繚瀛樼殑杩涘害
function clearSavedProgress() {
    localStorage.removeItem(getStorageKey('progress'));
    document.getElementById('resumeBtn').style.display = 'none';
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/progress').remove()
            .catch(err => console.log('Firebase娓呴櫎杩涘害澶辫触:', err));
    }
}

// 椤甸潰鍏抽棴鍓嶈嚜鍔ㄤ繚瀛?
window.addEventListener('beforeunload', function() {
    if (currentMode && currentQuestionIndex < getCurrentQuestionCount() && currentQuestionIndex > 0) {
        saveGameProgress();
    }
});

// 椤甸潰鍔犺浇鏃惰嚜鍔ㄧ櫥褰曚笂娆＄帺瀹?
window.addEventListener('DOMContentLoaded', function() {
    initFirebase();
    const lastPlayer = localStorage.getItem('englishGameLastPlayer');
    if (lastPlayer) {
        document.getElementById('playerNameInput').value = lastPlayer;
    }
    document.getElementById('playerNameInput').addEventListener('keypress',function(e){if(e.key==='Enter')loginPlayer();});
    loadUserSettings();
    applyGradeSelectionToInputs();
    updateGradeSelection();
    setQuestionCount(totalQuestions);
});


// 婵€鍔辫

// ========== Grade Selection ==========
function toggleAllGrades(checked){
    document.querySelectorAll('.grade-grid input[type="checkbox"]').forEach(function(cb){cb.checked=checked;});
    updateGradeSelection();
}
function updateGradeSelection(){
    var m=[['cb_g3s1','grade3_semester1'],['cb_g3s2','grade3_semester2'],['cb_g4s1','grade4_semester1'],['cb_g4s2','grade4_semester2'],['cb_g5s1','grade5_semester1'],['cb_g5s2','grade5_semester2'],['cb_g6s1','grade6_semester1'],['cb_g6s2','grade6_semester2']];
    m.forEach(function(p){var l=document.getElementById(p[0]);var cb=l.querySelector('input');selectedGrades[p[1]]=cb.checked;if(cb.checked)l.classList.add('selected');else l.classList.remove('selected');});
    document.getElementById('selectAllGrades').checked=Object.values(selectedGrades).every(function(v){return v;});
    saveUserSettings();
}
function setQuestionCount(count) {
    totalQuestions = count;
    document.querySelectorAll('.count-btn').forEach(function(button) {
        button.classList.remove('selected');
        if (button.textContent.trim() === count + '题') {
            button.classList.add('selected');
        }
    });
    saveUserSettings();
}
// ========== Wrong Words ==========
function getWrongWordsData(){return JSON.parse(localStorage.getItem(getStorageKey('wrongWords'))||'[]');}
function saveWrongWord(wo){
    var ww=getWrongWordsData();var ex=ww.find(function(w){return w.word===wo.word;});
    if(ex){ex.count=(ex.count||1)+1;ex.lastWrong=Date.now();}else{ww.push({word:wo.word,chinese:wo.chinese,count:1,lastWrong:Date.now()});}
    localStorage.setItem(getStorageKey('wrongWords'),JSON.stringify(ww));updateWrongWordsBtn();
    if(isFirebaseReady&&firebaseDB){firebaseDB.ref('players/'+currentPlayerName+'/wrongWords').set(ww).catch(function(e){});}
}
function removeWrongWord(w){
    var ww=getWrongWordsData().filter(function(x){return x.word!==w;});
    localStorage.setItem(getStorageKey('wrongWords'),JSON.stringify(ww));updateWrongWordsBtn();
    if(isFirebaseReady&&firebaseDB){firebaseDB.ref('players/'+currentPlayerName+'/wrongWords').set(ww).catch(function(){});}
}
function updateWrongWordsBtn(){
    var ww=getWrongWordsData();var b=document.getElementById('wrongWordsBtn');var cn=document.getElementById('wrongWordsCount');
    if(b)b.style.display=ww.length>0?'block':'none';if(cn)cn.textContent=ww.length;
}
function showWrongNotebook() {
    showOnlyScreen('wrongNotebookScreen');
    var wrongWords = getWrongWordsData();
    var list = document.getElementById('wrongWordsList');
    if (wrongWords.length === 0) {
        list.innerHTML = '<div class="no-history">&#127881; 太棒了！没有错词！</div>';
        document.getElementById('practiceWrongBtn').style.display = 'none';
        return;
    }
    var sortedWords = wrongWords.slice().sort(function(a, b) {
        return (b.count || 1) - (a.count || 1) || (b.lastWrong || 0) - (a.lastWrong || 0);
    });
    document.getElementById('practiceWrongBtn').style.display = 'block';
    list.innerHTML = sortedWords.map(function(word) {
        return '<div class="wrong-word-item">' +
            '<div><div class="wrong-word-english">' + escapeHtml(word.word) + '</div><div class="wrong-word-chinese">' + escapeHtml(word.chinese) + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:10px"><span class="wrong-word-count">错 ' + (word.count || 1) + ' 次</span><button class="wrong-word-play" data-word="' + encodeURIComponent(word.word) + '" onclick="speak(decodeURIComponent(this.dataset.word))">&#128264;</button></div>' +
            '</div>';
    }).join('');
}
function clearWrongWords() {
    if (confirm('确定要清空错词本吗？')) {
        localStorage.removeItem(getStorageKey('wrongWords'));
        if (isFirebaseReady && firebaseDB) {
            firebaseDB.ref('players/' + currentPlayerName + '/wrongWords').remove().catch(function() {});
        }
        updateWrongWordsBtn();
        showWrongNotebook();
    }
}
function startWrongWordsGame() {
    var wrongWords = getWrongWordsData();
    if (wrongWords.length === 0) {
        alert('错词本为空！');
        return;
    }
    currentMode = 'read';
    currentQuestionIndex = 0;
    score = 0;
    var count = Math.min(wrongWords.length, totalQuestions);
    gameQuestions = shuffleArray(wrongWords).slice(0, count);
    window._origTotal = totalQuestions;
    window._isWrongMode = true;
    totalQuestions = count;
    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';
    displayQuestion();
}
// ========== Leaderboard ==========
function showLeaderboard() {
    showOnlyScreen('leaderboardScreen');
    var list = document.getElementById('leaderboardList');
    list.innerHTML = '<div class="no-history">加载中...</div>';
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players').once('value').then(function(snapshot) {
            var data = snapshot.val();
            if (!data) {
                list.innerHTML = '<div class="no-history">暂无数据</div>';
                return;
            }
            var scores = [];
            Object.keys(data).forEach(function(name) {
                var player = data[name];
                if (player.history && Array.isArray(player.history) && player.history.length) {
                    scores.push({
                        name: name,
                        score: Math.max.apply(null, player.history.map(function(item) { return item.score || 0; }))
                    });
                }
            });
            scores.sort(function(a, b) { return b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'); });
            var top = scores.slice(0, 20);
            if (!top.length) {
                list.innerHTML = '<div class="no-history">暂无排行数据</div>';
                return;
            }
            var icons = ['&#129351;', '&#129352;', '&#129353;'];
            list.innerHTML = top.map(function(item, index) {
                var rank = index < 3 ? icons[index] : (index + 1);
                return '<div class="leaderboard-item"><span class="leaderboard-rank">' + rank + '</span><span class="leaderboard-name">' + escapeHtml(item.name) + '</span><span class="leaderboard-score">' + item.score + ' 分</span></div>';
            }).join('');
        }).catch(function() {
            list.innerHTML = '<div class="no-history">加载失败</div>';
        });
    } else {
        var history = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
        if (!history.length) {
            list.innerHTML = '<div class="no-history">暂无数据</div>';
            return;
        }
        var best = Math.max.apply(null, history.map(function(item) { return item.score || 0; }));
        list.innerHTML = '<div class="leaderboard-item"><span class="leaderboard-rank">&#129351;</span><span class="leaderboard-name">' + escapeHtml(currentPlayerName) + '</span><span class="leaderboard-score">' + best + ' 分</span></div>';
    }
}
// ========== Daily Checkin ==========
function recordCheckin(){
    var today=new Date().toISOString().slice(0,10);
    var cd=JSON.parse(localStorage.getItem(getStorageKey('checkin'))||'{"dates":[],"streak":0}');
    if(cd.dates.indexOf(today)!==-1)return;cd.dates.push(today);cd.dates.sort();
    var streak=1;for(var i=cd.dates.length-1;i>0;i--){if((new Date(cd.dates[i])-new Date(cd.dates[i-1]))/86400000===1)streak++;else break;}
    cd.streak=streak;localStorage.setItem(getStorageKey('checkin'),JSON.stringify(cd));updateCheckinDisplay(streak);
    if(isFirebaseReady&&firebaseDB){firebaseDB.ref('players/'+currentPlayerName+'/checkin').set(cd).catch(function(){});}
}
function updateCheckinDisplay(s){var el=document.getElementById('streakNum');if(el)el.textContent=s||0;}
function loadCheckinData(){var cd=JSON.parse(localStorage.getItem(getStorageKey('checkin'))||'{"dates":[],"streak":0}');updateCheckinDisplay(cd.streak);}
const praiseWords = ['Amazing!', 'Excellent!', 'Great!', 'Good!', '太棒了！', '你真厉害！', '继续加油！'];
const wrongWords = ['哎呀，错啦！', '别灰心！', '再想想！'];

// Web Audio API 鍒涘缓闊虫晥 - 绉诲姩绔吋瀹圭増
let audioContext = null;

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

document.addEventListener('click', initAudioContext);
document.addEventListener('touchstart', initAudioContext);

function playSuccessSound() {
    initAudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
}

function playWrongSound() {
    initAudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(261.63, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(220.00, audioContext.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// 璇煶鍚堟垚 - 绉诲姩绔吋瀹圭増
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const trySpeak = () => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.8;
            const voices = window.speechSynthesis.getVoices();
            const englishVoice = voices.find(v => v.lang.startsWith('en'));
            if (englishVoice) utterance.voice = englishVoice;
            window.speechSynthesis.speak(utterance);
        };
        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
            setTimeout(trySpeak, 100);
        } else {
            trySpeak();
        }
        return;
    }
    const audio = new Audio('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&type=2');
    audio.play().catch(err => console.log('澶囬€夐煶棰戝け璐?', err));
}

// 鍚堝苟鎵€鏈夎瘝姹?
function getAllVocabulary() {
    let allWords = [];
    ['grade3','grade4','grade5','grade6'].forEach(gk => {
        ['semester1','semester2'].forEach(sk => {
            if (selectedGrades[gk+'_'+sk] && vocabularyDatabase[gk] && vocabularyDatabase[gk][sk]) {
                allWords = allWords.concat(vocabularyDatabase[gk][sk]);
            }
        });
    });
    if (allWords.length===0) { Object.values(vocabularyDatabase).forEach(g => { Object.values(g).forEach(s => { allWords=allWords.concat(s); }); }); }
    return allWords;
}
function shuffleArray(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 闅忔満鎶藉彇棰樼洰
function getRandomQuestions(count) {
    return shuffleArray(getAllVocabulary()).slice(0, count);
}

// 闅忔満鐢熸垚骞叉壈椤?
function getWrongOptions(correctWord, count, displayField = 'chinese') {
    const usedValues = new Set([correctWord[displayField]]);
    const wrongOptions = [];

    for (const word of shuffleArray(getAllVocabulary())) {
        if (word.word === correctWord.word || word.chinese === correctWord.chinese) {
            continue;
        }
        if (usedValues.has(word[displayField])) {
            continue;
        }
        usedValues.add(word[displayField]);
        wrongOptions.push(word);
        if (wrongOptions.length >= count) {
            break;
        }
    }

    return wrongOptions;
}

// 寮€濮嬫父鎴?
function startGame(mode) {
    var av = getAllVocabulary();
    if (av.length < 4) {
        alert('可用单词太少，请至少选择一个年级！');
        return;
    }
    clearPendingAudio();
    currentMode = mode;
    currentQuestionIndex = 0;
    score = 0;
    gameQuestions = getRandomQuestions(Math.min(totalQuestions, av.length));

    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';

    clearSavedProgress();
    displayQuestion();
}

// 显示题目
function displayQuestion() {
    isAnswered = false;
    const question = gameQuestions[currentQuestionIndex];
    const effectiveMode = getEffectiveMode();

    document.getElementById('feedback').style.display = 'none';
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('wordInput').value = '';
    setAnswerControlsDisabled(false);

    const questionCount = getCurrentQuestionCount();
    document.getElementById('progressFill').textContent = `${currentQuestionIndex + 1} / ${questionCount}`;
    document.getElementById('progressFill').style.width = `${((currentQuestionIndex + 1) / questionCount) * 100}%`;

    document.getElementById('scoreDisplay').textContent = score;
    resetTimer();

    const questionText = document.getElementById('questionText');
    const playAudioBtn = document.getElementById('playAudioBtn');
    const optionsArea = document.getElementById('optionsArea');
    const inputArea = document.getElementById('inputArea');

    optionsArea.innerHTML = '';
    inputArea.style.display = 'none';
    playAudioBtn.style.display = 'none';

    if (effectiveMode === 'listen') {
        questionText.textContent = '点击按钮听发音，选择正确的中文意思';
        playAudioBtn.style.display = 'block';
        document.getElementById('submitBtn').style.display = 'none';

        const correctAnswer = question;
        const wrongOptions = getWrongOptions(question, 3, 'chinese');
        const allOptions = shuffleArray([...wrongOptions, correctAnswer]);

        allOptions.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option.chinese;
            btn.onclick = () => checkAnswer(option.chinese, correctAnswer.chinese, btn);
            optionsArea.appendChild(btn);
        });

        scheduleQuestionAudio();
    } else if (effectiveMode === 'read') {
        questionText.textContent = question.word;

        const correctAnswer = question;
        const wrongOptions = getWrongOptions(question, 3, 'chinese');
        const allOptions = shuffleArray([...wrongOptions, correctAnswer]);

        allOptions.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option.chinese;
            btn.onclick = () => checkAnswer(option.chinese, correctAnswer.chinese, btn);
            optionsArea.appendChild(btn);
        });

        document.getElementById('submitBtn').style.display = 'none';
    } else if (effectiveMode === 'write') {
        questionText.textContent = '点击按钮听发音，输入正确的单词';
        playAudioBtn.style.display = 'block';
        inputArea.style.display = 'block';
        document.getElementById('submitBtn').style.display = 'inline-block';
        document.getElementById('wordInput').focus();

        document.getElementById('wordInput').onkeypress = function(e) {
            if (e.key === 'Enter' && !isAnswered) {
                submitAnswer();
            }
        };

        scheduleQuestionAudio();
    } else if (effectiveMode === 'reverse') {
        questionText.textContent = question.chinese;
        var correctAnswer = question;
        var wrongOptions = getWrongOptions(question, 3, 'word');
        var allOptions = shuffleArray(wrongOptions.concat(correctAnswer));
        allOptions.forEach(function(option) {
            var btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option.word;
            btn.onclick = function() {
                checkAnswer(option.word, correctAnswer.word, btn);
            };
            optionsArea.appendChild(btn);
        });
        document.getElementById('submitBtn').style.display = 'none';
    }
}

// 播放发音
function playAudio() {
    const question = gameQuestions[currentQuestionIndex];
    if (!question) return;
    speak(question.word);
}

// 提交答案（听音写单词模式）
function submitAnswer() {
    if (isAnswered) return;
    const userAnswer = normalizeAnswer(document.getElementById('wordInput').value);
    const question = gameQuestions[currentQuestionIndex];
    checkAnswer(userAnswer, normalizeAnswer(question.word), null);
}

// 检查答案
function checkAnswer(userAnswer, correctAnswer, button) {
    if (isAnswered) return;
    isAnswered = true;
    const effectiveMode = getEffectiveMode();

    clearInterval(timerInterval);

    const feedback = document.getElementById('feedback');
    feedback.style.display = 'block';
    setAnswerControlsDisabled(true);

    const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);

    if (isCorrect) {
        score += 10;
        feedback.textContent = praiseWords[Math.floor(Math.random() * praiseWords.length)];
        feedback.classList.add('correct');
        playSuccessSound();

        if (button) {
            button.classList.add('correct');
        }
    } else {
        feedback.textContent = wrongWords[Math.floor(Math.random() * wrongWords.length)];
        feedback.classList.add('wrong');
        playWrongSound();

        if (button) {
            button.classList.add('wrong');
            const allOptions = document.querySelectorAll('.option-btn');
            allOptions.forEach(btn => {
                if (btn.textContent === correctAnswer) {
                    btn.classList.add('correct');
                }
            });
        }
    }

    document.getElementById('scoreDisplay').textContent = score;
    document.getElementById('nextBtn').style.display = 'block';

    const currentWord = gameQuestions[currentQuestionIndex];
    updateWordStats(currentWord, isCorrect);
    if (effectiveMode === 'write' && !isCorrect) {
        feedback.textContent = `哎呀，错啦！正确答案是: ${currentWord.word}`;
    }

    if (!isCorrect) {
        saveWrongWord(currentWord);
    } else if (window._isWrongMode) {
        removeWrongWord(currentWord.word);
    }
}

// 下一题
function nextQuestion() {
    currentQuestionIndex++;

    if (currentQuestionIndex >= getCurrentQuestionCount()) {
        showResult();
    } else {
        displayQuestion();
        saveGameProgress();
    }
}

// 显示结果
function showResult() {
    clearPendingAudio();
    if (window._isWrongMode) {
        totalQuestions = window._origTotal || 15;
        window._isWrongMode = false;
    }
    recordCheckin();
    saveScore(getSessionRecordMode(), score);

    showOnlyScreen('resultScreen');

    document.getElementById('finalScore').textContent = `${score} 分`;

    const maxScore = getCurrentQuestionCount() * 10;
    const accuracy = maxScore ? score / maxScore : 0;

    const starsContainer = document.getElementById('stars');
    starsContainer.innerHTML = '';
    const starCount = Math.ceil(accuracy * 5);
    for (let i = 0; i < starCount && i < 5; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '\u2B50';
        star.style.animationDelay = `${i * 0.2}s`;
        starsContainer.appendChild(star);
    }

    const resultMessage = document.getElementById('resultMessage');
    if (accuracy >= 0.9) {
        resultMessage.textContent = '太棒了！你是英语小天才！';
    } else if (accuracy >= 0.75) {
        resultMessage.textContent = '很不错！继续加油！';
    } else if (accuracy >= 0.5) {
        resultMessage.textContent = '还可以哦，多练习会更好！';
    } else {
        resultMessage.textContent = '别灰心，再接再厉！';
    }

    if (currentMode === 'challenge') {
        const dailySummary = saveDailyChallengeResult(score, getCurrentQuestionCount());
        resultMessage.textContent += dailySummary.isNewBest ? ' 今日挑战新纪录！' : ' 今日挑战最佳：' + dailySummary.bestScore + ' 分';
    } else if (currentMode === 'review') {
        resultMessage.textContent += ' 已完成一轮智能复习！';
    }
}

// 重新开始
function restartGame() {
    if (currentMode === 'challenge') {
        startDailyChallenge();
        return;
    }
    if (currentMode === 'review') {
        startSmartReview();
        return;
    }
    startGame(currentMode);
}

// 返回主菜单
function showMenu() {
    clearInterval(timerInterval);
    clearPendingAudio();
    showMenuScreen();
    updateWrongWordsBtn();
    loadCheckinData();
}

// 计时器
function resetTimer() {
    clearInterval(timerInterval);
    const effectiveMode = getEffectiveMode();
    timer = 15;
    document.getElementById('timer').textContent = timer;
    document.getElementById('timer').classList.remove('warning');

    timerInterval = setInterval(() => {
        timer--;
        document.getElementById('timer').textContent = timer;

        if (timer <= 5) {
            document.getElementById('timer').classList.add('warning');
        }

        if (timer <= 0) {
            clearInterval(timerInterval);
            if (!isAnswered) {
                isAnswered = true;
                const feedback = document.getElementById('feedback');
                feedback.style.display = 'block';
                setAnswerControlsDisabled(true);
                feedback.textContent = '时间到！';
                feedback.classList.add('wrong');
                playWrongSound();

                if (effectiveMode === 'write') {
                    const question = gameQuestions[currentQuestionIndex];
                    feedback.textContent = `时间到！正确答案是: ${question.word}`;
                }

                document.getElementById('nextBtn').style.display = 'block';
                saveWrongWord(gameQuestions[currentQuestionIndex]);
                updateWordStats(gameQuestions[currentQuestionIndex], false);

                if (effectiveMode !== 'write') {
                    const allOptions = document.querySelectorAll('.option-btn');
                    allOptions.forEach(btn => {
                        if (effectiveMode === 'listen' || effectiveMode === 'read') {
                            const correctAnswer = gameQuestions[currentQuestionIndex].chinese;
                            if (btn.textContent === correctAnswer) {
                                btn.classList.add('correct');
                            }
                        } else if (effectiveMode === 'reverse') {
                            const correctAnswer = gameQuestions[currentQuestionIndex].word;
                            if (btn.textContent === correctAnswer) {
                                btn.classList.add('correct');
                            }
                        }
                    });
                }
            }
        }
    }, 1000);
}

function handleGameKeyboardShortcuts(e) {
    var gameScreen = document.getElementById('gameScreen');
    if (!gameScreen || gameScreen.style.display !== 'block') return;

    var activeElement = document.activeElement;
    var isTyping = activeElement && (activeElement.id === 'wordInput' || activeElement.id === 'playerNameInput');
    var nextBtn = document.getElementById('nextBtn');
    var playButtonVisible = document.getElementById('playAudioBtn').style.display !== 'none';

    if ((e.key === ' ' || e.code === 'Space') && playButtonVisible) {
        e.preventDefault();
        playAudio();
        return;
    }

    if (e.key === 'Enter') {
        if (nextBtn.style.display !== 'none') {
            e.preventDefault();
            nextQuestion();
            return;
        }
        if (getEffectiveMode() === 'write' && !isAnswered) {
            e.preventDefault();
            submitAnswer();
        }
        return;
    }

    if (isTyping) return;
    if (isAnswered) return;

    if (/^[1-4]$/.test(e.key)) {
        var options = Array.from(document.querySelectorAll('.option-btn'));
        var index = Number(e.key) - 1;
        if (options[index]) {
            e.preventDefault();
            options[index].click();
        }
    }
}

document.addEventListener('keydown', handleGameKeyboardShortcuts);

document.addEventListener('click', function() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });

// 历史记录管理
function saveScore(mode, score) {
    const history = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
    const timestamp = Date.now();
    const record = {
        mode: mode,
        score: score,
        timestamp: timestamp,
        date: new Date(timestamp).toLocaleString('zh-CN'),
        player: currentPlayerName
    };
    history.unshift(record);
    if (history.length > 30) {
        history.pop();
    }
    localStorage.setItem(getStorageKey('history'), JSON.stringify(history));

    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/history').set(history)
            .catch(err => console.log('Firebase保存历史失败:', err));
    }

    clearSavedProgress();
}

function showHistory() {
    showOnlyScreen('historyScreen');

    const history = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
    const historyList = document.getElementById('historyList');

    if (history.length === 0) {
        historyList.innerHTML = '<div class="no-history">暂无游戏记录，快去玩游戏吧！</div>';
        return;
    }

    const sortedHistory = [...history].sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    historyList.innerHTML = sortedHistory.map((record) => {
        return '<div class="history-item">' +
            '<div class="history-item-info">' +
            '<div class="history-item-mode">' + escapeHtml(getModeDisplayName(record.mode)) + '</div>' +
            '<div class="history-item-date">' + escapeHtml(formatRecordDate(record)) + '</div>' +
            '</div>' +
            '<div class="history-item-score">' + (record.score || 0) + ' 分</div>' +
            '</div>';
    }).join('');
}

function clearHistory() {
    localStorage.removeItem(getStorageKey('history'));
    showHistory();
}

var SMART_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;

function getAdaptiveWordAccuracy(stats) {
    return stats && stats.attempts ? (stats.correct || 0) / stats.attempts : 0;
}

function clampReviewNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function dedupeQuestionsByWordEnhanced(questions) {
    var seen = {};
    return questions.filter(function(question) {
        var key = normalizeAnswer(question.word);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

getReviewState = function(stats) {
    stats = stats || {};
    var now = Date.now();
    var nextReviewAt = stats.nextReviewAt || 0;
    var dueInMs = nextReviewAt ? nextReviewAt - now : 0;
    var isDue = !nextReviewAt || dueInMs <= 0;
    return {
        accuracy: getAdaptiveWordAccuracy(stats),
        isDue: isDue,
        overdueMs: isDue ? Math.abs(Math.min(dueInMs, 0)) : 0,
        dueInHours: isDue ? 0 : Math.ceil(dueInMs / (60 * 60 * 1000)),
        dueInDays: isDue ? 0 : Math.ceil(dueInMs / SMART_REVIEW_DAY_MS)
    };
};

updateWordStats = function(question, isCorrect) {
    if (!question || !question.word || !currentPlayerName) return;
    var key = normalizeAnswer(question.word);
    var allStats = getWordStatsData();
    var now = Date.now();
    var entry = allStats[key] || {
        word: question.word,
        chinese: question.chinese,
        attempts: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        maxStreak: 0,
        lastSeen: 0,
        lastWrong: 0,
        reviewLevel: 0,
        nextReviewAt: 0,
        lastResult: '',
        firstSeen: now,
        stabilityDays: 0.25,
        difficulty: 0.45,
        consecutiveWrong: 0
    };

    entry.word = question.word;
    entry.chinese = question.chinese;
    entry.attempts += 1;
    entry.lastSeen = now;
    entry.lastResult = isCorrect ? 'correct' : 'wrong';

    if (isCorrect) {
        entry.correct += 1;
        entry.streak = (entry.streak || 0) + 1;
        entry.maxStreak = Math.max(entry.maxStreak || 0, entry.streak);
        entry.consecutiveWrong = 0;
        entry.reviewLevel = Math.min((entry.reviewLevel || 0) + 1, 12);
        var accuracyRate = getAdaptiveWordAccuracy({ attempts: entry.attempts, correct: entry.correct });
        var currentStability = Math.max(entry.stabilityDays || 0.25, 0.25);
        var streakBonus = Math.min(0.5, entry.streak * 0.08);
        var accuracyBonus = Math.max(0, accuracyRate - 0.6) * 0.8;
        var difficultyPenalty = (entry.difficulty || 0.45) * 0.6;
        var growthFactor = clampReviewNumber(1.4 + streakBonus + accuracyBonus - difficultyPenalty + currentStability * 0.08, 1.3, 2.6);
        entry.stabilityDays = clampReviewNumber(currentStability * growthFactor, 0.5, 45);
        entry.difficulty = clampReviewNumber((entry.difficulty || 0.45) - 0.05 - Math.min(0.05, entry.streak * 0.01), 0.15, 0.95);
    } else {
        entry.wrong += 1;
        entry.streak = 0;
        entry.lastWrong = now;
        entry.reviewLevel = 0;
        entry.consecutiveWrong = (entry.consecutiveWrong || 0) + 1;
        entry.difficulty = clampReviewNumber((entry.difficulty || 0.45) + 0.12, 0.15, 0.95);
        entry.stabilityDays = clampReviewNumber(Math.max(entry.stabilityDays || 0.25, 0.25) * 0.45, 0.125, 12);
    }

    entry.nextReviewAt = now + Math.round(entry.stabilityDays * SMART_REVIEW_DAY_MS);
    allStats[key] = entry;
    saveWordStatsData(allStats);
};

calculateReviewWeight = function(question, statsMap, wrongWordMap) {
    var key = normalizeAnswer(question.word);
    var stats = statsMap[key] || {};
    var attempts = stats.attempts || 0;
    var wrong = stats.wrong || 0;
    var accuracy = attempts ? getAdaptiveWordAccuracy(stats) : 0.55;
    var reviewState = getReviewState(stats);
    var weight = 1;

    if (reviewState.isDue) {
        weight += 7 + Math.min(8, reviewState.overdueMs / SMART_REVIEW_DAY_MS);
    } else {
        weight += Math.max(0, 2.5 - reviewState.dueInHours / 10);
    }

    weight += (wrongWordMap[key] || 0) * 4;
    weight += wrong * 2;
    weight += attempts ? (1 - accuracy) * 5 : 2;
    weight += (stats.difficulty || 0.45) * 4;
    weight += Math.max(0, 2 - Math.min(stats.stabilityDays || 0.25, 2));
    weight += Math.min(3, (stats.consecutiveWrong || 0) * 1.2);

    if ((stats.streak || 0) >= 4 && accuracy >= 0.85 && !reviewState.isDue) {
        weight *= 0.4;
    }

    return weight;
};

function pickPriorityQuestionsEnhanced(pool, count, statsMap, wrongWordMap) {
    if (!pool.length || count <= 0) return [];
    var remaining = dedupeQuestionsByWordEnhanced(pool).slice();
    var selected = [];

    while (selected.length < count && remaining.length) {
        var weights = remaining.map(function(question) {
            return calculateReviewWeight(question, statsMap, wrongWordMap);
        });
        var totalWeight = weights.reduce(function(sum, value) { return sum + value; }, 0);
        var roll = Math.random() * totalWeight;
        var pickedIndex = 0;
        for (var i = 0; i < remaining.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                pickedIndex = i;
                break;
            }
        }
        selected.push(remaining.splice(pickedIndex, 1)[0]);
    }

    return selected;
}

function buildSmartReviewQuestionsEnhanced(pool, count) {
    var wrongWordMap = {};
    getWrongWordsData().forEach(function(item) {
        wrongWordMap[normalizeAnswer(item.word)] = item.count || 1;
    });

    var statsMap = getWordStatsData();
    var buckets = { due: [], weak: [], fresh: [], reinforce: [] };

    dedupeQuestionsByWordEnhanced(pool).forEach(function(question) {
        var key = normalizeAnswer(question.word);
        var stats = statsMap[key] || {};
        var attempts = stats.attempts || 0;
        var accuracy = getAdaptiveWordAccuracy(stats);
        var reviewState = getReviewState(stats);
        var isWeak = attempts > 0 && (accuracy < 0.75 || (wrongWordMap[key] || 0) >= 2 || (stats.consecutiveWrong || 0) > 0);

        if (!attempts) {
            buckets.fresh.push(question);
        } else if (reviewState.isDue) {
            buckets.due.push(question);
        } else if (isWeak) {
            buckets.weak.push(question);
        } else {
            buckets.reinforce.push(question);
        }
    });

    var plan = [];
    function appendUnique(items) {
        items.forEach(function(question) {
            if (plan.length >= count) return;
            var key = normalizeAnswer(question.word);
            var exists = plan.some(function(current) {
                return normalizeAnswer(current.word) === key;
            });
            if (!exists) {
                plan.push(question);
            }
        });
    }

    appendUnique(pickPriorityQuestionsEnhanced(buckets.due, Math.min(buckets.due.length, Math.max(4, Math.ceil(count * 0.45))), statsMap, wrongWordMap));
    appendUnique(pickPriorityQuestionsEnhanced(buckets.weak, Math.min(buckets.weak.length, Math.ceil(count * 0.3)), statsMap, wrongWordMap));
    appendUnique(pickPriorityQuestionsEnhanced(buckets.fresh, Math.min(buckets.fresh.length, Math.max(1, Math.floor(count * 0.15))), statsMap, wrongWordMap));
    if (plan.length < count) appendUnique(pickPriorityQuestionsEnhanced(buckets.reinforce, count - plan.length, statsMap, wrongWordMap));
    if (plan.length < count) appendUnique(pickPriorityQuestionsEnhanced(pool, count - plan.length, statsMap, wrongWordMap));
    return plan.slice(0, count);
}

function getModePerformanceSummaryEnhanced(history) {
    var trackedModes = ['listen', 'read', 'write', 'reverse', 'daily', 'review'];
    var stats = {};

    history.forEach(function(record) {
        var mode = record.mode || 'unknown';
        if (trackedModes.indexOf(mode) === -1) return;
        if (!stats[mode]) {
            stats[mode] = { count: 0, totalScore: 0 };
        }
        stats[mode].count += 1;
        stats[mode].totalScore += record.score || 0;
    });

    return Object.keys(stats).map(function(mode) {
        return {
            mode: mode,
            count: stats[mode].count,
            average: Math.round(stats[mode].totalScore / stats[mode].count)
        };
    }).sort(function(a, b) {
        return a.average - b.average || a.count - b.count;
    })[0] || null;
}

function updateStudyFocusPanel() {
    var grid = document.getElementById('studyFocusGrid');
    var tip = document.getElementById('studyFocusTip');
    var smartReviewBtn = document.getElementById('smartReviewBtn');
    if (!grid || !tip || !smartReviewBtn) return;

    if (!currentPlayerName) {
        grid.innerHTML = '';
        tip.textContent = '输入名字后自动生成今天的学习建议';
        smartReviewBtn.textContent = '智能复习';
        return;
    }

    var wordStats = Object.values(getWordStatsData());
    var history = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
    var reviewOverview = getReviewOverview(wordStats);
    var weakCount = wordStats.filter(function(item) {
        return (item.attempts || 0) > 0 && (getAdaptiveWordAccuracy(item) < 0.75 || (item.wrong || 0) >= 2 || (item.consecutiveWrong || 0) > 0);
    }).length;
    var weakestMode = getModePerformanceSummaryEnhanced(history);
    var dailyEntry = getDailyChallengeData()[getTodayKey()];
    var recommendedMode = weakestMode ? getModeDisplayName(weakestMode.mode) : '智能复习';
    var goalText = reviewOverview.dueNow > 0 ? '先复习 ' + Math.min(reviewOverview.dueNow, totalQuestions) + ' 题' : (weakCount > 0 ? '巩固 ' + Math.min(weakCount, totalQuestions) + ' 个薄弱词' : '挑战一次每日任务');

    grid.innerHTML = [
        { label: '现在该复习', value: reviewOverview.dueNow, note: '到期优先' },
        { label: '薄弱词汇', value: weakCount, note: '重点巩固' },
        { label: '推荐模式', value: recommendedMode, note: '下一轮练它' },
        { label: '今日目标', value: goalText, note: dailyEntry ? '今日最佳 ' + dailyEntry.bestScore + ' 分' : '保持节奏' }
    ].map(function(card) {
        return '<div class="study-focus-item"><div class="study-focus-label">' + escapeHtml(card.label) + '</div><div class="study-focus-value">' + escapeHtml(card.value) + '</div><div class="study-focus-note">' + escapeHtml(card.note) + '</div></div>';
    }).join('');

    tip.textContent = reviewOverview.dueNow > 0 ? '建议先做一轮智能复习，优先处理已经到期的词，再去挑战新题。' : (weakCount > 0 ? '到期词不多，适合先补薄弱词，再做每日挑战巩固手感。' : '当前节奏不错，适合继续做每日挑战或切换模式扩大覆盖面。');
    smartReviewBtn.textContent = reviewOverview.dueNow > 0 ? '智能复习 (' + reviewOverview.dueNow + ')' : '智能复习';
}

var __originalShowMenuScreen = showMenuScreen;
showMenuScreen = function() {
    __originalShowMenuScreen();
    updateStudyFocusPanel();
};

startSmartReview = function() {
    var availableWords = getAllVocabulary();
    if (availableWords.length < 4) {
        alert('可用单词太少，请至少选择一个年级！');
        return;
    }
    clearPendingAudio();
    currentMode = 'review';
    currentQuestionIndex = 0;
    score = 0;
    var questionCount = Math.min(totalQuestions, availableWords.length);
    gameQuestions = buildSmartReviewQuestionsEnhanced(availableWords, questionCount);
    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';
    clearSavedProgress();
    displayQuestion();
};

var __originalLoadPlayerData = loadPlayerData;
loadPlayerData = function(playerName) {
    __originalLoadPlayerData(playerName);
    updateStudyFocusPanel();
    setTimeout(updateStudyFocusPanel, 1200);
};

var __originalShowMenu = showMenu;
showMenu = function() {
    __originalShowMenu();
    updateStudyFocusPanel();
};
var ACCOUNT_STORAGE_KEY = 'englishGame_accounts';

function getAccountsData() {
    try {
        return JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || '{}');
    } catch (e) {
        console.log('读取账号信息失败，使用空账号表', e);
        return {};
    }
}

function saveAccountsData(data) {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(data));
}

function getAccountLookupKey(name) {
    return normalizeAnswer(name);
}

function getStoredAccount(name) {
    return getAccountsData()[getAccountLookupKey(name)] || null;
}

function saveStoredAccount(name, account) {
    var allAccounts = getAccountsData();
    allAccounts[getAccountLookupKey(name)] = account;
    saveAccountsData(allAccounts);
}

function showLoginMessage(text, type) {
    var messageEl = document.getElementById('loginMessage');
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.className = 'login-message' + (type ? ' ' + type : '');
}

function setLoginBusy(isBusy) {
    var button = document.getElementById('loginBtn');
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = isBusy ? '登录中...' : ' 登录 / 注册';
}

function clearLoginFormState() {
    var nameInput = document.getElementById('playerNameInput');
    var passwordInput = document.getElementById('playerPasswordInput');
    if (nameInput) nameInput.style.borderColor = '#e0e0e0';
    if (passwordInput) passwordInput.style.borderColor = '#e0e0e0';
    showLoginMessage('');
}

function getPasswordHashFallback(raw) {
    var hash = 2166136261;
    for (var i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return 'fallback-' + (hash >>> 0).toString(16);
}

async function hashPlayerPassword(name, password) {
    var raw = 'english-game|' + getAccountLookupKey(name) + '|' + password;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        var bytes = new TextEncoder().encode(raw);
        var digest = await window.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(function(byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }
    return getPasswordHashFallback(raw);
}

async function fetchRemotePlayerRecord(name) {
    if (!isFirebaseReady || !firebaseDB) return null;
    try {
        var snapshot = await firebaseDB.ref('players/' + name).once('value');
        return snapshot.val();
    } catch (err) {
        console.log('读取云端账号失败，继续使用本地模式', err);
        return null;
    }
}

async function saveRemoteAccount(name, account) {
    if (!isFirebaseReady || !firebaseDB) return;
    try {
        await firebaseDB.ref('players/' + name + '/auth').set(account);
    } catch (err) {
        console.log('保存云端账号失败，已保留本地账号', err);
    }
}

function finishPlayerLogin(name) {
    currentPlayerName = name;
    localStorage.setItem('englishGameLastPlayer', name);
    clearLoginFormState();
    var passwordInput = document.getElementById('playerPasswordInput');
    if (passwordInput) passwordInput.value = '';

    showMenuScreen();
    document.getElementById('playerInfo').style.display = 'flex';
    document.getElementById('playerNameDisplay').textContent = ' ' + name;

    loadPlayerData(name);
    updateWrongWordsBtn();
    loadCheckinData();
}

loginPlayer = async function() {
    var nameInput = document.getElementById('playerNameInput');
    var passwordInput = document.getElementById('playerPasswordInput');
    var name = (nameInput.value || '').trim();
    var password = (passwordInput.value || '').trim();

    clearLoginFormState();

    if (!name) {
        nameInput.style.borderColor = '#f5576c';
        showLoginMessage('请输入名字', 'error');
        return;
    }
    if (!password) {
        passwordInput.style.borderColor = '#f5576c';
        showLoginMessage('请输入密码', 'error');
        return;
    }
    if (password.length < 4) {
        passwordInput.style.borderColor = '#f5576c';
        showLoginMessage('密码至少 4 位', 'error');
        return;
    }

    setLoginBusy(true);
    try {
        var remotePlayer = await fetchRemotePlayerRecord(name);
        var remoteAccount = remotePlayer && remotePlayer.auth && remotePlayer.auth.passwordHash ? remotePlayer.auth : null;
        var localAccount = getStoredAccount(name);
        var passwordHash = await hashPlayerPassword(name, password);
        var matchedAccount = localAccount || remoteAccount;
        var isNewAccount = false;

        if (matchedAccount && matchedAccount.passwordHash) {
            if (matchedAccount.passwordHash !== passwordHash) {
                passwordInput.style.borderColor = '#f5576c';
                showLoginMessage('密码不正确，请重新输入', 'error');
                return;
            }
            var mergedAccount = {
                displayName: matchedAccount.displayName || name,
                passwordHash: matchedAccount.passwordHash,
                createdAt: matchedAccount.createdAt || Date.now(),
                updatedAt: Date.now()
            };
            saveStoredAccount(name, mergedAccount);
            if (!remoteAccount || remoteAccount.passwordHash !== mergedAccount.passwordHash) {
                await saveRemoteAccount(name, mergedAccount);
            }
        } else {
            isNewAccount = true;
            var newAccount = {
                displayName: name,
                passwordHash: passwordHash,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            saveStoredAccount(name, newAccount);
            await saveRemoteAccount(name, newAccount);
        }

        finishPlayerLogin(name);
        if (isNewAccount) {
            showLoginMessage('新账号已创建', 'success');
        }
    } finally {
        setLoginBusy(false);
    }
};

var __originalSwitchPlayerAuth = switchPlayer;
switchPlayer = function() {
    __originalSwitchPlayerAuth();
    var passwordInput = document.getElementById('playerPasswordInput');
    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.style.borderColor = '#e0e0e0';
    }
    clearLoginFormState();
};

document.addEventListener('DOMContentLoaded', function() {
    var passwordInput = document.getElementById('playerPasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') loginPlayer();
        });
    }
});
SCREEN_IDS.push('forgotPasswordScreen', 'accountCenterScreen', 'adminManageScreen');

var currentPlayerAccount = null;
var DEFAULT_ADMIN_NAMES = ['admin', '管理员'];

function isDefaultAdminName(name) {
    return DEFAULT_ADMIN_NAMES.indexOf(normalizeAnswer(name)) !== -1;
}

function normalizeAccountRecord(name, account) {
    var base = account || {};
    return {
        displayName: base.displayName || name,
        passwordHash: base.passwordHash || '',
        passwordHint: base.passwordHint || '',
        createdAt: base.createdAt || Date.now(),
        updatedAt: base.updatedAt || Date.now(),
        isAdmin: !!base.isAdmin || isDefaultAdminName(name)
    };
}

async function getMergedAccountRecord(name) {
    var localAccount = getStoredAccount(name);
    var remotePlayer = await fetchRemotePlayerRecord(name);
    var remoteAccount = remotePlayer && remotePlayer.auth ? remotePlayer.auth : null;
    if (!localAccount && !remoteAccount) return null;
    return normalizeAccountRecord(name, Object.assign({}, remoteAccount || {}, localAccount || {}));
}

async function saveAccountRecord(name, account) {
    var normalized = normalizeAccountRecord(name, account);
    saveStoredAccount(name, normalized);
    await saveRemoteAccount(name, normalized);
    return normalized;
}

function getPlayerStoragePrefix(name) {
    return 'englishGame_' + name + '_';
}

function removePlayerLocalData(name) {
    var keysToRemove = ['history', 'progress', 'wordStats', 'dailyChallenge', 'wrongWords', 'checkin'];
    keysToRemove.forEach(function(key) {
        localStorage.removeItem(getPlayerStoragePrefix(name) + key);
    });
}

function setAdminManageButtonVisibility() {
    var adminBtn = document.getElementById('adminManageBtn');
    if (!adminBtn) return;
    adminBtn.style.display = currentPlayerAccount && currentPlayerAccount.isAdmin ? 'block' : 'none';
}

function showLoginScreenFromUtility() {
    clearInterval(timerInterval);
    clearPendingAudio();
    showOnlyScreen('loginScreen');
    showLoginMessage('');
}

function showForgotPasswordScreen() {
    var forgotNameInput = document.getElementById('forgotPlayerNameInput');
    var playerNameInput = document.getElementById('playerNameInput');
    if (forgotNameInput && playerNameInput) {
        forgotNameInput.value = (playerNameInput.value || '').trim();
    }
    var hintCard = document.getElementById('forgotPasswordHintCard');
    if (hintCard) hintCard.style.display = 'none';
    var hintText = document.getElementById('forgotPasswordHintText');
    if (hintText) hintText.textContent = '未设置';
    var messageEl = document.getElementById('forgotPasswordMessage');
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.className = 'login-message';
    }
    showOnlyScreen('forgotPasswordScreen');
}

async function lookupPasswordHint() {
    var nameInput = document.getElementById('forgotPlayerNameInput');
    var messageEl = document.getElementById('forgotPasswordMessage');
    var hintCard = document.getElementById('forgotPasswordHintCard');
    var hintText = document.getElementById('forgotPasswordHintText');
    var name = (nameInput.value || '').trim();
    if (!name) {
        messageEl.textContent = '请输入玩家名字';
        messageEl.className = 'login-message error';
        if (hintCard) hintCard.style.display = 'none';
        return;
    }
    var account = await getMergedAccountRecord(name);
    if (!account || !account.passwordHash) {
        messageEl.textContent = '没有找到这个账号';
        messageEl.className = 'login-message error';
        if (hintCard) hintCard.style.display = 'none';
        return;
    }
    messageEl.textContent = account.passwordHint ? '已找到密码提示' : '这个账号还没有设置密码提示';
    messageEl.className = 'login-message success';
    if (hintText) hintText.textContent = account.passwordHint || '未设置提示';
    if (hintCard) hintCard.style.display = 'block';
}

function showAccountCenter() {
    if (!currentPlayerName) {
        alert('请先登录账号');
        return;
    }
    var accountNameEl = document.getElementById('accountCenterPlayerName');
    if (accountNameEl) accountNameEl.textContent = currentPlayerName;
    var hintInput = document.getElementById('passwordHintInput');
    if (hintInput) hintInput.value = currentPlayerAccount && currentPlayerAccount.passwordHint ? currentPlayerAccount.passwordHint : '';
    ['currentPasswordForChange','newPasswordForChange','confirmPasswordForChange'].forEach(function(id) {
        var input = document.getElementById(id);
        if (input) input.value = '';
    });
    var messageEl = document.getElementById('accountCenterMessage');
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.className = 'login-message';
    }
    showOnlyScreen('accountCenterScreen');
}

async function updatePlayerPasswordAndHint() {
    var currentPasswordInput = document.getElementById('currentPasswordForChange');
    var newPasswordInput = document.getElementById('newPasswordForChange');
    var confirmPasswordInput = document.getElementById('confirmPasswordForChange');
    var hintInput = document.getElementById('passwordHintInput');
    var messageEl = document.getElementById('accountCenterMessage');
    var currentPassword = (currentPasswordInput.value || '').trim();
    var newPassword = (newPasswordInput.value || '').trim();
    var confirmPassword = (confirmPasswordInput.value || '').trim();
    var passwordHint = (hintInput.value || '').trim();

    if (!currentPlayerName || !currentPlayerAccount) {
        messageEl.textContent = '请先登录账号';
        messageEl.className = 'login-message error';
        return;
    }
    if (!currentPassword) {
        messageEl.textContent = '请输入当前密码';
        messageEl.className = 'login-message error';
        return;
    }

    var currentHash = await hashPlayerPassword(currentPlayerName, currentPassword);
    if (currentHash !== currentPlayerAccount.passwordHash) {
        messageEl.textContent = '当前密码不正确';
        messageEl.className = 'login-message error';
        return;
    }
    if (newPassword) {
        if (newPassword.length < 4) {
            messageEl.textContent = '新密码至少 4 位';
            messageEl.className = 'login-message error';
            return;
        }
        if (newPassword !== confirmPassword) {
            messageEl.textContent = '两次输入的新密码不一致';
            messageEl.className = 'login-message error';
            return;
        }
    }

    var updatedAccount = normalizeAccountRecord(currentPlayerName, currentPlayerAccount);
    updatedAccount.passwordHint = passwordHint;
    updatedAccount.updatedAt = Date.now();
    if (newPassword) {
        updatedAccount.passwordHash = await hashPlayerPassword(currentPlayerName, newPassword);
    }
    currentPlayerAccount = await saveAccountRecord(currentPlayerName, updatedAccount);
    messageEl.textContent = newPassword ? '密码和提示已更新' : '密码提示已更新';
    messageEl.className = 'login-message success';
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
}

async function fetchAllPlayerRecords() {
    var localAccounts = getAccountsData();
    var players = {};
    Object.keys(localAccounts).forEach(function(key) {
        var account = localAccounts[key];
        var name = account.displayName || key;
        players[name] = {
            name: name,
            auth: normalizeAccountRecord(name, account),
            source: ['本地']
        };
    });
    if (isFirebaseReady && firebaseDB) {
        try {
            var snapshot = await firebaseDB.ref('players').once('value');
            var remotePlayers = snapshot.val() || {};
            Object.keys(remotePlayers).forEach(function(name) {
                if (!players[name]) {
                    players[name] = { name: name, auth: null, source: [] };
                }
                players[name].remote = remotePlayers[name];
                players[name].source.push('云端');
                if (remotePlayers[name].auth) {
                    players[name].auth = normalizeAccountRecord(name, Object.assign({}, remotePlayers[name].auth, players[name].auth || {}));
                }
            });
        } catch (err) {
            console.log('读取玩家列表失败', err);
        }
    }
    return Object.keys(players).sort(function(a, b) { return a.localeCompare(b, 'zh-CN'); }).map(function(name) {
        return players[name];
    });
}

async function refreshAdminPlayerList() {
    if (!currentPlayerAccount || !currentPlayerAccount.isAdmin) {
        alert('只有管理员可以查看账号管理');
        return;
    }
    var listEl = document.getElementById('adminPlayerList');
    var messageEl = document.getElementById('adminManageMessage');
    listEl.innerHTML = '<div class="no-history">加载中...</div>';
    messageEl.textContent = '';
    messageEl.className = 'login-message';

    var players = await fetchAllPlayerRecords();
    if (!players.length) {
        listEl.innerHTML = '<div class="no-history">还没有玩家账号</div>';
        return;
    }
    listEl.innerHTML = players.map(function(player) {
        var auth = player.auth || {};
        var tags = [];
        if (auth.isAdmin) tags.push('管理员');
        (player.source || []).forEach(function(item) { tags.push(item); });
        var hintStatus = auth.passwordHint ? '已设置提示' : '未设置提示';
        return '<div class="admin-player-item">'
            + '<div class="admin-player-head">'
            + '<div class="admin-player-name">' + escapeHtml(player.name) + '</div>'
            + '<div class="admin-player-tags">' + tags.map(function(tag) { return '<span class="admin-tag">' + escapeHtml(tag) + '</span>'; }).join('') + '</div>'
            + '</div>'
            + '<div class="admin-player-meta">密码状态：' + (auth.passwordHash ? '已设置' : '未设置') + '，提示状态：' + hintStatus + '</div>'
            + '<div class="admin-actions">'
            + '<button class="mini-btn mini-btn-reset" onclick="adminResetPlayerPassword(' + JSON.stringify(player.name) + ')">重置密码</button>'
            + '<button class="mini-btn mini-btn-delete" onclick="adminDeletePlayerAccount(' + JSON.stringify(player.name) + ')">删除账号</button>'
            + '</div>'
            + '</div>';
    }).join('');
}

function showAdminManageScreen() {
    if (!currentPlayerAccount || !currentPlayerAccount.isAdmin) {
        alert('只有管理员可以进入账号管理');
        return;
    }
    showOnlyScreen('adminManageScreen');
    refreshAdminPlayerList();
}

async function adminResetPlayerPassword(name) {
    if (!currentPlayerAccount || !currentPlayerAccount.isAdmin) return;
    var tempPassword = Math.random().toString(36).slice(-6);
    var account = await getMergedAccountRecord(name);
    if (!account) {
        alert('没有找到这个玩家');
        return;
    }
    account.passwordHash = await hashPlayerPassword(name, tempPassword);
    account.updatedAt = Date.now();
    currentPlayerAccount = currentPlayerAccount && currentPlayerAccount.displayName === name ? account : currentPlayerAccount;
    await saveAccountRecord(name, account);
    var messageEl = document.getElementById('adminManageMessage');
    messageEl.textContent = '已将 ' + name + ' 的密码重置为临时密码：' + tempPassword;
    messageEl.className = 'login-message success';
    refreshAdminPlayerList();
}

async function adminDeletePlayerAccount(name) {
    if (!currentPlayerAccount || !currentPlayerAccount.isAdmin) return;
    if (normalizeAnswer(name) === normalizeAnswer(currentPlayerName)) {
        alert('不能删除当前登录的管理员账号');
        return;
    }
    if (!confirm('确定要删除玩家 ' + name + ' 的账号和数据吗？')) {
        return;
    }
    var accounts = getAccountsData();
    delete accounts[getAccountLookupKey(name)];
    saveAccountsData(accounts);
    removePlayerLocalData(name);
    if (isFirebaseReady && firebaseDB) {
        try {
            await firebaseDB.ref('players/' + name).remove();
        } catch (err) {
            console.log('删除云端玩家失败', err);
        }
    }
    var messageEl = document.getElementById('adminManageMessage');
    messageEl.textContent = '已删除玩家 ' + name;
    messageEl.className = 'login-message success';
    refreshAdminPlayerList();
}

var __originalFinishPlayerLoginExtended = finishPlayerLogin;
finishPlayerLogin = function(name) {
    __originalFinishPlayerLoginExtended(name);
    currentPlayerAccount = normalizeAccountRecord(name, getStoredAccount(name) || {});
    setAdminManageButtonVisibility();
};

var __originalLoginPlayerExtended = loginPlayer;
loginPlayer = async function() {
    var passwordInput = document.getElementById('playerPasswordInput');
    var nameInput = document.getElementById('playerNameInput');
    var name = (nameInput.value || '').trim();
    await __originalLoginPlayerExtended();
    if (!currentPlayerName || normalizeAnswer(currentPlayerName) !== normalizeAnswer(name)) {
        return;
    }
    var account = await getMergedAccountRecord(currentPlayerName);
    if (account) {
        if (!account.passwordHint) account.passwordHint = '';
        account.isAdmin = account.isAdmin || isDefaultAdminName(currentPlayerName);
        account.updatedAt = Date.now();
        currentPlayerAccount = await saveAccountRecord(currentPlayerName, account);
    }
    if (passwordInput) passwordInput.value = '';
    setAdminManageButtonVisibility();
};

var __originalShowMenuScreenExtended = showMenuScreen;
showMenuScreen = function() {
    __originalShowMenuScreenExtended();
    setAdminManageButtonVisibility();
};

var __originalSwitchPlayerFinal = switchPlayer;
switchPlayer = function() {
    __originalSwitchPlayerFinal();
    currentPlayerAccount = null;
    setAdminManageButtonVisibility();
};
function getNamedStorageKey(name, type) {
    return 'englishGame_' + name + '_' + type;
}

function hasMeaningfulStoredValue(value) {
    if (value === null || value === undefined) return false;
    return ['[]', '{}', '{"dates":[],"streak":0}', 'null', ''].indexOf(String(value).trim()) === -1;
}

function hasLocalLegacyPlayerData(name) {
    var keys = ['history', 'progress', 'wordStats', 'dailyChallenge', 'wrongWords', 'checkin'];
    return keys.some(function(key) {
        return hasMeaningfulStoredValue(localStorage.getItem(getNamedStorageKey(name, key)));
    });
}

function hasRemoteLegacyPlayerData(playerData) {
    if (!playerData) return false;
    var keys = ['history', 'progress', 'wordStats', 'dailyChallenge', 'wrongWords', 'checkin'];
    return keys.some(function(key) {
        var value = playerData[key];
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return !!value;
    });
}

function needsLegacyAccountProtection(name, localAccount, remoteAccount, remotePlayer) {
    if (localAccount || remoteAccount) return false;
    return hasLocalLegacyPlayerData(name) || hasRemoteLegacyPlayerData(remotePlayer);
}

var __originalLegacyProtectedLoginPlayer = loginPlayer;
loginPlayer = async function() {
    var nameInput = document.getElementById('playerNameInput');
    var name = (nameInput && nameInput.value || '').trim();

    if (name) {
        var remotePlayer = await fetchRemotePlayerRecord(name);
        var remoteAccount = remotePlayer && remotePlayer.auth && remotePlayer.auth.passwordHash ? remotePlayer.auth : null;
        var localAccount = getStoredAccount(name);
        if (needsLegacyAccountProtection(name, localAccount, remoteAccount, remotePlayer)) {
            clearLoginFormState();
            if (nameInput) nameInput.style.borderColor = '#f5576c';
            showLoginMessage('这个名字已有学习记录，但还没有绑定密码，请联系管理员重置或先完成账号迁移。', 'error');
            return;
        }
    }

    await __originalLegacyProtectedLoginPlayer();
};