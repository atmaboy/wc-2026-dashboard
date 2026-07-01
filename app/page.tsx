import './globals.css';
import Script from 'next/script';

export default function Page() {
  return (
    <main>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <svg className="logo" viewBox="0 0 64 64" fill="none" aria-label="FIFA World Cup 2026 Dashboard">
              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" opacity="0.28" />
              <path
                d="M32 10c7 0 13 3 17 8-1 7-5 12-11 15 2 7 1 13-2 21-7 0-13-3-18-8 1-8 4-13 10-17-2-6-1-12 4-19Z"
                fill="currentColor"
              />
            </svg>
            <div>
              <h1>FIFA World Cup 2026</h1>
              <p>Live Scoring Dashboard</p>
            </div>
          </div>
          <button id="refreshButton" className="refreshBtn" aria-label="Refresh data">
            <svg
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Refresh</span>
          </button>
        </header>

        <section className="container">
          {/* Meta row */}
          <div className="meta" id="metaRow">
            <span id="matchesCount">0 matches</span>
            <span id="updatedAt">Updated: -</span>
            <span className="connected" id="sourceState">
              <span className="meta-dot" id="statusDot" />
              <span id="statusText">Connecting...</span>
            </span>
          </div>

          {/* Tournament Progress */}
          <section className="panel" id="progressPanel">
            <div className="currentBadge" id="currentStatus">Loading tournament status...</div>
            <h2>&#x1F3C6; Tournament Progress</h2>
            <div className="stageScroll">
              <div className="stageGrid" id="stageGrid">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="skeleton sk-stage" />
                ))}
              </div>
            </div>
          </section>

          {/* Upcoming Matches */}
          <section className="panel">
            <h2>&#x1F4C5; Upcoming Matches <span className="subtle">(Next 3 days &middot; GMT+7)</span></h2>
            <div className="cards" id="upcomingList">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton sk-card" />
              ))}
            </div>
          </section>

          {/* Past Results */}
          <section className="panel">
            <div className="panel-header">
              <h2>&#x1F4CB; Past Results</h2>
              <div className="filter-group" id="stageFilter" role="group" aria-label="Filter by stage">
                <button className="filter-btn active" data-stage="ALL">All</button>
              </div>
            </div>
            <div className="cards" id="resultsList">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton sk-card" />
              ))}
            </div>
            <div className="pagination" id="pagination" aria-label="Navigasi halaman">
              <button className="pg-btn" id="pgPrev" aria-label="Halaman sebelumnya" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="pg-info" id="pgInfo">1 / 1</span>
              <button className="pg-btn" id="pgNext" aria-label="Halaman berikutnya">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <p className="footerNote">Diurutkan pertandingan terbaru &middot; Waktu dalam GMT+7</p>
          </section>

          {/* News Section */}
          <section className="panel">
            <h2>&#x1F4F0; Berita Piala Dunia 2026</h2>
            <div className="news-filter" id="newsLangFilter">
              <button className="filter-btn active" data-lang="ALL">All</button>
              <button className="filter-btn" data-lang="en">&#x1F1EC;&#x1F1E7; English</button>
              <button className="filter-btn" data-lang="id">&#x1F1EE;&#x1F1E9; Indonesia</button>
            </div>
            <div className="news-grid" id="newsList">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton sk-news" />
              ))}
            </div>
          </section>
        </section>
      </div>

      {/* External JS file — avoids JSX string-escape issues with inline Script */}
      <Script src="/dashboard.js" strategy="afterInteractive" />
    </main>
  );
}
