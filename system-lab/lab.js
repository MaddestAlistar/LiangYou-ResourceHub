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
  const SYSTEMS = Object.freeze({
    freedos: {name:"FreeDOS", type:"fda", file:"freedos722.img", memory:32, vga:4},
    kolibri: {name:"KolibriOS", type:"fda", file:"kolibri.img", memory:64, vga:8},
    reactos: {name:"ReactOS", type:"hda", memory:512, vga:16, remote:{url:"https://i.copy.sh/reactos-v3/.img",size:734003200,async:true,fixed_chunk_size:1048576,use_parts:true}, state:{url:"https://i.copy.sh/reactos_state-v3.bin.zst"},acpi:true},
    android: {name:"Android-x86 1.6", type:"cdrom", memory:512, vga:16, remote:{url:"https://i.copy.sh/android-x86-1.6-r2/.iso",size:54661120,async:true,fixed_chunk_size:1048576,use_parts:true},autoEnter:true},
    android44: {name:"Android-x86 4.4", type:"cdrom", memory:512, vga:16, remote:{url:"https://i.copy.sh/android_x86_nonsse3_4.4r1_20140904/.iso",size:247463936,async:true,fixed_chunk_size:1048576,use_parts:true},autoEnter:true},
    win95: {name:"Windows 95",type:"hda", memory:64,vga:8,local:true},
    win98: {name:"Windows 98",type:"hda", memory:128,vga:8,local:true}
  });

  const GUIDES = Object.freeze({
    freedos: {
      title:"FreeDOS · 不止一个游戏，还能做什么？",
      intro:"这是一台复古 DOS 电脑。看到 A:\\> 就说明开机了，不需要密码。你可以玩多个游戏，也可以浏览文件和了解早期电脑命令。",
      steps:[
        "先等待黑色窗口出现 A:\\> 提示符。开头出现「Boot failed: CDROM」并不一定是故障，之后从 Floppy 启动成功即可。",
        "先点画面下方的「查看磁盘文件」，了解磁盘里有什么；想玩游戏可选贪吃蛇、太空侵略者或俄罗斯方块。",
        "游戏中用方向键；换游戏前先退出，回到 A:\\> 后再点另一个。不同游戏退出键可能是 Esc 或 Q，实在无法退出可重启。"
      ],
      note:"图标按钮只是帮你输入命令；DOS 远不止这些功能。看到 A:\\> 才能输入下一条。",
      commands:[
        {name:"列出文件",value:"dir",hint:"查看当前目录"},
        {name:"查看帮助",value:"help",hint:"显示可用命令"},
        {name:"清屏",value:"cls",hint:"清空屏幕"},
        {name:"贪吃蛇",value:"snake",hint:"方向键控制"},
        {name:"太空侵略者",value:"invaders",hint:"经典小游戏"},
        {name:"俄罗斯方块",value:"tetris",hint:"经典方块游戏"}
      ]
    },
    kolibri: {
      title:"KolibriOS · 进入图形桌面",
      intro:"这是有窗口和桌面图标的系统。手机滑动通常只会移动光标，不一定能自动完成鼠标单击；请用画面下方的「左键点击」或「双击打开」。",
      steps:[
        "刚开始会看到硬件和 CPU 初始化信息，这是开机过程，不是操作界面。",
        "等待画面切换到图形桌面后再操作；单纯切换为图形模式也不保证已完全进入桌面。",
        "先用手指拖动光标到目标，再点「单击左键」选中，或「双击打开」进入。若只有光标移动，使用下面的鼠标按键，不要只点「确认」。"
      ],
      note:"KolibriOS 需要鼠标左右键。下方提供单击、双击、右键；方向键和 Enter 不能代替所有桌面点击。",
      commands:[]
    },
    reactos: {
      title:"ReactOS · 免费开源的 Windows 风格桌面",
      intro:"ReactOS 是独立开源系统，不是微软 Windows。加载的是约 700 MB 的虚拟硬盘，采用分块读取。首次启动可能很慢，iPhone 可能因为内存不足而失败。",
      steps:["等待出现图形桌面或系统启动界面；单纯出现开机文字不等于已进入桌面。","在画面上移动光标，用「左键点击」「双击打开」「右键菜单」操作。","如果黑屏、长时间不动或手机闪退，请用电脑访问，或点击系统卡片里的官方演示入口。"],
      note:"ReactOS 使用 v86 官方演示镜像（按需分块），不要输入账号、密码或重要个人数据。",
      commands:[]
    },
    android: {
      title:"Android-x86 1.6 · 早期安卓演示",
      intro:"这是旧版 Android-x86，不是现代手机安卓，也不支持当代应用商店或大多数新 APK。网页只模拟一台旧设备。",
      steps:["启动后等待出现安卓开机菜单或 logo；可能需要按 Enter 选择启动。","进入图形界面后，可以轻点屏幕或使用鼠标点击按钮。","系统可能需要较长时间加载；在 iPhone 上可能因内存限制无法进入桌面。"],
      note:"使用旧版安卓演示镜像，适合怀旧体验，不适合登录真实账号。",
      commands:[]
    },
    android44: {
      title:"Android-x86 4.4 · 实验性安卓系统",
      intro:"4.4 镜像比 1.6 大得多，需要更高内存，iPhone Safari 可能无法运行。这是历史 Android-x86，不支持现代应用体验。",
      steps:["等待系统引导，若出现启动菜单可按 Enter 确认。","进入系统后尝试触屏操作；网页模拟器的鼠标行为与手机原生安卓不同。","如始终黑屏，建议电脑端或尝试轻量版 Android 1.6。"],
      note:"安卓 4.4 为额外实验入口，兼容性不做保证。",
      commands:[]
    },
    win95: {
      title:"Windows 95 · 加载你自己的启动磁盘",
      intro:"本站不会提供 Windows 系统文件。请从本机选择你有权使用的、已经安装好 Windows 95 的可启动 .img/.vhd 磁盘文件，安装光盘 ISO 不能直接打开桌面。",
      steps:["点击 Windows 95 卡片的「选择镜像并启动」，选取本地可启动磁盘文件。","镜像会留在当前访客浏览器中运行，不上传到良友科技网站。","等待 Windows 95 开机；如果是空白磁盘或安装 ISO，无法直接进入桌面。大镜像建议电脑打开。"],
      note:"也可以通过系统卡片中的 v86 官方演示链接参观 Windows 95。",
      commands:[]
    },
    win98: {
      title:"Windows 98 · 加载你自己的启动磁盘",
      intro:"Windows 98 是微软的专有系统。本站不预装镜像；请自行选择你有权使用的已安装、可启动的 .img/.vhd 文件。",
      steps:["选择 Windows 98 卡片里的「选择镜像并启动」，从本机选取启动磁盘文件。","系统数据不会上传网站；大型镜像可能占用数百 MB 内存。","等待 Windows 98 桌面，必要时重启。安装 ISO 并不等同于可启动的已安装磁盘。"],
      note:"想快速参观可以用系统卡片里的 v86 官方演示。",
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
  let bootMonitor = null;
  const pendingDownloads = new Set();
  let loadingTimer = null;
  let attemptFailed = false;
  let activeLocalFile = null;
  let localIntent = null;
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
  async function prepareAssets(config,token,localFile) {
    let completed = 0;
    const total = config.remote || config.local ? 3 : 4;
    async function one(label,urls,min) {
      const value = await fetchAsset(label,urls,min,token);
      completed += 1;
      if(token === generation && !attemptFailed)
        showLoading("资源准备中 " + completed + "/" + total,"已取得"+label+"，正在准备剩余文件…");
      return value;
    }
    const tasks = [
      one("系统 BIOS",ASSETS.seabios,50000),
      one("显示 BIOS",ASSETS.vgabios,10000),
      one("运行核心 WASM",ASSETS.wasm,1000000)
    ];
    if(!config.remote && !config.local) tasks.push(one(config.name+"镜像",ASSETS.image(config.file),100000));
    const [bios,vga,wasm,image] = await Promise.all(tasks);
    let disk;
    if(config.remote) {
      // v86 downloads only accessed chunks from the upstream public image CDN.
      // Don't fetch the entire virtual hard drive into the phone's RAM.
      disk = {...config.remote};
    } else if(config.local) {
      if(!localFile) throw new Error("请先选择自己的 Windows 可启动 .img 磁盘镜像。");
      showLoading("正在读取本地 Windows 启动磁盘","文件留在你的设备，不上传到网站。大镜像在手机上可能占用较多内存。");
      const data = await localFile.arrayBuffer();
      if(token !== generation) throw new Error("加载已取消");
      if(data.byteLength < 1024 * 1024) throw new Error("选择的文件太小，可能不是可启动的磁盘镜像。");
      disk = {buffer:data};
    } else {
      disk = {buffer:image.buffer};
    }
    return {bios:{buffer:bios.buffer},vga_bios:{buffer:vga.buffer},disk,wasm_path:wasm.url};
  }


  const EASY_ACTIONS = Object.freeze({
    freedos:[{label:"🐍 贪吃蛇",value:"snake"},{label:"👾 太空侵略者",value:"invaders"},{label:"🧱 俄罗斯方块",value:"tetris"}],
    kolibri:[]
  });
  const GAME_COMMANDS = new Set(["snake","invaders","tetris"]);
  let touchStart = null;
  let mouseBusy = false;
  const graphical = id => !!id && id !== "freedos";
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
      $("simpleStep").textContent = current==="freedos" ? "等待 A:\\> 出现；这是已经开机的标志。" : "正在启动图形系统。Android 和 ReactOS 需要更长时间，建议电脑体验。";
      $("simpleActionHelp").textContent = "现在还在启动，请先不要输入。";
      btn.textContent = "⌛ 等待系统启动";
    } else if(current==="freedos") {
      $("simpleStep").textContent = gamePlaying
        ? "正在游戏中。换游戏前请先回到 A:\\>，必要时重启。"
        : "已进入 DOS！先查看文件，或点下方其他小游戏。";
      $("simpleActionHelp").textContent = gamePlaying
        ? "尝试 Esc 退出（有些游戏用 Q），不能退出可点「重启」。"
        : "不只贪吃蛇：还可以玩侵略者、俄罗斯方块和使用 DOS 工具。";
      btn.textContent = gamePlaying ? "↩ 尝试退出当前游戏" : "📁 查看磁盘文件";
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
    $("guideIntro").textContent = guide ? guide.intro : "选择系统查看操作提示。ReactOS、Android 是图形系统；Windows 需要合法的本地启动盘。";
    const steps = guide ? guide.steps : ["从上方选择一个系统并点击「启动」。","等待系统进入命令提示符或桌面。","通过下方快捷命令和虚拟按键操作。"];
    $("guideSteps").replaceChildren(...steps.map(step => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    }));
    const note=$("systemNote");
    note.hidden = !id;
    note.textContent = id==="freedos" ? "💡 FreeDOS 不是游戏机：你可以打开多个游戏，也能看文件和使用早期电脑工具。"
      : id==="kolibri" ? "💡 KolibriOS 有真正的桌面。手机只移动光标还不够，要点击下方的鼠标左键或双击。"
      : id==="reactos" ? "💡 ReactOS 模拟磁盘约 700 MB，分块读取；首次启动可能很慢。"
      : id==="android"||id==="android44" ? "💡 这是旧版 Android-x86 实验镜像，不代表能使用现代安卓 APP。"
      : id==="win95"||id==="win98" ? "💡 Windows 必须选择你合法持有的可启动磁盘，本站不提供微软系统镜像。" : "";
    const actions=$("easyActions");
    actions.replaceChildren();
    for(const item of EASY_ACTIONS[id]||[]) {
      const button=document.createElement("button");
      button.type="button";
      button.dataset.easycmd=item.value;
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
    ready = false; isRunning = false; guestReady = false; commandBusy = false; gamePlaying = false; attemptFailed = false;
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
  async function launch(id,localFile=null) {
    const config = SYSTEMS[id];
    if (!config) return;
    if(config.local && !localFile) {
      localIntent=id;
      $("localDiskInput").value="";
      $("localDiskInput").click();
      return;
    }
    activeLocalFile = config.local ? localFile : null;
    const token = ++generation;
    current = id;
    $("errorBox").hidden = true;
    $("machineName").textContent = config.name;
    resetUI();
    showLoading("正在准备系统…",config.remote ? "正在准备模拟器。大型系统镜像由 v86 分块读取，较适合电脑浏览器。" : config.local ? "正在准备加载你选的本地启动磁盘…" : "首次运行需要下载几个系统文件，失败会切换备用地址。");
    renderGuide(id);
    simpleStatus("系统正在启动，等屏幕出现提示后，点击旁边的大按钮即可。");
    const card = document.querySelector('[data-system="' + (id==="android44" ? "android" : id) + '"]');
    if(card) card.classList.add("active");
    $("runtime").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    status("正在加载模拟器核心…");
    try {
      await stopExisting();
      if(token !== generation) return;
      await loadRuntime();
      if(token !== generation) return;
      const assets = await prepareAssets(config,token,localFile);
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
        boot_order:config.type === "cdrom" ? 0x213 : config.type === "hda" ? 0x132 : 0x231,
        acpi:!!config.acpi,
        initial_state:config.state || undefined,
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
        if(config.autoEnter) setTimeout(()=>{
          if(token===generation && emulator===instance && isRunning) instance.keyboard_send_scancodes(KEY_CODES.enter,15).catch(()=>{});
        },3000);
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
            simpleStatus("DOS 已进入：可以查看磁盘文件，也能选贪吃蛇、侵略者或俄罗斯方块。");
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
      instance.add_listener("download-progress",progress=>{
        if(token!==generation || !config.remote) return;
        if(progress?.lengthComputable && progress.total>0)
          $("runtimeHint").textContent = "正在按需读取系统磁盘："+Math.round(100*progress.loaded/progress.total)+"%（单个资源）。大型系统加载慢属于正常情况。";
      });
      // Don't claim success until the engine explicitly reports it has started.
      loadingTimer = setTimeout(() => {
        if(token !== generation || isRunning) return;
        fail(new Error("虚拟机没有在允许的启动时间内运行。大系统可能超过设备内存限制，请优先尝试电脑或使用官方演示。"));
      }, config.remote ? 180000 : 45000);
    } catch(error) {
      if(token === generation) { resetUI(); fail(error); }
    }
  }
  document.querySelectorAll("[data-launch]").forEach(button => button.addEventListener("click", () => launch(button.dataset.launch)));
  document.querySelectorAll("[data-local]").forEach(button=>button.addEventListener("click",()=>launch(button.dataset.local)));
  $("localDiskInput").addEventListener("change",event=>{
    const file=event.target.files?.[0];
    const id=localIntent;
    localIntent=null;
    if(file && id && SYSTEMS[id]?.local) launch(id,file);
  });
  $("pause").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.stop();}catch(e){fail(e);}}});
  $("resume").addEventListener("click",async () => {if(emulator && ready) {try{await emulator.run();}catch(e){fail(e);}}});
  $("restart").addEventListener("click",() => {if(emulator && ready) emulator.restart();});
  $("exit").addEventListener("click",async () => {++generation; if(document.body.classList.contains("lab-immersive")) setImmersive(false); resetUI();current = null;activeLocalFile=null;renderGuide(null);status("已退出");$("machineName").textContent="尚未启动";await stopExisting();});
  $("fullscreen").addEventListener("click",toggleImmersive);
  $("screenMode").addEventListener("click",toggleImmersive);
  $("retryLoading").addEventListener("click",()=>{if(current) launch(current,activeLocalFile);});
  $("retryFailed").addEventListener("click",()=>{if(current) launch(current,activeLocalFile);});
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
  async function runQuickCommand(cmd) {
    if(!emulator || !ready || !isRunning || !guestReady || commandBusy || graphical(current)) return;
    if(!GUIDES[current].commands.some(item => item.value === cmd)) return;
    if(current==="freedos" && gamePlaying) {
      simpleStatus("先退出当前游戏并确认回到 A:\\>，再点击其他游戏。不能退出就点重启。");
      return;
    }
    const instance = emulator;
    commandBusy = true;
    updateGuideButtons();
    feedback("正在发送 " + cmd + " 并执行…");
    try {
      await instance.keyboard_send_text(cmd, 15);
      if(instance !== emulator || !isRunning) return;
      await instance.keyboard_send_scancodes(KEY_CODES.enter, 15);
      if(instance === emulator) {
        feedback("已输入并执行「" + cmd + "」。请看上方黑色窗口的输出。");
        if(current==="freedos" && GAME_COMMANDS.has(cmd)) gamePlaying=true;
        simpleStatus(GAME_COMMANDS.has(cmd) ? "已尝试启动「"+cmd+"」。游戏按键因游戏而异，用下方方向键尝试，换游戏前先退出。" : "已执行「" + cmd + "」，请查看屏幕内容。");
      }
    } catch(error) {
      feedback("快捷命令未执行成功：" + (error?.message || "模拟器暂不可用"));
    } finally {
      commandBusy = false;
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
      if(gamePlaying) {pressVirtualKey("esc"); gamePlaying=false; simpleStatus("已发送 Esc，请看屏幕是否回到 A:\\>。未退出可尝试 Q 或重启。");updateSimpleUI();}
      else runQuickCommand("dir");
    } else if(graphical(current)) clickMouse("left");
  });
  $("easyActions").addEventListener("click",event=>{
    const button=event.target.closest("[data-easycmd]");
    if(button && !button.disabled)runQuickCommand(button.dataset.easycmd);
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
