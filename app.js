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
  const gateFront = $("gateFront");
  const gateFold = $("gateFold");
  const frontList = $("frontList");
  const foldList = $("foldList");
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
  let room = "yard";
  let dockFolded = localStorage.getItem("rig_dock") === "fold";
  let archiveArmed = false;
  let archiveTimer = null;

  function applyDockFold() {
    const wrap = $("dockWrap");
    const btn = $("swimFold");
    if (!wrap || !btn) return;
    wrap.classList.toggle("folded", dockFolded);
    btn.setAttribute("aria-expanded", dockFolded ? "false" : "true");
    btn.textContent = dockFolded ? "Open dock" : "Fold dock";
  }

  function colSum(loads, empty, openSlots) {
    const bits = [];
    (loads || []).slice(0, 3).forEach((l) => {
      bits.push(`<button type="button" class="sum-item" data-id="${l.id}">${escape(l.title)}</button>`);
    });
    const extra = Math.max(0, (loads || []).length - 3);
    if (extra) bits.push(`<span class="more">+${extra}</span>`);
    if (openSlots) bits.push(`<span class="more">${openSlots} open</span>`);
    if (!bits.length) bits.push(`<span class="empty">${empty}</span>`);
    return bits.join("");
  }

  function showRoom(name) {
    room = name || "yard";
    document.querySelectorAll(".room").forEach((el) => {
      el.classList.toggle("on", el.dataset.room === room);
    });
    document.querySelectorAll("#dock [data-room]").forEach((el) => {
      el.classList.toggle("on", el.dataset.room === room);
    });
    $("bay").textContent = room === "talk" ? "ridge" : room;
    if (location.hash.replace("#", "") !== room) {
      history.replaceState(null, "", "#" + room);
    }
    drop.hidden = room !== "yard";
    document.body.classList.toggle("talking", room === "talk");
    if (room === "money") drawMoney();
    if (room === "talk") drawTalk();
    if (room === "log") drawLog($("logQ").value.trim());
  }
  $("dock").addEventListener("click", (e) => {
    const b = e.target.closest("[data-room]");
    if (b) showRoom(b.dataset.room);
  });
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    if (h === "ridge") showRoom("talk");
    else if (h) showRoom(h);
  });
  let origin = localStorage.getItem("rig_origin") || (onPages ? DEFAULT_ORIGIN : "");
  let token = localStorage.getItem("rig_token") || "";

  function apiUrl(path) {
    const base = origin.replace(/\/$/, "");
    return `${base}${path}`;
  }

  async function api(path, opt = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-Rig-Hand": "bryan",
      ...(opt.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(apiUrl(path), {
      credentials: origin ? "omit" : "include",
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
    $("originRow").hidden = !onPages;
    $("connectLede").textContent = onPages
      ? "Pages is glass. Origin is the Pro on your tailnet. Token stays on this device."
      : "Tailnet only. Paste the token. Not Google — this page.";
    $("originIn").value = origin || DEFAULT_ORIGIN;
    $("tokenIn").value = token;
    connect.hidden = false;
  }

  function ageDays(iso) {
    if (!iso) return 0;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }

  function whereLabel(zone) {
    if (zone === "pad") return "in progress";
    if (zone === "qa") return "qa";
    if (zone === "scale") return "closed";
    return "";
  }

  function ticket(load, compact) {
    const said = escape(load.said || "—");
    const did = load.did ? `<p class="did">${escape(load.did)}</p>` : "";
    const zone = load.zone || "lot";
    const age = zone === "scale" ? Math.min(7, ageDays(load.weighed_at)) : null;
    const left = zone === "scale" ? Math.max(0, 7 - ageDays(load.weighed_at)) : null;
    const where = whereLabel(zone);
    const ageAttr = age == null ? "" : ` data-age="${age}"`;
    return `<div class="ticket zone-${zone}" role="button" tabindex="0" data-id="${load.id}"${ageAttr}>
      <span class="stub" aria-hidden="true"></span>
      <span class="face">
        <h3>${escape(load.title)}</h3>
        ${where && compact ? `<span class="where">${escape(where)}</span>` : ""}
        <p class="said">${said}</p>
        ${compact ? "" : did}
        ${left != null ? `<span class="hot">${left}d</span>` : ""}
      </span>
    </div>`;
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
    const signed = ((yard.soul || {}).signed) || [];
    const lens = $("lens");
    const law = yard.law || ["Never flatter.", "Never omit a true good."];
    lens.hidden = false;
    const thru = signed.length
      ? `<span class="thru">Read through</span>${signed.map((c) => escape(c.title)).join(" · ")}`
      : `<span class="thru">The book</span>`;
    lens.innerHTML = `${thru}<span class="law">${law.map(escape).join(" ")}</span>`;
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

    const docket = yard.docket || { front: [], fold: [], front_n: 0, fold_n: 0 };
    const front = docket.front || [];
    const fold = docket.fold || [];
    gateLamp.dataset.on = front.length ? "1" : "0";
    gateLamp.title = front.length ? `${front.length} at the front` : "gate clear";
    gateEl.hidden = front.length + fold.length === 0;
    gateFront.hidden = front.length === 0;
    gateFold.hidden = fold.length === 0;
    frontList.innerHTML = front.map((l) => ticket(l, true)).join("");
    foldList.innerHTML = fold.map((l) => ticket(l, true)).join("");

    const progList = $("progList");
    const qaList = $("qaList");
    const closedList = $("closedList");
    if (progList && qaList && closedList) {
      const qa = yard.qa || [];
      const closed = yard.scale || [];
      const archived = yard.scale_archived || 0;
      $("progN").textContent = `${pad.length}/${limit}`;
      $("qaN").textContent = qa.length ? String(qa.length) : "";
      $("closedN").textContent = closed.length
        ? (archived ? `${closed.length} · ${archived} archived` : String(closed.length))
        : (archived ? `${archived} archived` : "");
      const padSlots = [];
      for (let i = 0; i < limit; i++) {
        const load = pad[i];
        padSlots.push(load
          ? ticket(load, true)
          : `<div class="bay-slot" data-open-drop>Open</div>`);
      }
      progList.innerHTML = padSlots.join("");
      qaList.innerHTML = qa.length
        ? qa.map((l) => ticket(l, true)).join("")
        : "<p class='empty'>Nothing waiting to be proven.</p>";
      closedList.innerHTML = closed.length
        ? closed.map((l) => ticket(l, true)).join("")
        : `<p class='empty'>${archived ? archived + " archived. Nothing hot." : "Nothing closed this week."}</p>`;
      const progSum = $("progSum");
      const qaSum = $("qaSum");
      const closedSum = $("closedSum");
      if (progSum) progSum.innerHTML = colSum(pad, "Pad is open.", Math.max(0, limit - pad.length));
      if (qaSum) qaSum.innerHTML = colSum(qa, "Nothing in QA.");
      if (closedSum) {
        closedSum.innerHTML = colSum(closed, archived ? `${archived} archived.` : "Nothing closed this week.");
      }
      const archBtn = $("archiveClosed");
      if (archBtn) {
        archBtn.hidden = closed.length === 0;
        if (!archiveArmed) archBtn.textContent = closed.length ? `Archive ${closed.length}` : "Archive";
      }
      applyDockFold();
    }

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

    const soul = yard.soul || { signed: [], unsigned: [] };
    const creedCard = (c, signed) => `<article class="creed${signed ? " signed" : ""}" data-slug="${escape(c.slug)}">
      <div class="mark">${signed ? "signed" : "unsigned"} · ${escape(c.tier)} · v${c.version}</div>
      <h3>${escape(c.title)}</h3>
      <p>${escape(c.body)}</p>
      ${c.objection ? `<p class="why">${escape(c.objection)}</p>` : ""}
      <div class="acts">
        ${signed ? "" : `<button type="button" class="act primary" data-creed="confirm">I sign this</button>`}
        <button type="button" class="act ghost" data-creed="flag">Not quite</button>
      </div>
    </article>`;
    $("soulUnsigned").innerHTML = (soul.unsigned || []).map((c) => creedCard(c, false)).join("")
      || "<p class='empty'>No unsigned creeds. File one when it is his words.</p>";
    $("soulSigned").innerHTML = (soul.signed || []).map((c) => creedCard(c, true)).join("");

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
    const thru = (((yard.soul || {}).signed) || []).map((c) => c.title).join(" · ");
    $("sheetZone").textContent = [thru ? "through " + thru : "", epicName, load.gate ? "gate" : "", load.zone].filter(Boolean).join(" · ");
    $("sheetTitle").value = load.title;
    $("sheetSaid").value = load.said || "";
    $("sheetDid").value = load.did || "";
    $("sheetBody").value = load.body || "";
    const here = { pull: "pad", qa: "qa", lot: "lot" };
    document.querySelectorAll("#sheet [data-act]").forEach((b) => {
      b.classList.toggle("now", here[b.dataset.act] === load.zone);
    });
    sheetErr.hidden = true;
    sheet.hidden = false;
    $("sheetSaid").focus();
  }

  function hideLoadSheet() {
    sheet.hidden = true;
    openId = null;
  }

  async function drawLog(q) {
    const box = $("logList");
    const nEl = $("logN");
    if (!box) return;
    const qs = q ? `?n=80&q=${encodeURIComponent(q)}` : "?n=80";
    try {
      const data = await api("/api/log" + qs);
      const rows = data.log || [];
      if (nEl) nEl.textContent = String(rows.length);
      box.innerHTML = rows.map((r) =>
        `<li><time>${escape((r.at || "").replace("T", " ").slice(0, 16))}</time>` +
        `<b>${escape(r.kind)}</b> <span>${escape(r.ref || "")}</span>` +
        `<em>${escape(r.detail || "")}</em></li>`
      ).join("") || "<li class='empty'>Nothing in the log.</li>";
    } catch (_) {
      box.innerHTML = "<li class='empty'>Log unread.</li>";
    }
  }

  function fig(label, value) {
    if (value == null) return `<div class="fig unknown"><span>${label}</span><b>unknown</b></div>`;
    const n = Number(value);
    const txt = Number.isFinite(n)
      ? n.toLocaleString(undefined, { style: "currency", currency: "USD" })
      : String(value);
    return `<div class="fig"><span>${label}</span><b>${txt}</b></div>`;
  }

  async function drawMoney() {
    const box = $("moneyFigs");
    if (!box) return;
    try {
      const s = await api("/api/standing");
      const bits = [
        fig("earned (load log)", s.earned_mtd),
        fig("contribution", s.contribution_mtd),
        fig("road this month", s.road_mtd),
        fig("booked this month", s.booked_month),
        fig("debt book", s.debt_balance),
        fig("monthly debt+", s.debt_monthly),
        fig("pasted cash mtd", s.cash_mtd),
        fig("pending holds", s.pending_holds),
      ];
      box.innerHTML = bits.join("");
      const trips = (s.trips && s.trips.trips) || [];
      const list = $("tripsList");
      const tripsN = $("tripsN");
      if (tripsN) tripsN.textContent = s.trips && s.trips.month ? s.trips.month : "";
      if (list) {
        const money = (n) => n == null ? "unknown" : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
        const unpl = s.trips && s.trips.unplaced_road;
        let head = "";
        if (unpl != null && unpl < 0) {
          head = `<p class="why">Trips carry ${money(-unpl)} spent outside this month. Cost follows the trip, not the calendar.</p>`;
        } else if (unpl != null && unpl > 0) {
          head = `<p class="why">Unplaced road ${money(unpl)} — in the month, not on these trips.</p>`;
        }
        list.innerHTML = head + trips.map((t) => {
          const kids = (t.loads || []).map((l) =>
            `<li><b>${escape(l.lane || l.broker)}</b> <span>${money(l.rate)}</span>` +
            (l.road != null ? `<span class="road">${money(l.road)}</span>` : "") +
            ` <em>${escape(l.delivery || "")}</em></li>`
          ).join("");
          return `<article class="trip">
            <header><h3>${escape(t.name || "trip")}</h3>
              <p>${escape(t.start || "")} – ${escape(t.end || "")}</p></header>
            <ul>${kids}</ul>
            <p class="trip-sum">rate ${money(t.revenue)} · road ${money(t.road)} · left ${money(t.left)}</p>
          </article>`;
        }).join("") || "<p class='empty'>No loads delivered this month.</p>";
      }
      const notes = (s.notes || []).concat(
        (s.unknown || []).length ? "Unknown: " + s.unknown.join(", ") : []
      );
      $("moneyNotes").textContent = notes.join(" · ");
      $("docList").innerHTML = (s.docs || []).map((d) => {
        const amt = d.amount == null ? "" : " · " + Number(d.amount).toLocaleString(undefined, { style: "currency", currency: "USD" });
        return `<a href="${apiUrl("/api/standing/doc/" + d.id)}" target="_blank">${escape(d.kind)} · ${escape(d.filename)}${amt}</a>`;
      }).join("");
      await drawPlace();
    } catch (err) {
      box.innerHTML = `<div class="fig unknown"><span>money</span><b>${escape(err.message)}</b></div>`;
    }
  }

  function moneyUSD(n) {
    if (n == null) return "unknown";
    return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function loadOptions(loads, selected) {
    return (loads || []).map((l) =>
      `<option value="${l.sheet_row}"${String(l.sheet_row) === String(selected) ? " selected" : ""}>` +
      `${escape((l.broker || "") + " · " + (l.lane || "") + " · " + moneyUSD(l.rate))}</option>`
    ).join("");
  }

  async function drawPlace() {
    const pile = $("placePile");
    if (!pile) return;
    const err = $("placeErr");
    if (err) err.hidden = true;
    const data = await api("/api/place");
    if (data.error) {
      pile.innerHTML = `<p class="empty">${escape(data.error)}</p>`;
      return;
    }
    if ($("placeN")) $("placeN").textContent = `${data.unplaced_n} in the pile · ${data.placed_n} placed`;
    const loads = data.loads || [];
    pile.innerHTML = (data.txns || []).map((t) => {
      const badge = [
        t.weekly ? "weekly bill" : "",
        (t.status || "").toLowerCase() === "pending" ? "pending" : "",
      ].filter(Boolean).join(" · ");
      const placed = (t.placed || []).map((p) =>
        `<li><b>${moneyUSD(p.amount)}</b> on ${p.sheet_row} · ${escape(p.source)}` +
        `<em>${escape(p.basis || "")}</em></li>`
      ).join("");
      const opts = loadOptions(t.trip_loads && t.trip_loads.length ? t.trip_loads : loads);
      return `<article class="place-row${t.placed.length ? " is-placed" : ""}" data-txn="${t.id}">
        <header>
          <h3>${escape(t.merchant || t.category)}</h3>
          <p><span>${moneyUSD(t.cost)}</span> · ${escape(t.category)} · ${escape(t.date || "")}${badge ? " · " + badge : ""}</p>
        </header>
        ${placed ? `<ul class="placed">${placed}</ul>` : ""}
        <div class="place-row-acts">
          <select data-load>${opts}</select>
          <button type="button" class="act primary" data-place="whole">Place</button>
          <button type="button" class="act" data-place="share">Share</button>
          <button type="button" class="act ghost" data-place="clear">Clear</button>
        </div>
      </article>`;
    }).join("") || "<p class='empty'>No trip-direct spend this month.</p>";
  }

  async function sendDoc(file, kind) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    const data = btoa(bin);
    await api("/api/standing/doc", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name || (kind + ".png"),
        mime: file.type || "application/octet-stream",
        data,
        kind,
        amount: $("shotAmt").value,
        account: $("bankAcct").value,
      }),
    });
    $("shotAmt").value = "";
    await drawMoney();
  }

  function paintTalk(s) {
    const log = $("talkLog");
    const st = $("talkState");
    const mdl = $("talkModel");
    const arm = $("talkArm");
    if (!log) return;
    if (mdl) mdl.textContent = s.model || "";
    const bits = [];
    if (!s.armed) bits.push("Off. History stays.");
    else if (!s.ollama) bits.push("Ollama is dark.");
    else bits.push("Ridge. Engine Liquid 2.6B. Kin is the model we train.");
    if (s.mode === "counsel") bits.push("Counsel on — sit with it. Not a license.");
    bits.push(s.backup ? "Backup disk is here." : "Backup disk is not mounted.");
    if (st) st.textContent = bits.join(" ");
    const modeBtn = $("talkMode");
    if (modeBtn) {
      modeBtn.dataset.on = s.mode === "counsel" ? "1" : "0";
      modeBtn.textContent = s.mode === "counsel" ? "Counsel on" : "Counsel";
    }
    if (arm) {
      arm.textContent = s.armed ? "Off" : "On";
      arm.dataset.on = s.armed ? "1" : "0";
    }
    const msgs = (s.talk && s.talk.messages) || [];
    log.innerHTML = msgs.map((m) =>
      `<li class="${m.role === "user" ? "user" : "assistant"}">` +
      `<span class="who">${m.role === "user" ? "You" : "Ridge"}</span>` +
      `${escape(m.body)}</li>`
    ).join("") || "<li class='empty'>Nothing said yet.</li>";
    log.scrollTop = log.scrollHeight;
  }

  async function drawTalk() {
    const err = $("talkErr");
    if (err) err.hidden = true;
    try {
      paintTalk(await api("/api/talk"));
    } catch (e) {
      if (err) {
        err.hidden = false;
        err.textContent = e.message;
      }
    }
  }

  async function drawCurrent() {
    const box = $("currentText");
    const at = $("currentAt");
    if (!box) return;
    try {
      const c = await api("/api/context");
      box.textContent = c.text || "";
      if (at) at.textContent = (c.generated_at || "").replace("T", " ").slice(0, 16);
    } catch (_) {
      box.textContent = "Current unread.";
    }
  }

  async function refresh() {
    yard = await api("/api/yard");
    render();
    if ($("currentBox") && $("currentBox").open) drawCurrent();
    if ($("logBox") && $("logBox").open) drawLog($("logQ").value.trim());
    drawMoney();
    if (openId) {
      const still = findLoad(openId);
      if (still) {
        const epicName = ((yard.epics || []).find((e) => e.id === still.epic) || {}).title || "";
        const thru = (((yard.soul || {}).signed) || []).map((c) => c.title).join(" · ");
        $("sheetZone").textContent = [thru ? "through " + thru : "", epicName, still.gate ? "gate" : "", still.zone].filter(Boolean).join(" · ");
        const here = { pull: "pad", qa: "qa", lot: "lot" };
        document.querySelectorAll("#sheet [data-act]").forEach((b) => {
          b.classList.toggle("now", here[b.dataset.act] === still.zone);
        });
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

  let justDragged = false;

  padEl.addEventListener("click", (e) => {
    if (justDragged) return;
    const open = e.target.closest("[data-open-drop]");
    if (open) {
      dropIn.focus();
      return;
    }
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  lotEl.addEventListener("click", (e) => {
    if (justDragged) return;
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  frontList.addEventListener("click", (e) => {
    if (justDragged) return;
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  foldList.addEventListener("click", (e) => {
    if (justDragged) return;
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  boardEl.addEventListener("click", (e) => {
    if (justDragged) return;
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  function toggleDockFold() {
    dockFolded = !dockFolded;
    localStorage.setItem("rig_dock", dockFolded ? "fold" : "open");
    applyDockFold();
  }
  $("swimFold").addEventListener("click", toggleDockFold);

  $("archiveClosed").addEventListener("click", async (e) => {
    e.stopPropagation();
    const n = ((yard && yard.scale) || []).length;
    const btn = $("archiveClosed");
    if (!n || !btn) return;
    if (!archiveArmed) {
      archiveArmed = true;
      btn.textContent = `Archive ${n} — tap again`;
      clearTimeout(archiveTimer);
      archiveTimer = setTimeout(() => {
        archiveArmed = false;
        btn.textContent = `Archive ${n}`;
      }, 4000);
      return;
    }
    archiveArmed = false;
    clearTimeout(archiveTimer);
    try {
      await api("/api/loads/archive-closed", { method: "POST", body: "{}" });
      await refresh();
    } catch (err) {
      btn.textContent = err.message;
    }
  });
  $("swim").addEventListener("click", (e) => {
    if (justDragged) return;
    if (e.target.closest("h2")) {
      toggleDockFold();
      return;
    }
    if (e.target.closest("[data-open-drop]")) {
      openGrow("story");
      return;
    }
    const btn = e.target.closest("[data-id]");
    if (btn) openSheet(Number(btn.dataset.id));
  });
  epicNav.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-epic]");
    if (!chip) return;
    focusEpic = chip.dataset.epic || "";
    render();
  });

  let drag = null;

  function colAt(x, y) {
    const cols = [...document.querySelectorAll("#swim .col")];
    if (!cols.length) return "";
    const wrap = $("dockWrap") || $("swim");
    const wr = wrap.getBoundingClientRect();
    if (y < wr.top - 24 || y > wr.bottom + 80) return "";
    const i = Math.max(0, Math.min(cols.length - 1, Math.floor(((x - wr.left) / wr.width) * cols.length)));
    return cols[i].dataset.col;
  }

  function clearDrop() {
    document.querySelectorAll(".col.drop").forEach((c) => c.classList.remove("drop"));
  }

  function refusePad() {
    padEl.classList.remove("refuse");
    void padEl.offsetWidth;
    padEl.classList.add("refuse");
    const swim = $("swim");
    if (swim) {
      swim.classList.remove("refuse");
      void swim.offsetWidth;
      swim.classList.add("refuse");
    }
  }

  async function dropLoad(id, zone) {
    const load = findLoad(id);
    if (!load || load.zone === zone) return;
    try {
      if (zone === "pad") {
        await api(`/api/loads/${id}/pull`, { method: "POST", body: "{}" });
      } else if (zone === "qa") {
        await api(`/api/loads/${id}/qa`, { method: "POST", body: "{}" });
      } else if (zone === "scale") {
        const did = (load.did || "").trim();
        if (!did) {
          openSheet(id);
          sheetErr.hidden = false;
          sheetErr.textContent = "Close needs I did. Write it, then drag onto Closed.";
          $("sheetDid").focus();
          return;
        }
        await api(`/api/loads/${id}/weigh`, {
          method: "POST",
          body: JSON.stringify({ did }),
        });
        hideLoadSheet();
      } else {
        return;
      }
      await refresh();
    } catch (err) {
      if (err.code === 409) {
        refusePad();
        return;
      }
      if (err.code === 403) {
        openSheet(id);
        sheetErr.hidden = false;
        sheetErr.textContent = "Only you close. Drag it onto Closed.";
        return;
      }
      openSheet(id);
      sheetErr.hidden = false;
      sheetErr.textContent = err.message;
    }
  }

  function endDrag(e) {
    if (!drag) return;
    const id = drag.id;
    const lifted = drag.lifted;
    const x = e.type === "pointercancel" && drag.lastX != null ? drag.lastX : e.clientX;
    const y = e.type === "pointercancel" && drag.lastY != null ? drag.lastY : e.clientY;
    const zone = lifted ? colAt(x, y) : "";
    if (drag.ghost) drag.ghost.remove();
    if (drag.el) drag.el.classList.remove("dragging");
    document.body.classList.remove("dragging");
    clearDrop();
    try { drag.el && drag.el.releasePointerCapture(drag.pointer); } catch (_) { /* already up */ }
    drag = null;
    if (lifted) {
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 400);
      if (zone) dropLoad(id, zone);
    }
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest("input, textarea, select, summary, a, .act, .sheet, .connect, .swim-fold")) return;
    const btn = e.target.closest("[data-id]");
    if (!btn || !yard || !btn.closest("#swim, #board, #lot, #pad")) return;
    const load = findLoad(Number(btn.dataset.id));
    if (!load || load.zone === "scale") return;
    drag = {
      id: load.id,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lifted: false,
      el: btn,
      pointer: e.pointerId,
      ghost: null,
    };
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.lifted) {
      if (dx * dx + dy * dy < 25) return;
      drag.lifted = true;
      try { drag.el.setPointerCapture(drag.pointer); } catch (_) { /* some browsers */ }
      drag.el.classList.add("dragging");
      document.body.classList.add("dragging");
      const box = drag.el.getBoundingClientRect();
      const ghost = drag.el.cloneNode(true);
      ghost.classList.add("ticket-ghost");
      ghost.style.width = box.width + "px";
      ghost.style.height = box.height + "px";
      ghost.style.left = e.clientX + "px";
      ghost.style.top = e.clientY + "px";
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    e.preventDefault();
    if (drag.ghost) {
      drag.ghost.style.left = e.clientX + "px";
      drag.ghost.style.top = e.clientY + "px";
    }
    clearDrop();
    const zone = colAt(e.clientX, e.clientY);
    if (zone) {
      const col = document.querySelector(`.col[data-col="${zone}"]`);
      if (col) col.classList.add("drop");
    }
  }, { passive: false });
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

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
      } else if (kind === "qa") {
        await api(`/api/loads/${openId}/qa`, { method: "POST", body: "{}" });
      } else if (kind === "lot") {
        await api(`/api/loads/${openId}/lot`, { method: "POST", body: "{}" });
      } else if (kind === "hand") {
        const load = findLoad(openId);
        await api(`/api/loads/${openId}/hand`, {
          method: "POST",
          body: JSON.stringify({ needs_hand: !(load && load.needs_hand) }),
        });
      }
      await refresh();
    } catch (err) {
      if (err.code === 409) {
        refusePad();
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
    token = $("tokenIn").value.trim();
    origin = onPages ? $("originIn").value.trim().replace(/\/$/, "") : "";
    localStorage.setItem("rig_origin", origin);
    localStorage.setItem("rig_token", token);
    try {
      const join = await fetch(apiUrl("/api/connect"), {
        method: "POST",
        credentials: origin ? "omit" : "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token }),
      });
      if (!join.ok) {
        showConnect("bad token");
        return;
      }
      await refresh();
      connect.hidden = true;
    } catch (err) {
      showConnect(err.message);
    }
  });

  let growMode = "story";
  const growSheet = $("growSheet");
  const growErr = $("growErr");
  function openGrow(mode) {
    growMode = mode;
    growErr.hidden = true;
    $("growName").value = "";
    $("growWhy").value = "";
    $("growEpicRow").hidden = mode !== "story";
    $("growTierRow").hidden = mode !== "creed";
    $("growKick").textContent = mode;
    $("growTitle").textContent = ({
      epic: "New epic",
      story: "New story",
      creed: "File a creed — unsigned until you sign",
    })[mode];
    $("growWhyLab").firstChild.textContent = mode === "epic" ? "Why " : mode === "creed" ? "Body " : "I said ";
    const sel = $("growEpic");
    sel.innerHTML = (yard.epics || []).map((e) =>
      `<option value="${e.id}"${e.id === (focusEpic || "board") ? " selected" : ""}>${escape(e.title)}</option>`
    ).join("");
    growSheet.hidden = false;
    $("growName").focus();
  }
  $("newEpic").addEventListener("click", () => openGrow("epic"));
  $("newStory").addEventListener("click", () => openGrow("story"));
  $("newCreed").addEventListener("click", () => openGrow("creed"));
  growSheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-grow-close]")) growSheet.hidden = true;
  });
  $("growSave").addEventListener("click", async () => {
    growErr.hidden = true;
    const name = $("growName").value.trim();
    const why = $("growWhy").value.trim();
    try {
      if (growMode === "epic") {
        await api("/api/epics", { method: "POST", body: JSON.stringify({ title: name, why }) });
      } else if (growMode === "story") {
        await api("/api/loads", {
          method: "POST",
          body: JSON.stringify({ title: name, said: why || name, epic: $("growEpic").value }),
        });
      } else {
        await api("/api/doctrine", {
          method: "POST",
          body: JSON.stringify({
            title: name,
            body: why,
            slug: name,
            tier: $("growTier").value,
          }),
        });
      }
      growSheet.hidden = true;
      await refresh();
    } catch (err) {
      growErr.hidden = false;
      growErr.textContent = err.message;
    }
  });
  async function sendTalk(text) {
    const box = $("talkIn");
    const err = $("talkErr");
    const send = $("talkSend");
    text = (text || "").trim();
    if (!text) return;
    err.hidden = true;
    send.disabled = true;
    send.textContent = "…";
    const log = $("talkLog");
    if (log && !log.querySelector(".pending")) {
      const li = document.createElement("li");
      li.className = "user pending";
      li.innerHTML = `<span class="who">You</span>${escape(text)}`;
      if (log.querySelector(".empty")) log.innerHTML = "";
      log.appendChild(li);
      const wait = document.createElement("li");
      wait.className = "assistant pending";
      wait.innerHTML = `<span class="who">Ridge</span>Listening…`;
      log.appendChild(wait);
      log.scrollTop = log.scrollHeight;
    }
    try {
      const s = await api("/api/talk", { method: "POST", body: JSON.stringify({ text }) });
      box.value = "";
      paintTalk(s);
      await speakLast(s);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
      try { paintTalk(await api("/api/talk")); } catch (_) { /* still failed */ }
    } finally {
      send.disabled = false;
      send.textContent = "Send";
      box.focus();
    }
  }
  $("talkForm").addEventListener("submit", (e) => {
    e.preventDefault();
    sendTalk($("talkIn").value);
  });
  $("talkIn").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendTalk($("talkIn").value);
    }
  });
  let hearOn = localStorage.getItem("rig_hear") !== "0";
  let partnerAudio = null;
  function applyHear() {
    const b = $("talkHear");
    if (!b) return;
    b.dataset.on = hearOn ? "1" : "0";
    b.textContent = hearOn ? "Voice on" : "Voice";
    if (!hearOn && partnerAudio) {
      partnerAudio.pause();
      partnerAudio = null;
    }
  }
  function afterPartnerSpoke() {
    if (room !== "talk") return;
    startMic();
  }
  async function speakLast(s) {
    if (!hearOn) {
      afterPartnerSpoke();
      return;
    }
    const msgs = (s && s.talk && s.talk.messages) || [];
    const last = [...msgs].reverse().find((m) => m.role === "assistant");
    if (!last || !last.id) {
      afterPartnerSpoke();
      return;
    }
    try {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl(`/api/talk/voice/${last.id}`), {
        credentials: origin ? "omit" : "include",
        headers,
      });
      if (!res.ok) throw new Error("voice unread");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (partnerAudio) partnerAudio.pause();
      partnerAudio = new Audio(url);
      partnerAudio.onended = afterPartnerSpoke;
      partnerAudio.onerror = afterPartnerSpoke;
      await partnerAudio.play();
    } catch (_) {
      afterPartnerSpoke();
    }
  }
  applyHear();
  $("talkMode").addEventListener("click", async () => {
    const on = $("talkMode").dataset.on === "1";
    const err = $("talkErr");
    err.hidden = true;
    try {
      const s = await api("/api/talk/mode", {
        method: "POST",
        body: JSON.stringify({ mode: on ? "ridge" : "counsel" }),
      });
      paintTalk(s);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });
  $("talkExport").addEventListener("click", async () => {
    const err = $("talkErr");
    err.hidden = true;
    try {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl("/api/talk/export?fmt=jsonl"), {
        credentials: origin ? "omit" : "include",
        headers,
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") || "";
      const named = /filename="([^"]+)"/.exec(dispo);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (named && named[1]) || "ridge.jsonl";
      a.click();
      err.hidden = false;
      err.style.color = "var(--ok)";
      err.textContent = "Wrote the pairs on the Pro (data/talk-export) and downloaded a copy.";
    } catch (ex) {
      err.hidden = false;
      err.style.color = "";
      err.textContent = ex.message;
    }
  });
  $("talkHear").addEventListener("click", () => {
    hearOn = !hearOn;
    localStorage.setItem("rig_hear", hearOn ? "1" : "0");
    applyHear();
  });

  let rec = null;
  const FIRST_WAIT = 10000;
  const SILENCE_AFTER = 2500;
  const SPEECH_RMS = 0.045;

  function micRms(analyser, buf) {
    analyser.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      s += v * v;
    }
    return Math.sqrt(s / buf.length);
  }

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
  }

  async function finishMic(reason) {
    const btn = $("talkMic");
    const err = $("talkErr");
    const session = rec;
    rec = null;
    if (!session) return;
    if (session.raf) cancelAnimationFrame(session.raf);
    if (session.ctx) {
      try { session.ctx.close(); } catch (_) { /* already */ }
    }
    const chunks = session.chunks || [];
    const mime = session.mime || "audio/webm";
    await new Promise((resolve) => {
      if (!session.mr || session.mr.state === "inactive") {
        resolve();
        return;
      }
      session.mr.onstop = resolve;
      try { session.mr.stop(); } catch (_) { resolve(); }
    });
    stopTracks(session.stream);
    btn.classList.remove("hot");
    if (reason === "cancel") {
      btn.textContent = "Speak";
      return;
    }
    if (reason === "quiet" || !chunks.length) {
      btn.textContent = "Speak";
      err.hidden = false;
      err.textContent = "Heard nothing in 10 seconds.";
      return;
    }
    err.hidden = true;
    btn.textContent = "…";
    const blob = new Blob(chunks, { type: mime });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    try {
      const heard = await api("/api/talk/hear", {
        method: "POST",
        body: JSON.stringify({ data: btoa(bin), mime: blob.type }),
      });
      const text = (heard && heard.text) || "";
      if (!text) throw new Error("nothing in that take");
      $("talkIn").value = text;
      await sendTalk(text);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    } finally {
      btn.textContent = "Speak";
    }
  }

  function watchMic(session) {
    const started = performance.now();
    let heardAt = 0;
    let quietSince = 0;
    const loop = (now) => {
      if (rec !== session) return;
      const level = micRms(session.analyser, session.buf);
      const speaking = level >= SPEECH_RMS;
      if (!heardAt) {
        if (speaking) {
          heardAt = now;
          quietSince = 0;
          $("talkMic").textContent = "Hearing";
        } else if (now - started >= FIRST_WAIT) {
          finishMic("quiet");
          return;
        }
      } else if (speaking) {
        quietSince = 0;
      } else {
        if (!quietSince) quietSince = now;
        if (now - quietSince >= SILENCE_AFTER) {
          finishMic("said");
          return;
        }
      }
      session.raf = requestAnimationFrame(loop);
    };
    session.raf = requestAnimationFrame(loop);
  }

  async function startMic() {
    const err = $("talkErr");
    if (rec || room !== "talk") return;
    err.hidden = true;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      err.hidden = false;
      err.textContent = "This browser will not take a voice.";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const session = {
        stream, mr, ctx, analyser,
        buf: new Uint8Array(analyser.fftSize),
        chunks: [],
        mime: mr.mimeType || mime || "audio/webm",
        raf: 0,
      };
      mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) session.chunks.push(ev.data); };
      rec = session;
      mr.start(200);
      $("talkMic").classList.add("hot");
      $("talkMic").textContent = "Listening";
      watchMic(session);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message || "mic refused";
    }
  }
  $("talkMic").addEventListener("click", () => {
    if (rec) {
      finishMic("cancel");
      return;
    }
    startMic();
  });

  $("talkArm").addEventListener("click", async () => {
    const on = $("talkArm").dataset.on === "1";
    const err = $("talkErr");
    err.hidden = true;
    try {
      const s = await api(on ? "/api/talk/kill" : "/api/talk/arm", { method: "POST", body: "{}" });
      paintTalk(s);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });
  $("soulSec").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-creed]");
    if (!btn) return;
    const card = btn.closest("[data-slug]");
    if (!card) return;
    const slug = card.dataset.slug;
    try {
      if (btn.dataset.creed === "confirm") {
        await api(`/api/doctrine/${slug}/confirm`, { method: "POST", body: "{}" });
      } else {
        const objection = window.prompt("What's not quite right?") || "";
        await api(`/api/doctrine/${slug}/flag`, {
          method: "POST",
          body: JSON.stringify({ objection }),
        });
      }
      await refresh();
    } catch (err) {
      alert(err.message);
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
          good: $("enGood").value,
        }),
      });
      $("enNarrative").value = "";
      $("enFindings").value = "";
      $("enDecisions").value = "";
      $("enNext").value = "";
      $("enGood").value = "";
      closeSheet.hidden = true;
      await refresh();
    } catch (err) {
      enErr.hidden = false;
      enErr.textContent = err.message;
    }
  });

  async function placeAct(fn) {
    const err = $("placeErr");
    if (err) err.hidden = true;
    try {
      await fn();
      await drawMoney();
    } catch (e) {
      if (err) {
        err.hidden = false;
        err.textContent = e.message;
      }
    }
  }
  $("placePile").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-place]");
    if (!btn) return;
    const row = btn.closest("[data-txn]");
    const txn = Number(row && row.dataset.txn);
    const sel = row && row.querySelector("[data-load]");
    const act = btn.dataset.place;
    if (act === "whole") {
      placeAct(() => api("/api/place", {
        method: "POST",
        body: JSON.stringify({ txn_id: txn, sheet_row: Number(sel.value) }),
      }));
    } else if (act === "share") {
      placeAct(() => api("/api/place/share", {
        method: "POST",
        body: JSON.stringify({ txn_id: txn }),
      }));
    } else if (act === "clear") {
      placeAct(() => api("/api/place/clear", {
        method: "POST",
        body: JSON.stringify({ txn_id: txn }),
      }));
    }
  });
  $("placeStab").addEventListener("click", () => placeAct(async () => {
    const p = await api("/api/place/stab");
    const box = $("placePreview");
    box.hidden = false;
    box.innerHTML = `<p class="why">${escape(p.note || "")} ${p.txns || 0} txns · ${p.split_txns || 0} splits · ${moneyUSD(p.total)}</p>` +
      (p.placements || []).slice(0, 12).map((r) =>
        `<p>${escape(r.date || "")} ${escape(r.merchant || "")} ${moneyUSD(r.amount)} → ${r.sheet_row} ${escape(r.broker || "")}<em> ${escape(r.basis || "")}</em></p>`
      ).join("") +
      ((p.placements || []).length > 12 ? `<p class="empty">…${p.placements.length - 12} more</p>` : "");
  }));
  $("placeApply").addEventListener("click", () => placeAct(async () => {
    await api("/api/place/apply", { method: "POST", body: "{}" });
    $("placePreview").hidden = true;
  }));
  $("placeClearAuto").addEventListener("click", () => placeAct(async () => {
    await api("/api/place/clear-auto", { method: "POST", body: "{}" });
    $("placePreview").hidden = true;
  }));

  $("moneyPaste").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("bankText").value;
    if (!text.trim()) return;
    try {
      const out = await api("/api/standing/paste", {
        method: "POST",
        body: JSON.stringify({ text, account: $("bankAcct").value }),
      });
      $("bankText").value = "";
      $("moneyNotes").textContent = `Filed ${out.added} · skipped ${out.skip_n}`;
      await drawMoney();
    } catch (err) {
      $("moneyNotes").textContent = err.message;
    }
  });
  $("docFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) await sendDoc(f, "doc");
    e.target.value = "";
  });
  $("shotWell").addEventListener("paste", async (e) => {
    const item = [...(e.clipboardData && e.clipboardData.items) || []].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const f = item.getAsFile();
    if (f) await sendDoc(f, "shot");
  });
  $("currentBox").addEventListener("toggle", () => {
    if ($("currentBox").open) drawCurrent();
  });
  $("logBox").addEventListener("toggle", () => {
    if ($("logBox").open) drawLog($("logQ").value.trim());
  });
  $("logFind").addEventListener("submit", (e) => {
    e.preventDefault();
    drawLog($("logQ").value.trim());
  });

  const ver = $("ver");
  function askVersion() {
    navigator.serviceWorker.ready
      .then((r) => r.active && r.active.postMessage({ type: "VERSION" }))
      .catch(() => {});
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "VERSION" && ver) {
        ver.textContent = String(e.data.version || "").replace("rig-shell-", "") || "v?";
      }
    });
    askVersion();
    setTimeout(askVersion, 2500);
    setTimeout(() => { if (ver && /^v1$/.test(ver.textContent)) {/* still the html default */} }, 4000);
    navigator.serviceWorker.addEventListener("controllerchange", () => setTimeout(askVersion, 300));
    ver.addEventListener("click", async () => {
      ver.className = "ver checking";
      ver.textContent = "pulling";
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) {
          navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
          await r.update();
          if (r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
          setTimeout(() => location.reload(), 3000);
          return;
        }
      } catch (_) { /* reload anyway */ }
      location.reload();
    });
  } else if (ver) {
    ver.textContent = "fresh";
  }

  (async () => {
    applyDockFold();
    origin = localStorage.getItem("rig_origin") || (onPages ? DEFAULT_ORIGIN : "");
    token = localStorage.getItem("rig_token") || "";
    if (onPages && (!origin || !token)) {
      showConnect();
      return;
    }
    try {
      await refresh();
      showRoom((location.hash || "#yard").replace("#", "") || "yard");
    } catch (err) {
      if (err.code !== 401) showConnect(err.message || "could not reach the book");
    }
  })();
})();
