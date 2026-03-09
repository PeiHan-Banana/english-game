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

const SCREEN_IDS = ['loginScreen', 'menuScreen', 'gameScreen', 'resultScreen', 'historyScreen', 'wrongNotebookScreen', 'leaderboardScreen'];

// ========== Firebase 配置 ==========
// 请替换为你自己的 Firebase 配置（从 Firebase Console 获取）
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

// 初始化 Firebase
function initFirebase() {
    try {
        if (firebaseConfig.apiKey && firebaseConfig.databaseURL) {
            const app = firebase.initializeApp(firebaseConfig);
            firebaseDB = firebase.database();
            isFirebaseReady = true;
            if(firebase.analytics){firebase.analytics();console.log('Google Analytics 已启用');}
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

// ========== 玩家登录 ==========
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

    // 加载该玩家的数据
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

// ========== 数据存储 ==========
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

// 保存游戏进度（断点续玩）
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

    // 保存到 localStorage
    localStorage.setItem(getStorageKey('progress'), JSON.stringify(progressData));

    // 保存到 Firebase
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/progress').set(progressData)
            .catch(err => console.log('Firebase保存进度失败:', err));
    }
}

// 加载玩家数据
function loadPlayerData(playerName) {
    // 先从 localStorage 加载
    const localProgress = localStorage.getItem(getStorageKey('progress'));
    if (localProgress) {
        const data = JSON.parse(localProgress);
        // 检查进度是否有效（24小时内）
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
            document.getElementById('resumeBtn').style.display = 'block';
        }
    }

    // 如果 Firebase 可用，从云端加载
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + playerName).once('value')
            .then(snapshot => {
                const data = snapshot.val();
                if (data) {
                    // 同步历史记录
                    if (data.history) {
                        const localHistory = JSON.parse(localStorage.getItem(getStorageKey('history')) || '[]');
                        // 合并云端和本地记录（去重）
                        const merged = mergeHistory(localHistory, data.history);
                        localStorage.setItem(getStorageKey('history'), JSON.stringify(merged));
                    }
                    // 同步游戏进度
                    if (data.progress && Date.now() - data.progress.timestamp < 24 * 60 * 60 * 1000) {
                        localStorage.setItem(getStorageKey('progress'), JSON.stringify(data.progress));
                        document.getElementById('resumeBtn').style.display = 'block';
                    }
                    if(data.wrongWords){var lw=JSON.parse(localStorage.getItem(getStorageKey('wrongWords'))||'[]');data.wrongWords.forEach(function(cw){var f=lw.find(function(m){return m.word===cw.word;});if(f)f.count=Math.max(f.count||1,cw.count||1);else lw.push(cw);});localStorage.setItem(getStorageKey('wrongWords'),JSON.stringify(lw));updateWrongWordsBtn();}
                    if(data.checkin&&data.checkin.dates){var lc=JSON.parse(localStorage.getItem(getStorageKey('checkin'))||'{"dates":[],"streak":0}');var as={};lc.dates.forEach(function(d){as[d]=1;});data.checkin.dates.forEach(function(d){as[d]=1;});var ad=Object.keys(as).sort();var st=ad.length>0?1:0;for(var i=ad.length-1;i>0;i--){if((new Date(ad[i])-new Date(ad[i-1]))/86400000===1)st++;else break;}localStorage.setItem(getStorageKey('checkin'),JSON.stringify({dates:ad,streak:st}));updateCheckinDisplay(st);}
                }
            })
            .catch(err => console.log('Firebase加载失败:', err));
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

// 继续上次游戏
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

// 清除已保存的进度
function clearSavedProgress() {
    localStorage.removeItem(getStorageKey('progress'));
    document.getElementById('resumeBtn').style.display = 'none';
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/progress').remove()
            .catch(err => console.log('Firebase清除进度失败:', err));
    }
}

// 页面关闭前自动保存
window.addEventListener('beforeunload', function() {
    if (currentMode && currentQuestionIndex < getCurrentQuestionCount() && currentQuestionIndex > 0) {
        saveGameProgress();
    }
});

// 页面加载时自动登录上次玩家
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


// 激励语

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
    document.querySelectorAll('.count-btn').forEach(function(b){b.classList.remove('selected');if(b.textContent.trim()===count+'题')b.classList.add('selected');});
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
    if(ww.length===0){list.innerHTML='<div class="no-history">🎉 太棒了！没有错词！</div>';document.getElementById('practiceWrongBtn').style.display='none';return;}
    var sortedWords=ww.slice().sort(function(a,b){return (b.count||1)-(a.count||1)||(b.lastWrong||0)-(a.lastWrong||0);});
    document.getElementById('practiceWrongBtn').style.display='block';
    list.innerHTML=sortedWords.map(function(w){var safeWord=escapeHtml(w.word);var safeChinese=escapeHtml(w.chinese);return '<div class="wrong-word-item"><div><div class="wrong-word-english">'+safeWord+'</div><div class="wrong-word-chinese">'+safeChinese+'</div></div><div style="display:flex;align-items:center;gap:10px"><span class="wrong-word-count">错'+(w.count||1)+'次</span><button class="wrong-word-play" data-word="'+encodeURIComponent(w.word)+'" onclick="speak(decodeURIComponent(this.dataset.word))">🔊</button></div></div>';}).join('');
}
function clearWrongWords(){
    if(confirm('确定要清空错词本吗？')){localStorage.removeItem(getStorageKey('wrongWords'));if(isFirebaseReady&&firebaseDB){firebaseDB.ref('players/'+currentPlayerName+'/wrongWords').remove().catch(function(){});}updateWrongWordsBtn();showWrongNotebook();}
}
function startWrongWordsGame(){
    var ww=getWrongWordsData();if(ww.length===0){alert('错词本为空！');return;}
    currentMode='read';currentQuestionIndex=0;score=0;
    var cnt=Math.min(ww.length,totalQuestions);gameQuestions=shuffleArray(ww).slice(0,cnt);
    window._origTotal=totalQuestions;window._isWrongMode=true;totalQuestions=cnt;
    showOnlyScreen('gameScreen');document.getElementById('submitBtn').style.display='none';
    displayQuestion();
}
// ========== Leaderboard ==========
function showLeaderboard(){
    showOnlyScreen('leaderboardScreen');
    var list=document.getElementById('leaderboardList');list.innerHTML='<div class="no-history">加载中...</div>';
    if(isFirebaseReady&&firebaseDB){
        firebaseDB.ref('players').once('value').then(function(snap){
            var d=snap.val();if(!d){list.innerHTML='<div class="no-history">暂无数据</div>';return;}
            var sc=[];Object.keys(d).forEach(function(n){var p=d[n];if(p.history&&Array.isArray(p.history)&&p.history.length){sc.push({name:n,score:Math.max.apply(null,p.history.map(function(h){return h.score||0;}))});}});
            sc.sort(function(a,b){return b.score-a.score||a.name.localeCompare(b.name,'zh-CN');});var top=sc.slice(0,20);
            if(top.length===0){list.innerHTML='<div class="no-history">暂无排行数据</div>';return;}
            var icons=['🥇','🥈','🥉'];
            list.innerHTML=top.map(function(it,i){var r=i<3?icons[i]:(i+1);return '<div class="leaderboard-item"><span class="leaderboard-rank">'+r+'</span><span class="leaderboard-name">'+escapeHtml(it.name)+'</span><span class="leaderboard-score">'+it.score+' 分</span></div>';}).join('');
        }).catch(function(){list.innerHTML='<div class="no-history">加载失败</div>';});
    }else{
        var h=JSON.parse(localStorage.getItem(getStorageKey('history'))||'[]');
        if(h.length===0){list.innerHTML='<div class="no-history">暂无数据</div>';return;}
        var best=Math.max.apply(null,h.map(function(x){return x.score||0;}));
        list.innerHTML='<div class="leaderboard-item"><span class="leaderboard-rank">🥇</span><span class="leaderboard-name">'+escapeHtml(currentPlayerName)+'</span><span class="leaderboard-score">'+best+' 分</span></div>';
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
const praiseWords = ['Amazing!', 'Excellent!', 'Great!', 'Good!', '太棒了!', '你真厉害!', '继续加油!'];
const wrongWords = ['哎呀，错啦！', '别灰心！', '再想想！'];

// Web Audio API 创建音效 - 移动端兼容版
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

// 语音合成 - 移动端兼容版
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
    audio.play().catch(err => console.log('备选音频失败:', err));
}

// 合并所有词汇
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

// 随机抽取题目
function getRandomQuestions(count) {
    return shuffleArray(getAllVocabulary()).slice(0, count);
}

// 随机生成干扰项
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

// 开始游戏
function startGame(mode) {
    var av=getAllVocabulary();
    if(av.length<4){alert('可用单词太少，请至少选择一个年级！');return;}
    clearPendingAudio();
    currentMode = mode;
    currentQuestionIndex = 0;
    score = 0;
    gameQuestions = getRandomQuestions(Math.min(totalQuestions,av.length));

    showOnlyScreen('gameScreen');
    document.getElementById('submitBtn').style.display = 'none';

    clearSavedProgress();
    displayQuestion();
}

// 显示题目
function displayQuestion() {
    isAnswered = false;
    const question = gameQuestions[currentQuestionIndex];

    // 重置界面
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('wordInput').value = '';
    setAnswerControlsDisabled(false);

    // 更新进度
    const questionCount = getCurrentQuestionCount();
    document.getElementById('progressFill').textContent = `${currentQuestionIndex + 1} / ${questionCount}`;
    document.getElementById('progressFill').style.width = `${((currentQuestionIndex + 1) / questionCount) * 100}%`;

    // 更新分数
    document.getElementById('scoreDisplay').textContent = score;

    // 重置计时器
    resetTimer();

    const questionText = document.getElementById('questionText');
    const playAudioBtn = document.getElementById('playAudioBtn');
    const optionsArea = document.getElementById('optionsArea');
    const inputArea = document.getElementById('inputArea');

    optionsArea.innerHTML = '';
    inputArea.style.display = 'none';
    playAudioBtn.style.display = 'none';

    if (currentMode === 'listen') {
        // 听音选单词模式
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

    } else if (currentMode === 'read') {
        // 看单词选中文模式
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

    } else if (currentMode === 'write') {
        // 听音写单词模式
        questionText.textContent = '点击按钮听发音，输入正确的单词';
        playAudioBtn.style.display = 'block';
        inputArea.style.display = 'block';
        document.getElementById('submitBtn').style.display = 'inline-block';
        document.getElementById('wordInput').focus();

        // 绑定回车键
        document.getElementById('wordInput').onkeypress = function(e) {
            if (e.key === 'Enter' && !isAnswered) {
                submitAnswer();
            }
        };

        scheduleQuestionAudio();
    } else if (currentMode === 'reverse') {
        questionText.textContent = question.chinese;
        var ca=question;var wo=getWrongOptions(question,3,'word');
        var ao=shuffleArray(wo.concat(ca));
        ao.forEach(function(opt){var btn=document.createElement('button');btn.className='option-btn';btn.textContent=opt.word;btn.onclick=function(){checkAnswer(opt.word,ca.word,btn);};optionsArea.appendChild(btn);});
        document.getElementById('submitBtn').style.display='none';
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
            // 显示正确答案
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

    // 听音写单词模式下显示正确答案
    const currentWord = gameQuestions[currentQuestionIndex];
    if (currentMode === 'write' && !isCorrect) {
        feedback.textContent = `哎呀，错啦！正确答案是: ${currentWord.word}`;
    }
    // auto-play removed
    if(!isCorrect){saveWrongWord(currentWord);}
    else if(window._isWrongMode){removeWrongWord(currentWord.word);}
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
    if(window._isWrongMode){totalQuestions=window._origTotal||15;window._isWrongMode=false;}
    recordCheckin();
    // 保存得分到历史记录
    saveScore(currentMode, score);

    showOnlyScreen('resultScreen');

    document.getElementById('finalScore').textContent = `${score} 分`;

    const maxScore = getCurrentQuestionCount() * 10;
    const accuracy = maxScore ? score / maxScore : 0;

    // 显示星星
    const starsContainer = document.getElementById('stars');
    starsContainer.innerHTML = '';
    const starCount = Math.ceil(accuracy * 5);
    for (let i = 0; i < starCount && i < 5; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '⭐';
        star.style.animationDelay = `${i * 0.2}s`;
        starsContainer.appendChild(star);
    }

    // 显示评价
    const resultMessage = document.getElementById('resultMessage');
    if (accuracy >= 0.9) {
        resultMessage.textContent = '太棒了！你是英语小天才！🎉';
    } else if (accuracy >= 0.75) {
        resultMessage.textContent = '很不错！继续加油！💪';
    } else if (accuracy >= 0.5) {
        resultMessage.textContent = '还可以哦，多练习会更好！😊';
    } else {
        resultMessage.textContent = '别灰心，再接再厉！💪';
    }
}

// 重新开始
function restartGame() {
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

                if (currentMode === 'write') {
                    const question = gameQuestions[currentQuestionIndex];
                    feedback.textContent = `时间到！正确答案是: ${question.word}`;
                }

                document.getElementById('nextBtn').style.display = 'block';
                saveWrongWord(gameQuestions[currentQuestionIndex]);

                // 显示正确答案
                if (currentMode !== 'write') {
                    const allOptions = document.querySelectorAll('.option-btn');
                    allOptions.forEach(btn => {
                        if (currentMode === 'listen' || currentMode === 'read') {
                            const correctAnswer = gameQuestions[currentQuestionIndex].chinese;
                            if (btn.textContent === correctAnswer) {
                                btn.classList.add('correct');
                            }
                        } else if (currentMode === 'reverse') {
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
        if (currentMode === 'write' && !isAnswered) {
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

// 页面加载时恢复音频上下文
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

    // 同步到 Firebase
    if (isFirebaseReady && firebaseDB) {
        firebaseDB.ref('players/' + currentPlayerName + '/history').set(history)
            .catch(err => console.log('Firebase保存历史失败:', err));
    }

    // 清除游戏进度
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

    const modeNames = {
        'listen': '听音选单词',
        'read': '看单词选中文',
        'write': '听音写单词',
        'reverse': '看中文选英语'
    };

    const sortedHistory = [...history].sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    historyList.innerHTML = sortedHistory.map((record) => {
        return '<div class="history-item">' +
            '<div class="history-item-info">' +
            '<div class="history-item-mode">' + escapeHtml(modeNames[record.mode] || record.mode) + '</div>' +
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
