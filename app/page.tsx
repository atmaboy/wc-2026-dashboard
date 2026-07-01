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
            {/* Past results: same card grid as upcoming */}
            <div className="cards" id="resultsList">
              {Array.from({length:4}).map((_,i)=><div key={i} className="skeleton sk-card"></div>)}
            </div>
            {/* Pagination */}
            <div className="pagination" id="pagination" aria-label="Navigasi halaman">
              <button className="pg-btn" id="pgPrev" aria-label="Halaman sebelumnya" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="pg-info" id="pgInfo">1 / 1</span>
              <button className="pg-btn" id="pgNext" aria-label="Halaman berikutnya">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
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

      <Script id="dashboard-script" strategy="afterInteractive">{`
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
        var pgPrev        = document.getElementById('pgPrev');
        var pgNext        = document.getElementById('pgNext');
        var pgInfo        = document.getElementById('pgInfo');
        var pagination    = document.getElementById('pagination');

        var allPast      = [];
        var activeStage  = 'ALL';
        var allNews      = [];
        var activeLang   = 'ALL';
        var currentPage  = 1;
        var PAGE_SIZE    = 5;

        /* ---- Helpers ---- */
        function crestImg(url, name, size) {
          if (!url) return '<div class="crest-placeholder" style="width:'+size+'px;height:'+size+'px">' + ((name || '?').charAt(0)) + '</div>';
          return '<img src="' + url + '" alt="' + (name || '') + ' crest" width="' + size + '" height="' + size + '" loading="lazy" class="crest" onerror="this.outerHTML=\'<div class=crest-placeholder style=width:'+size+'px;height:'+size+'px>\'+this.alt.charAt(0)+\'</div>\'">';
        }

        /* ---- Stage card (Tournament Progress) ---- */
        function stageCard(stage) {
          var pct = stage.total ? Math.round((stage.completed / stage.total) * 100) : 0;
          return '<article class="stageCard ' + (stage.isCurrent ? 'active' : '') + '">'
            + '<div class="stageIndex">' + stage.order + '</div>'
            + '<div class="stageName">' + stage.label + '</div>'
            + '<div class="stageProgress">' + stage.completed + ' / ' + stage.total + ' matches</div>'
            + '<div class="stageBar"><span style="width:' + pct + '%"></span></div>'
            + '</article>';
        }

        /* ---- Upcoming card ---- */
        function upcomingCard(match) {
          return '<article class="matchCard">'
            + '<div class="rowTop"><div class="stageLabel">' + match.stageLabel + '</div><div class="date">' + match.dayLabel + ' \u00b7 ' + match.localTime + ' WIB</div></div>'
            + '<div class="vs">'
              + '<div class="team">' + crestImg(match.homeCrest, match.homeTeam, 28) + '<strong>' + match.homeTeam + '</strong><span>' + (match.homeShort || '') + '</span></div>'
              + '<div class="versus">VS</div>'
              + '<div class="team">' + crestImg(match.awayCrest, match.awayTeam, 28) + '<strong>' + match.awayTeam + '</strong><span>' + (match.awayShort || '') + '</span></div>'
            + '</div>'
            + '<div class="venue">\ud83d\udccd ' + match.venue + '</div>'
            + '</article>';
        }

        /* ---- Scorer chips grouped by team side ---- */
        function scorersList(scorers, homeTeam, awayTeam) {
          if (!scorers || !scorers.length) return '';
          var homeGoals = scorers.filter(function(s) {
            return s.team && (s.team === homeTeam || s.team.indexOf(homeTeam) !== -1 || homeTeam.indexOf(s.team) !== -1);
          });
          var awayGoals = scorers.filter(function(s) {
            return s.team && (s.team === awayTeam || s.team.indexOf(awayTeam) !== -1 || awayTeam.indexOf(s.team) !== -1);
          });
          var unknownGoals = scorers.filter(function(s) {
            return homeGoals.indexOf(s) === -1 && awayGoals.indexOf(s) === -1;
          });
          function goalChip(s) {
            var suffix = s.type ? ' <span class="goal-type">' + s.type + '</span>' : '';
            var min    = s.minute ? ' <span class="goal-min">' + s.minute + '\u2019</span>' : '';
            return '<span class="scorer-chip">' + s.name + min + suffix + '</span>';
          }
          var homeHtml = '<div class="scorers-home">'    + homeGoals.map(goalChip).join('')    + '</div>';
          var unkHtml  = unknownGoals.length ? '<div class="scorers-unknown">' + unknownGoals.map(goalChip).join('') + '</div>' : '';
          var awayHtml = '<div class="scorers-away">'    + awayGoals.map(goalChip).join('')    + '</div>';
          return '<div class="scorers-row">' + homeHtml + unkHtml + awayHtml + '</div>';
        }

        /* ---- Past result card (same structure as upcomingCard) ---- */
        function resultCard(match) {
          var sh = (match.score.home !== null && match.score.home !== undefined) ? match.score.home : '-';
          var sa = (match.score.away !== null && match.score.away !== undefined) ? match.score.away : '-';

          var badges = '<span class="r-stage">' + match.stageLabel + '</span>'
            + (match.group ? ' <span class="r-group">' + match.group + '</span>' : '');

          return '<article class="matchCard past-card">'
            /* top row: date + stage badges */
            + '<div class="rowTop">'
              + '<div class="date-badges">' + badges + '</div>'
              + '<div class="date">' + match.dateLabel + ' WIB</div>'
            + '</div>'
            /* teams + final score – same vs block as upcoming */
            + '<div class="vs">'
              + '<div class="team">' + crestImg(match.homeCrest, match.homeTeam, 28) + '<strong>' + match.homeTeam + '</strong><span>' + (match.homeShort || '') + '</span></div>'
              + '<div class="scorePill">' + sh + ' \u2013 ' + sa + '</div>'
              + '<div class="team">' + crestImg(match.awayCrest, match.awayTeam, 28) + '<strong>' + match.awayTeam + '</strong><span>' + (match.awayShort || '') + '</span></div>'
            + '</div>'
            /* venue */
            + '<div class="venue">\ud83d\udccd ' + match.venue + '</div>'
            /* scorers */
            + scorersList(match.scorers, match.homeTeam, match.awayTeam)
            + '</article>';
        }

        /* ---- News card ---- */
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

        /* ---- Stage filter ---- */
        function buildStageFilters(stages) {
          var used = {};
          allPast.forEach(function(m) { used[m.stage] = true; });
          var html = '<button class="filter-btn ' + (activeStage === 'ALL' ? 'active' : '') + '" data-stage="ALL">All</button>';
          stages.forEach(function(s) {
            if (used[s.key]) {
              html += '<button class="filter-btn ' + (activeStage === s.key ? 'active' : '') + '" data-stage="' + s.key + '">' + s.label + '</button>';
            }
          });
          stageFilter.innerHTML = html;
          stageFilter.querySelectorAll('.filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              activeStage = btn.getAttribute('data-stage');
              currentPage = 1;
              stageFilter.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
              btn.classList.add('active');
              renderPastResults();
            });
          });
        }

        /* ---- Pagination helper ---- */
        function updatePagination(total) {
          var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
          pgInfo.textContent = currentPage + ' / ' + totalPages;
          pgPrev.disabled = currentPage <= 1;
          pgNext.disabled = currentPage >= totalPages;
          pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        }

        pgPrev.addEventListener('click', function() {
          if (currentPage > 1) { currentPage--; renderPastResults(); }
        });
        pgNext.addEventListener('click', function() {
          var filtered = activeStage === 'ALL' ? allPast : allPast.filter(function(m) { return m.stage === activeStage; });
          var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
          if (currentPage < totalPages) { currentPage++; renderPastResults(); }
        });

        /* ---- Render past results ---- */
        function renderPastResults() {
          var filtered = activeStage === 'ALL' ? allPast : allPast.filter(function(m) { return m.stage === activeStage; });
          if (!filtered.length) {
            resultsList.innerHTML = '<div class="empty">Tidak ada hasil untuk fase ini.</div>';
            pagination.style.display = 'none';
            return;
          }
          var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
          if (currentPage > totalPages) currentPage = totalPages;
          var start  = (currentPage - 1) * PAGE_SIZE;
          var sliced = filtered.slice(start, start + PAGE_SIZE);
          resultsList.innerHTML = sliced.map(resultCard).join('');
          updatePagination(filtered.length);
          /* Scroll to top of section smoothly */
          resultsList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        /* ---- Render news ---- */
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

        /* ---- Render full dashboard ---- */
        function renderDashboard(data) {
          matchesCount.textContent = data.totals.matches + ' matches in DB';
          updatedAt.textContent = 'Updated: ' + new Date(data.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
          currentStatus.textContent = data.currentStatus.stage + ' \u00b7 ' + data.currentStatus.message;
          stageGrid.innerHTML = data.stages.map(stageCard).join('');
          upcomingList.innerHTML = data.upcoming.length
            ? data.upcoming.map(upcomingCard).join('')
            : '<div class="empty">Tidak ada pertandingan dalam 3 hari ke depan.</div>';
          allPast     = data.past;
          currentPage = 1;
          buildStageFilters(data.stages);
          renderPastResults();
          setStatus('football-data.org connected');
        }

        /* ---- Fetch dashboard data ---- */
        async function fetchDashboard() {
          setStatus('Fetching data...');
          var res  = await fetch('/api/data', { cache: 'no-store' });
          var data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengambil data');
          renderDashboard(data);
        }

        /* ---- Fetch news (deferred) ---- */
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

        /* ---- Auto-refresh every 5 minutes ---- */
        setInterval(fetchDashboard, 5 * 60 * 1000);

        /* ---- Init ---- */
        fetchDashboard()
          .then(function() { fetchNewsDeferred(); })
          .catch(function(err) {
            setStatus(err.message, 'error');
            stageGrid.innerHTML    = '<div class="empty">Jalankan /api/bootstrap setelah deploy pertama.</div>';
            upcomingList.innerHTML = '<div class="empty">Data belum tersedia.</div>';
            resultsList.innerHTML  = '<div class="empty">Data belum tersedia.</div>';
            pagination.style.display = 'none';
            fetchNewsDeferred();
          });
      `}</Script>
    </main>
  );
}
