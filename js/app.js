(() => {
  const $ = (id) => document.getElementById(id);
  const lists = window.LUMEN_PLAYLISTS;
  const storeKey = "lumen-tv-v2";
  const state = {
    listId: "featured", channels: [], filtered: [], query: "", listQuery: "",
    popularFirst: true, favOnly: false, favorites: new Set(), current: null,
    pip: { 1: null, 2: null }, hls: { main: null, 1: null, 2: null },
    checkToken: 0, railHidden: false, guideHidden: false
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
    if (Array.isArray(saved.favorites)) state.favorites = new Set(saved.favorites);
    if (typeof saved.popularFirst === "boolean") state.popularFirst = saved.popularFirst;
    if (typeof saved.railHidden === "boolean") state.railHidden = saved.railHidden;
    if (typeof saved.guideHidden === "boolean") state.guideHidden = saved.guideHidden;
    if (saved.vol) {
      $("volMain").value = saved.vol.main ?? 1;
      $("volPip1").value = saved.vol.p1 ?? 0.6;
      $("volPip2").value = saved.vol.p2 ?? 0.6;
    }
  } catch (e) {}
  const persist = () => localStorage.setItem(storeKey, JSON.stringify({
    favorites: [...state.favorites], popularFirst: state.popularFirst,
    railHidden: state.railHidden, guideHidden: state.guideHidden,
    vol: { main: $("volMain").value, p1: $("volPip1").value, p2: $("volPip2").value }
  }));
  const applyLayout = () => {
    $("app").classList.toggle("rail-collapsed", state.railHidden);
    $("stage").classList.toggle("guide-collapsed", state.guideHidden);
    $("toggleRail").textContent = state.railHidden ? "Show lists" : "Hide lists";
    $("toggleGuide").textContent = state.guideHidden ? "Show channels" : "Hide channels";
  };
  const toast = (msg) => {
    const el = $("status"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  };
  const attr = (line, key) => {
    const m = line.match(new RegExp(key + '="([^"]*)"', "i"));
    return m ? m[1] : "";
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => "&#" + ch.charCodeAt(0) + ";");
  const lastCommaOutsideQuotes = (s) => {
    let inQ = false, last = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '"') inQ = !inQ;
      else if (s[i] === "," && !inQ) last = i;
    }
    return last;
  };
  const looksLikeJunk = (s) => /gecko|libvlc|user-agent|applewebkit|mozilla\/|chrome\/\d|safari\/\d|vlc\/\d/i.test(s);
  const cleanName = (raw, fallback) => {
    let s = String(raw || "").replace(/^["']+|["']+$/g, "").trim();
    s = s.replace(/Mozilla\/[\s\S]*/i, " ");
    s = s.replace(/\(like Gecko\)[\s\S]*/ig, " ");
    s = s.replace(/Chrome\/[\d.]+[\s\S]*/ig, " ");
    s = s.replace(/Safari\/[\d.]+[\s\S]*/ig, " ");
    s = s.replace(/VLC\/[\d.]+[\s\S]*/ig, " ");
    s = s.replace(/LibVLC\/[\s\S]*/ig, " ");
    s = s.replace(/http-user-agent[=:][\s\S]*/ig, " ");
    s = s.replace(/\bgroup-title="[^"]*"[, ]*/ig, " ");
    s = s.replace(/\btvg-[a-z-]+="[^"]*"[, ]*/ig, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (!s || s.length < 2 || looksLikeJunk(s)) s = fallback || "Channel";
    if (s.length > 42) s = s.slice(0, 40) + "...";
    return s;
  };
  const parseM3U = (text) => {
    const lines = text.split(/\r?\n/), out = [], seen = new Set();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXTINF")) continue;
      let url = "";
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const n = lines[j].trim();
        if (!n || n.startsWith("#")) continue;
        url = n; break;
      }
      if (!url || url.startsWith("plugin://") || /youtube\.com\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      const cut = lastCommaOutsideQuotes(line);
      const rawName = cut >= 0 ? line.slice(cut + 1).trim() : "";
      const tvg = attr(line, "tvg-name");
      const base = (tvg && !looksLikeJunk(tvg)) ? tvg : rawName;
      const name = cleanName(base, tvg || "Channel");
      out.push({ name, group: cleanName(attr(line, "group-title") || "General", "General"), logo: attr(line, "tvg-logo"), url, score: popularity(name) });
    }
    return out;
  };
  const popularity = (name) => {
    const n = name.toLowerCase(); let score = 0;
    window.LUMEN_POPULAR.forEach((term, i) => { if (n.includes(term)) score += (window.LUMEN_POPULAR.length - i) * 3; });
    return score;
  };
  const sortChannels = (arr) => {
    const copy = arr.slice();
    if (state.popularFirst) copy.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
    else copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  };
  const renderLists = () => {
    const q = state.listQuery.toLowerCase();
    $("listNav").innerHTML = lists.filter((l) => !q || l.name.toLowerCase().includes(q) || l.desc.toLowerCase().includes(q)).map((l) => {
      const on = l.id === state.listId ? " active" : "";
      return '<button class="list-btn' + on + '" data-list="' + l.id + '"><span class="list-ico">' + l.icon + '</span><span class="list-meta"><span class="list-name">' + l.name + '</span><span class="list-desc">' + l.desc + '</span></span></button>';
    }).join("");
  };
  const logoFallback = (name) => {
    const letters = name.replace(/[^A-Za-z0-9]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "TV";
    return '<div class="thumb ph">' + letters + '</div>';
  };
  const renderChannels = () => {
    let rows = state.channels;
    if (state.favOnly) rows = rows.filter((c) => state.favorites.has(c.url));
    if (state.query) {
      const q = state.query.toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.group || "").toLowerCase().includes(q));
    }
    state.filtered = sortChannels(rows).slice(0, 400);
    $("channelCount").textContent = state.filtered.length + " live";
    $("channels").innerHTML = state.filtered.map((c) => {
      const on = state.current && state.current.url === c.url ? " on" : "";
      const fav = state.favorites.has(c.url) ? " on" : "";
      const enc = encodeURIComponent(c.url);
      const thumb = c.logo ? '<img class="thumb" src="' + c.logo + '" alt="" loading="lazy" onerror="this.outerHTML=\'<div class=thumb ph>TV</div>\'">' : logoFallback(c.name);
      return '<article class="card' + on + '" data-url="' + enc + '">' + thumb +
        '<div style="min-width:0"><h3 title="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</h3><p>' + escapeHtml(c.group || "") + '</p>' +
        '<div class="card-actions"><button class="tiny star' + fav + '" data-fav="' + enc + '">Fav</button>' +
        '<button class="tiny" data-to="1" data-url="' + enc + '">PIP1</button>' +
        '<button class="tiny" data-to="2" data-url="' + enc + '">PIP2</button></div></div></article>';
    }).join("") || '<p style="color:var(--muted);padding:12px">No live channels in this filter.</p>';
  };
  const findChannel = (url) => state.channels.find((c) => c.url === url) || state.current;
  const probeUrl = (url) => new Promise((resolve) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6500);
    fetch(url, { method: "GET", mode: "cors", cache: "no-store", signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) return resolve("dead");
        return res.text().then((body) => resolve(/#EXTM3U|#EXT-X|#EXTINF/i.test(body.slice(0, 240)) ? "live" : "dead"));
      })
      .catch(() => resolve("unknown"))
      .finally(() => clearTimeout(timer));
  });
  async function checkFeeds(token) {
    const pill = $("checkStatus");
    const queue = sortChannels(state.channels).slice(0, 120);
    let live = 0, dead = 0, checked = 0;
    pill.classList.add("hot");
    const runOne = async (ch) => {
      if (token !== state.checkToken) return;
      const result = await probeUrl(ch.url);
      checked += 1;
      if (result === "dead") {
        dead += 1;
        state.channels = state.channels.filter((c) => c.url !== ch.url);
        if (state.current && state.current.url === ch.url) state.current = null;
      } else live += 1;
      if (checked % 4 === 0 || result === "dead") {
        pill.textContent = "Checking " + checked + "/" + queue.length + " · removed " + dead;
        renderChannels();
      }
    };
    await Promise.all([0, 1, 2, 3].map(async (offset) => {
      for (let i = offset; i < queue.length; i += 4) {
        if (token !== state.checkToken) return;
        await runOne(queue[i]);
      }
    }));
    if (token !== state.checkToken) return;
    pill.classList.remove("hot");
    pill.textContent = live + " reachable · " + dead + " removed";
    renderChannels();
  }
  async function loadList(id) {
    const list = lists.find((l) => l.id === id) || lists[0];
    state.listId = list.id;
    state.checkToken += 1;
    const token = state.checkToken;
    $("nowList").textContent = list.name;
    $("checkStatus").textContent = "Loading...";
    renderLists();
    try {
      if (list.type === "featured") {
        state.channels = window.LUMEN_FEATURED.map((c) => Object.assign({}, c, { name: cleanName(c.name, "Channel"), score: c.score || popularity(c.name) }));
      } else {
        const res = await fetch(list.url);
        if (!res.ok) throw new Error("Playlist HTTP " + res.status);
        state.channels = parseM3U(await res.text());
        if (!state.channels.length) throw new Error("No playable entries");
      }
      renderChannels();
      if (list.type === "featured" && !state.current && state.channels[0]) {
        playMain(state.channels.find((c) => /demo/i.test(c.name)) || state.channels[0]);
      }
      checkFeeds(token);
    } catch (err) {
      $("checkStatus").textContent = "";
      $("channels").innerHTML = '<p style="color:var(--danger);padding:12px">' + escapeHtml(err.message) + '</p>';
    }
  }
  function attachHls(video, url, slot) {
    destroyHls(slot); video.pause();
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
      hls.loadSource(url); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else toast("This feed will not play in a browser.");
      });
      state.hls[slot] = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    }
  }
  function destroyHls(slot) {
    const h = state.hls[slot];
    if (h) { try { h.destroy(); } catch (e) {} state.hls[slot] = null; }
  }
  function playMain(ch) {
    if (!ch) return;
    state.current = ch;
    $("nowTitle").textContent = ch.name;
    $("veil").classList.add("hide");
    $("liveDot").classList.add("on");
    const video = $("mainVideo");
    video.muted = false; video.volume = Number($("volMain").value);
    attachHls(video, ch.url, "main");
    $("playBtn").textContent = "Pause";
    renderChannels();
  }
  function playPip(slot, ch) {
    if (!ch) return;
    state.pip[slot] = ch;
    $("pip" + slot).hidden = false;
    $("pip" + slot + "Name").textContent = ch.name;
    const video = $("pip" + slot + "Video");
    video.muted = true; video.volume = Number($("volPip" + slot).value);
    attachHls(video, ch.url, slot);
    $("mutePip" + slot).textContent = "Unmute";
    positionPip(slot);
  }
  function closePip(slot) {
    destroyHls(slot);
    const video = $("pip" + slot + "Video");
    video.removeAttribute("src"); video.load();
    state.pip[slot] = null;
    $("pip" + slot).hidden = true;
  }
  function swapPip(slot) {
    const a = state.current, b = state.pip[slot];
    if (!b) return;
    playMain(b);
    if (a) playPip(slot, a);
  }
  function positionPip(slot) {
    const el = $("pip" + slot);
    if (!el.style.left) {
      el.style.left = slot === 1 ? "16px" : "auto";
      el.style.right = slot === 1 ? "auto" : "16px";
      el.style.top = slot === 1 ? "16px" : "auto";
      el.style.bottom = slot === 1 ? "auto" : "64px";
    }
  }
  function enableDragResize() {
    let mode = null;
    document.addEventListener("pointerdown", (e) => {
      const resize = e.target.closest("[data-resize]");
      const bar = e.target.closest(".pip-bar");
      if (resize) {
        const el = $("pip" + resize.dataset.resize);
        mode = { type: "resize", el, x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight };
      } else if (bar) {
        const el = bar.closest(".pip");
        const r = el.getBoundingClientRect();
        const t = $("theater").getBoundingClientRect();
        mode = { type: "drag", el, dx: e.clientX - r.left, dy: e.clientY - r.top };
        el.style.right = "auto"; el.style.bottom = "auto";
        el.style.left = (r.left - t.left) + "px"; el.style.top = (r.top - t.top) + "px";
      }
    });
    document.addEventListener("pointermove", (e) => {
      if (!mode) return;
      if (mode.type === "drag") {
        const t = $("theater").getBoundingClientRect();
        mode.el.style.left = Math.min(Math.max(0, e.clientX - t.left - mode.dx), t.width - mode.el.offsetWidth) + "px";
        mode.el.style.top = Math.min(Math.max(0, e.clientY - t.top - mode.dy), t.height - mode.el.offsetHeight) + "px";
      } else {
        mode.el.style.width = Math.max(220, mode.w + (e.clientX - mode.x)) + "px";
        mode.el.style.height = Math.max(150, mode.h + (e.clientY - mode.y)) + "px";
      }
    });
    document.addEventListener("pointerup", () => { mode = null; });
  }
  $("listNav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-list]");
    if (btn) loadList(btn.dataset.list);
  });
  $("channels").addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      const url = decodeURIComponent(fav.dataset.fav);
      if (state.favorites.has(url)) state.favorites.delete(url); else state.favorites.add(url);
      persist(); renderChannels(); return;
    }
    const to = e.target.closest("[data-to]");
    if (to) {
      const url = decodeURIComponent(to.dataset.url);
      playPip(Number(to.dataset.to), findChannel(url) || state.filtered.find((c) => c.url === url));
      return;
    }
    const card = e.target.closest(".card");
    if (card) playMain(findChannel(decodeURIComponent(card.dataset.url)) || state.filtered.find((c) => c.url === decodeURIComponent(card.dataset.url)));
  });
  $("listSearch").addEventListener("input", (e) => { state.listQuery = e.target.value; renderLists(); });
  $("channelSearch").addEventListener("input", (e) => { state.query = e.target.value; renderChannels(); });
  $("favFilterBtn").addEventListener("click", () => { state.favOnly = !state.favOnly; $("favFilterBtn").classList.toggle("active", state.favOnly); renderChannels(); });
  $("sortBtn").addEventListener("click", () => { state.popularFirst = !state.popularFirst; $("sortBtn").textContent = state.popularFirst ? "Popular first" : "A-Z"; persist(); renderChannels(); });
  $("toggleRail").addEventListener("click", () => { state.railHidden = !state.railHidden; $("rail").classList.toggle("open", !state.railHidden); applyLayout(); persist(); });
  $("toggleGuide").addEventListener("click", () => { state.guideHidden = !state.guideHidden; applyLayout(); persist(); });
  $("playBtn").addEventListener("click", () => { const v = $("mainVideo"); if (v.paused) { v.play(); $("playBtn").textContent = "Pause"; } else { v.pause(); $("playBtn").textContent = "Play"; } });
  $("muteMain").addEventListener("click", () => { const v = $("mainVideo"); v.muted = !v.muted; $("muteMain").textContent = v.muted ? "Unmute" : "Mute"; });
  $("volMain").addEventListener("input", (e) => { $("mainVideo").volume = Number(e.target.value); $("volMainLbl").textContent = Math.round(e.target.value * 100) + "%"; persist(); });
  [1, 2].forEach((slot) => {
    $("mutePip" + slot).addEventListener("click", () => { const v = $("pip" + slot + "Video"); v.muted = !v.muted; $("mutePip" + slot).textContent = v.muted ? "Unmute" : "Mute"; });
    $("volPip" + slot).addEventListener("input", (e) => { $("pip" + slot + "Video").volume = Number(e.target.value); persist(); });
  });
  $("theater").addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    const swap = e.target.closest("[data-swap]");
    if (close) closePip(Number(close.dataset.close));
    if (swap) swapPip(Number(swap.dataset.swap));
  });
  $("pip1FromMain").addEventListener("click", () => state.current && playPip(1, state.current));
  $("pip2FromMain").addEventListener("click", () => state.current && playPip(2, state.current));
  $("fsBtn").addEventListener("click", () => { const el = $("theater"); if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen(); else document.exitFullscreen && document.exitFullscreen(); });
  const modal = $("modal");
  $("customBtn").addEventListener("click", () => { $("modalTitle").textContent = "Load custom list"; $("customUrl").hidden = false; $("keys").hidden = true; $("modalOk").hidden = false; modal.showModal(); });
  $("helpBtn").addEventListener("click", () => { $("modalTitle").textContent = "Shortcuts"; $("customUrl").hidden = true; $("modalOk").hidden = true; $("keys").hidden = false; $("keys").textContent = "[ hide lists\n] hide channels\nSpace play\n1 / 2 PIP"; modal.showModal(); });
  modal.addEventListener("close", async () => {
    if (modal.returnValue !== "ok") return;
    const url = $("customUrl").value.trim();
    if (!url) return;
    lists.unshift({ id: "custom-" + Date.now(), name: "Custom list", desc: "Loaded by you", icon: "+", url: url });
    await loadList(lists[0].id);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input")) return;
    if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
    if (e.key === "m" || e.key === "M") $("muteMain").click();
    if (e.key === "1" && state.current) playPip(1, state.current);
    if (e.key === "2" && state.current) playPip(2, state.current);
    if (e.key === "[") $("toggleRail").click();
    if (e.key === "]") $("toggleGuide").click();
    if (e.key === "f" || e.key === "F") $("fsBtn").click();
    if (e.key === "Escape") { if (state.pip[2]) closePip(2); else if (state.pip[1]) closePip(1); }
  });
  enableDragResize();
  applyLayout();
  renderLists();
  loadList("featured");
})();
