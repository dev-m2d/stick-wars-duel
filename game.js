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
  const costs={worker:50,sword:100,archer:150};
  const labels={worker:"عامل",sword:"سياف",archer:"رامٍ"};
  const show=el=>{[lobby,waiting,gamePanel].forEach(x=>x.classList.add("hidden"));el.classList.remove("hidden");};
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
        show(gamePanel);startGame();
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
    show(lobby);say("رجعت للقائمة الرئيسية.");
  });
  function startGame(){
    if(game){game.destroy(true);game=null;}
    if(!window.Phaser){$("game").textContent="تعذر تحميل محرك اللعبة. حدّث الصفحة.";return;}
    const config={type:Phaser.AUTO,parent:"game",width:900,height:340,backgroundColor:"#9dcbd1",scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:{create}};
    game=new Phaser.Game(config);
  }
  function create(){
    scene=this;
    const g=this.add.graphics();
    g.fillStyle(0x91b96e).fillRect(0,250,900,90);g.fillStyle(0x7a9d5b).fillRect(0,250,900,12);g.fillStyle(0xd9c18b).fillRect(0,262,900,78);
    g.fillStyle(0x647b89).fillRect(25,165,48,85);g.fillStyle(0x647b89).fillRect(827,165,48,85);
    g.fillStyle(0xf2bd51).fillRect(30,125,38,40);g.fillStyle(0x263b53).fillRect(832,125,38,40);
    this.add.text(18,20,"YOUR CASTLE",{fontFamily:"Arial",fontSize:"13px",color:"#25364a",fontStyle:"bold"});
    this.add.text(765,20,"ENEMY CASTLE",{fontFamily:"Arial",fontSize:"13px",color:"#25364a",fontStyle:"bold"});
    this.add.text(350,285,"GOLD MINE  ◆",{fontFamily:"Arial",fontSize:"14px",color:"#6b532c",fontStyle:"bold"});
    this.add.circle(450,250,12,0xe9b34b).setStrokeStyle(3,0x9a702f);
    this.unitsLayer=this.add.container(0,0);
    this.hud=this.add.text(450,45,"",{fontFamily:"Arial",fontSize:"16px",color:"#26384a",fontStyle:"bold"}).setOrigin(.5);
    if(latest?.game)renderGame(latest.game);
  }
  function renderGame(gs){
    if(!gs)return;
    latest.game=gs;
    if(scene && scene.unitsLayer){
      scene.unitsLayer.removeAll(true);
      [1,2].forEach(side=>(gs.players?.[side]?.units||[]).forEach(u=>{
        const enemy=side!==player,color=side===1?0xf0b43e:0x253b5a,x=u.x,y=246;
        const head=scene.add.circle(x,y-28,7,color),body=scene.add.rectangle(x,y-13,4,22,color);
        const legs=scene.add.graphics();legs.lineStyle(4,color);legs.lineBetween(x,y-3,x-7,y+6);legs.lineBetween(x,y-3,x+7,y+6);
        const arms=scene.add.graphics();arms.lineStyle(3,color);arms.lineBetween(x,y-18,x-9,y-9);arms.lineBetween(x,y-18,x+9,y-9);
        scene.unitsLayer.add([head,body,legs,arms]);
      }));
      scene.hud.setText("قاعدة فريقك: "+gs.baseHp[player]+"%  |  قاعدة الخصم: "+gs.baseHp[player===1?2:1]+"%");
    }
    const mine=gs.players?.[player]||{gold:0,units:[]};
    $("gold").textContent="🪙 "+mine.gold;$("army").textContent="الجيش: "+mine.units.length;
    if(gs.ended)$("gameMessage").textContent=gs.winner===player?"🏆 انتصرت!":"💀 خسرت المعركة!";
    else $("gameMessage").textContent="اجمع الذهب ودرّب جيشك!";
  }
  async function train(type){
    if(!roomRef||!latest||latest.status!=="started"||!costs[type])return;
    try{
      const playerRef=roomRef.child("game/players/"+player);
      const result=await playerRef.transaction(p=>{
        if(!p||p.gold<costs[type]||latest?.game?.ended)return;
        p.gold-=costs[type];
        p.units=p.units||[];
        p.units.push({type,x:player===1?90:810,hp:100,id:user.uid+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,5)});
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
            own.gold+=8+own.units.filter(u=>u.type==="worker").length*4;
            own.units.forEach(u=>{if(u.type!=="worker")u.x=Math.max(50,Math.min(850,u.x+(side===1?1:-1)*(u.type==="sword"?5:2)));});
            const damage=own.units.filter(u=>u.type!=="worker"&&(side===1?u.x>=810:u.x<=90)).length;
            gs.baseHp[enemy]=Math.max(0,gs.baseHp[enemy]-damage);
          });
          if(gs.baseHp[1]<=0||gs.baseHp[2]<=0){gs.ended=true;gs.winner=gs.baseHp[1]<=0?2:1;room.status="finished";}
          return room;
        },undefined,false);
      }catch(e){$("gameMessage").textContent="انقطع الاتصال مؤقتًا…";}
    },1000);
  }
  if(window.firebase){
    ensureFirebase().then(()=>say("متصل! أنشئ غرفة أو أدخل كود صديقك."))
      .catch(e=>say("تعذر تسجيل الدخول: "+e.message,true));
  }else say("جاري تحميل خدمات اللعبة…");
  window.addEventListener("beforeunload",()=>stopListeners());
})();