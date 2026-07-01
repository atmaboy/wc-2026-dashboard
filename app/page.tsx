import './globals.css';
import Script from 'next/script';

export default function Page() {
  return (
    <main>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <svg className="logo" viewBox="0 0 64 64" fill="none" aria-label="FIFA World Cup 2026 Dashboard">
              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" opacity="0.28"></circle>
              <path d="M32 10c7 0 13 3 17 8-1 7-5 12-11 15 2 7 1 13-2 21-7 0-13-3-18-8 1-8 4-13 10-17-2-6-1-12 4-19Z" fill="currentColor"></path>
            </svg>
            <div>
              <h1>FIFA World Cup 2026</h1>
              <p>Live Scoring Dashboard</p>
            </div>
          </div>
          <button id="refreshButton" className="refreshBtn" aria-label="Refresh data">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <span>Refresh</span>
          </button>
        </header>

        <section className="container">
          <div className="meta" id="metaRow">
            <span id="matchesCount">0 matches</span>
            <span id="updatedAt">Updated: -</span>
            <span className="connected" id="sourceState">
              <span className="meta-dot" id="statusDot"></span>
              <span id="statusText">Connecting...</span>
            </span>
          </div>

          {/* Tournament Progress */}
          <section className="panel" id="progressPanel">
            <div className="currentBadge" id="currentStatus">Loading tournament status...</div>
            <h2>🏆 Tournament Progress</h2>
            <div className="stageScroll">
              <div className="stageGrid" id="stageGrid">
                {Array.from({length:7}).map((_,i)=><div key={i} className="skeleton sk-stage"></div>)}
              </div>
            </div>
          </section>

          {/* Upcoming Matches */}
          <section className="panel">
            <h2>📅 Upcoming Matches <span className="subtle">(Next 3 days · GMT+7)</span></h2>
            <div className="cards" id="upcomingList">
              {Array.from({length:3}).map((_,i)=><div key={i} className="skeleton sk-card"></div>)}
            </div>
          </section>

          {/* Past Results */}
          <section className="panel">
            <div className="panel-header">
              <h2>📋 Past Results</h2>
              <div className="filter-group" id="stageFilter" role="group" aria-label="Filter by stage">
                <button className="filter-btn active" data-stage="ALL">All</button>
              </div>
            </div>
            <div className="results" id="resultsList">
              {Array.from({length:4}).map((_,i)=><div key={i} className="skeleton sk-row"></div>)}
            </div>
            <p className="footerNote">Diurutkan pertandingan terbaru · Waktu dalam GMT+7</p>
          </section>

          {/* News Section */}
          <section className="panel">
            <h2>📰 Berita Piala Dunia 2026</h2>
            <div className="news-filter" id="newsLangFilter">
              <button className="filter-btn active" data-lang="ALL">All</button>
              <button className="filter-btn" data-lang="en">🇬🇧 English</button>
              <button className="filter-btn" data-lang="id">🇮🇩 Indonesia</button>
            </div>
            <div className="news-grid" id="newsList">
              {Array.from({length:6}).map((_,i)=><div key={i} className="skeleton sk-news"></div>)}
            </div>
          </section>
        </section>
      </div>

      <Script id="dashboard-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
        var stageGrid     = document.getElementById('stageGrid');
        var upcomingList  = document.getElementById('upcomingList');
        var resultsList   = document.getElementById('resultsList');
        var matchesCount  = document.getElementById('matchesCount');
        var updatedAt     = document.getElementById('updatedAt');
        var statusDot     = document.getElementById('statusDot');
        var statusText    = document.getElementById('statusText');
        var sourceState   = document.getElementById('sourceState');
        var refreshButton = document.getElementById('refreshButton');
        var currentStatus = document.getElementById('currentStatus');
        var stageFilter   = document.getElementById('stageFilter');
        var newsList      = document.getElementById('newsList');
        var newsLangFilter= document.getElementById('newsLangFilter');

        var allPast     = [];
        var activeStage = 'ALL';
        var allNews     = [];
        var activeLang  = 'ALL';

        /* ---- Helpers ---- */
        function crestImg(url, name, size) {
          if (!url) return '<div class="crest-placeholder">' + ((name || '?').charAt(0)) + '</div>';
          return '<img src="' + url + '" alt="' + (name || '') + ' crest" width="' + size + '" height="' + size + '" loading="lazy" class="crest" onerror="this.parentNode.innerHTML=this.alt.charAt(0);">';
        }

        /* ---- Renderers ---- */
        function stageCard(stage) {
          var pct = stage.total ? Math.round((stage.completed / stage.total) * 100) : 0;
          return '<article class="stageCard ' + (stage.isCurrent ? 'active' : '') + '">'
            + '<div class="stageIndex">' + stage.order + '</div>'
            + '<div class="stageName">' + stage.label + '</div>'
            + '<div class="stageProgress">' + stage.completed + ' / ' + stage.total + ' matches</div>'
            + '<div class="stageBar"><span style="width:' + pct + '%"></span></div>'
            + '</article>';
        }

        function upcomingCard(match) {
          return '<article class="matchCard">'
            + '<div class="rowTop"><div class="stageLabel">' + match.stageLabel + '</div><div class="date">' + match.dayLabel + ' \u00b7 ' + match.localTime + ' WIB</div></div>'
            + '<div class="vs">'
              + '<div class="team">' + crestImg(match.homeCrest, match.homeTeam, 28) + '<strong>' + match.homeTeam + '</strong><span>' + (match.homeShort || '') + '</span></div>'
              + '<div class="versus">VS</div>'
              + '<div class="team away">' + crestImg(match.awayCrest, match.awayTeam, 28) + '<strong>' + match.awayTeam + '</strong><span>' + (match.awayShort || '') + '</span></div>'
            + '</div>'
            + '<div class="venue">\ud83d\udccd ' + match.venue + '</div>'
            + '</article>';
        }

        /* Render scorers grouped by team side */
        function scorersList(scorers, homeTeam, awayTeam) {
          if (!scorers || !scorers.length) return '';

          var homeGoals = scorers.filter(function(s) {
            return s.team && (s.team === homeTeam || s.team.includes(homeTeam) || homeTeam.includes(s.team));
          });
          var awayGoals = scorers.filter(function(s) {
            return s.team && (s.team === awayTeam || s.team.includes(awayTeam) || awayTeam.includes(s.team));
          });
          // Scorers whose team didn\'t match either side — show in center
          var unknownGoals = scorers.filter(function(s) {
            return !homeGoals.includes(s) && !awayGoals.includes(s);
          });

          function goalChip(s) {
            var suffix = s.type ? ' <span class="goal-type">' + s.type + '</span>' : '';
            var min    = s.minute ? ' <span class="goal-min">' + s.minute + '\'</span>' : '';
            return '<span class="scorer-chip">' + s.name + min + suffix + '</span>';
          }

          var homeHtml = homeGoals.length  ? '<div class="scorers-home">'    + homeGoals.map(goalChip).join('')  + '</div>' : '<div class="scorers-home"></div>';
          var awayHtml = awayGoals.length  ? '<div class="scorers-away">'    + awayGoals.map(goalChip).join('')  + '</div>' : '<div class="scorers-away"></div>';
          var unkHtml  = unknownGoals.length ? '<div class="scorers-unknown">' + unknownGoals.map(goalChip).join('') + '</div>' : '';

          return '<div class="scorers-row">' + homeHtml + unkHtml + awayHtml + '</div>';
        }

        function resultRow(match) {
          var sh = (match.score.home !== null && match.score.home !== undefined) ? match.score.home : '-';
          var sa = (match.score.away !== null && match.score.away !== undefined) ? match.score.away : '-';
          return '<article class="resultRow">'
            + '<div class="r-date"><span>' + match.dateLabel + '</span><span class="r-stage">' + match.stageLabel + '</span>' + (match.group ? '<span class="r-group">' + match.group + '</span>' : '') + '</div>'
            + '<div class="match-teams">'
              + '<div class="r-home">' + crestImg(match.homeCrest, match.homeTeam, 22) + '<span>' + match.homeTeam + '</span></div>'
              + '<div class="scorePill">' + sh + ' \u2013 ' + sa + '</div>'
              + '<div class="r-away"><span>' + match.awayTeam + '</span>' + crestImg(match.awayCrest, match.awayTeam, 22) + '</div>'
            + '</div>'
            + scorersList(match.scorers, match.homeTeam, match.awayTeam)
            + '</article>';
        }

        function newsCard(item) {
          var langBadge = item.lang === 'id' ? '<span class="lang-badge id">\ud83c\uddee\ud83c\udde9 ID</span>' : '<span class="lang-badge en">\ud83c\uddec\ud83c\udde7 EN</span>';
          var summary = item.summary ? '<p class="news-summary">' + item.summary + '</p>' : '';
          return '<a href="' + item.url + '" target="_blank" rel="noopener noreferrer" class="newsCard">'
            + '<div class="news-top"><span class="news-source">' + item.source + '</span>' + langBadge + '</div>'
            + '<h3 class="news-title">' + item.title + '</h3>'
            + summary
            + '<div class="news-footer">Baca selengkapnya \u2192</div>'
            + '</a>';
        }

        function setStatus(msg, type) {
          statusText.textContent = msg;
          sourceState.className = type || 'connected';
          if (statusDot) statusDot.style.background = type === 'error' ? 'var(--color-error)' : 'var(--color-primary)';
        }

        /* ---- Stage filter buttons ---- */
        function buildStageFilters(stages) {
          var used = new Set(allPast.map(function(m) { return m.stage; }));
          var html = '<button class="filter-btn ' + (activeStage === 'ALL' ? 'active' : '') + '" data-stage="ALL">All</button>';
          stages.forEach(function(s) {
            if (used.has(s.key)) {
              html += '<button class="filter-btn ' + (activeStage === s.key ? 'active' : '') + '" data-stage="' + s.key + '">' + s.label + '</button>';
            }
          });
          stageFilter.innerHTML = html;
          stageFilter.querySelectorAll('.filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              activeStage = btn.getAttribute('data-stage');
              stageFilter.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
              btn.classList.add('active');
              renderPastResults();
            });
          });
        }

        function renderPastResults() {
          var filtered = activeStage === 'ALL' ? allPast : allPast.filter(function(m) { return m.stage === activeStage; });
          if (!filtered.length) {
            resultsList.innerHTML = '<div class="empty">Tidak ada hasil untuk fase ini.</div>';
            return;
          }
          var header = '<div class="results-header"><span>Tanggal</span><span>Pertandingan</span></div>';
          resultsList.innerHTML = header + filtered.map(resultRow).join('');
        }

        /* ---- News lang filter ---- */
        function renderNews() {
          var filtered = activeLang === 'ALL' ? allNews : allNews.filter(function(n) { return n.lang === activeLang; });
          if (!filtered.length) {
            newsList.innerHTML = '<div class="empty">Tidak ada berita tersedia saat ini.</div>';
            return;
          }
          newsList.innerHTML = filtered.map(newsCard).join('');
        }

        newsLangFilter.querySelectorAll('.filter-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            activeLang = btn.getAttribute('data-lang');
            newsLangFilter.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            renderNews();
          });
        });

        /* ---- Render dashboard ---- */
        function renderDashboard(data) {
          matchesCount.textContent = data.totals.matches + ' matches in DB';
          updatedAt.textContent = 'Updated: ' + new Date(data.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
          currentStatus.textContent = data.currentStatus.stage + ' \u00b7 ' + data.currentStatus.message;
          stageGrid.innerHTML = data.stages.map(stageCard).join('');
          upcomingList.innerHTML = data.upcoming.length
            ? data.upcoming.map(upcomingCard).join('')
            : '<div class="empty">Tidak ada pertandingan dalam 3 hari ke depan.</div>';
          allPast = data.past;
          buildStageFilters(data.stages);
          renderPastResults();
          setStatus('football-data.org connected');
        }

        /* ---- Fetch dashboard data (priority) ---- */
        async function fetchDashboard() {
          setStatus('Fetching data...');
          var res  = await fetch('/api/data', { cache: 'no-store' });
          var data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengambil data');
          renderDashboard(data);
        }

        /* ---- Fetch news (deferred, non-blocking) ---- */
        function fetchNewsDeferred() {
          fetch('/api/news', { cache: 'no-store' })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (!data.ok || !data.articles || !data.articles.length) throw new Error('no articles');
              allNews = data.articles;
              renderNews();
            })
            .catch(function() {
              newsList.innerHTML = '<div class="empty">Gagal memuat berita. Coba refresh halaman.</div>';
            });
        }

        /* ---- Manual refresh ---- */
        async function manualRefresh() {
          refreshButton.disabled = true;
          refreshButton.querySelector('span').textContent = 'Refreshing...';
          try {
            var res     = await fetch('/api/refresh');
            var payload = await res.json();
            if (!res.ok || !payload.ok) throw new Error(payload.error || 'Refresh gagal');
            await fetchDashboard();
            fetchNewsDeferred();
          } catch (err) {
            setStatus(err.message, 'error');
          } finally {
            refreshButton.disabled = false;
            refreshButton.querySelector('span').textContent = 'Refresh';
          }
        }

        refreshButton.addEventListener('click', manualRefresh);

        /* ---- Init: load dashboard first, news deferred ---- */
        fetchDashboard()
          .then(function() { fetchNewsDeferred(); })
          .catch(function(err) {
            setStatus(err.message, 'error');
            stageGrid.innerHTML    = '<div class="empty">Jalankan /api/bootstrap setelah deploy pertama.</div>';
            upcomingList.innerHTML = '<div class="empty">Data belum tersedia.</div>';
            resultsList.innerHTML  = '<div class="empty">Data belum tersedia.</div>';
            fetchNewsDeferred();
          });
      ` }} />
    </main>
  );
}
