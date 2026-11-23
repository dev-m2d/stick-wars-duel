/* Stick Wars: Duel — Firebase Realtime Database multiplayer, no custom server. */
(() => {
  const $ = id => document.getElementById(id);
  const lobby=$("lobby"), waiting=$("waiting"), gamePanel=$("gamePanel"), status=$("status");
  const firebaseConfig={
    apiKey:"AIzaSyBDfE-THsGe8s7e-5Guq2vFrC9fHIKrVuw",
    authDomain:"stick-wars-duel.firebaseapp.com",
    databaseURL:"https://stick-wars-duel-default-rtdb.firebaseio.com",
    projectId:"stick-wars-duel",
    storageBucket:"stick-wars-duel.firebasestorage.app",
    messagingSenderId:"1087007888495",
    appId:"1:1087007888495:web:344ea8e25bc49e01c5e99a"
  };
  let db, user=null, roomRef=null, roomCode="", player=0, game=null, scene=null, roomListener=null, hostTimer=null, latest=null;
  const costs={worker:50,sword:100,archer:150,wizard:250,giant:400};
  const labels={worker:"عامل",sword:"سياف",archer:"رامٍ",wizard:"ساحر",giant:"عملاق"};
  const show=el=>{[lobby,waiting,gamePanel].forEach(x=>x.classList.add("hidden"));el.classList.remove("hidden");};
  function enterBattleView(requestNative=false){
    gamePanel.classList.add("is-fullscreen");
    document.body.classList.add("battle-open");
    if(requestNative && document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen().catch(()=>{});
    }
  }
  function leaveBattleView(){
    gamePanel.classList.remove("is-fullscreen");
    document.body.classList.remove("battle-open");
    if(document.fullscreenElement && document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  }
  const say=(msg,error=false)=>{status.textContent=msg;status.style.color=error?"#ff8b83":"";};
  const initialGame=()=>({
    started:false, ended:false, winner:0, baseHp:{1:100,2:100},
    players:{
      1:{gold:150,units:[]},
      2:{gold:150,units:[]}
    }, tick:0
  });
  function makeCode(){return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"X");}
  function stopListeners(){
    if(roomRef && roomListener) roomRef.off("value",roomListener);
    roomListener=null;
    if(hostTimer){clearInterval(hostTimer);hostTimer=null;}
  }
  async function ensureFirebase(){
    if(!window.firebase) throw new Error("تعذر تحميل Firebase. تأكد من اتصال الإنترنت ثم حدّث الصفحة.");
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db=firebase.database();
    if(!user){const cred=await firebase.auth().signInAnonymously();user=cred.user;}
    return user;
  }
  function watchRoom(){
    stopListeners();
    roomListener=snap=>{
      if(!snap.exists()){say("الغرفة لم تعد موجودة.",true);show(lobby);return;}
      latest=snap.val();
      const guestJoined=!!latest.guest;
      $("playerStatus").textContent=guestJoined
        ? "🟢 اللاعب الثاني دخل الغرفة"
        : "🟡 اللاعب الثاني لم يدخل بعد";
      $("startBtn").disabled=player!==1 || !guestJoined || latest.status!=="waiting";
      $("startBtn").classList.toggle("is-disabled", $("startBtn").disabled);
      if(latest.status==="started" && gamePanel.classList.contains("hidden")){
        $("gameCode").textContent=roomCode;
        $("matchTitle").textContent="أنت اللاعب "+player;
        show(gamePanel);enterBattleView(false);startGame();
        if(player===1) startHostLoop();
      }else if(latest.status==="waiting"){
        $("codeDisplay").textContent=roomCode;
        $("waitingText").textContent=player===2
          ? "تم دخول الغرفة. انتظر صاحب الغرفة ليضغط «ابدأ الجيم»."
          : guestJoined
            ? "صاحبك دخل! اضغط «ابدأ الجيم» عندما تكون جاهزًا."
            : "أرسل الكود لصديقك وانتظر انضمامه.";
        $("startBtn").classList.toggle("hidden",player!==1);
        show(waiting);
      }else if(latest.status==="finished"){
        $("waitingText").textContent="انتهت الغرفة.";
      }
      if(latest.game && gamePanel.classList.contains("hidden")===false) renderGame(latest.game);
    };
    roomRef.on("value",roomListener,err=>say("خطأ في قراءة الغرفة: "+err.message,true));
  }
  $("createBtn").addEventListener("click",async()=>{
    say("جاري إنشاء غرفة آمنة…");
    try{
      await ensureFirebase();
      let made=false;
      for(let i=0;i<8&&!made;i++){
        roomCode=makeCode();roomRef=db.ref("rooms/"+roomCode);
        const result=await roomRef.transaction(current=>{
          if(current!==null)return;
          return {host:user.uid,guest:null,status:"waiting",createdAt:firebase.database.ServerValue.TIMESTAMP,game:initialGame()};
        },undefined,false);
        made=result.committed;
      }
      if(!made)throw new Error("تعذر إنشاء كود غرفة. حاول مرة أخرى.");
      player=1;watchRoom();
    }catch(e){say(e.message||"حدث خطأ أثناء إنشاء الغرفة.",true);}
  });
  $("joinBtn").addEventListener("click",async()=>{
    const code=$("roomCode").value.trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(code)){say("اكتب كودًا صحيحًا من 6 أحرف أو أرقام.",true);return;}
    say("جاري البحث عن الغرفة…");
    try{
      await ensureFirebase();roomCode=code;roomRef=db.ref("rooms/"+roomCode);
      const claim=await roomRef.child("guest").transaction(current=>current===null?user.uid:undefined,undefined,false);
      if(!claim.committed)throw new Error("الغرفة غير موجودة أو اكتمل عدد اللاعبين.");
      player=2;
      watchRoom();
    }catch(e){
      const message=e.message||"تعذر دخول الغرفة. راجع الكود وحاول.";
      say(message,true);
      if(roomRef && player===2){
        $("waitingText").textContent="خطأ أثناء بدء المباراة: "+message;
        show(waiting);
      }
    }
  });
  $("startBtn").addEventListener("click",async()=>{
    if(player!==1 || !roomRef || !latest?.guest || latest.status!=="waiting")return;
    enterBattleView(true);
    $("startBtn").disabled=true;
    $("startBtn").textContent="جاري بدء المباراة…";
    try{
      const result=await roomRef.transaction(room=>{
        if(!room || room.host!==user.uid || !room.guest || room.status!=="waiting")return;
        room.status="started";
        room.game=room.game||initialGame();
        room.game.started=true;
        return room;
      },undefined,false);
      if(!result.committed)throw new Error("تعذر بدء المباراة. تأكد أن اللاعب الثاني ما زال متصلًا.");
    }catch(e){
      $("waitingText").textContent=e.message||"حدث خطأ أثناء بدء المباراة.";
      $("startBtn").disabled=false;
      $("startBtn").textContent="ابدأ الجيم";
    }
  });
  $("cancelBtn").addEventListener("click",async()=>{
    stopListeners();
    if(roomRef && player===1){
      try{await roomRef.update({status:"closed"});}catch(_){}
    }
    roomRef=null;roomCode="";player=0;latest=null;
    if(game){game.destroy(true);game=null;scene=null;}
    leaveBattleView();show(lobby);say("رجعت للقائمة الرئيسية.");
  });
  function startGame(){
    if(game){game.destroy(true);game=null;scene=null;}
    const holder=$("game");
    holder.innerHTML="";
    if(!window.Phaser){holder.textContent="تعذر تحميل محرك اللعبة. تأكد من الإنترنت ثم حدّث الصفحة.";return;}
    try{
      const config={
        type:Phaser.CANVAS,parent:"game",width:960,height:540,
        backgroundColor:"#91cbd7",
        scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
        render:{antialias:true,pixelArt:false},
        scene:{create}
      };
      game=new Phaser.Game(config);
      game.events.once("ready",()=>{if(latest?.game)renderGame(latest.game);});
    }catch(e){
      holder.textContent="تعذر تشغيل ساحة المعركة: "+(e.message||e);
      console.error("Phaser start error",e);
    }
  }
  function drawCastle(g,x,color,flip=false){
    g.fillStyle(color,1);
    g.fillRect(x-48,300,96,112);
    g.fillRect(x-58,280,30,132);g.fillRect(x+28,280,30,132);
    g.fillRect(x-64,270,42,18);g.fillRect(x+22,270,42,18);
    g.fillRect(x-12,330,24,82);
    g.fillStyle(0xe8d7a9,1);g.fillRect(x-5,350,10,62);
    g.fillStyle(0x29394b,1);g.fillRect(x-42,320,15,24);g.fillRect(x+27,320,15,24);
    g.fillStyle(flip?0x263b53:0xf2bd51,1);
    g.fillTriangle(x,215,x-28,268,x+28,268);
    g.fillRect(x-4,265,8,38);
  }
  function create(){
    scene=this;
    const g=this.add.graphics();
    // Bright sky, distant hills and a clear battlefield floor.
    g.fillGradientStyle(0x75c9e4,0x75c9e4,0xc7e9e9,0xc7e9e9,1);
    g.fillRect(0,0,960,540);
    g.fillStyle(0xffe39a,1);g.fillCircle(480,112,48);
    g.fillStyle(0xffffff,.58);
    [[170,105,35],[205,100,28],[235,108,22],[720,130,30],[752,122,24],[780,132,20]].forEach(v=>g.fillCircle(v[0],v[1],v[2]));
    g.fillStyle(0x78a9a0,1);
    g.fillTriangle(0,330,170,145,350,330);g.fillTriangle(250,330,485,165,710,330);g.fillTriangle(610,330,805,150,960,330);
    g.fillStyle(0x6c9c67,1);g.fillRect(0,390,960,150);
    g.fillStyle(0xdec58f,1);g.fillRect(0,418,960,122);
    g.fillStyle(0xc8ad76,1);g.fillRect(0,444,960,8);
    g.fillStyle(0x5c8755,1);g.fillRect(0,390,960,13);
    drawCastle(g,65,0x667f91,false);drawCastle(g,895,0x53677e,true);
    // Decorative guardian statues beside both castles.
    [125,835].forEach((x,i)=>{
      const col=i===0?0xf2bd51:0x263b53;
      g.fillStyle(0x9a8969,1);g.fillRect(x-15,350,30,52);
      g.fillStyle(col,1);g.fillCircle(x,333,12);g.fillRect(x-8,344,16,30);
      g.fillRect(x-22,354,8,24);g.fillRect(x+14,354,8,24);
      g.fillStyle(0x6b5b43,1);g.fillRect(x-22,400,44,9);
    });
    this.add.text(22,24,"قلعتك",{fontFamily:"Cairo, Arial",fontSize:"20px",color:"#20354a",fontStyle:"bold"});
    this.add.text(830,24,"قلعة الخصم",{fontFamily:"Cairo, Arial",fontSize:"20px",color:"#20354a",fontStyle:"bold"});
    this.add.text(480,465,"منجم الذهب",{fontFamily:"Cairo, Arial",fontSize:"18px",color:"#72562b",fontStyle:"bold"}).setOrigin(.5);
    this.add.circle(480,420,15,0xf1bd4d).setStrokeStyle(4,0x9a702f);
    this.unitsLayer=this.add.container(0,0);
    this.hud=this.add.text(480,66,"",{fontFamily:"Cairo, Arial",fontSize:"19px",color:"#20354a",fontStyle:"bold",backgroundColor:"#ffffff99",padding:{x:12,y:7}}).setOrigin(.5);
    if(latest?.game)renderGame(latest.game);
  }
  function renderGame(gs){
    if(!gs)return;
    latest.game=gs;
    if(scene && scene.unitsLayer){
      scene.unitsLayer.removeAll(true);
      [1,2].forEach(side=>(gs.players?.[side]?.units||[]).forEach(u=>{
        const x=Number.isFinite(u.x)?u.x:(side===1?150:810),y=390;
        const color=side===1?0xf0a92f:0x263b53;
        const group=scene.add.container(x,y);
        if(u.type==="giant")group.setScale(1.8);
        const shadow=scene.add.ellipse(0,2,30,9,0x243b35,.28);
        const legs=scene.add.graphics();legs.lineStyle(6,color,1);legs.lineBetween(-4,-8,-11,2);legs.lineBetween(4,-8,11,2);
        const body=scene.add.rectangle(0,-22,13,28,color).setStrokeStyle(2,0xffffff,.7);
        const head=scene.add.circle(0,-43,10,0xf1d1a4).setStrokeStyle(2,color);
        const arms=scene.add.graphics();arms.lineStyle(5,color,1);arms.lineBetween(-4,-29,-17,-19);arms.lineBetween(4,-29,17,-20);
        group.add([shadow,legs,body,head,arms]);
        if(u.type==="sword"||u.type==="giant"){
          const sword=scene.add.rectangle(20,-27,u.type==="giant"?7:4,u.type==="giant"?38:24,0xe7edf4).setAngle(25);group.add(sword);
        }else if(u.type==="archer"){
          const bow=scene.add.arc(18,-27,10,-85,85,false,0x754b2b).setStrokeStyle(3,0x754b2b);group.add(bow);
        }else if(u.type==="wizard"){
          group.add(scene.add.triangle(0,-16,0,-4,-17,12,17,0x6e55a5));
          group.add(scene.add.rectangle(19,-30,4,39,0x8a653b).setAngle(8));
          group.add(scene.add.circle(20,-51,6,0x7be7ff));
        }else{
          const tool=scene.add.rectangle(18,-28,4,25,0x8a653b).setAngle(25);group.add(tool);
        }
        const hpPct=Math.max(0,(u.hp??100)/(u.maxHp??100));
        group.add(scene.add.rectangle(0,-62,26,4,0x3a2830));
        group.add(scene.add.rectangle(-13+13*hpPct,-62,26*hpPct,4,0x5be08a).setOrigin(0,0.5));
        scene.unitsLayer.add(group);
      }));
      const hp1=gs.baseHp?.[player]??100,hp2=gs.baseHp?.[player===1?2:1]??100;
      scene.hud.setText("تمثالك: "+hp1+"%     ⚔     تمثال الخصم: "+hp2+"%");
    }
    const mine=gs.players?.[player]||{gold:0,units:[]};
    $("gold").textContent="🪙 "+mine.gold;$("army").textContent="الجيش: "+mine.units.length;
    if(gs.ended)$("gameMessage").textContent=gs.winner===player?"🏆 انتصرت!":"💀 خسرت المعركة!";
    else $("gameMessage").textContent="درّب جنودك واهجم على تمثال الخصم!";
  }
  $("fullscreenBtn").addEventListener("click",()=>{
    if(!document.fullscreenElement && document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen().catch(()=>{});
    }else if(document.fullscreenElement && document.exitFullscreen){
      document.exitFullscreen().catch(()=>{});
    }
  });
  async function train(type){
    if(!roomRef||!latest||latest.status!=="started"||!costs[type])return;
    try{
      const playerRef=roomRef.child("game/players/"+player);
      const result=await playerRef.transaction(p=>{
        if(!p||p.gold<costs[type]||latest?.game?.ended)return;
        p.gold-=costs[type];
        p.units=p.units||[];
        p.units.push({type,x:player===1?145:815,hp:type==="giant"?260:100,maxHp:type==="giant"?260:100,cooldown:0,id:user.uid+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,5)});
        return p;
      },undefined,false);
      if(!result.committed)$("gameMessage").textContent="الذهب غير كافٍ أو انتهت المباراة.";
    }catch(e){$("gameMessage").textContent="تعذر تدريب الوحدة: "+(e.code||e.message||"تحقق من الاتصال");}
  }
  document.querySelectorAll(".unit-btn").forEach(b=>b.addEventListener("click",()=>train(b.dataset.unit)));
  function startHostLoop(){
    if(hostTimer)return;
    hostTimer=setInterval(async()=>{
      if(!roomRef||player!==1)return;
      try{
        await roomRef.transaction(room=>{
          if(!room||room.status!=="started"||room.game.ended)return;
          const gs=room.game;gs.tick=(gs.tick||0)+1;
          [1,2].forEach(side=>{
            const own=gs.players[side],enemy=side===1?2:1;
            own.gold+=8+own.units.filter(u=>u.type==="worker").length*5;
            own.units.forEach(u=>{
              if(u.type==="worker"||u.hp<=0)return;
              u.cooldown=Math.max(0,(u.cooldown||0)-1);
              const foes=gs.players[enemy].units.filter(v=>v.hp>0);
              let target=null,best=Infinity;
              foes.forEach(v=>{const d=Math.abs(v.x-u.x);if(d<best){best=d;target=v;}});
              const range=u.type==="archer"?230:u.type==="wizard"?185:u.type==="giant"?48:34;
              if(target&&best<=range){
                if(u.cooldown===0){
                  const damage=u.type==="wizard"?24:u.type==="giant"?42:u.type==="archer"?18:25;
                  target.hp=Math.max(0,target.hp-damage);
                  if(u.type==="wizard")foes.filter(v=>v!==target&&Math.abs(v.x-target.x)<55).forEach(v=>v.hp=Math.max(0,v.hp-12));
                  u.cooldown=u.type==="archer"?2:u.type==="wizard"?3:1;
                }
              }else{
                const speed=u.type==="giant"?2.2:u.type==="archer"?2.5:3.5;
                u.x=Math.max(95,Math.min(865,u.x+(side===1?1:-1)*speed));
              }
              if(!target||best>range){
                const atGate=side===1?u.x>=860:u.x<=100;
                if(atGate&&u.cooldown===0){gs.baseHp[enemy]=Math.max(0,gs.baseHp[enemy]-(u.type==="giant"?18:u.type==="wizard"?9:12));u.cooldown=2;}
              }
            });
            gs.players[side].units=own.units.filter(u=>u.hp>0);
          });
          if(gs.baseHp[1]<=0||gs.baseHp[2]<=0){gs.ended=true;gs.winner=gs.baseHp[1]<=0?2:1;room.status="finished";}
          return room;
        },undefined,false);
      }catch(e){const detail=(e&&((e.code||"")+" "+(e.message||""))).trim();$("gameMessage").textContent="تعذر تحديث المباراة: "+(detail||"خطأ غير معروف");}
    },1000);
  }
  if(window.firebase){
    ensureFirebase().then(()=>say("متصل! أنشئ غرفة أو أدخل كود صديقك."))
      .catch(e=>say("تعذر تسجيل الدخول: "+e.message,true));
  }else say("جاري تحميل خدمات اللعبة…");
  window.addEventListener("beforeunload",()=>stopListeners());
})();