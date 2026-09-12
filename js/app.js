(() => {
  const $ = (id) => document.getElementById(id);
  const lists = window.LUMEN_PLAYLISTS;
  const storeKey = "lumen-tv-v1";
  const state = {
    listId: "featured",
    channels: [],
    filtered: [],
    query: "",
    listQuery: "",
    popularFirst: true,
    favOnly: false,
    favorites: new Set(),
    current: null,
    pip: { 1: null, 2: null },
    hls: { main: null, 1: null, 2: null }
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
    if (Array.isArray(saved.favorites)) state.favorites = new Set(saved.favorites);
    if (typeof saved.popularFirst === "boolean") state.popularFirst = saved.popularFirst;
    if (saved.vol) {
      $("volMain").value = saved.vol.main ?? 1;
      $("volPip1").value = saved.vol.p1 ?? 0.6;
      $("volPip2").value = saved.vol.p2 ?? 0.6;
    }
  } catch {}

  const persist = () => {
    localStorage.setItem(storeKey, JSON.stringify({
      favorites: [...state.favorites],
      popularFirst: state.popularFirst,
      vol: { main: $("volMain").value, p1: $("volPip1").value, p2: $("volPip2").value }
    }));
  };

  const toast = (msg) => {
    const el = $("status");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  };

  const attr = (line, key) => {
    const m = line.match(new RegExp(key + '="([^"]*)"', "i"));
    return m ? m[1] : "";
  };

  const parseM3U = (text) => {
    const lines = text.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXTINF")) continue;
      let url = "";
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const n = lines[j].trim();
        if (!n || n.startsWith("#")) continue;
        url = n;
        break;
      }
      if (!url || url.startsWith("plugin://") || url.includes("youtube.com/")) continue;
      const name = (line.split(",").slice(1).join(",") || attr(line, "tvg-name") || "Channel").trim();
      out.push({
        name,
        group: attr(line, "group-title") || "General",
        logo: attr(line, "tvg-logo"),
        url,
        score: popularity(name)
      });
    }
    return out;
  };

  const popularity = (name) => {
    const n = name.toLowerCase();
    let score = 0;
    window.LUMEN_POPULAR.forEach((term, i) => {
      if (n.includes(term)) score += (window.LUMEN_POPULAR.length - i) * 3;
    });
    if (/\b(us|usa|uk|english|international|world)\b/i.test(name)) score += 8;
    if (/24|hd|1080|720/i.test(name)) score += 2;
    return score;
  };

  const sortChannels = (arr) => {
    const copy = [...arr];
    if (state.popularFirst) copy.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
    else copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  };

  const renderLists = () => {
    const q = state.listQuery.toLowerCase();
    $("listNav").innerHTML = lists.filter((l) => !q || l.name.toLowerCase().includes(q) || l.desc.toLowerCase().includes(q)).map((l) => `
      <button class="list-btn ${l.id === state.listId ? "active" : ""}" data-list="${l.id}">
        <span class="list-ico">${l.icon}</span>
        <span class="list-meta">
          <span class="list-name">${l.name}</span>
          <span class="list-desc">${l.desc}</span>
        </span>
      </button>
    `).join("");
  };

  const logoFallback = (name) => {
    const letters = name.replace(/[^A-Za-z0-9]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "TV";
    return `<div class="thumb ph">${letters}</div>`;
  };

  const renderChannels = () => {
    let rows = state.channels;
    if (state.favOnly) rows = rows.filter((c) => state.favorites.has(c.url));
    if (state.query) {
      const q = state.query.toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.group || "").toLowerCase().includes(q));
    }
    state.filtered = sortChannels(rows).slice(0, 400);
    $("channelCount").textContent = `${state.filtered.length}${state.channels.length > state.filtered.length ? ` of ${state.channels.length}` : ""} channels`;
    $("channels").innerHTML = state.filtered.map((c) => {
      const on = state.current && state.current.url === c.url;
      const fav = state.favorites.has(c.url);
      const thumb = c.logo
        ? `<img class="thumb" src="${c.logo}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb ph',textContent:'TV'}))" />`
        : logoFallback(c.name);
      return `<article class="card ${on ? "on" : ""}" data-url="${encodeURIComponent(c.url)}">
        ${thumb}
        <div>
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.group || "")}</p>
        </div>
        <div class="card-actions">
          <button class="tiny star ${fav ? "on" : ""}" data-fav="${encodeURIComponent(c.url)}" title="Favorite">★</button>
          <button class="tiny" data-to="1" data-url="${encodeURIComponent(c.url)}">PIP1</button>
          <button class="tiny" data-to="2" data-url="${encodeURIComponent(c.url)}">PIP2</button>
        </div>
      </article>`;
    }).join("") || `<p style="color:var(--muted);padding:12px">No channels match this filter.</p>`;
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[ch]));

  const findChannel = (url) => state.channels.find((c) => c.url === url) || state.current;

  async function loadList(id) {
    const list = lists.find((l) => l.id === id) || lists[0];
    state.listId = list.id;
    $("nowList").textContent = list.name;
    renderLists();
    $("channels").innerHTML = `<p style="color:var(--muted);padding:12px">Loading ${list.name}…</p>`;
    try {
      if (list.type === "featured") {
        state.channels = window.LUMEN_FEATURED.map((c) => ({ ...c, score: c.score || popularity(c.name) }));
      } else {
        const res = await fetch(list.url);
        if (!res.ok) throw new Error("Playlist HTTP " + res.status);
        const text = await res.text();
        state.channels = parseM3U(text);
        if (!state.channels.length) throw new Error("No playable entries in playlist");
      }
      renderChannels();
      toast(`${list.name}: ${state.channels.length} channels`);
    } catch (err) {
      $("channels").innerHTML = `<p style="color:var(--danger);padding:12px">${escapeHtml(err.message)}. Many country lists are large; try Featured or News.</p>`;
    }
  }

  function attachHls(video, url, slot) {
    destroyHls(slot);
    video.pause();
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        xhrSetup: (xhr) => { xhr.withCredentials = false; }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else toast("This stream blocked browser playback (CORS or geo). Try another channel.");
        }
      });
      state.hls[slot] = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}), { once: true });
    } else {
      toast("HLS is not supported in this browser.");
    }
  }

  function destroyHls(slot) {
    const h = state.hls[slot];
    if (h) {
      try { h.destroy(); } catch {}
      state.hls[slot] = null;
    }
  }

  function playMain(ch) {
    if (!ch) return;
    state.current = ch;
    $("nowTitle").textContent = ch.name;
    $("veil").classList.add("hide");
    $("liveDot").classList.add("on");
    const video = $("mainVideo");
    video.muted = false;
    video.volume = Number($("volMain").value);
    attachHls(video, ch.url, "main");
    $("playBtn").textContent = "❚❚";
    renderChannels();
    toast("Playing " + ch.name);
  }

  function playPip(slot, ch) {
    if (!ch) return;
    state.pip[slot] = ch;
    const box = $("pip" + slot);
    box.hidden = false;
    $("pip" + slot + "Name").textContent = ch.name;
    const video = $("pip" + slot + "Video");
    video.muted = true;
    video.volume = Number($("volPip" + slot).value);
    attachHls(video, ch.url, slot);
    $("mutePip" + slot).textContent = "🔇";
    $("mutePip" + slot).title = "Unmute PIP " + slot;
    positionPip(slot);
    toast(`PIP ${slot}: ${ch.name} (muted — unmute in the PIP bar)`);
  }

  function closePip(slot) {
    destroyHls(slot);
    const video = $("pip" + slot + "Video");
    video.removeAttribute("src");
    video.load();
    state.pip[slot] = null;
    $("pip" + slot).hidden = true;
  }

  function swapPip(slot) {
    const a = state.current;
    const b = state.pip[slot];
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
    const theater = $("theater");
    let mode = null;
    document.addEventListener("pointerdown", (e) => {
      const resize = e.target.closest("[data-resize]");
      const bar = e.target.closest(".pip-bar");
      if (resize) {
        const slot = resize.dataset.resize;
        const el = $("pip" + slot);
        mode = { type: "resize", el, x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight };
        el.setPointerCapture?.(e.pointerId);
      } else if (bar) {
        const el = bar.closest(".pip");
        const r = el.getBoundingClientRect();
        const t = theater.getBoundingClientRect();
        mode = { type: "drag", el, dx: e.clientX - r.left, dy: e.clientY - r.top, t };
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.left = r.left - t.left + "px";
        el.style.top = r.top - t.top + "px";
      }
    });
    document.addEventListener("pointermove", (e) => {
      if (!mode) return;
      if (mode.type === "drag") {
        const t = $("theater").getBoundingClientRect();
        const x = Math.min(Math.max(0, e.clientX - t.left - mode.dx), t.width - mode.el.offsetWidth);
        const y = Math.min(Math.max(0, e.clientY - t.top - mode.dy), t.height - mode.el.offsetHeight);
        mode.el.style.left = x + "px";
        mode.el.style.top = y + "px";
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
      if (state.favorites.has(url)) state.favorites.delete(url);
      else state.favorites.add(url);
      persist();
      renderChannels();
      return;
    }
    const to = e.target.closest("[data-to]");
    if (to) {
      const url = decodeURIComponent(to.dataset.url);
      const ch = findChannel(url) || state.filtered.find((c) => c.url === url);
      playPip(Number(to.dataset.to), ch);
      return;
    }
    const card = e.target.closest(".card");
    if (card) {
      const url = decodeURIComponent(card.dataset.url);
      playMain(findChannel(url) || state.filtered.find((c) => c.url === url));
    }
  });

  $("listSearch").addEventListener("input", (e) => { state.listQuery = e.target.value; renderLists(); });
  $("channelSearch").addEventListener("input", (e) => { state.query = e.target.value; renderChannels(); });
  $("favFilterBtn").addEventListener("click", () => {
    state.favOnly = !state.favOnly;
    $("favFilterBtn").classList.toggle("active", state.favOnly);
    renderChannels();
  });
  $("sortBtn").addEventListener("click", () => {
    state.popularFirst = !state.popularFirst;
    $("sortBtn").textContent = state.popularFirst ? "Popular first" : "A–Z";
    persist();
    renderChannels();
  });
  $("toggleRail").addEventListener("click", () => $("rail").classList.toggle("open"));

  $("playBtn").addEventListener("click", () => {
    const v = $("mainVideo");
    if (v.paused) { v.play(); $("playBtn").textContent = "❚❚"; }
    else { v.pause(); $("playBtn").textContent = "▶"; }
  });
  $("muteMain").addEventListener("click", () => {
    const v = $("mainVideo");
    v.muted = !v.muted;
    $("muteMain").textContent = v.muted ? "🔇" : "🔊";
  });
  $("volMain").addEventListener("input", (e) => {
    $("mainVideo").volume = Number(e.target.value);
    $("volMainLbl").textContent = Math.round(e.target.value * 100) + "%";
    persist();
  });
  $("volMainLbl").textContent = Math.round($("volMain").value * 100) + "%";

  [1, 2].forEach((slot) => {
    $("mutePip" + slot).addEventListener("click", () => {
      const v = $("pip" + slot + "Video");
      v.muted = !v.muted;
      $("mutePip" + slot).textContent = v.muted ? "🔇" : "🔊";
      $("mutePip" + slot).title = v.muted ? "Unmute PIP " + slot : "Mute PIP " + slot;
    });
    $("volPip" + slot).addEventListener("input", (e) => {
      $("pip" + slot + "Video").volume = Number(e.target.value);
      persist();
    });
  });

  $("theater").addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    const swap = e.target.closest("[data-swap]");
    if (close) closePip(Number(close.dataset.close));
    if (swap) swapPip(Number(swap.dataset.swap));
  });

  $("pip1FromMain").addEventListener("click", () => state.current && playPip(1, state.current));
  $("pip2FromMain").addEventListener("click", () => state.current && playPip(2, state.current));
  $("fsBtn").addEventListener("click", () => {
    const el = $("theater");
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  const modal = $("modal");
  $("customBtn").addEventListener("click", () => {
    $("modalTitle").textContent = "Load custom list";
    $("modalHint").textContent = "Paste a public M3U URL. Use only streams you are allowed to access.";
    $("customUrl").hidden = false;
    $("keys").hidden = true;
    $("modalOk").hidden = false;
    modal.showModal();
  });
  $("helpBtn").addEventListener("click", () => {
    $("modalTitle").textContent = "Shortcuts & notes";
    $("modalHint").textContent = "Lumen TV plays publicly listed streams in the browser. Some feeds block web playback via CORS or geo rules even when they work in VLC.";
    $("customUrl").hidden = true;
    $("modalOk").hidden = true;
    $("keys").hidden = false;
    $("keys").textContent = `Space        play / pause main\nM            mute main\n1 / 2        send current channel to PIP\nEsc          close last PIP\nF            fullscreen theater\n/            focus channel search\n\nClick a card to play on main.\nPIP1 / PIP2 buttons open independent floating players.\nEach PIP starts muted. Unmute and set volume on that window.\nDrag the PIP header to move. Drag the gold corner to resize.`;
    modal.showModal();
  });
  modal.addEventListener("close", async () => {
    if (modal.returnValue !== "ok") return;
    const url = $("customUrl").value.trim();
    if (!url) return;
    lists.unshift({ id: "custom-" + Date.now(), name: "Custom list", desc: "Loaded by you", icon: "+", url });
    await loadList(lists[0].id);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input")) return;
    if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
    if (e.key === "m" || e.key === "M") $("muteMain").click();
    if (e.key === "1" && state.current) playPip(1, state.current);
    if (e.key === "2" && state.current) playPip(2, state.current);
    if (e.key === "f" || e.key === "F") $("fsBtn").click();
    if (e.key === "/") { e.preventDefault(); $("channelSearch").focus(); }
    if (e.key === "Escape") {
      if (state.pip[2]) closePip(2);
      else if (state.pip[1]) closePip(1);
    }
  });

  enableDragResize();
  $("sortBtn").textContent = state.popularFirst ? "Popular first" : "A–Z";
  renderLists();
  loadList("featured");
})();
