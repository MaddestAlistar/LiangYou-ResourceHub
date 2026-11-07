/* LiangYou Web OS Lab — static browser-only v86 host. No VM backend. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);

  const UPSTREAM = "https://cdn.jsdelivr.net/npm/v86@0.5.473/";
  const UNPKG = "https://unpkg.com/v86@0.5.473/";
  const ASSETS = Object.freeze({
    seabios:[
      "https://cdn.jsdelivr.net/gh/copy/v86@master/bios/seabios.bin",
      "https://raw.githubusercontent.com/copy/v86/master/bios/seabios.bin"
    ],
    vgabios:[
      "https://cdn.jsdelivr.net/gh/copy/v86@master/bios/vgabios.bin",
      "https://raw.githubusercontent.com/copy/v86/master/bios/vgabios.bin"
    ],
    image: name => [
      "https://cdn.jsdelivr.net/gh/copy/images@master/" + name,
      "https://raw.githubusercontent.com/copy/images/master/" + name
    ],
    wasm:[
      UPSTREAM + "build/v86.wasm",
      UNPKG + "build/v86.wasm"
    ]
  });
  const SYSTEMS=Object.freeze({
    freedos:{name:"FreeDOS",type:"fda",file:"freedos722.img",memory:32,vga:4},
    kolibri:{name:"KolibriOS",type:"fda",file:"kolibri.img",memory:64,vga:8}
  });

  // Game list verified from the GAMES directory of copy/images/freedos722.img.
  const GUIDES=Object.freeze({
    freedos:{
      title:"FreeDOS · 经典小游戏与 DOS 工具",
      intro:"这是复古 DOS 电脑。开机看到 A:\\> 就进入系统了，无需登录。镜像里有五款其他游戏。",
      steps:[
        "等屏幕显示 A:\\>，就说明进入系统。前面提示光驱启动失败，不一定是真正启动失败。",
        "扫雷可以点「简单 / 中等 / 困难」直接进入，不用再手动输入数字；还有俄罗斯方块、太空侵略者等游戏。",
        "扫雷：方向键移动、空格翻开、Tab 插旗。退出当前游戏可以点「退出游戏 · 返回 DOS」，无需刷新整个网页。"
      ],
      note:"已核对镜像内 GAMES 目录。部分游戏操作需要额外按键，手机体验因游戏而异。",
      commands:[
        {name:"查看文件",value:"dir",hint:"查看磁盘目录"},
        {name:"显示帮助",value:"help",hint:"DOS 命令"},
        {name:"清空屏幕",value:"cls",hint:"清屏"},
        {name:"太空侵略者",value:"invaders",hint:"射击游戏"},
        {name:"俄罗斯方块",value:"tetris",hint:"拼方块"},
        {name:"Jumper",value:"jumper",hint:"跳跃游戏"},
        {name:"Rogue",value:"rogue",hint:"地牢冒险"}
      ]
    },
    kolibri:{
      title:"KolibriOS · 图形桌面操作",
      intro:"这是有窗口和桌面图标的轻量系统。手机拖动可移动光标，单击或双击可以使用画面下方的鼠标键。",
      steps:[
        "等开机信息结束、进入图形桌面。出现图形画面不一定代表桌面完全就绪。",
        "把鼠标指针移到图标上，点「单击左键」选中、点「双击打开」进入。",
        "可尝试 Esc 返回菜单；遇到无响应可重启。"
      ],
      note:"这是图形桌面，主要依靠鼠标；方向键和 Enter 不能替代所有鼠标操作。",
      commands:[]
    }
  });

  // Set 1 keyboard scan codes with key-down and key-up for each virtual key.
  const HOLD_KEYS = Object.freeze({up:0x48,down:0x50,left:0x4b,right:0x4d});
  const heldPads = new Map();
  const KEY_CODES = Object.freeze({
    esc:[0x01,0x81],
    tab:[0x0f,0x8f],
    enter:[0x1c,0x9c],
    space:[0x39,0xb9],
    backspace:[0x0e,0x8e],
    up:[0xe0,0x48,0xe0,0xc8],
    down:[0xe0,0x50,0xe0,0xd0],
    left:[0xe0,0x4b,0xe0,0xcb],
    right:[0xe0,0x4d,0xe0,0xcd],
    ctrlc:[0x1d,0x2e,0xae,0x9d]
  });

  let emulator = null;
  let current = null;
  let generation = 0;
  let scriptPromise = null;
  let ready = false;
  let isRunning = false;
  let guestReady = false;
  let commandBusy = false;
  let gamePlaying = false;
  let activeGame = null;
  let bootMonitor = null;
  const pendingDownloads = new Set();
  let loadingTimer = null;
  let attemptFailed = false;
  const controls = ["pause","resume","restart","fullscreen","exit","typeText","sendText","sendEnter"];
  const status = (message, live = false) => {
    $("machineStatus").textContent = message;
    $("led").classList.toggle("live", live);
  };

  const showLoading = (title,detail = "") => {
    if(attemptFailed) return;
    $("loadingCover").hidden = false;
    $("loadingTitle").textContent = title;
    $("loadingDetail").textContent = detail;
    $("loadingCover").classList.remove("load-failed");
    status(title);
    simpleStatus(detail || title);
  };
  const hideLoading = () => {
    $("loadingCover").hidden = true;
    $("loadingCover").classList.remove("load-failed");
  };
  function cancelDownloads() {
    for(const controller of pendingDownloads) controller.abort();
    pendingDownloads.clear();
    if(loadingTimer) {clearTimeout(loadingTimer);loadingTimer=null;}
  }
  async function fetchAsset(label,urls,minSize,token) {
    const failures = [];
    for(let i=0;i<urls.length;i++) {
      if(token !== generation || attemptFailed) throw new Error("已取消旧的加载任务");
      const controller = new AbortController();
      pendingDownloads.add(controller);
      const timer = setTimeout(()=>controller.abort(),23000);
      try {
        showLoading("正在获取" + label, i ? "第一个下载地址连接失败，已自动切换备用地址…" : "下载由访客设备完成，不会运行云服务器。");
        const response = await fetch(urls[i], {mode:"cors",cache:"default",signal:controller.signal});
        if(!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.arrayBuffer();
        if(data.byteLength < minSize) throw new Error("文件内容不完整");
        if(token !== generation) throw new Error("已取消旧的加载任务");
        return {buffer:data,url:urls[i]};
      } catch(error) {
        if(token !== generation || attemptFailed) throw error;
        failures.push((i===0?"主地址":"备用地址")+": "+(error?.message||String(error)));
      } finally {
        clearTimeout(timer);
        pendingDownloads.delete(controller);
      }
    }
    throw new Error(label+"下载失败（"+failures.join("；")+"）。请检查网络，或稍后重新尝试。");
  }
  async function prepareAssets(config,token) {
    let completed=0;
    async function one(label,urls,min) {
      const result=await fetchAsset(label,urls,min,token);
      completed++;
      if(token===generation && !attemptFailed)
        showLoading("资源准备中 "+completed+"/4","已取得"+label+"，正在准备剩余文件…");
      return result;
    }
    const [bios,vga,wasm,image]=await Promise.all([
      one("系统 BIOS",ASSETS.seabios,50000),
      one("显示 BIOS",ASSETS.vgabios,10000),
      one("运行核心 WASM",ASSETS.wasm,1000000),
      one(config.name+"镜像",ASSETS.image(config.file),100000)
    ]);
    return {bios:{buffer:bios.buffer},vga_bios:{buffer:vga.buffer},disk:{buffer:image.buffer},wasm_path:wasm.url};
  }

  const EASY_ACTIONS=Object.freeze({
    freedos:[
      {label:"👾 太空侵略者",value:"invaders"},
      {label:"🧱 俄罗斯方块",value:"tetris"},
      {label:"💣 扫雷·简单",value:"minesw~1",level:"1"},
      {label:"💣 扫雷·中等",value:"minesw~1",level:"2"},
      {label:"💣 扫雷·困难",value:"minesw~1",level:"3"}
    ],
    kolibri:[]
  });
  const GAME_COMMANDS=new Set(["invaders","tetris","minesw~1","jumper","rogue"]);
  let touchStart = null;
  let mouseBusy = false;
  const graphical=id=>id==="kolibri";
  async function clickMouse(kind) {
    if(!graphical(current) || !ready || !isRunning || !emulator || !emulator.bus?.send || mouseBusy) {
      simpleStatus("鼠标尚未就绪。请先启动图形系统并等待桌面出现。");
      return;
    }
    const instance = emulator;
    mouseBusy = true;
    updateSimpleUI();
    const buttons = kind === "right" ? [false,false,true] : [true,false,false];
    const release = [false,false,false];
    try {
      for(let i=0;i<(kind==="double"?2:1);i++) {
        if(instance !== emulator) break;
        instance.bus.send("mouse-click",buttons);
        await new Promise(resolve=>setTimeout(resolve,90));
        instance.bus.send("mouse-click",release);
        if(kind==="double" && i===0) await new Promise(resolve=>setTimeout(resolve,120));
      }
      if(instance===emulator) {
        const msg = kind==="right" ? "右键已发送，可查看是否弹出菜单。"
          : kind==="double" ? "双击已发送；如果没打开，请先把光标移动到图标上。"
          : "左键点击已发送；再试试选中图标。";
        simpleStatus(msg);
        $("quickFeedback").textContent = msg;
      }
    } catch(error) {
      simpleStatus("鼠标操作没能发送：" + (error?.message||String(error)));
    } finally { mouseBusy=false; updateSimpleUI(); }
  }

  const simpleStatus = text => { $("playStatus").textContent = text; };
  function updateSimpleUI() {
    const canUse = ready && isRunning;
    const isReady = canUse && guestReady;
    const btn = $("primaryAction");
    $("screenMode").disabled = !current;
    $("padEnter").disabled = !canUse;
    $("padSpace").disabled = !canUse;
    $("padEsc").disabled = !canUse;
    $("dpad").querySelectorAll("[data-padkey]").forEach(key=>{key.disabled=!canUse;});
    $("mouseControls").hidden = !graphical(current);
    $("mouseControls").querySelectorAll("[data-mouse]").forEach(button=>{button.disabled=!canUse||mouseBusy;});
    $("easyActions").querySelectorAll("[data-easycmd]").forEach(button=>{
      button.disabled = !isReady || commandBusy || (current==="freedos" && gamePlaying);
    });
    $("easyActions").hidden = !(EASY_ACTIONS[current]?.length) || (current==="freedos" && gamePlaying);
    btn.disabled = !isReady || commandBusy;
    if(!current) {
      $("simpleStep").textContent = "先选一个系统并启动，下面会告诉你怎么操作。";
      $("simpleActionHelp").textContent = "可以用按钮操作，不需要记住英文指令。";
      btn.textContent = "▶ 启动系统后可操作";
    } else if(!guestReady) {
      $("simpleStep").textContent = current==="freedos" ? "等待 A:\\> 出现，就能选择小游戏。" : "正在启动 KolibriOS，请等待桌面出现。";
      $("simpleActionHelp").textContent = "现在还在启动，请先不要输入。";
      btn.textContent = "⌛ 等待系统启动";
    } else if(current==="freedos") {
      $("simpleStep").textContent = gamePlaying
        ? "正在游戏中。换游戏点「退出游戏 · 返回 DOS」，不必一直试 Esc。"
        : "已进入 DOS！扫雷可直接选择简单、中等或困难。";
      $("simpleActionHelp").textContent = gamePlaying
        ? activeGame==="minesw~1"
          ? "扫雷：方向键移动、空格翻开、Tab 插旗。点「退出游戏」可直接返回 DOS。"
          : "老游戏可能不响应 Esc；点击大按钮会重启 DOS，确保退出游戏。"
        : "选择扫雷难度可直接进游戏，也可以玩俄罗斯方块、太空侵略者。";
      btn.textContent = gamePlaying ? "↻ 退出游戏 · 返回 DOS" : "📁 查看磁盘文件";
    } else {
      $("simpleStep").textContent = "拖动光标到图标，再点「单击左键」或「双击打开」。";
      $("simpleActionHelp").textContent = "下方有鼠标按键；方向键和 Enter 不是鼠标点击。";
      btn.textContent = "🖱 单击左键";
    }
    const immersive=document.body.classList.contains("lab-immersive");
    $("fullscreen").textContent = immersive?"↙ 退出放大":"⛶ 放大操作";
    $("screenMode").textContent = immersive?"↙ 返回页面":"⛶ 放大操作";
    for(const control of [$("fullscreen"),$("screenMode")])control.setAttribute("aria-pressed",String(immersive));
  }
  function setImmersive(enabled) {
    document.body.classList.toggle("lab-immersive",enabled);
    updateSimpleUI();
    if(enabled) {
      simpleStatus("已放大为整页操作区；iPhone Safari 可能仍显示浏览器地址栏，可横屏获得更多空间。");
    } else {
      simpleStatus("已返回普通页面，游戏方向键仍在屏幕下方。");
    }
  }
  async function toggleImmersive() {
    const enabled = document.body.classList.contains("lab-immersive");
    if(enabled) {
      setImmersive(false);
      if(document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch {}
      }
    } else {
      setImmersive(true);
      // iPhone Safari does not support fullscreen for arbitrary page elements.
      // Fixed viewport mode is usable without the Fullscreen API.
      if(document.fullscreenEnabled && $("machine").requestFullscreen) {
        try { await $("machine").requestFullscreen({navigationUI:"hide"}); } catch {}
      }
    }
  }
  const updateGuideButtons = () => {
    const enabled = ready && isRunning;
    const allowCommands = enabled && guestReady && !commandBusy;
    $("quickCommands").querySelectorAll("[data-command]").forEach(button => {
      button.disabled = !allowCommands;
    });
    $("virtualKeys").querySelectorAll("[data-vkey]").forEach(button => {
      button.disabled = !enabled || (button.dataset.vkey === "ctrlc" && graphical(current));
    });
    updateSimpleUI();
    $("guestIndicator").textContent = !current ? "尚未选择"
      : !guestReady ? "等待系统就绪"
      : current === "freedos" ? "DOS 已进入"
      : "已切换图形模式";
  };
  const renderGuide = id => {
    const guide = GUIDES[id];
    $("guideTitle").textContent = guide ? guide.title : "选择系统后显示操作提示";
    $("guideIntro").textContent = guide ? guide.intro : "FreeDOS 可以玩经典游戏，KolibriOS 是轻量桌面。";
    const steps = guide ? guide.steps : ["从上方选择一个系统并点击「启动」。","等待系统进入命令提示符或桌面。","通过下方快捷命令和虚拟按键操作。"];
    $("guideSteps").replaceChildren(...steps.map(step => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    }));
    const note=$("systemNote");
    note.hidden = !id;
    note.textContent=id==="freedos" ? "💡 扫雷可一键进入三种难度；方向键移动、空格翻开、Tab 插旗。退出按「返回 DOS」。"
      : id==="kolibri" ? "💡 KolibriOS 是图形桌面；先移动鼠标，再点左键或双击。" : "";
    const actions=$("easyActions");
    actions.replaceChildren();
    for(const item of EASY_ACTIONS[id]||[]) {
      const button=document.createElement("button");
      button.type="button";
      button.dataset.easycmd=item.value;
      if(item.level)button.dataset.level=item.level;
      button.textContent=item.label;
      button.disabled=true;
      actions.append(button);
    }
    actions.hidden = !actions.childElementCount;
    $("quickTitle").textContent = graphical(id) ? "桌面操作帮助" : "一键执行常用命令";
    $("quickNote").textContent = guide ? guide.note : "启动系统后自动显示对应快捷命令";
    const commands = $("quickCommands");
    commands.replaceChildren();
    if(guide?.commands.length) {
      for(const cmd of guide.commands) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quick-command";
        button.dataset.command = cmd.value;
        const name = document.createElement("strong");
        name.textContent = cmd.name;
        const code = document.createElement("code");
        code.textContent = cmd.value;
        const hint = document.createElement("small");
        hint.textContent = cmd.hint;
        button.append(name,code,hint);
        commands.append(button);
      }
    } else {
      const hint = document.createElement("p");
      hint.className = "quick-empty";
      hint.textContent = guide ? "图形系统通常不需要英文命令。请等待桌面出现，使用画面下方的单击、双击或右键。" : "尚未选择系统";
      commands.append(hint);
    }
    $("quickFeedback").textContent = guide ? "已切换到 " + SYSTEMS[id].name + " 的操作提示；请等待系统真正进入操作界面。" : "先启动一个系统，虚拟按键才会启用。";
    $("typeText").placeholder = graphical(id) ? "图形系统优先使用鼠标点击按钮" : id === "freedos" ? "例如：dir（不用输入 A:\\>）" : "输入命令或文本（不适合输入密码）";
    updateGuideButtons();
  };
  const buttons = () => {
    $("pause").disabled = !ready || !isRunning;
    $("resume").disabled = !ready || isRunning;
    ["restart","fullscreen","exit","typeText","sendText","sendEnter"].forEach(id => $(id).disabled = !ready);
    updateGuideButtons();
  };
  const resetUI = () => {
    ready = false; isRunning = false; guestReady = false; commandBusy = false; gamePlaying = false; activeGame = null; attemptFailed = false;
    if(bootMonitor) { clearInterval(bootMonitor); bootMonitor = null; }
    for(const hold of heldPads.values()) {
      try {hold.instance.keyboard_send_scancodes([0xe0,HOLD_KEYS[hold.name]|0x80]);} catch {}
    }
    heldPads.clear();
    cancelDownloads();
    controls.forEach(id => $(id).disabled = true);
    $("screenShell").classList.remove("running");
    document.querySelectorAll(".system-card").forEach(c => c.classList.remove("active"));
    updateGuideButtons();
  };
  const fail = error => {
    attemptFailed = true;
    const detail = error && error.message ? error.message : String(error || "未知错误");
    cancelDownloads();
    status("启动未完成 · 可点击重新尝试");
    $("errorBox").hidden = false;
    $("errorMessage").textContent = "系统暂时没能启动。原因：" + detail;
    $("loadingCover").hidden = false;
    $("loadingCover").classList.add("load-failed");
    $("loadingTitle").textContent = "没有启动成功";
    $("loadingDetail").textContent = "可能是网络连接或 iPhone 浏览器限制。点击「重新尝试启动」，网页将自动重新选择下载地址。";
    $("runtimeHint").textContent = "已经停止等待，不会一直停留在「正在下载」。如仍失败，可尝试刷新页面或打开官方 v86 演示。";
    simpleStatus("加载失败，点击上方「重新尝试启动」可再次尝试。");
  };
  function loadRuntime() {
    if (window.V86 || window.V86Starter) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    const sources = [UPSTREAM+"build/libv86.js",UNPKG+"build/libv86.js"];
    const attempt = url => new Promise((resolve,reject)=>{
      const script = document.createElement("script");
      let done = false;
      const finish = (ok,reason) => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        if(!ok) script.remove();
        ok ? resolve() : reject(new Error(reason));
      };
      const timer = setTimeout(()=>finish(false,"模拟器脚本加载超时"),18000);
      script.src=url;
      script.async=true;
      script.onload=()=>finish(!!(window.V86||window.V86Starter),"脚本未提供模拟器接口");
      script.onerror=()=>finish(false,"当前镜像站点无法连接");
      document.head.append(script);
    });
    scriptPromise = (async () => {
      for(let i=0;i<sources.length;i++) {
        showLoading("正在获取模拟器程序",i?"已自动切换备用程序下载地址…":"即将准备系统核心和开机文件…");
        try {await attempt(sources[i]);return;}catch(error) {
          if(window.V86 || window.V86Starter) return;
          if(i===sources.length-1) throw new Error("模拟器程序下载失败：" + error.message);
        }
      }
    })().catch(error=>{scriptPromise=null;throw error;});
    return scriptPromise;
  }
  async function stopExisting() {
    const old = emulator;
    emulator = null;
    if(old) { try { await old.destroy(); } catch (error) { console.warn("VM teardown:",error); } }
    $("screen_container").replaceChildren(Object.assign(document.createElement("div"),{style:"white-space:pre;font:14px monospace;line-height:14px"}), Object.assign(document.createElement("canvas"),{style:"display:none"}));
  }
  async function launch(id) {
    const config=SYSTEMS[id];
    if(!config)return;
    const token = ++generation;
    current = id;
    $("errorBox").hidden = true;
    $("machineName").textContent = config.name;
    resetUI();
    showLoading("正在准备系统…","首次运行需要下载几个系统文件，失败会自动切换备用地址。");
    renderGuide(id);
    simpleStatus("系统正在启动，等屏幕出现提示后，点击旁边的大按钮即可。");
    const card = document.querySelector('[data-system="' + id + '"]');
    if(card) card.classList.add("active");
    $("runtime").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    status("正在加载模拟器核心…");
    try {
      await stopExisting();
      if(token !== generation) return;
      await loadRuntime();
      if(token !== generation) return;
      const assets = await prepareAssets(config,token);
      if(token !== generation) return;
      showLoading("系统文件已准备完成","正在启动虚拟机，出现开机画面后即可操作。");
      const Emulator = window.V86 || window.V86Starter;
      const options = {
        wasm_path: assets.wasm_path,
        memory_size: config.memory * 1024 * 1024,
        vga_memory_size: config.vga * 1024 * 1024,
        screen_container: $("screen_container"),
        bios: assets.bios,
        vga_bios: assets.vga_bios,
        autostart:true,
        boot_order:0x231,
        disable_keyboard:false,
        disable_mouse:false
      };
      options[config.type] = assets.disk;
      const instance = new Emulator(options);
      if(token !== generation) { await instance.destroy(); return; }
      emulator = instance;
      $("screenShell").classList.add("running");
      instance.add_listener("emulator-ready", () => {
        if(token !== generation) return;
        ready = true;
        status("模拟器就绪，系统正在启动…",true);
        buttons();
        $("screen_container").focus({preventScroll:true});

      });
      instance.add_listener("emulator-started", () => {
        if(token !== generation) return;
        ready = true; isRunning = true;
        hideLoading();
        status("虚拟机运行中 · 系统正在引导",true);
        buttons();
        // v86's emulator-started event only means the emulated CPU is running.
        // It does NOT mean the guest OS has reached a usable prompt or desktop.
        if(bootMonitor) clearInterval(bootMonitor);
        const startedAt = Date.now();
        let warningShown = false;
        bootMonitor = setInterval(() => {
          if(token !== generation || !emulator) { clearInterval(bootMonitor); bootMonitor = null; return; }
          if(!isRunning) return;
          const screen = $("screen_container");
          const text = screen.textContent || "";
          const canvas = screen.querySelector("canvas");
          const graphics = canvas && getComputedStyle(canvas).display !== "none" && canvas.width >= 320 && canvas.height >= 200;
          if(id === "freedos" && /A:\\>/.test(text)) {
            guestReady = true;
            status("DOS 提示符已就绪 · 本地运行",true);
            simpleStatus("DOS 已进入：可以查看文件，也能选太空侵略者、俄罗斯方块、扫雷等小游戏。");
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(graphical(id) && graphics) {
            guestReady = true;
            status("图形模式已出现 · 请确认是否进入桌面",true);
            simpleStatus("已显示图形画面。等待桌面加载完成后，移动光标并点「单击左键」或「双击打开」。");
            updateGuideButtons();
            clearInterval(bootMonitor); bootMonitor = null;
          } else if(Date.now() - startedAt > 60000 && !warningShown) {
            warningShown = true;
            status("系统仍在引导 · 可以继续等待");
            $("runtimeHint").textContent = "模拟器仍在运行，但尚未检测到系统就绪界面。若画面长时间不动，可重启或尝试桌面浏览器。";
          } else if(Date.now() - startedAt > 180000) {
            clearInterval(bootMonitor); bootMonitor = null;
          }
        }, 1400);
      });
      instance.add_listener("emulator-stopped", () => {
        if(token !== generation) return;
        isRunning = false;
        status("已暂停");
        buttons();
      });
      // Don't claim success until the engine explicitly reports it has started.
      loadingTimer = setTimeout(() => {
        if(token !== generation || isRunning) return;
        fail(new Error("虚拟机没有在允许的启动时间内运行。大系统可能超过设备内存限制，请优先尝试电脑或使用官方演示。"));
      },45000);
    } catch(error) {
      if(token === generation) { resetUI(); fail(error); }
    }
  }
  document.querySelectorAll("[data-launch]").forEach(button => button.addEventListener("click", () => launch(button.dataset.launch)));
  $("pause").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.stop();}catch(e){fail(e);}}});
  $("resume").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.run();}catch(e){fail(e);}}});
  $("restart").addEventListener("click",() => {if(emulator && ready) emulator.restart();});
  $("exit").addEventListener("click",async () => {++generation; if(document.body.classList.contains("lab-immersive")) setImmersive(false); resetUI();current = null;renderGuide(null);status("已退出");$("machineName").textContent="尚未启动";await stopExisting();});
  $("fullscreen").addEventListener("click",toggleImmersive);
  $("screenMode").addEventListener("click",toggleImmersive);
  $("retryLoading").addEventListener("click",()=>{if(current) launch(current);});
  $("retryFailed").addEventListener("click",()=>{if(current) launch(current);});
  document.addEventListener("fullscreenchange",() => {
    if(!document.fullscreenElement && document.body.classList.contains("lab-immersive")) setImmersive(false);
  });
  const feedback = message => { $("quickFeedback").textContent = message; };
  async function pressVirtualKey(name) {
    if(!emulator || !ready || !isRunning || !KEY_CODES[name]) return;
    if(graphical(current) && name === "ctrlc") return;
    const instance = emulator;
    try {
      await instance.keyboard_send_scancodes(KEY_CODES[name], 12);
      if(instance === emulator) {
        feedback("虚拟按键 " + (name === "enter" ? "Enter" : name.toUpperCase()) + " 已发送到 " + SYSTEMS[current].name + "。");
        if(!gamePlaying) simpleStatus("按键已发送：" + (name === "enter" ? "确认" : name) + "。");
      }
    } catch(error) {
      feedback("按键未发送成功：" + (error?.message || "模拟器暂不可用"));
    }
  }
  async function runQuickCommand(cmd,level=null) {
    if(!emulator || !ready || !isRunning || !guestReady || commandBusy || graphical(current)) return;
    const minePreset=cmd==="minesw~1" && ["1","2","3"].includes(level);
    if(!GUIDES[current].commands.some(item => item.value === cmd) && !minePreset) return;
    if(current==="freedos" && gamePlaying) {
      simpleStatus("已经在游戏中了。点「退出游戏 · 返回 DOS」后再选另一款。");
      return;
    }
    const instance=emulator;
    commandBusy=true;
    updateGuideButtons();
    feedback(minePreset ? "正在启动扫雷并选择难度…" : "正在发送 "+cmd+"…");
    try {
      await instance.keyboard_send_text(cmd,15);
      if(instance!==emulator || !isRunning)return;
      await instance.keyboard_send_scancodes(KEY_CODES.enter,15);
      if(instance!==emulator || !isRunning)return;
      if(minePreset) {
        // Confirm the real GMB_MINE menu before selecting the difficulty.
        // Its labels are 1=easy, 2=medium, 3=hard. These are single keys;
        // pressing Enter afterwards may act on an already started board.
        const begin=Date.now();
        let menuReady=false;
        while(Date.now()-begin<8000) {
          if(instance!==emulator || !isRunning)return;
          const text=$("screen_container").textContent||"";
          if(/GMB_MINE|easy game/.test(text)){menuReady=true;break;}
          await new Promise(resolve=>setTimeout(resolve,110));
        }
        if(!menuReady)throw new Error("未检测到扫雷难度菜单。可以点「退出游戏 · 返回 DOS」后重试。");
        await instance.keyboard_send_text(level,45);
      }
      if(instance===emulator) {
        if(current==="freedos" && GAME_COMMANDS.has(cmd)){gamePlaying=true;activeGame=cmd;}
        const name={1:"简单",2:"中等",3:"困难"}[level];
        feedback(minePreset ? "已向扫雷发送「"+name+"」难度，请查看画面。" : "已执行「"+cmd+"」，请查看画面。");
        simpleStatus(minePreset
          ? "扫雷 "+name+" 已选择：方向键移动、空格翻开、Tab 插旗。退出点「返回 DOS」。"
          : GAME_COMMANDS.has(cmd)
          ? "已尝试启动「"+cmd+"」。如果 Esc 无效，点「退出游戏 · 返回 DOS」。"
          : "已执行「"+cmd+"」，请查看画面。");
      }
    } catch(error) {
      feedback("操作未完成："+(error?.message||"请重新启动"));
      simpleStatus("操作未完成，可以点击「退出游戏 · 返回 DOS」后再试。");
      if(minePreset && instance===emulator){gamePlaying=true;activeGame=cmd;}
    } finally {
      commandBusy=false;
      updateGuideButtons();
    }
  }
  $("quickCommands").addEventListener("click", event => {
    const button = event.target.closest("[data-command]");
    if(button && $("quickCommands").contains(button) && !button.disabled) runQuickCommand(button.dataset.command);
  });
  $("virtualKeys").addEventListener("click", event => {
    const button = event.target.closest("[data-vkey]");
    if(button && $("virtualKeys").contains(button) && !button.disabled) pressVirtualKey(button.dataset.vkey);
  });
  $("primaryAction").addEventListener("click", () => {
    if(!guestReady || !ready || !isRunning || commandBusy) return;
    if(current === "freedos") {
      if(gamePlaying) {
        simpleStatus("正在重启 FreeDOS 以退出游戏。屏幕重新出现 A:\\> 即可选择其他游戏。");
        launch("freedos");
      }
      else runQuickCommand("dir");
    } else if(graphical(current)) clickMouse("left");
  });
  $("easyActions").addEventListener("click",event=>{
    const button=event.target.closest("[data-easycmd]");
    if(button && !button.disabled)runQuickCommand(button.dataset.easycmd,button.dataset.level||null);
  });
  $("mouseControls").addEventListener("click",event=>{
    const button=event.target.closest("[data-mouse]");
    if(button && !button.disabled)clickMouse(button.dataset.mouse);
  });
  const screen=$("screen_container");
  screen.addEventListener("touchstart",event=>{
    if(!graphical(current) || !isRunning || event.touches.length!==1) {touchStart=null;return;}
    const touch=event.touches[0];
    touchStart={x:touch.clientX,y:touch.clientY,at:Date.now()};
  },{passive:true});
  screen.addEventListener("touchend",event=>{
    if(!touchStart || !graphical(current) || !isRunning) return;
    const touch=event.changedTouches[0];
    const dx=touch.clientX-touchStart.x,dy=touch.clientY-touchStart.y;
    const tap=Math.hypot(dx,dy)<12 && Date.now()-touchStart.at<650;
    touchStart=null;
    if(!tap) return;
    event.preventDefault(); // Avoid a duplicate synthetic mouse click on iOS.
    // Let the v86 adapter's touchend handler release its own buttons first.
    setTimeout(()=>{if(graphical(current) && isRunning)clickMouse("left");},0);
  },{passive:false});
    $("padEnter").addEventListener("click",() => pressVirtualKey("enter"));
  $("padSpace").addEventListener("click",() => pressVirtualKey("space"));
  $("padEsc").addEventListener("click",() => pressVirtualKey("esc"));
  // Holding a D-pad button keeps the emulated arrow key pressed until finger-up.
  // Quick taps last at least 90 ms, as older DOS games often poll keys slowly.
  const handledPointerClicks=new WeakSet();
  $("dpad").addEventListener("pointerdown",event=>{
    const key=event.target.closest("[data-padkey]");
    if(!key || key.disabled || !event.isPrimary || !ready || !isRunning || !emulator)return;
    event.preventDefault();
    const name=key.dataset.padkey;
    const make=HOLD_KEYS[name];
    if(!make)return;
    handledPointerClicks.add(key);
    try{key.setPointerCapture(event.pointerId);}catch{}
    const instance=emulator;
    heldPads.set(event.pointerId,{name,instance,start:Date.now()});
    simpleStatus("方向键已按下："+({up:"上",down:"下",left:"左",right:"右"}[name]||name)+"，松开手指即停止。");
    instance.keyboard_send_scancodes([0xe0,make]).catch(()=>{});
  });
  function releasePad(event) {
    const held=heldPads.get(event.pointerId);
    if(!held)return;
    heldPads.delete(event.pointerId);
    const release=()=>{
      if(held.instance!==emulator)return;
      held.instance.keyboard_send_scancodes([0xe0,HOLD_KEYS[held.name]|0x80]).catch(()=>{});
    };
    const time=Math.max(0,90-(Date.now()-held.start));
    if(time) setTimeout(release,time); else release();
  }
  $("dpad").addEventListener("pointerup",releasePad);
  $("dpad").addEventListener("pointercancel",releasePad);
  $("dpad").addEventListener("click",event=>{
    const key=event.target.closest("[data-padkey]");
    if(!key || key.disabled)return;
    if(handledPointerClicks.has(key)){handledPointerClicks.delete(key);return;}
    pressVirtualKey(key.dataset.padkey); // Keyboard or accessibility activation.
  });
  $("typeForm").addEventListener("submit", async event => {
    event.preventDefault();
    if(!ready || !isRunning || !emulator) return;
    const input = $("typeText");
    const txt = input.value;
    if(!txt) { feedback("输入框是空的。可以选择上面的一键执行，或输入命令。"); return; }
    const instance = emulator;
    try {
      await instance.keyboard_send_text(txt, 15);
      if(instance === emulator) {
        input.value = "";
        feedback("文字已发送。需要执行命令的话，再点击「Enter ↵ 执行」。");
      }
    } catch(error) { feedback("文字发送失败：" + (error?.message || "模拟器暂不可用")); }
  });
  $("sendEnter").addEventListener("click", () => pressVirtualKey("enter"));
  renderGuide(null);
  updateSimpleUI();
  window.addEventListener("pagehide",() => { if(emulator) { try { emulator.stop(); } catch {} } });
})();
