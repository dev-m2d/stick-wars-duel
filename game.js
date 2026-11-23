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
  const costs={worker:50,sword:100,archer:150,wizard:250,giant:400,spearman:180,shield:220};
  const labels={worker:"عامل",sword:"سياف",archer:"رامٍ",wizard:"ساحر",giant:"عملاق",spearman:"رامح",shield:"مدرّع"};
  const show=el=>{[lobby,waiting,gamePanel].forEach(x=>x.classList.add("hidden"));el.classList.remove("hidden");};
  function enterBattleView(requestNative=false){
    gamePanel.classList.add("is-fullscreen");
    document.body.classList.add("battle-open","game-active");
    if(requestNative && document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen().catch(()=>{});
    }
  }
  function leaveBattleView(){
    gamePanel.classList.remove("is-fullscreen");
    document.body.classList.remove("battle-open","game-active");
    if(document.fullscreenElement && document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  }
  const say=(msg,error=false)=>{status.textContent=msg;status.style.color=error?"#ff8b83":"";};
  const initialGame=()=>({
    started:false, ended:false, winner:0, baseHp:{1:100,2:100},
    players:{
      1:{gold:150,units:[],upgrades:{mine:0,attack:0,fort:0}},
      2:{gold:150,units:[],upgrades:{mine:0,attack:0,fort:0}}
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
    if(!Array.isArray(firebase.apps) || firebase.apps.length===0) firebase.initializeApp(firebaseConfig);
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
        scene:{create:function(){try{return create.call(this);}catch(err){console.error('Battle scene error',err);const box=document.getElementById('game');if(box)box.innerHTML='<div style="padding:18px;color:white;background:#651f2b;direction:rtl">خطأ رسم الساحة: '+(err&&err.stack?err.stack:(err&&err.message?err.message:String(err)))+'</div>';}}}
      };
      game=new Phaser.Game(config);
      game.events.once(Phaser.Core.Events.READY,()=>{if(latest?.game)renderGame(latest.game);});
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

    // Layered blue sky and bright sun.
    for(let i=0;i<18;i++){
      const c=Math.round(160+i*4);
      g.fillStyle((c<<16)|(Math.min(225,c+24)<<8)|Math.min(245,c+38),1);
      g.fillRect(0,i*13,960,14);
    }
    g.fillStyle(0xfff4c8,1);g.fillCircle(480,76,76);
    g.fillStyle(0xffffff,.18);g.fillCircle(480,76,91);

    // Soft clouds.
    [[110,95],[175,118],[735,83],[800,105],[885,128]].forEach(([x,y])=>{
      g.fillStyle(0xffffff,.82);
      g.fillCircle(x,y,18);g.fillCircle(x+19,y-8,23);g.fillCircle(x+43,y,16);
      g.fillRect(x,y,43,16);
    });

    // Far mountains and green rolling hills.
    g.fillStyle(0x8295a0,1);
    [[0,270,130,145],[100,275,270,128],[280,270,440,152],[520,275,690,130],[720,270,900,145],[850,275,1040,125]].forEach(v=>g.fillTriangle(v[0],v[1],v[2],v[3],v[4],v[1]));
    g.fillStyle(0x9abf55,1);
    g.fillEllipse(125,286,390,125);g.fillEllipse(390,286,430,135);g.fillEllipse(740,282,470,145);
    g.fillStyle(0x6f9d3d,1);
    g.fillEllipse(35,310,300,105);g.fillEllipse(300,305,380,100);g.fillEllipse(660,308,420,105);g.fillEllipse(930,305,260,100);

    // Pine trees across the horizon.
    const pine=(x,y,scale)=>{
      g.fillStyle(0x684a2e,1);g.fillRect(x-5*scale,y-5*scale,10*scale,45*scale);
      g.fillStyle(0x244f2d,1);
      g.fillTriangle(x,y-105*scale,x-34*scale,y-22*scale,x+34*scale,y-22*scale);
      g.fillStyle(0x326b36,1);
      g.fillTriangle(x,y-82*scale,x-39*scale,y+2*scale,x+39*scale,y+2*scale);
      g.fillStyle(0x477f3a,1);
      g.fillTriangle(x,y-58*scale,x-32*scale,y+18*scale,x+32*scale,y+18*scale);
    };
    [[80,310,.95],[190,300,.72],[315,310,1.05],[640,305,.9],[795,310,1.08],[900,305,.75]].forEach(v=>pine(v[0],v[1],v[2]));

    // Dirt battlefield with grassy edge, texture and small stones.
    g.fillStyle(0x738b2d,1);g.fillRect(0,326,960,28);
    g.fillStyle(0x9b9137,1);g.fillRect(0,345,960,195);
    g.fillStyle(0x897c32,1);g.fillEllipse(480,420,1120,220);
    g.fillStyle(0xb0a047,.45);
    for(let i=0;i<85;i++){
      const x=(i*137)%960,y=365+((i*71)%165);
      g.fillCircle(x,y,1+(i%3));
    }
    g.fillStyle(0x4f7c31,1);
    for(let i=0;i<75;i++){
      const x=(i*83)%960;
      g.fillRect(x,333+(i%4)*3,2+(i%3),8+(i%5)*2);
    }

    // Gold seams and bright crystal clusters.
    const crystals=(x,y,scale)=>{
      g.fillStyle(0xd28b18,1);
      g.fillTriangle(x-22*scale,y+12*scale,x-8*scale,y-20*scale,x+2*scale,y+12*scale);
      g.fillTriangle(x-4*scale,y+12*scale,x+10*scale,y-28*scale,x+19*scale,y+12*scale);
      g.fillTriangle(x+10*scale,y+12*scale,x+25*scale,y-13*scale,x+31*scale,y+12*scale);
      g.fillStyle(0xffd52d,1);
      g.fillTriangle(x-8*scale,y-20*scale,x-4*scale,y+12*scale,x+2*scale,y+12*scale);
      g.fillTriangle(x+10*scale,y-28*scale,x+13*scale,y+12*scale,x+19*scale,y+12*scale);
      g.fillStyle(0xfff18a,.9);
      g.fillTriangle(x+10*scale,y-28*scale,x+10*scale,y-8*scale,x+16*scale,y-15*scale);
    };
    [[445,390,.8],[520,426,1],[690,410,.9],[825,386,.85]].forEach(v=>crystals(v[0],v[1],v[2]));

    // Small mining mounds.
    [[265,438],[575,465],[760,455]].forEach(([x,y])=>{
      g.fillStyle(0x65552d,1);g.fillEllipse(x,y,48,13);
      g.fillStyle(0xc5a33f,1);g.fillCircle(x-8,y-5,4);g.fillCircle(x+7,y-7,5);
    });

    // Two fortresses and their banners frame the battlefield.
    drawCastle(g,65,0xe0a63f,false);
    drawCastle(g,895,0x526b86,true);
    g.fillStyle(0x263b53,1);g.fillRect(48,225,4,48);
    g.fillStyle(0xf4c451,1);g.fillTriangle(52,227,78,236,52,245);
    g.fillStyle(0x263b53,1);g.fillRect(908,225,4,48);
    g.fillStyle(0xe45e57,1);g.fillTriangle(908,227,882,236,908,245);
    this.add.text(22,18,"⚔",{fontFamily:"Arial",fontSize:"27px",color:"#ffffff"});
    this.add.text(480,18,"ساحة المعركة",{fontFamily:"Cairo, Arial",fontSize:"18px",color:"#ffffff",fontStyle:"bold",stroke:"#38552c",strokeThickness:3}).setOrigin(.5);
    this.unitsLayer=this.add.container(0,0);
    this.hud=this.add.text(480,505,"",{fontFamily:"Cairo, Arial",fontSize:"18px",color:"#ffffff",fontStyle:"bold",backgroundColor:"#26351dcc",padding:{x:12,y:6}}).setOrigin(.5);
  }
  function renderGame(gs){
    if(!gs)return;
    gs.players=gs.players||{};
    [1,2].forEach(side=>{
      gs.players[side]=gs.players[side]||{gold:150,units:[],upgrades:{mine:0,attack:0,fort:0}};
      if(!Array.isArray(gs.players[side].units))gs.players[side].units=[];
      if(!Number.isFinite(gs.players[side].gold))gs.players[side].gold=150;
      gs.players[side].upgrades=gs.players[side].upgrades||{mine:0,attack:0,fort:0};
    });
    gs.baseHp=gs.baseHp||{1:100,2:100};
    latest.game=gs;
    if(scene && scene.unitsLayer){
      scene.unitsLayer.removeAll(true);
      [1,2].forEach(side=>gs.players[side].units.forEach(u=>{
        const x=Number.isFinite(u.x)?u.x:(side===1?150:810),y=390;
        const color=side===1?0xf0a92f:0x263b53;
        const group=scene.add.container(x,y);
        if(u.type==="giant")group.setScale(side===1?1.8:-1.8,1.8);
        else group.setScale(side===1?1:-1,1);
        if(u.type==="shield")group.setScale(side===1?1.12:-1.12,1.12);
        const shadow=scene.add.ellipse(0,2,30,9,0x243b35,.28);
        const legs=scene.add.graphics();legs.lineStyle(6,color,1);legs.lineBetween(-4,-8,-11,2);legs.lineBetween(4,-8,11,2);
        const body=scene.add.rectangle(0,-22,13,28,color).setStrokeStyle(2,0xffffff,.7);
        const head=scene.add.circle(0,-43,10,0xf1d1a4).setStrokeStyle(2,color);
        const arms=scene.add.graphics();arms.lineStyle(5,color,1);arms.lineBetween(-4,-29,-17,-19);arms.lineBetween(4,-29,17,-20);
        group.add([shadow,legs,body,head,arms]);
        if(u.type==="sword"||u.type==="giant"||u.type==="spearman"){
          const sword=scene.add.rectangle(20,-27,u.type==="giant"?7:u.type==="spearman"?3:4,u.type==="giant"?38:u.type==="spearman"?43:24,u.type==="spearman"?0xb9c7d2:0xe7edf4).setAngle(u.type==="spearman"?5:25);group.add(sword);
        }else if(u.type==="archer"){
          const bow=scene.add.arc(18,-27,10,-85,85,false,0x754b2b).setStrokeStyle(3,0x754b2b);group.add(bow);
        }else if(u.type==="shield"){
          group.add(scene.add.rectangle(18,-27,15,24,0x91a8bc).setStrokeStyle(3,0xdce6ee).setAngle(-12));
        }else if(u.type==="wizard"){
          group.add(scene.add.triangle(0,-16,0,-4,-17,12,17,12,0x6e55a5));
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
      const mine=gs.players?.[player]||{upgrades:{}};
      document.querySelectorAll(".upgrade-btn").forEach(btn=>{
        const level=mine.upgrades?.[btn.dataset.upgrade]||0;
        btn.classList.toggle("upgrade-max",level>=5);
        const small=btn.querySelector("small");
        if(small)small.textContent=level>=5?"MAX":({mine:"300",attack:"350",fort:"400"}[btn.dataset.upgrade])+" • "+level+"/5";
      });
    }
    const mine=gs.players?.[player]||{gold:0,units:[],upgrades:{}};
    const mineUnits=Array.isArray(mine.units)?mine.units:[];
    $("gold").textContent="🪙 "+(mine.gold??0);$("army").textContent="👥 "+mineUnits.length+"/100";$("baseHealth").textContent="🏰 "+(gs.baseHp?.[player]??100)+"%";
    if(gs.ended)$("gameMessage").textContent=gs.winner===player?"🏆 انتصرت!":"💀 خسرت المعركة!";
    else $("gameMessage").textContent="درّب جنودك واهجم على تمثال الخصم!";
  }
  $("hudFullscreen").addEventListener("click",()=>$("fullscreenBtn").click());
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
        if((p.units||[]).length>=100)return;
        p.gold-=costs[type];
        p.units=p.units||[];
        const maxHp=type==="giant"?260:type==="shield"?175:100;
        p.units.push({type,x:player===1?145:815,hp:maxHp,maxHp,cooldown:0,id:user.uid+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,5)});
        return p;
      },undefined,false);
      if(!result.committed)$("gameMessage").textContent="الذهب غير كافٍ أو الجيش وصل إلى 100 جندي أو انتهت المباراة.";
    }catch(e){$("gameMessage").textContent="تعذر تدريب الوحدة: "+(e.code||e.message||"تحقق من الاتصال");}
  }
  document.querySelectorAll(".unit-btn").forEach(b=>b.addEventListener("click",()=>train(b.dataset.unit)));
  function playRecruitSound(){
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      const c=new C(),o=c.createOscillator(),g=c.createGain();
      o.type="triangle";o.frequency.setValueAtTime(520,c.currentTime);o.frequency.exponentialRampToValueAtTime(780,c.currentTime+.09);
      g.gain.setValueAtTime(.08,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.13);
      o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.14);o.onended=()=>c.close();
    }catch(_){}
  }
  async function upgrade(kind){
    if(!roomRef||!latest||latest.status!=="started")return;
    const costs={mine:300,attack:350,fort:400},max={mine:5,attack:5,fort:5};
    try{
      const ref=roomRef.child("game/players/"+player);
      const result=await ref.transaction(p=>{
        if(!p||p.gold<costs[kind])return;
        p.upgrades=p.upgrades||{mine:0,attack:0,fort:0};
        if((p.upgrades[kind]||0)>=max[kind])return;
        p.gold-=costs[kind];p.upgrades[kind]=(p.upgrades[kind]||0)+1;
        return p;
      },undefined,false);
      if(result.committed){
        
        $("gameMessage").textContent="تم تطوير "+({mine:"المنجم",attack:"الهجوم",fort:"القلعة"}[kind])+" بنجاح!";
        playRecruitSound();
      }else $("gameMessage").textContent="الذهب غير كافٍ أو وصلت لأقصى مستوى تطوير.";
    }catch(e){$("gameMessage").textContent="تعذر التطوير: "+(e.code||e.message);}
  }
  document.querySelectorAll(".upgrade-btn").forEach(b=>b.addEventListener("click",()=>upgrade(b.dataset.upgrade)));

  function startHostLoop(){
    if(hostTimer)return;
    hostTimer=setInterval(async()=>{
      if(!roomRef||player!==1)return;
      try{
        await roomRef.transaction(room=>{
          if(!room||room.status!=="started"||room.game.ended)return;
          const gs=room.game;gs.tick=(gs.tick||0)+1;gs.baseHp=gs.baseHp||{1:100,2:100};gs.players=gs.players||{};
          [1,2].forEach(side=>{
            gs.players[side]=gs.players[side]||{gold:150,units:[],upgrades:{mine:0,attack:0,fort:0}};
            const own=gs.players[side],enemy=side===1?2:1;
            own.units=Array.isArray(own.units)?own.units:[];
            own.gold=Number.isFinite(own.gold)?own.gold:150;
            own.upgrades=own.upgrades||{mine:0,attack:0,fort:0};
            gs.players[enemy]=gs.players[enemy]||{gold:150,units:[],upgrades:{mine:0,attack:0,fort:0}};
            gs.players[enemy].units=Array.isArray(gs.players[enemy].units)?gs.players[enemy].units:[];
            gs.baseHp[side]=Math.min(200,Math.max(gs.baseHp[side]||100,100+(own.upgrades.fort||0)*20));
            own.gold+=8+own.units.filter(u=>u&&u.type==="worker").length*(5+2*own.upgrades.mine);
            own.units.forEach(u=>{
              if(u.hp<=0)return;
              if(u.type==="worker"){
                const mineX=side===1?280:680,homeX=side===1?145:815;
                u.minePhase=u.minePhase||"out";
                const destination=u.minePhase==="out"?mineX:homeX;
                const step=side===1?1:-1;
                if(Math.abs(destination-u.x)<7){u.x=destination;u.minePhase=u.minePhase==="out"?"back":"out";}
                else u.x+=step*5;
                return;
              }
              u.cooldown=Math.max(0,(u.cooldown||0)-1);
              const foes=gs.players[enemy].units.filter(v=>v.hp>0);
              let target=null,best=Infinity;
              foes.forEach(v=>{const d=Math.abs(v.x-u.x);if(d<best){best=d;target=v;}});
              const range=u.type==="archer"?230:u.type==="wizard"?185:u.type==="giant"?48:u.type==="spearman"?72:34;
              if(target&&best<=range){
                if(u.cooldown===0){
                  const rawDamage=u.type==="wizard"?24:u.type==="giant"?42:u.type==="archer"?18:u.type==="spearman"?34:u.type==="shield"?15:25;
                  const damage=Math.round(rawDamage*(1+(own.upgrades?.attack||0)*0.15));
                  target.hp=Math.max(0,target.hp-damage);
                  if(u.type==="wizard")foes.filter(v=>v!==target&&Math.abs(v.x-target.x)<55).forEach(v=>v.hp=Math.max(0,v.hp-12));
                  u.cooldown=u.type==="archer"?2:u.type==="wizard"?3:1;
                }
              }else{
                const speed=u.type==="giant"?2.2:u.type==="archer"?2.5:u.type==="shield"?2:3.5;
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