(function () {
  'use strict';

  var stageGrid      = document.getElementById('stageGrid');
  var upcomingList   = document.getElementById('upcomingList');
  var resultsList    = document.getElementById('resultsList');
  var matchesCount   = document.getElementById('matchesCount');
  var updatedAt      = document.getElementById('updatedAt');
  var statusDot      = document.getElementById('statusDot');
  var statusText     = document.getElementById('statusText');
  var sourceState    = document.getElementById('sourceState');
  var refreshButton  = document.getElementById('refreshButton');
  var currentStatus  = document.getElementById('currentStatus');
  var stageFilter    = document.getElementById('stageFilter');
  var newsList       = document.getElementById('newsList');
  var newsLangFilter = document.getElementById('newsLangFilter');
  var pgPrev         = document.getElementById('pgPrev');
  var pgNext         = document.getElementById('pgNext');
  var pgInfo         = document.getElementById('pgInfo');
  var pagination     = document.getElementById('pagination');

  var allPast     = [];
  var activeStage = 'ALL';
  var allNews     = [];
  var activeLang  = 'ALL';
  var currentPage = 1;
  var PAGE_SIZE   = 5;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  function crestImg(url, name, size) {
    var initial = (name || '?').charAt(0);
    if (!url) {
      return '<div class="crest-placeholder" style="width:' + size + 'px;height:' + size + 'px">' + initial + '</div>';
    }
    return (
      '<img src="' + url + '"' +
      ' alt="' + (name || '') + ' crest"' +
      ' width="' + size + '" height="' + size + '"' +
      ' loading="lazy" class="crest"' +
      ' onerror="this.style.display=\'none\'"' +
      '>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Card builders                                                        */
  /* ------------------------------------------------------------------ */

  function stageCard(stage) {
    var pct = stage.total ? Math.round((stage.completed / stage.total) * 100) : 0;
    return (
      '<article class="stageCard ' + (stage.isCurrent ? 'active' : '') + '">'
      + '<div class="stageIndex">' + stage.order + '</div>'
      + '<div class="stageName">' + stage.label + '</div>'
      + '<div class="stageProgress">' + stage.completed + ' / ' + stage.total + ' matches</div>'
      + '<div class="stageBar"><span style="width:' + pct + '%"></span></div>'
      + '</article>'
    );
  }

  function upcomingCard(match) {
    return (
      '<article class="matchCard">'
      + '<div class="rowTop">'
        + '<div class="stageLabel">' + match.stageLabel + '</div>'
        + '<div class="date">' + match.dayLabel + ' &middot; ' + match.localTime + ' WIB</div>'
      + '</div>'
      + '<div class="vs">'
        + '<div class="team">' + crestImg(match.homeCrest, match.homeTeam, 28) + '<strong>' + match.homeTeam + '</strong><span>' + (match.homeShort || '') + '</span></div>'
        + '<div class="versus">VS</div>'
        + '<div class="team">' + crestImg(match.awayCrest, match.awayTeam, 28) + '<strong>' + match.awayTeam + '</strong><span>' + (match.awayShort || '') + '</span></div>'
      + '</div>'
      + '<div class="venue">&#128205; ' + match.venue + '</div>'
      + '</article>'
    );
  }

  function scorersList(scorers, homeTeam, awayTeam) {
    if (!scorers || !scorers.length) return '';
    var homeGoals = scorers.filter(function (s) {
      return s.team && (s.team === homeTeam || s.team.indexOf(homeTeam) !== -1 || homeTeam.indexOf(s.team) !== -1);
    });
    var awayGoals = scorers.filter(function (s) {
      return s.team && (s.team === awayTeam || s.team.indexOf(awayTeam) !== -1 || awayTeam.indexOf(s.team) !== -1);
    });
    var unknownGoals = scorers.filter(function (s) {
      return homeGoals.indexOf(s) === -1 && awayGoals.indexOf(s) === -1;
    });
    function goalChip(s) {
      var suffix = s.type ? ' <span class="goal-type">' + s.type + '</span>' : '';
      var min    = s.minute ? ' <span class="goal-min">' + s.minute + "'" + '</span>' : '';
      return '<span class="scorer-chip">&#9917; ' + s.name + min + suffix + '</span>';
    }
    var homeHtml = '<div class="scorers-home">'    + homeGoals.map(goalChip).join('')    + '</div>';
    var unkHtml  = unknownGoals.length ? '<div class="scorers-unknown">' + unknownGoals.map(goalChip).join('') + '</div>' : '';
    var awayHtml = '<div class="scorers-away">'    + awayGoals.map(goalChip).join('')    + '</div>';
    return '<div class="scorers-row">' + homeHtml + unkHtml + awayHtml + '</div>';
  }

  function resultCard(match) {
    var sh = (match.score.home !== null && match.score.home !== undefined) ? match.score.home : '-';
    var sa = (match.score.away !== null && match.score.away !== undefined) ? match.score.away : '-';
    var badges =
      '<span class="r-stage">' + match.stageLabel + '</span>'
      + (match.group ? ' <span class="r-group">' + match.group + '</span>' : '');
    return (
      '<article class="matchCard past-card">'
      + '<div class="rowTop">'
        + '<div class="date-badges">' + badges + '</div>'
        + '<div class="date">' + match.dateLabel + ' WIB</div>'
      + '</div>'
      + '<div class="vs">'
        + '<div class="team">' + crestImg(match.homeCrest, match.homeTeam, 28) + '<strong>' + match.homeTeam + '</strong><span>' + (match.homeShort || '') + '</span></div>'
        + '<div class="scorePill">' + sh + ' &ndash; ' + sa + '</div>'
        + '<div class="team">' + crestImg(match.awayCrest, match.awayTeam, 28) + '<strong>' + match.awayTeam + '</strong><span>' + (match.awayShort || '') + '</span></div>'
      + '</div>'
      + '<div class="venue">&#128205; ' + match.venue + '</div>'
      + scorersList(match.scorers, match.homeTeam, match.awayTeam)
      + '</article>'
    );
  }

  function newsCard(item) {
    var langBadge = item.lang === 'id'
      ? '<span class="lang-badge id">&#127470;&#127465; ID</span>'
      : '<span class="lang-badge en">&#127468;&#127463; EN</span>';
    var summary = item.summary ? '<p class="news-summary">' + item.summary + '</p>' : '';
    return (
      '<a href="' + item.url + '" target="_blank" rel="noopener noreferrer" class="newsCard">'
      + '<div class="news-top"><span class="news-source">' + item.source + '</span>' + langBadge + '</div>'
      + '<h3 class="news-title">' + item.title + '</h3>'
      + summary
      + '<div class="news-footer">Baca selengkapnya &rarr;</div>'
      + '</a>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Status                                                               */
  /* ------------------------------------------------------------------ */

  function setStatus(msg, type) {
    statusText.textContent = msg;
    sourceState.className  = type || 'connected';
    if (statusDot) {
      statusDot.style.background = type === 'error' ? 'var(--color-error)' : 'var(--color-primary)';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Stage filter                                                         */
  /* ------------------------------------------------------------------ */

  function buildStageFilters(stages) {
    var used = {};
    allPast.forEach(function (m) { used[m.stage] = true; });
    var html = '<button class="filter-btn ' + (activeStage === 'ALL' ? 'active' : '') + '" data-stage="ALL">All</button>';
    stages.forEach(function (s) {
      if (used[s.key]) {
        html += '<button class="filter-btn ' + (activeStage === s.key ? 'active' : '') + '" data-stage="' + s.key + '">' + s.label + '</button>';
      }
    });
    stageFilter.innerHTML = html;
    stageFilter.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeStage = btn.getAttribute('data-stage');
        currentPage = 1;
        stageFilter.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderPastResults();
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Pagination                                                           */
  /* ------------------------------------------------------------------ */

  function updatePagination(total) {
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pgInfo.textContent  = currentPage + ' / ' + totalPages;
    pgPrev.disabled     = currentPage <= 1;
    pgNext.disabled     = currentPage >= totalPages;
    pagination.style.display = totalPages > 1 ? 'flex' : 'none';
  }

  pgPrev.addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; renderPastResults(); }
  });

  pgNext.addEventListener('click', function () {
    var filtered   = activeStage === 'ALL' ? allPast : allPast.filter(function (m) { return m.stage === activeStage; });
    var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage < totalPages) { currentPage++; renderPastResults(); }
  });

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */

  function renderPastResults() {
    var filtered = activeStage === 'ALL' ? allPast : allPast.filter(function (m) { return m.stage === activeStage; });
    if (!filtered.length) {
      resultsList.innerHTML    = '<div class="empty">Tidak ada hasil untuk fase ini.</div>';
      pagination.style.display = 'none';
      return;
    }
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start  = (currentPage - 1) * PAGE_SIZE;
    var sliced = filtered.slice(start, start + PAGE_SIZE);
    resultsList.innerHTML = sliced.map(resultCard).join('');
    updatePagination(filtered.length);
    resultsList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderNews() {
    var filtered = activeLang === 'ALL' ? allNews : allNews.filter(function (n) { return n.lang === activeLang; });
    if (!filtered.length) {
      newsList.innerHTML = '<div class="empty">Tidak ada berita tersedia saat ini.</div>';
      return;
    }
    newsList.innerHTML = filtered.map(newsCard).join('');
  }

  newsLangFilter.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeLang = btn.getAttribute('data-lang');
      newsLangFilter.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderNews();
    });
  });

  function renderDashboard(data) {
    matchesCount.textContent = data.totals.matches + ' matches in DB';
    updatedAt.textContent    = 'Updated: ' + new Date(data.generatedAt).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) + ' WIB';
    currentStatus.textContent = data.currentStatus.stage + ' \u00b7 ' + data.currentStatus.message;
    stageGrid.innerHTML    = data.stages.map(stageCard).join('');
    upcomingList.innerHTML = data.upcoming.length
      ? data.upcoming.map(upcomingCard).join('')
      : '<div class="empty">Tidak ada pertandingan dalam 3 hari ke depan.</div>';
    allPast     = data.past;
    currentPage = 1;
    buildStageFilters(data.stages);
    renderPastResults();
    setStatus('football-data.org connected');
  }

  /* ------------------------------------------------------------------ */
  /* Data fetching                                                        */
  /* ------------------------------------------------------------------ */

  function fetchDashboard() {
    setStatus('Fetching data...');
    return fetch('/api/data', { cache: 'no-store' })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (r) {
        if (!r.res.ok || !r.data.ok) throw new Error(r.data.error || 'Gagal mengambil data');
        renderDashboard(r.data);
      });
  }

  function fetchNewsDeferred() {
    fetch('/api/news', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok || !data.articles || !data.articles.length) throw new Error('no articles');
        allNews = data.articles;
        renderNews();
      })
      .catch(function () {
        newsList.innerHTML = '<div class="empty">Gagal memuat berita. Coba refresh halaman.</div>';
      });
  }

  function manualRefresh() {
    refreshButton.disabled = true;
    refreshButton.querySelector('span').textContent = 'Refreshing...';
    fetch('/api/refresh')
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (r) {
        if (!r.res.ok || !r.data.ok) throw new Error(r.data.error || 'Refresh gagal');
        return fetchDashboard();
      })
      .then(function () { fetchNewsDeferred(); })
      .catch(function (err) { setStatus(err.message, 'error'); })
      .finally(function () {
        refreshButton.disabled = false;
        refreshButton.querySelector('span').textContent = 'Refresh';
      });
  }

  refreshButton.addEventListener('click', manualRefresh);

  /* Auto-refresh every 5 minutes */
  setInterval(fetchDashboard, 5 * 60 * 1000);

  /* Init */
  fetchDashboard()
    .then(function () { fetchNewsDeferred(); })
    .catch(function (err) {
      setStatus(err.message, 'error');
      stageGrid.innerHTML    = '<div class="empty">Jalankan /api/bootstrap setelah deploy pertama.</div>';
      upcomingList.innerHTML = '<div class="empty">Data belum tersedia.</div>';
      resultsList.innerHTML  = '<div class="empty">Data belum tersedia.</div>';
      pagination.style.display = 'none';
      fetchNewsDeferred();
    });

})();
