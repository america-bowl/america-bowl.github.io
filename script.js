(function(){
  "use strict";

  var ALL_Q = window.ALL_Q || [];

  var CAT_ORDER = ["prereq","A","B","C","D","E","F","G","H","I","appendix","US_Currency","US_Units","US_Geography","US_Nicknames","US_Civics","US_History_Culture"];
  var CAT_META = {};
  
  ALL_Q.forEach(function(q){
    if(!CAT_META[q.cat]) CAT_META[q.cat] = {label:q.catLabel, count:0, letter:catLetter(q.cat)};
    CAT_META[q.cat].count++;
  });

  function catLetter(cat){
    var map = {prereq:"00", A:"01", B:"02", C:"03", D:"04", E:"05", F:"06", G:"07", H:"08", I:"09", appendix:"10", US_Currency:"11", US_Units:"12", US_Geography:"13", US_Nicknames:"14", US_Civics:"15", US_History_Culture:"16"};
    return map[cat] || "--";
  }

  function loadJSON(key, fallback){
    try{
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    }catch(e){ return fallback; }
  }
  function saveJSON(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  }

  var missed = loadJSON('ab_missed_v2', []);
  var bestScores = loadJSON('ab_best_v2', {});
  var totals = loadJSON('ab_totals_v2', {answered:0, correct:0});

  // ---- Settings (explanation language / timer length) ----
  var SETTINGS_KEY = 'ab_settings_v1';
  var TIMER_MIN = 3, TIMER_MAX = 20, TIMER_DEFAULT = 15;
  var LANGS = ['en', 'ja', 'both'];

  function clampTimer(n){
    n = parseInt(n, 10);
    if(isNaN(n)) n = TIMER_DEFAULT;
    return Math.max(TIMER_MIN, Math.min(TIMER_MAX, n));
  }
  function loadSettings(){
    var s = loadJSON(SETTINGS_KEY, {});
    return {
      lang: LANGS.indexOf(s.lang) !== -1 ? s.lang : 'both',
      timer: clampTimer(s.timer)
    };
  }
  var settings = loadSettings();
  function saveSettings(){ saveJSON(SETTINGS_KEY, settings); }

  // Web Audio API による効果音再生 (Duolingo風SE)
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playCorrectSE() {
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = ctx.currentTime;
    // Duolingo風の爽やかな和音アルペジオ (E5 -> G5 -> C6)
    var notes = [659.25, 783.99, 1046.50];
    notes.forEach(function(freq, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.07);
      
      gain.gain.setValueAtTime(0.15, now + index * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.07 + 0.22);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + index * 0.07);
      osc.stop(now + index * 0.07 + 0.22);
    });
  }

  function playIncorrectSE() {
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = ctx.currentTime;
    // 低めの残念な音 (F3 -> Eb3)
    var notes = [174.61, 155.56];
    notes.forEach(function(freq, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);
      
      gain.gain.setValueAtTime(0.12, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.28);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.28);
    });
  }

  var screens = {
    home: document.getElementById('screen-home'),
    quiz: document.getElementById('screen-quiz'),
    result: document.getElementById('screen-result')
  };
  var homeLink = document.getElementById('home-link');
  var settingsBtn = document.getElementById('settings-btn');
  var headerTitle = document.getElementById('header-title');
  var headerSub = document.getElementById('header-sub');

  function showScreen(name){
    Object.keys(screens).forEach(function(k){
      if(screens[k]) screens[k].classList.toggle('active', k === name);
    });
    if(homeLink) homeLink.style.display = (name === 'home') ? 'none' : 'inline-block';
    if(settingsBtn) settingsBtn.style.display = (name === 'home') ? '' : 'none';
    window.scrollTo({top:0, behavior:'auto'});
  }

  function renderHome(){
    stopTimer();
    if(headerTitle) headerTitle.textContent = "AMERICA BOWL";
    if(headerSub) headerSub.textContent = "Comprehensive practice that covers vast categories.";

    var statsLine = document.getElementById('stats-line');
    if(statsLine){
      if(totals.answered > 0){
        statsLine.textContent = 'Cumulative Stats: ' + totals.correct + ' / ' + totals.answered + ' Correct (' + Math.round(totals.correct/totals.answered*100) + '% Rate)';
      } else {
        statsLine.textContent = '';
      }
    }

    var reviewCard = document.getElementById('card-review');
    var reviewCount = document.getElementById('review-count');
    if(reviewCard && reviewCount){
      if(missed.length > 0){
        reviewCard.style.display = '';
        reviewCount.textContent = String(missed.length);
      } else {
        reviewCard.style.display = 'none';
      }
    }

    var grid = document.getElementById('cat-grid');
    if(grid){
      grid.replaceChildren(); // innerHTML = '' の安全な代替
      CAT_ORDER.forEach(function(cat){
        var meta = CAT_META[cat];
        if(!meta) return;
        var best = bestScores[cat];
        
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'cat-card';

        var letterSpan = document.createElement('span');
        letterSpan.className = 'letter';
        letterSpan.textContent = meta.letter;

        var infoSpan = document.createElement('span');
        infoSpan.className = 'info';

        var nameP = document.createElement('p');
        nameP.className = 'name';
        nameP.textContent = meta.label;

        var metaP = document.createElement('p');
        metaP.className = 'meta';
        metaP.textContent = best ? ('Best: ' + best.correct + ' / ' + best.total) : (meta.count + ' Questions');

        infoSpan.appendChild(nameP);
        infoSpan.appendChild(metaP);

        card.appendChild(letterSpan);
        card.appendChild(infoSpan);

        card.addEventListener('click', function(){ startQuiz(cat); });
        grid.appendChild(card);
      });
    }
  }

  var btnMix = document.getElementById('card-mix');
  if(btnMix) btnMix.addEventListener('click', function(){ startQuiz('__mix__'); });

  var btnReview = document.getElementById('card-review');
  if(btnReview) btnReview.addEventListener('click', function(){ startQuiz('__review__'); });

  if(homeLink) homeLink.addEventListener('click', function(){ renderHome(); showScreen('home'); });

  var quitLink = document.getElementById('quit-link');
  if(quitLink) quitLink.addEventListener('click', function(){ renderHome(); showScreen('home'); });

  var btnBack = document.getElementById('btn-back');
  if(btnBack) btnBack.addEventListener('click', function(){ renderHome(); showScreen('home'); });

  function shuffle(arr){
    var a = arr.slice();
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // タイマー関連変数
  var timerInterval = null;
  var timeLeft = settings.timer; // 制限時間（秒）は設定画面で3〜20秒に変更可能

  function startTimer() {
    stopTimer();
    timeLeft = settings.timer;
    updateTimerUI();
    timerInterval = setInterval(function() {
      timeLeft--;
      updateTimerUI();
      if (timeLeft <= 0) {
        stopTimer();
        handleTimeOut();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerUI() {
    var timerEl = document.getElementById('q-timer');
    if (timerEl) {
      timerEl.textContent = '⏱️ ' + timeLeft + 's';
      // 警告表示は残り時間が短くなったときだけ(短い制限時間でも常時点滅しないように調整)
      var warnAt = Math.max(1, Math.min(5, Math.floor(settings.timer / 3)));
      timerEl.classList.toggle('warning', timeLeft <= warnAt);
    }
  }

  function handleTimeOut() {
    if (session && !session.answered) {
      var q = session.questions[session.index];
      selectAnswer(null, null, q);
    }
  }

  var session = null;

  function startQuiz(catKey){
    var pool, label;
    if(catKey === '__mix__'){
      pool = shuffle(ALL_Q).slice(0, 30);
      label = 'Random 30 Questions';
    } else if(catKey === '__review__'){
      pool = ALL_Q.filter(function(q){ return missed.indexOf(q.id) !== -1; });
      pool = shuffle(pool);
      label = 'Review Missed';
    } else {
      pool = shuffle(ALL_Q.filter(function(q){ return q.cat === catKey; }));
      label = CAT_META[catKey] ? CAT_META[catKey].label : 'Quiz';
    }
    if(pool.length === 0){ return; }
    session = {
      catKey: catKey,
      label: label,
      questions: pool,
      index: 0,
      score: 0,
      answered: false,
      wrongIds: [],
      perCatStats: {}
    };
    if(headerTitle) headerTitle.textContent = label;
    if(headerSub) headerSub.textContent = pool.length + ' Questions Total';
    showScreen('quiz');
    renderQuestion();
  }

  // 親要素 #options への「イベントデリゲーション」設定（初期化時に1度だけバインド）
  var optsWrap = document.getElementById('options');
  if (optsWrap) {
    optsWrap.addEventListener('click', function(e) {
      var btn = e.target.closest('.opt-btn');
      if (!btn || !session || session.answered) return;
      var chosen = btn.getAttribute('data-opt');
      var q = session.questions[session.index];
      selectAnswer(btn, chosen, q);
    });
  }

  function renderQuestion(){
    var q = session.questions[session.index];
    session.answered = false;

    document.getElementById('quiz-cat-chip').textContent = q.catLabel;
    document.getElementById('quiz-score-label').textContent = 'Score: ' + session.score;
    document.getElementById('qno').textContent = 'Question ' + (session.index + 1) + ' / ' + session.questions.length;
    document.getElementById('qtext').textContent = q.q;

    var pct = Math.round((session.index) / session.questions.length * 100);
    document.getElementById('progress-fill').style.width = pct + '%';

    var stamp = document.getElementById('stamp');
    stamp.className = 'stamp';
    stamp.textContent = '';

    // 解説用領域の初期化
    var expBox = document.getElementById('q-explanation');
    if (!expBox) {
      expBox = document.createElement('div');
      expBox.id = 'q-explanation';
      expBox.className = 'q-explanation';
      var qFooter = document.querySelector('.q-footer');
      if (qFooter && qFooter.parentNode) qFooter.parentNode.insertBefore(expBox, qFooter);
    }
    expBox.hidden = true;
    expBox.replaceChildren();

    // タイマー用表示要素の初期化
    var timerEl = document.getElementById('q-timer');
    if (!timerEl) {
      timerEl = document.createElement('div');
      timerEl.id = 'q-timer';
      timerEl.className = 'q-timer';
      var metaBox = document.querySelector('.quiz-meta');
      if (metaBox) metaBox.appendChild(timerEl);
    }

    optsWrap.replaceChildren(); // innerHTML = '' を排して要素をクリア
    var letters = ['A','B','C','D'];
    var shuffledOptions = shuffle(q.options);
    
    shuffledOptions.forEach(function(opt, i){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn';
      btn.setAttribute('data-opt', opt); // イベントデリゲーション用にデータを付与

      var markSpan = document.createElement('span');
      markSpan.className = 'mark';
      markSpan.textContent = letters[i];

      var textSpan = document.createElement('span');
      textSpan.textContent = opt;

      btn.appendChild(markSpan);
      btn.appendChild(textSpan);
      optsWrap.appendChild(btn);
    });

    document.getElementById('next-btn').classList.remove('show');

    // タイマースタート
    startTimer();
  }

  function selectAnswer(btn, chosen, q){
    if(session.answered) return;
    session.answered = true;

    stopTimer(); // 時間計測をストップ

    var correct = (chosen === q.a);
    var stamp = document.getElementById('stamp');

    totals.answered++;
    if(correct){
      totals.correct++;
      session.score++;
      stamp.textContent = 'CORRECT';
      stamp.className = 'stamp correct show';
      playCorrectSE(); // 正解SE
      var mi = missed.indexOf(q.id);
      if(mi !== -1){ missed.splice(mi, 1); }
    } else {
      stamp.textContent = chosen === null ? 'TIME OUT' : 'INCORRECT';
      stamp.className = 'stamp incorrect show';
      playIncorrectSE(); // 不正解SE
      session.wrongIds.push(q.id);
      if(missed.indexOf(q.id) === -1){ missed.push(q.id); }
    }
    saveJSON('ab_missed_v2', missed);
    saveJSON('ab_totals_v2', totals);

    var cs = session.perCatStats[q.cat] || (session.perCatStats[q.cat] = {label:q.catLabel, correct:0, total:0});
    cs.total++;
    if(correct) cs.correct++;

    var allBtns = document.querySelectorAll('#options .opt-btn');
    allBtns.forEach(function(b){
      b.disabled = true;
      var text = b.getAttribute('data-opt');
      if(b === btn && correct){ b.classList.add('correct'); }
      else if(b === btn && !correct){ b.classList.add('incorrect'); }
      else if(text === q.a){ b.classList.add('correct'); }
      else { b.classList.add('dim'); }
    });

    showExplanation(q);

    document.getElementById('quiz-score-label').textContent = 'Score: ' + session.score;
    var nextEl = document.getElementById('next-btn');
    nextEl.classList.add('show');
    // スマホでも解説と「Next」ボタンが見える位置までスクロール
    if (nextEl.scrollIntoView) nextEl.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }

  // 解説（Explanation）の表示：設定に応じて英語 / 日本語 / 両方
  function addExpBlock(box, tag, langCode, text){
    var row = document.createElement('div');
    row.className = 'exp-block';

    var tagEl = document.createElement('span');
    tagEl.className = 'exp-tag';
    tagEl.textContent = tag;

    var textEl = document.createElement('p');
    textEl.className = 'exp-text';
    textEl.setAttribute('lang', langCode);
    textEl.textContent = text;

    row.appendChild(tagEl);
    row.appendChild(textEl);
    box.appendChild(row);
  }

  function showExplanation(q){
    var box = document.getElementById('q-explanation');
    if(!box) return;
    var exp = q.exp || {};
    var en = exp.en || ('Correct answer: ' + q.a);
    var ja = exp.ja || ('正解: ' + q.a);
    box.replaceChildren();
    if(settings.lang === 'en' || settings.lang === 'both') addExpBlock(box, 'EN', 'en', en);
    if(settings.lang === 'ja' || settings.lang === 'both') addExpBlock(box, '日本語', 'ja', ja);
    box.hidden = false;
  }

  var nextBtn = document.getElementById('next-btn');
  if(nextBtn){
    nextBtn.addEventListener('click', function(){
      session.index++;
      if(session.index >= session.questions.length){
        finishQuiz();
      } else {
        renderQuestion();
      }
    });
  }

  function finishQuiz(){
    stopTimer();
    document.getElementById('progress-fill').style.width = '100%';

    if(session.catKey !== '__mix__' && session.catKey !== '__review__'){
      bestScores[session.catKey] = {correct: session.score, total: session.questions.length};
      saveJSON('ab_best_v2', bestScores);
    }

    var total = session.questions.length;
    var correct = session.score;
    var pct = Math.round(correct / total * 100);

    document.getElementById('result-correct').textContent = String(correct);
    document.getElementById('result-total').textContent = String(total);
    document.getElementById('result-pct').textContent = 'Accuracy: ' + pct + '%';

    var msg;
    if(pct >= 90) msg = 'Outstanding performance. You have demonstrated commanding knowledge of the material.';
    else if(pct >= 70) msg = 'Strong result. Reviewing incorrect answers will solidify your expertise.';
    else if(pct >= 40) msg = 'Good baseline. Concentrate on specific weaker categories to improve.';
    else msg = 'Keep practicing individual categories to build familiarity with key concepts.';
    document.getElementById('result-msg').textContent = msg;

    var bd = document.getElementById('breakdown');
    bd.replaceChildren(); // innerHTML = '' の完全排除
    var catKeys = Object.keys(session.perCatStats);
    if(catKeys.length > 1){
      catKeys.forEach(function(ck){
        var s = session.perCatStats[ck];
        var row = document.createElement('div');
        row.className = 'bd-row';

        var labelSpan = document.createElement('span');
        labelSpan.className = 'bd-label';
        labelSpan.textContent = s.label;

        var numSpan = document.createElement('span');
        numSpan.className = 'bd-num';
        numSpan.textContent = s.correct + ' / ' + s.total;

        row.appendChild(labelSpan);
        row.appendChild(numSpan);
        bd.appendChild(row);
      });
    }

    var reviewBtn = document.getElementById('btn-review-missed');
    if(session.wrongIds.length > 0){
      reviewBtn.style.display = '';
      reviewBtn.onclick = function(){
        var pool = shuffle(ALL_Q.filter(function(q){ return session.wrongIds.indexOf(q.id) !== -1; }));
        session = {
          catKey: '__review__', label: 'Review Session Missed', questions: pool,
          index: 0, score: 0, answered:false, wrongIds: [], perCatStats: {}
        };
        if(headerTitle) headerTitle.textContent = session.label;
        if(headerSub) headerSub.textContent = pool.length + ' Questions';
        showScreen('quiz');
        renderQuestion();
      };
    } else {
      reviewBtn.style.display = 'none';
    }

    document.getElementById('btn-retry').onclick = function(){
      startQuiz(session.catKey === '__review__' ? '__review__' : session.catKey);
    };

    showScreen('result');
  }

  // ---------------- Theme ----------------
  function getPreferredTheme() {
    try {
      var savedTheme = localStorage.getItem('ab_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch (e) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function setTheme(theme) {
    applyTheme(theme);
    try { localStorage.setItem('ab_theme', theme); } catch (e) {}
    syncSettingsUI();
  }

  // ---------------- Settings modal ----------------
  var modal = document.getElementById('settings-modal');
  var closeBtn = document.getElementById('settings-close');
  var timerRange = document.getElementById('timer-range');
  var timerValue = document.getElementById('timer-value');
  var timerMinus = document.getElementById('timer-minus');
  var timerPlus = document.getElementById('timer-plus');
  var resetBtn = document.getElementById('reset-data');
  var lastFocus = null;

  function setSeg(name, value) {
    var seg = document.querySelector('.seg[data-setting="' + name + '"]');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function(b) {
      var on = b.getAttribute('data-value') === value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function syncSettingsUI() {
    setSeg('theme', document.documentElement.getAttribute('data-theme') || 'dark');
    setSeg('lang', settings.lang);
    if (timerRange) timerRange.value = String(settings.timer);
    if (timerValue) timerValue.textContent = settings.timer + ' s';
    if (timerMinus) timerMinus.disabled = settings.timer <= TIMER_MIN;
    if (timerPlus) timerPlus.disabled = settings.timer >= TIMER_MAX;
  }

  function setTimer(n) {
    settings.timer = clampTimer(n);
    saveSettings();
    syncSettingsUI();
  }

  document.querySelectorAll('.seg').forEach(function(seg) {
    seg.addEventListener('click', function(e) {
      var b = e.target.closest('button');
      if (!b) return;
      var name = seg.getAttribute('data-setting');
      var val = b.getAttribute('data-value');
      if (name === 'theme') {
        setTheme(val);
      } else if (name === 'lang' && LANGS.indexOf(val) !== -1) {
        settings.lang = val;
        saveSettings();
        syncSettingsUI();
      }
    });
  });

  if (timerRange) timerRange.addEventListener('input', function() { setTimer(timerRange.value); });
  if (timerMinus) timerMinus.addEventListener('click', function() { setTimer(settings.timer - 1); });
  if (timerPlus) timerPlus.addEventListener('click', function() { setTimer(settings.timer + 1); });

  // 正答率データの削除（2回タップで確定）
  var resetArmed = false;
  var resetTimeout = null;

  function disarmReset() {
    clearTimeout(resetTimeout);
    resetArmed = false;
    if (resetBtn) {
      resetBtn.textContent = 'Delete accuracy data';
      resetBtn.classList.remove('armed');
      resetBtn.disabled = false;
    }
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = 'Tap again to confirm';
        resetBtn.classList.add('armed');
        resetTimeout = setTimeout(disarmReset, 4000);
        return;
      }
      clearTimeout(resetTimeout);
      missed = [];
      bestScores = {};
      totals = {answered: 0, correct: 0};
      try {
        localStorage.removeItem('ab_missed_v2');
        localStorage.removeItem('ab_best_v2');
        localStorage.removeItem('ab_totals_v2');
      } catch (e) {}
      renderHome();
      resetArmed = false;
      resetBtn.classList.remove('armed');
      resetBtn.textContent = '✓ Deleted';
      resetBtn.disabled = true;
      resetTimeout = setTimeout(disarmReset, 1800);
    });
  }

  function openSettings() {
    if (!modal) return;
    lastFocus = document.activeElement;
    syncSettingsUI();
    disarmReset();
    modal.hidden = false;
    document.body.classList.add('modal-open');
    if (closeBtn) closeBtn.focus();
  }

  function closeSettings() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    disarmReset();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.hasAttribute('data-close')) closeSettings();
    });
    // Tabキーがモーダルの外に出ないようにする
    modal.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      var items = modal.querySelectorAll('button:not([disabled]), input');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSettings();
  });

  applyTheme(getPreferredTheme());
  syncSettingsUI();

  renderHome();
})();
