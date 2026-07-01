import './globals.css';
import Script from 'next/script';

export default function Page() {
  return (
    <main>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <svg className="logo" viewBox="0 0 64 64" fill="none" aria-label="Tournament dashboard logo">
              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" opacity="0.28"></circle>
              <path d="M32 10c7 0 13 3 17 8-1 7-5 12-11 15 2 7 1 13-2 21-7 0-13-3-18-8 1-8 4-13 10-17-2-6-1-12 4-19Z" fill="currentColor"></path>
            </svg>
            <div>
              <h1>FIFA World Cup 2026</h1>
              <p>Live Scoring Dashboard</p>
            </div>
          </div>
          <button id="refreshButton" className="refreshBtn">↻ Refresh</button>
        </header>
        <section className="container">
          <div className="meta" id="metaRow">
            <span id="matchesCount">0 matches in DB</span>
            <span id="updatedAt">Updated: -</span>
            <span className="connected" id="sourceState">● waiting for connection</span>
          </div>
          <section className="panel">
            <div className="currentBadge" id="currentStatus">Current status loading</div>
            <h2>🏆 Tournament Progress</h2>
            <div className="stageGrid" id="stageGrid"></div>
          </section>
          <section className="panel">
            <h2>📅 Upcoming Matches <span className="subtle">(Next 3 days · GMT+7)</span></h2>
            <div className="cards" id="upcomingList"></div>
          </section>
          <section className="panel">
            <h2>📋 Past Results</h2>
            <div className="results" id="resultsList"></div>
            <p className="footerNote">Semua hasil diurutkan berdasarkan tanggal ascending.</p>
          </section>
        </section>
      </div>
      <Script id="dashboard-script" strategy="afterInteractive">{`
        const stageGrid = document.getElementById('stageGrid');
        const upcomingList = document.getElementById('upcomingList');
        const resultsList = document.getElementById('resultsList');
        const matchesCount = document.getElementById('matchesCount');
        const updatedAt = document.getElementById('updatedAt');
        const sourceState = document.getElementById('sourceState');
        const refreshButton = document.getElementById('refreshButton');
        const currentStatus = document.getElementById('currentStatus');
        function stageCard(stage){const pct=stage.total?Math.round((stage.completed/stage.total)*100):0;return '<article class="stageCard '+(stage.isCurrent?'active':'')+'"><div class="stageIndex">'+stage.order+'</div><div class="stageName">'+stage.label+'</div><div class="stageProgress">'+stage.completed+'/'+stage.total+'</div><div class="stageBar"><span style="width:'+pct+'%"></span></div></article>';}
        function upcomingCard(match){return '<article class="matchCard"><div class="rowTop"><div class="stageLabel">'+match.stageLabel+'</div><div class="date">'+match.dayLabel+' \u00b7 '+match.localTime+' GMT+7</div></div><div class="vs"><div class="team"><strong>'+match.homeTeam+'</strong><span>'+(match.homeShort||'')+'</span></div><div class="versus">VS</div><div class="team away"><strong>'+match.awayTeam+'</strong><span>'+(match.awayShort||'')+'</span></div></div><div class="venue">\ud83d\udccd '+match.venue+'</div></article>';}
        function resultRow(match){return '<article class="resultRow"><div><div class="date">'+match.dateLabel+' GMT+7</div><div class="stageLabel">'+match.stageLabel+'</div></div><div>'+(match.group||'-')+'</div><div>'+match.homeTeam+'</div><div class="scorePill">'+(match.score.home??'-')+' - '+(match.score.away??'-')+'</div><div>'+match.awayTeam+'</div><div class="venue">'+match.venue+'</div></article>';}
        function renderDashboard(data){matchesCount.textContent=data.totals.matches+' matches in DB';updatedAt.textContent='Updated: '+new Date(data.generatedAt).toLocaleString('en-GB',{timeZone:'Asia/Jakarta'})+' GMT+7';currentStatus.textContent=data.currentStatus.stage+' \u00b7 '+data.currentStatus.message;stageGrid.innerHTML=data.stages.map(stageCard).join('');upcomingList.innerHTML=data.upcoming.length?data.upcoming.map(upcomingCard).join(''):'<div class="empty">Belum ada pertandingan 3 hari ke depan.</div>';resultsList.innerHTML=data.past.length?data.past.map(resultRow).join(''):'<div class="empty">Belum ada hasil pertandingan selesai.</div>';sourceState.textContent='\u25cf football-data.org connected';sourceState.className='connected';}
        async function fetchDashboard(){sourceState.textContent='\u25cf loading data';const res=await fetch('/api/data',{cache:'no-store'});const data=await res.json();if(!res.ok||!data.ok) throw new Error(data.error||'Gagal mengambil data');renderDashboard(data);}
        async function manualRefresh(){refreshButton.disabled=true;refreshButton.textContent='Refreshing...';try{const res=await fetch('/api/refresh');const payload=await res.json();if(!res.ok||!payload.ok) throw new Error(payload.error||'Refresh gagal');await fetchDashboard();}catch(error){sourceState.textContent='\u25cf '+error.message;sourceState.className='error';}finally{refreshButton.disabled=false;refreshButton.textContent='\u21bb Refresh';}}
        refreshButton.addEventListener('click', manualRefresh);
        fetchDashboard().catch((error)=>{sourceState.textContent='\u25cf '+error.message;sourceState.className='error';stageGrid.innerHTML='<div class="empty">Jalankan /api/bootstrap setelah deploy pertama.</div>';upcomingList.innerHTML='<div class="empty">Data belum tersedia.</div>';resultsList.innerHTML='<div class="empty">Data belum tersedia.</div>';});
      `}</Script>
    </main>
  );
}
