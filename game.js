const vocabularyDatabase = window.vocabularyDatabase || {};

if (!Object.keys(vocabularyDatabase).length) {
    console.warn('璇嶅簱鏁版嵁鏈姞杞斤紝娓告垙灏嗘棤娉曟甯稿紑濮?);
}

// 娓告垙鐘舵€?
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

// ========== Firebase 閰嶇疆 ==========
// 璇锋浛鎹负浣犺嚜宸辩殑 Firebase 閰嶇疆锛堜粠 Firebase Console 鑾峰彇锛?
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

// 鍒濆鍖?Firebase
function initFirebase() {
    try {
        if (firebaseConfig.apiKey && firebaseConfig.databaseURL) {
            const app = firebase.initializeApp(firebaseConfig);
            firebaseDB = firebase.database();
            isFirebaseReady = true;
            if(firebase.analytics){firebase.analytics();console.log('Google Analytics 宸插惎鐢?);}
            updateSyncStatus(true);
            console.log('Firebase 宸茶繛鎺?);
        } else {
            console.log('Firebase 鏈厤缃紝浣跨敤鏈湴瀛樺偍');
            updateSyncStatus(false);
        }
    } catch (e) {
        console.log('Firebase 鍒濆鍖栧け璐ワ紝浣跨敤鏈湴瀛樺偍:', e);
        updateSyncStatus(false);
    }
}

function updateSyncStatus(online) {
    const el = document.getElementById('syncStatus');
    if (el) {
        if (online) {
            el.textContent = ' 浜戠鍚屾宸插紑鍚?;
            el.className = 'sync-status online';
        } else {
            el.textContent = ' 鏈湴瀛樺偍妯″紡';
            el.className = 'sync-status offline';
        }
    }
}

// ========== 鐜╁鐧诲綍 ==========
function loginPlayer() {
    const nameInput = document.getElementById('playerNameInput');
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.style.borderColor = '#f5576c';
        nameInput.placeholder = '璇疯緭鍏ュ悕瀛楋紒';
        return;
    }
    currentPlayerName = name;
    localStorage.setItem('englishGameLastPlayer', name);
    nameInput.style.borderColor = '#e0e0e0';

    showMenuScreen();
    document.getElementById('playerInfo').style.display = 'flex';
    document.getElementById('playerNameDisplay').textContent = ' ' + name;

    // 鍔犺浇璇ョ帺瀹剁殑鏁版嵁
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

// ========== 鏁版嵁瀛樺偍 ==========
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
        console.log('璇诲彇璁剧疆澶辫触锛屼娇鐢ㄩ粯璁よ缃?, e);
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
        listen: '鍚煶閫夊崟璇?,
        read: '鐪嬪崟璇嶉€変腑鏂?,
        write: '鍚煶鍐欏崟璇?,
        reverse: '鐪嬩腑鏂囬€夎嫳璇?,
        daily: '姣忔棩鎸戞垬',
        review: '鏅鸿兘澶嶄範'
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
    const entry = allStats[key] || {
        word: question.word,
        chinese: question.chinese,
        attempts: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        maxStreak: 0,
        lastSeen: 0,
        lastWrong: 0
    };
    entry.word = question.word;
    entry.chinese = question.chinese;
    entry.attempts += 1;
    entry.lastSeen = Date.now();
    if (isCorrect) {
        entry.correct += 1;
        entry.streak = (entry.streak || 0) + 1;
        entry.maxStreak = Math.max(entry.maxStreak || 0, entry.streak);
    } else {
        entry.wrong += 1;
        entry.streak = 0;
        entry.lastWrong = Date.now();
    }
    allStats[key] = entry;
    saveWordStatsData(allStats);
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
    const accuracy = attempts ? correct / attempts : 0.6;
    let weight = 1;
    weight += (wrongWordMap[key] || 0) * 5;
    weight += wrong * 2;
    weight += attempts ? (1 - accuracy) * 4 : 1.5;
    if (stats.lastWrong && Date.now() - stats.lastWrong < 7 * 24 * 60 * 60 * 1000) {
        weight += 2;
    }
    if (stats.lastSeen && Date.now() - stats.lastSeen > 3 * 24 * 60 * 60 * 1000) {
        weight += 1;
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
        alert('鍙敤鍗曡瘝澶皯锛岃鑷冲皯閫夋嫨涓€涓勾绾э紒');
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
        alert('鍙敤鍗曡瘝澶皯锛岃鑷冲皯閫夋嫨涓€涓勾绾э紒');
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
    const weakWordsList = document.getElementById('weakWordsList');
    const modePerformanceList = document.getElementById('modePerformanceList');
    const wordStats = Object.values(getWordStatsData());
    const history = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
    const wrongWords = getWrongWordsData();
    const checkinData = JSON.parse(localStorage.getItem(getStorageKey('checkin')) || '{"dates":[],"streak":0}');
    const dailyData = getDailyChallengeData()[getTodayKey()];

    const totalAttempts = wordStats.reduce(function(sum, item) { return sum + (item.attempts || 0); }, 0);
    const totalCorrect = wordStats.reduce(function(sum, item) { return sum + (item.correct || 0); }, 0);
    const accuracy = totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0;
    const bestScore = history.length ? Math.max.apply(null, history.map(function(item) { return item.score || 0; })) : 0;
    const masteredWords = wordStats.filter(function(item) {
        const attempts = item.attempts || 0;
        const correct = item.correct || 0;
        return attempts >= 3 && correct / attempts >= 0.8;
    }).length;

    const cards = [
        { title: '缁冧範灞€鏁?, value: history.length, subtitle: '绱瀹屾垚鐨勬父鎴忚疆娆? },
        { title: '绛旈鎬绘暟', value: totalAttempts, subtitle: '鎵€鏈変綔绛旀鏁? },
        { title: '鎬讳綋姝ｇ‘鐜?, value: accuracy + '%', subtitle: '绱鍑嗙‘鐜? },
        { title: '鎺屾彙璇嶆暟', value: masteredWords, subtitle: '缁冭繃涓旀纭巼80%' },
        { title: '杩炵画鎵撳崱', value: checkinData.streak || 0, subtitle: '鍧氭寔澶╂暟' },
        { title: '浠婃棩鎸戞垬', value: dailyData ? dailyData.bestScore + '鍒? : '鏈紑濮?, subtitle: dailyData ? '浠婃棩鏈€浣虫垚缁? : '蹇幓鎸戞垬涓€娆″惂' },
        { title: '閿欒瘝鏈?, value: wrongWords.length, subtitle: '寰呭涔犺瘝姹? },
        { title: '鍘嗗彶鏈€楂樺垎', value: bestScore, subtitle: '鎵€鏈夋ā寮忔渶楂樺垎' }
    ];

    reportGrid.innerHTML = cards.map(function(card) {
        return '<div class="report-card">' +
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
        const aScore = (1 - aRate) * aAttempts;
        const bScore = (1 - bRate) * bAttempts;
        return bScore - aScore || bAttempts - aAttempts;
    }).slice(0, 8);

    if (!weakestWords.length) {
        weakWordsList.innerHTML = '<div class="report-empty">杩樻病鏈夎冻澶熺殑鏁版嵁锛屽厛鍘荤帺鍑犺疆鍚э紒</div>';
    } else {
        weakWordsList.innerHTML = weakestWords.map(function(item) {
            const attempts = item.attempts || 0;
            const correct = item.correct || 0;
            const rate = attempts ? Math.round(correct / attempts * 100) : 0;
            return '<div class="report-item">' +
                '<div class="report-item-info">' +
                '<div class="report-item-label">' + escapeHtml(item.word) + '  ' + escapeHtml(item.chinese || '') + '</div>' +
                '<div class="report-item-meta">浣滅瓟 ' + attempts + ' 娆★紝姝ｇ‘鐜?' + rate + '%</div>' +
                '</div>' +
                '<div class="report-item-value">閿?' + (item.wrong || 0) + ' 娆?/div>' +
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
        modePerformanceList.innerHTML = '<div class="report-empty">杩樻病鏈夋ā寮忚〃鐜版暟鎹€?/div>';
    } else {
        modePerformanceList.innerHTML = modeItems.map(function(item) {
            return '<div class="report-item">' +
                '<div class="report-item-info">' +
                '<div class="report-item-label">' + escapeHtml(getModeDisplayName(item.mode)) + '</div>' +
                '<div class="report-item-meta">鍏辨寫鎴?' + item.count + ' 娆★紝骞冲潎 ' + item.average + ' 鍒?/div>' +
                '</div>' +
                '<div class="report-item-value">鏈€楂?' + item.bestScore + ' 鍒?/div>' +
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
function setQuestionCount(count){
    totalQuestions=count;
    document.querySelectorAll('.count-btn').forEach(function(b){b.classList.remove('selected');if(b.textContent.trim()===count+'棰?)b.classList.add('selected');});
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
function showWrongNotebook(){
    showOnlyScreen('wrongNotebookScreen');
    var ww=getWrongWordsData();var list=document.getElementById('wrongWordsList');
    if(ww.length===0){list.innerHTML='<div class="no-history">馃帀 澶浜嗭紒娌℃湁閿欒瘝锛?/div>';document.getElementById('practiceWrongBtn').style.display='none';return;}
    var sortedWords=ww.slice().sort(function(a,b){return (b.count||1)-(a.count||1)||(b.lastWrong||0)-(a.lastWrong||0);});
    document.getElementById('practiceWrongBtn').style.display='block';
    list.innerHTML=sortedWords.map(function(w){var safeWord=escapeHtml(w.word);var safeChinese=escapeHtml(w.chinese);return '<div class="wrong-word-item"><div><div class="wrong-word-english">'+safeWord+'</div><div class="wrong-word-chinese">'+safeChinese+'</div></div><div style="display:flex;align-items:center;gap:10px"><span class="wrong-word-count">閿?+(w.count||1)+'娆?/span><button class="wrong-word-play" data-word="'+encodeURIComponent(w.word)+'" onclick="speak(decodeURIComponent(this.dataset.word))">馃攰</button></div></div>';}).join('');
}
function clearWrongWords(){
    if(confirm('纭畾瑕佹竻绌洪敊璇嶆湰鍚楋紵')){localStorage.removeItem(getStorageKey('wrongWords'));if(isFirebaseReady&&firebaseDB){firebaseDB.ref('players/'+currentPlayerName+'/wrongWords').remove().catch(function(){});}updateWrongWordsBtn();showWrongNotebook();}
}
function startWrongWordsGame(){
    var ww=getWrongWordsData();if(ww.length===0){alert('閿欒瘝鏈负绌猴紒');return;}
    currentMode='read';currentQuestionIndex=0;score=0;
    var cnt=Math.min(ww.length,totalQuestions);gameQuestions=shuffleArray(ww).slice(0,cnt);
    window._origTotal=totalQuestions;window._isWrongMode=true;totalQuestions=cnt;
    showOnlyScreen('gameScreen');document.getElementById('submitBtn').style.display='none';
    displayQuestion();
}
// ========== Leaderboard ==========
function showLeaderboard(){
    showOnlyScreen('leaderboardScreen');
    var list=document.getElementById('leaderboardList');list.innerHTML='<div class="no-history">鍔犺浇涓?..</div>';
    if(isFirebaseReady&&firebaseDB){
        firebaseDB.ref('players').once('value').then(function(snap){
            var d=snap.val();if(!d){list.innerHTML='<div class="no-history">鏆傛棤鏁版嵁</div>';return;}
            var sc=[];Object.keys(d).forEach(function(n){var p=d[n];if(p.history&&Array.isArray(p.history)&&p.history.length){sc.push({name:n,score:Math.max.apply(null,p.history.map(function(h){return h.score||0;}))});}});
            sc.sort(function(a,b){return b.score-a.score||a.name.localeCompare(b.name,'zh-CN');});var top=sc.slice(0,20);
            if(top.length===0){list.innerHTML='<div class="no-history">鏆傛棤鎺掕鏁版嵁</div>';return;}
            var icons=['馃','馃','馃'];
            list.innerHTML=top.map(function(it,i){var r=i<3?icons[i]:(i+1);return '<div class="leaderboard-item"><span class="leaderboard-rank">'+r+'</span><span class="leaderboard-name">'+escapeHtml(it.name)+'</span><span class="leaderboard-score">'+it.score+' 鍒?/span></div>';}).join('');
        }).catch(function(){list.innerHTML='<div class="no-history">鍔犺浇澶辫触</div>';});
    }else{
        var h=JSON.parse(localStorage.getItem(getStorageKey('history'))||'[]');
        if(h.length===0){list.innerHTML='<div class="no-history">鏆傛棤鏁版嵁</div>';return;}
        var best=Math.max.apply(null,h.map(function(x){return x.score||0;}));
        list.innerHTML='<div class="leaderboard-item"><span class="leaderboard-rank">馃</span><span class="leaderboard-name">'+escapeHtml(currentPlayerName)+'</span><span class="leaderboard-score">'+best+' 鍒?/span></div>';
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
const praiseWords = ['Amazing!', 'Excellent!', 'Great!', 'Good!', '澶浜?', '浣犵湡鍘夊!', '缁х画鍔犳补!'];
const wrongWords = ['鍝庡憖锛岄敊鍟︼紒', '鍒伆蹇冿紒', '鍐嶆兂鎯筹紒'];

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
        star.textContent = '';
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
