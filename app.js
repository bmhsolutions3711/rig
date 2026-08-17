(() => {
  const DEFAULT_ORIGIN = "https://bryans-macbook-pro-1.tail1ed408.ts.net:8700";
  const onPages = location.hostname.endsWith("github.io");

  const $ = (id) => document.getElementById(id);

  function ingestHash() {
    const raw = location.hash.slice(1);
    if (!raw) return;
    if (raw === "reset") {
      localStorage.removeItem("rig_origin");
      localStorage.removeItem("rig_token");
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if (raw.startsWith("cfg=")) {
      try {
        const cfg = JSON.parse(decodeURIComponent(raw.slice(4)));
        if (cfg.api) localStorage.setItem("rig_origin", String(cfg.api).replace(/\/$/, ""));
        if (cfg.token) localStorage.setItem("rig_token", String(cfg.token));
      } catch (_) { /* bad cfg stays unconnected */ }
      history.replaceState(null, "", location.pathname + location.search);
    }
  }
  ingestHash();
  const padEl = $("pad");
  const lotEl = $("lot");
  const lotSec = $("lotSec");
  const gateEl = $("gate");
  const gateList = $("gateList");
  const gateLamp = $("gateLamp");
  const padCount = $("padCount");
  const boardEl = $("board");
  const epicNav = $("epicNav");
  const sheet = $("sheet");
  const connect = $("connect");
  const drop = $("drop");
  const dropIn = $("dropIn");
  const sheetErr = $("sheetErr");
  const lastLeft = $("lastLeft");
  const closeSheet = $("closeSheet");
  const enErr = $("enErr");

  let yard = null;
  let openId = null;
  let focusEpic = "";
  let origin = localStorage.getItem("rig_origin") || (onPages ? DEFAULT_ORIGIN : "");
  let token = localStorage.getItem("rig_token") || "";

  function apiUrl(path) {
    const base = origin.replace(/\/$/, "");
    return `${base}${path}`;
  }

  async function api(path, opt = {}) {
    const headers = { "Content-Type": "application/json", ...(opt.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(apiUrl(path), {
      credentials: origin ? "omit" : "same-origin",
      ...opt,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      showConnect("closed — origin and token");
      const err = new Error("unauthorized");
      err.code = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.code = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  function showConnect(msg) {
    if (msg) {
      $("connectErr").hidden = false;
      $("connectErr").textContent = msg;
    } else {
      $("connectErr").hidden = true;
    }
    $("originIn").value = origin || DEFAULT_ORIGIN;
    $("tokenIn").value = token;
    connect.hidden = false;
  }

  function ticket(load, compact) {
    const said = escape(load.said || "—");
    const did = load.did ? `<p class="did">${escape(load.did)}</p>` : "";
    return `<button type="button" class="ticket zone-${load.zone || "lot"}" data-id="${load.id}">
      <span class="stub" aria-hidden="true"></span>
      <span class="face">
        <h3>${escape(load.title)}</h3>
        <p class="said">${said}</p>
        ${compact ? "" : did}
      </span>
    </button>`;
  }

  function escape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    if (!yard) return;
    const limit = yard.pad_limit || 3;
    const pad = yard.pad || [];
    padCount.textContent = `${pad.length}/${limit}`;
    const last = (yard.entry && yard.entry.last) || null;
    if (last && last.next_up) {
      lastLeft.hidden = false;
      lastLeft.textContent = "Last left: " + last.next_up.split("\n")[0];
    } else {
      lastLeft.hidden = true;
    }
    const slots = [];
    for (let i = 0; i < limit; i++) {
      const load = pad[i];
      if (load) {
        slots.push(`<div class="bay-slot full">${ticket(load)}</div>`);
      } else {
        slots.push(`<div class="bay-slot" data-open-drop>Open</div>`);
      }
    }
    padEl.innerHTML = slots.join("");

    const gate = yard.gate || [];
    gateLamp.dataset.on = gate.length ? "1" : "0";
    gateLamp.title = gate.length ? `${gate.length} at the gate` : "gate clear";
    gateEl.hidden = gate.length === 0;
    gateList.innerHTML = gate.map((l) => ticket(l, true)).join("");

    const epics = yard.board || [];
    epicNav.hidden = epics.length === 0;
    epicNav.innerHTML = `<button type="button" class="epic-chip${focusEpic ? "" : " on"}" data-epic="">All</button>` +
      epics.map((e) => `<button type="button" class="epic-chip${focusEpic === e.id ? " on" : ""}" data-epic="${e.id}">${escape(e.title)} <span>${e.open}</span></button>`).join("");

    boardEl.innerHTML = epics
      .filter((e) => !focusEpic || e.id === focusEpic)
      .map((e) => {
        const open = (e.loads || []).filter((l) => l.zone !== "scale");
        const done = (e.loads || []).filter((l) => l.zone === "scale");
        return `<article class="epic" id="epic-${e.id}">
          <header>
            <h2>${escape(e.title)} <span>${e.open} open · ${e.done} weighed</span></h2>
            <p class="why">${escape(e.why || "")}</p>
          </header>
          <div class="epic-loads">${open.map((l) => ticket(l, true)).join("") || "<p class='empty'>Nothing open.</p>"}</div>
          ${done.length ? `<details class="weighed"><summary>Weighed ${done.length}</summary>${done.map((l) => ticket(l)).join("")}</details>` : ""}
        </article>`;
      }).join("");

    const loose = (yard.ungrouped || []).filter((l) => l.zone !== "scale");
    lotSec.hidden = loose.length === 0;
    const lotN = $("lotN");
    if (lotN) lotN.textContent = loose.length ? String(loose.length) : "";
    lotEl.innerHTML = loose.map((l) => ticket(l, true)).join("");
  }

  function findLoad(id) {
    return (yard.loads || []).find((l) => l.id === id);
  }

  function openSheet(id) {
    const load = findLoad(id);
    if (!load) return;
    openId = id;
    const epicName = ((yard.epics || []).find((e) => e.id === load.epic) || {}).title || load.epic || "";
    $("sheetZone").textContent = [epicName, load.gate ? "gate" : "", load.zone].filter(Boolean).join(" · ");
    $("sheetTitle").value = load.title;
    $("sheetSaid").value = load.said || "";
    $("sheetDid").value = load.did || "";
    $("sheetBody").value = load.body || "";
    sheetErr.hidden = true;
    sheet.hidden = false;
    $("sheetSaid").focus();
  }

  function hideLoadSheet() {
    sheet.hidden = true;
    openId = null;
  }

  async function refresh() {
    yard = await api("/api/yard");
    render();
    if (openId) {
      const still = findLoad(openId);
      if (still) {
        const epicName = ((yard.epics || []).find((e) => e.id === still.epic) || {}).title || "";
        $("sheetZone").textContent = [epicName, still.gate ? "gate" : "", still.zone].filter(Boolean).join(" · ");
      }
    }
  }

  async function saveOpen() {
    if (!openId) return;
    await api(`/api/loads/${openId}`, {
      method: "POST",
      body: JSON.stringify({
        title: $("sheetTitle").value,
        said: $("sheetSaid").value,
        did: $("sheetDid").value,
        body: $("sheetBody").value,
      }),
    });
  }

  padEl.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open-drop]");
    if (open) {
      dropIn.focus();
      return;
    }
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  lotEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  gateList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  boardEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  epicNav.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-epic]");
    if (!chip) return;
    focusEpic = chip.dataset.epic || "";
    render();
  });

  sheet.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) {
      try { await saveOpen(); } catch (_) {}
      hideLoadSheet();
      try { await refresh(); } catch (_) {}
      return;
    }
    const act = e.target.closest("[data-act]");
    if (!act || !openId) return;
    sheetErr.hidden = true;
    try {
      await saveOpen();
      const kind = act.dataset.act;
      if (kind === "pull") {
        await api(`/api/loads/${openId}/pull`, { method: "POST", body: "{}" });
      } else if (kind === "lot") {
        await api(`/api/loads/${openId}/lot`, { method: "POST", body: "{}" });
      } else if (kind === "weigh") {
        await api(`/api/loads/${openId}/weigh`, {
          method: "POST",
          body: JSON.stringify({ did: $("sheetDid").value }),
        });
      } else if (kind === "hand") {
        const load = findLoad(openId);
        await api(`/api/loads/${openId}/hand`, {
          method: "POST",
          body: JSON.stringify({ needs_hand: !(load && load.needs_hand) }),
        });
      }
      await refresh();
      if (kind === "weigh") hideLoadSheet();
    } catch (err) {
      if (err.code === 409) {
        padEl.classList.remove("refuse");
        void padEl.offsetWidth;
        padEl.classList.add("refuse");
        sheetErr.hidden = false;
        sheetErr.textContent = "The pad is full.";
        return;
      }
      sheetErr.hidden = false;
      sheetErr.textContent = err.message;
    }
  });

  drop.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = dropIn.value.trim();
    if (!title) return;
    try {
      await api("/api/loads", {
        method: "POST",
        body: JSON.stringify({ title, said: title, epic: focusEpic || "board" }),
      });
      dropIn.value = "";
      await refresh();
    } catch (err) {
      dropIn.blur();
      alert(err.message);
    }
  });

  $("connectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    origin = $("originIn").value.trim().replace(/\/$/, "");
    token = $("tokenIn").value.trim();
    localStorage.setItem("rig_origin", origin);
    localStorage.setItem("rig_token", token);
    try {
      await refresh();
      connect.hidden = true;
    } catch (err) {
      showConnect(err.message);
    }
  });

  $("closeBtn").addEventListener("click", () => {
    enErr.hidden = true;
    closeSheet.hidden = false;
    $("enNarrative").focus();
  });
  closeSheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-entry]")) closeSheet.hidden = true;
  });
  $("enSave").addEventListener("click", async () => {
    enErr.hidden = true;
    try {
      await api("/api/entry/close", {
        method: "POST",
        body: JSON.stringify({
          narrative: $("enNarrative").value,
          findings: $("enFindings").value,
          decisions: $("enDecisions").value,
          next_up: $("enNext").value,
        }),
      });
      $("enNarrative").value = "";
      $("enFindings").value = "";
      $("enDecisions").value = "";
      $("enNext").value = "";
      closeSheet.hidden = true;
      await refresh();
    } catch (err) {
      enErr.hidden = false;
      enErr.textContent = err.message;
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  (async () => {
    origin = localStorage.getItem("rig_origin") || (onPages ? DEFAULT_ORIGIN : "");
    token = localStorage.getItem("rig_token") || "";
    if (onPages && (!origin || !token)) {
      showConnect();
      return;
    }
    try {
      await refresh();
    } catch (err) {
      if (err.code !== 401) showConnect(err.message || "could not reach the book");
    }
  })();
})();
