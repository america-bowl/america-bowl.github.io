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
  var headerTitle = document.getElementById('header-title');
  var headerSub = document.getElementById('header-sub');

  function showScreen(name){
    Object.keys(screens).forEach(function(k){
      if(screens[k]) screens[k].classList.toggle('active', k === name);
    });
    if(homeLink) homeLink.style.display = (name === 'home') ? 'none' : 'inline-block';
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
  var TIME_LIMIT = 15; // 制限時間（秒）
  var timeLeft = TIME_LIMIT;

  function startTimer() {
    stopTimer();
    timeLeft = TIME_LIMIT;
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
      timerEl.classList.toggle('warning', timeLeft <= 5);
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
      var qCard = document.querySelector('.q-card');
      if (qCard) qCard.appendChild(expBox);
    }
    expBox.style.display = 'none';
    expBox.textContent = '';

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

    // 解説（Explanation）の表示
    var expBox = document.getElementById('q-explanation');
    if (expBox) {
      var expText = q.e || q.explanation || ('正解は: ' + q.a);
      expBox.textContent = '💡 解説: ' + expText;
      expBox.style.display = 'block';
    }

    document.getElementById('quiz-score-label').textContent = 'Score: ' + session.score;
    document.getElementById('next-btn').classList.add('show');
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

  var themeToggleBtn = document.getElementById('theme-toggle');
  var themeIcon = document.getElementById('theme-icon');
  var themeText = document.getElementById('theme-text');

  function getPreferredTheme() {
    var savedTheme = localStorage.getItem('ab_theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ab_theme', theme);
    if (themeIcon && themeText) {
      if (theme === 'light') {
        themeIcon.textContent = '☀️';
        themeText.textContent = 'Light';
      } else {
        themeIcon.textContent = '🌙';
        themeText.textContent = 'Dark';
      }
    }
  }

  setTheme(getPreferredTheme());

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function() {
      var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      var nextTheme = currentTheme === 'light' ? 'dark' : 'light';
      setTheme(nextTheme);
    });
  }

  renderHome();
})();
