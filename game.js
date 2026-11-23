/* Stick Wars: Duel — browser client. Multiplayer requires the companion server in /server. */
(() => {
  const $ = (id) => document.getElementById(id);
  const lobby = $("lobby"), waiting = $("waiting"), gamePanel = $("gamePanel");
  const status = $("status");
  let socket = null, roomCode = "", player = 1, game = null, sceneRef = null;
  let multiplayer = false, snapshotTimer = null;
  const state = { gold: 150, units: [], enemyUnits: [], enemyGold: 150, baseHp: 100, enemyBaseHp: 100, lastIncome: 0, ended: false };

  function show(section) {
    [lobby, waiting, gamePanel].forEach(el => el.classList.add("hidden"));
    section.classList.remove("hidden");
  }
  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? "#ff8b83" : "";
  }
  function getServerUrl() {
    return $("serverUrl").value.trim().replace(/\/$/, "");
  }
  function connectServer() {
    const url = getServerUrl();
    if (!url) throw new Error("اكتب رابط السيرفر أولاً. سنضيف السيرفر في خطوة النشر التالية.");
    if (!window.io) throw new Error("تعذّر تحميل مكتبة الاتصال. حدّث الصفحة.");
    return new Promise((resolve, reject) => {
      const s = io(url, { transports: ["websocket", "polling"], timeout: 8000 });
      const timer = setTimeout(() => { s.disconnect(); reject(new Error("السيرفر لم يرد. تأكد من رابط السيرفر وأنه يعمل.")); }, 8500);
      s.once("connect", () => { clearTimeout(timer); socket = s; resolve(s); });
      s.once("connect_error", () => { clearTimeout(timer); s.disconnect(); reject(new Error("فشل الاتصال بالسيرفر. راجع الرابط وحاول مرة أخرى.")); });
    });
  }
  function bindRoomEvents(s) {
    s.on("room:error", ({ message }) => setStatus(message || "حدث خطأ في الغرفة.", true));
    s.on("room:joined", (data) => {
      roomCode = data.code; player = data.player;
      $("gameCode").textContent = roomCode;
      $("matchTitle").textContent = "أنت اللاعب " + player;
      show(gamePanel); startGame();
    });
    s.on("room:player-joined", () => {
      $("waitingText").textContent = "انضم صديقك! جارٍ تجهيز المعركة…";
    });
    s.on("room:start", (data) => {
      roomCode = data.code; player = data.player || player;
      $("gameCode").textContent = roomCode;
      show(gamePanel); startGame();
    });
    s.on("game:action", (data) => {
      if (!sceneRef || data.player === player) return;
      sceneRef.applyRemoteAction(data);
    });
    s.on("game:snapshot", (data) => {
      if (!sceneRef || data.player === player) return;
      sceneRef.applyRemoteSnapshot(data);
    });
    s.on("room:opponent-left", () => { $("gameMessage").textContent = "غادر الخصم الغرفة."; });
  }

  $("createBtn").addEventListener("click", async () => {
    setStatus("جاري الاتصال بالسيرفر…");
    try {
      const s = await connectServer(); bindRoomEvents(s);
      s.emit("room:create", (result) => {
        if (!result || !result.ok) { setStatus(result?.message || "تعذر إنشاء الغرفة.", true); return; }
        roomCode = result.code; player = 1;
        $("codeDisplay").textContent = roomCode;
        $("waitingText").textContent = "أرسل الكود لصديقك. الغرفة تسمح بلاعبين فقط.";
        show(waiting);
      });
    } catch (e) { setStatus(e.message, true); }
  });

  $("joinBtn").addEventListener("click", async () => {
    const code = $("roomCode").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setStatus("اكتب كودًا صحيحًا من 6 أحرف أو أرقام.", true); return; }
    setStatus("جاري الاتصال بالغرفة…");
    try {
      const s = await connectServer(); bindRoomEvents(s);
      s.emit("room:join", { code }, (result) => {
        if (!result || !result.ok) { setStatus(result?.message || "تعذر دخول الغرفة.", true); return; }
        roomCode = result.code; player = 2; multiplayer = true;
        $("gameCode").textContent = roomCode; $("matchTitle").textContent = "أنت اللاعب 2";
        show(gamePanel); startGame();
        s.emit("room:ready", { code });
      });
    } catch (e) { setStatus(e.message, true); }
  });

  $("cancelBtn").addEventListener("click", () => {
    if (socket) socket.disconnect();
    socket = null; show(lobby); setStatus("تم الرجوع للقائمة.");
  });

  function startGame() {
    if (game) { game.destroy(true); game = null; }
    state.gold = 150; state.units = []; state.enemyUnits = []; state.enemyGold = 150;
    state.baseHp = 100; state.enemyBaseHp = 100; state.lastIncome = Date.now(); state.ended = false;
    if (!window.Phaser) { $("game").textContent = "تعذر تحميل محرك اللعبة. تحقق من الإنترنت ثم حدّث الصفحة."; return; }
    const config = {
      type: Phaser.AUTO, parent: "game", width: 900, height: 340, backgroundColor: "#9dcbd1",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: { create, update }
    };
    game = new Phaser.Game(config);
    function create() {
      sceneRef = this;
      const g = this.add.graphics();
      g.fillStyle(0x91b96e).fillRect(0, 250, 900, 90);
      g.fillStyle(0x7a9d5b).fillRect(0, 250, 900, 12);
      g.fillStyle(0xd9c18b).fillRect(0, 262, 900, 78);
      g.fillStyle(0x647b89).fillRect(25, 165, 48, 85);
      g.fillStyle(0x647b89).fillRect(827, 165, 48, 85);
      g.fillStyle(0xf2bd51).fillRect(30, 125, 38, 40);
      g.fillStyle(0x263b53).fillRect(832, 125, 38, 40);
      this.add.text(18, 20, "YOUR CASTLE", { fontFamily: "Arial", fontSize: "13px", color: "#25364a", fontStyle: "bold" });
      this.add.text(765, 20, "ENEMY CASTLE", { fontFamily: "Arial", fontSize: "13px", color: "#25364a", fontStyle: "bold" });
      this.add.text(350, 285, "GOLD MINE  ◆", { fontFamily: "Arial", fontSize: "14px", color: "#6b532c", fontStyle: "bold" });
      this.mine = this.add.circle(450, 250, 12, 0xe9b34b).setStrokeStyle(3, 0x9a702f);
      this.unitsLayer = this.add.container(0, 0);
      this.enemyLayer = this.add.container(0, 0);
      this.hud = this.add.text(450, 45, "", { fontFamily: "Arial", fontSize: "16px", color: "#26384a", fontStyle: "bold" }).setOrigin(.5);
      this.drawAll();
      this.applyRemoteAction = (data) => {
        if (data.type === "train") {
          const arr = state.enemyUnits;
          arr.push({ type: data.unit, x: player === 1 ? 820 : 80, hp: 100, remote: true });
          this.drawAll();
        }
      };
      this.applyRemoteSnapshot = (data) => {
        if (Array.isArray(data.units)) { state.enemyUnits = data.units; this.drawAll(); }
        if (typeof data.baseHp === "number") state.enemyBaseHp = data.baseHp;
      };
      this.drawAll = () => {
        this.unitsLayer.removeAll(true); this.enemyLayer.removeAll(true);
        state.units.forEach(u => this.drawUnit(this.unitsLayer, u, false));
        state.enemyUnits.forEach(u => this.drawUnit(this.enemyLayer, u, true));
        this.hud.setText("قاعدة فريقك: " + state.baseHp + "%     |     قاعدة الخصم: " + state.enemyBaseHp + "%");
      };
      this.drawUnit = (layer, unit, enemy) => {
        const color = enemy ? 0x253b5a : 0xf0b43e;
        const x = unit.x, y = 246;
        const head = this.add.circle(x, y - 28, 7, color);
        const body = this.add.rectangle(x, y - 13, 4, 22, color);
        const legs = this.add.graphics(); legs.lineStyle(4, color); legs.lineBetween(x, y - 3, x - 7, y + 6); legs.lineBetween(x, y - 3, x + 7, y + 6);
        const arms = this.add.graphics(); arms.lineStyle(3, color); arms.lineBetween(x, y - 18, x - 9, y - 9); arms.lineBetween(x, y - 18, x + 9, y - 9);
        layer.add([head, body, legs, arms]);
      };
      this.time.addEvent({ delay: 1000, loop: true, callback: () => {
        if (state.ended) return;
        state.gold += 8 + state.units.filter(u => u.type === "worker").length * 4;
        state.units.forEach(u => { if (u.type !== "worker") u.x = Math.min(820, u.x + (u.type === "sword" ? 5 : 2)); });
        state.enemyUnits.forEach(u => { if (u.type !== "worker") u.x = Math.max(80, u.x - 3); });
        const attackers = state.units.filter(u => u.type !== "worker" && u.x >= 810).length;
        const defenders = state.enemyUnits.filter(u => u.type !== "worker" && u.x <= 90).length;
        state.enemyBaseHp = Math.max(0, state.enemyBaseHp - attackers);
        state.baseHp = Math.max(0, state.baseHp - defenders);
        if (state.enemyBaseHp <= 0 || state.baseHp <= 0) {
          state.ended = true;
          $("gameMessage").textContent = state.enemyBaseHp <= 0 ? "🏆 انتصرت!" : "💀 خسرت المعركة!";
        }
        this.drawAll(); updateHud();
        if (multiplayer && socket && player === 1) socket.emit("game:snapshot", { code: roomCode, units: state.units, baseHp: state.baseHp });
      }});
    }
    function update() {}
  }

  function updateHud() {
    $("gold").textContent = "🪙 " + state.gold;
    $("army").textContent = "الجيش: " + state.units.length;
  }
  document.querySelectorAll(".unit-btn").forEach(button => button.addEventListener("click", () => {
    const unit = button.dataset.unit;
    const costs = { worker: 50, sword: 100, archer: 150 };
    if (state.ended) return;
    if (state.gold < costs[unit]) { $("gameMessage").textContent = "الذهب غير كافٍ!"; return; }
    state.gold -= costs[unit];
    const x = player === 1 ? 90 : 810;
    state.units.push({ type: unit, x, hp: 100 });
    if (sceneRef) sceneRef.drawAll();
    updateHud();
    $("gameMessage").textContent = "تم تدريب " + (unit === "worker" ? "عامل" : unit === "sword" ? "سياف" : "رامٍ") + " جديد!";
    if (socket && multiplayer) socket.emit("game:action", { code: roomCode, type: "train", unit, player });
  }));

  // Host room waits for the second player; server will notify both clients.
  if (window.io) {
    // Keep the UI deliberately simple: server URL is entered once per device.
  }
})();