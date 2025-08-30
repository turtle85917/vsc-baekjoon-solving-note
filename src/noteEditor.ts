import * as vscode from "vscode";

const REGEX_HEADER = /^#{1} (.+)/gm;
const REGEX_SOLVING_DATE = /- (\d{4}\/\d{2}\/\d{2}(?: ~ \d{4}\/\d{2}\/\d{2})?)/g;
const REGEX_SOLVING_ITEM = /^\s{2}- \[<img .*?tier_small\/(s?\d+)\.svg".*?> (\d+)\]\(.*?\)(.*)$/m;
const REGEX_API_URI = /https:\/\/mazassumnida\.wtf\/api\/v2\/generate_badge\?boj=(.+?)\)/;

const REFRESH_AT = 60 * 60 * 24 * 7 * 1000; // 7 days (unit: ms)

export class NoteEditor implements vscode.CustomTextEditorProvider{
  public static register(context:vscode.ExtensionContext):vscode.Disposable{
    const provider = new NoteEditor(context);
    return vscode.window.registerCustomEditorProvider("solving-note.customEditor", provider);
  }
  public async resolveCustomTextEditor(document:vscode.TextDocument, webviewPanel:vscode.WebviewPanel, _token:any):Promise<void>{
    webviewPanel.webview.options = {enableScripts: true};
    webviewPanel.webview.html = this.getHtml();
    const updateWebview = async():Promise<void> => {
      const readme = document.getText();
      // Parsing README syntax
      const chunk = [...readme.matchAll(REGEX_HEADER)];
      let contexts:string[] = [];
      for(let i = 0; i < chunk.length; i++)
        contexts.push(readme.slice(chunk[i].index, i === chunk.length - 1 ? undefined : chunk[i + 1].index));
      // Parsing username
      const username = contexts[1].match(REGEX_API_URI)![1];
      // Parsing solving list
      const sliced = contexts[2].slice(12);
      const dates = [...sliced.matchAll(REGEX_SOLVING_DATE)];
      const list:ProblemItem[] = [];
      for(let i = 0; i < dates.length; i++){
        const content = sliced.slice(dates[i].index, i === dates.length - 1 ? undefined : dates[i + 1].index).split('\n').slice(1);
        list.push([dates[i][1]]);
        let topLine = -1;
        for(const line of content){
          if(/^\s{2}-/.test(line)){
            const match = line.match(REGEX_SOLVING_ITEM);
            if(match === null){
              list.at(-1)?.push(line.trim());
              continue;
            }
            else
              list.at(-1)!.push({
                problemId: match[2],
                problemTier: match[1],
                isMarathon: !!match[3],
                isFinishMarathon: false,
                metadata: []
              });
            topLine = list.at(-1)!.length - 1;
          }else if(/^\s{4}-/.test(line)){
            const currentLine = list.at(-1)![topLine];
            if(currentLine instanceof Object){
              currentLine.metadata.push(line.trim());
              if(line.trim().startsWith("- 마라톤 코스 완주!"))
                currentLine.isFinishMarathon = true;
            }
          }
        }
      }
      // Send solved.ac api
      const cache = this.context.workspaceState.get<UserInfoInWorkspace|null>("userInfo", null);
      let user:SolvedacUser, background:SolvedacBackground;
      if(cache === null || Date.now() - cache.updatedAt >= REFRESH_AT){
        user = await(await fetch(`https://solved.ac/api/v3/user/show?handle=${username}`)).json() as SolvedacUser;
        background = await(await fetch(`https://solved.ac/api/v3/background/show?backgroundId=${user.backgroundId}`)).json() as SolvedacBackground;
        this.context.workspaceState.update("userInfo", {
          user,
          background,
          updatedAt: Date.now()
        });
      }else{
        user = cache.user;
        background = cache.background;
        console.log("Loaded saved data!");
      }
      // Send contexts
      webviewPanel.webview.postMessage({
        type: "update",
        chunk: contexts,
        streak: list,
        savedScrollY: this.context.workspaceState.get("scrollY", 0)
      });
      webviewPanel.webview.postMessage({
        type: "updateUser",
        user, background
      });
    };
    updateWebview();
    webviewPanel.onDidChangeViewState(event => {
      if(event.webviewPanel.visible) updateWebview();
    });
    webviewPanel.webview.onDidReceiveMessage(async event => {
      if(event.type === "openProfile") vscode.env.openExternal(vscode.Uri.parse(`https://solved.ac/profile/${event.username}`));
      if(event.type === "forceUpdate"){
        const user = await(await fetch(`https://solved.ac/api/v3/user/show?handle=${event.username}`)).json() as SolvedacUser;
        const background = await(await fetch(`https://solved.ac/api/v3/background/show?backgroundId=${user.backgroundId}`)).json() as SolvedacBackground;
        this.context.workspaceState.update("userInfo", {
          user,
          background,
          updatedAt: Date.now()
        });
        console.log("Updated user!");
        webviewPanel.webview.postMessage({
          type: "updateUser",
          user, background
        });
      }
      if(event.type === "saveScroll"){
        this.context.workspaceState.update("scrollY", event.scrollY);
        console.log(`Updated scroll y: ${event.scrollY}`);
      }
    });
  }

  constructor(private readonly context:vscode.ExtensionContext){}

  private getHtml():string{
    return `
      <!DOCTYPE html>
      <html>
      <body>
        <div class="container">
          <div class="user">
            <img class="background">
            <div class="profile">
              <div class="my">
                <img class="profile">
                <img class="tier">
              </div>
              <span class="name"></span>
            </div>
          </div>
          <div class="history">
            <div class="title">문제 풀이 기록</div>
            <div class="list"></div>
          </div>
          <div class="etc"></div>
          <div class="option">
            <div class="btn plus"><i data-lucide="plus"></i></div>
            <div class="btn recent"><i data-lucide="chevrons-down"></i></div>
            <div class="btn refresh"><i data-lucide="rotate-ccw"></i></div>
          </div>
        </div>
        <style>
          div.container > div.user > img.background{
            border-radius: 12px;
          }
          div.container > div.user > div.profile{
            display: flex;
            align-items: center;
            padding-left: 20px;
            transform: translateY(-40px);
          }
          div.container > div.user > div.profile > div.my{
            position: relative;
            width: 128px;
          }
          div.container > div.user > div.profile > div.my > img.profile{
            width: 128px;
            height: 128px;
            border: 0;
            border-radius: 9999px;
            background-color: black;
          }
          div.container > div.user > div.profile > div.my > img.tier{
            position: absolute;
            width: 28px;
            bottom: -10px;
            left: 50%;
            transform: translateX(-50%);
          }
          div.container > div.user > div.profile > span.name{
            margin-left: 10px;
            font-size: 16pt;
            cursor: pointer;
          }
          div.history > div.title{
            font-size: 16pt;
          }
          div.history > div.list > div.item{
            position: relative;
            margin-bottom: 20px;
          }
          div.history > div.list > div.item:last-child{
            margin-bottom: 0;
          }
          div.history > div.list > div.item > div.line{
            position: absolute;
            width: 4px;
            height: calc(100% + 15px);
            background-color: rgba(255, 255, 255, 0.3);
            border-radius: 9999px;
            margin-top: 10px;
            transform-origin: top;
            will-change: transform;
          }
          div.history > div.list > div.item:last-child > div.line{
            height: 100%;
          }
          div.history > div.list > div.item > div.date{
            margin-left: 12px;
            margin-bottom: 12px;
            font-size: 12pt;
            line-height: 20px;
          }
          div.history > div.list > div.item > div.content,
          div.history > div.list > div.item > div.problem{
            will-change: transform, opacity;
          }
          div.history > div.list > div.item > div.content{
            margin-left: 20px;
            color: gray;
            font-size: 12pt;
          }
          div.history > div.list > div.item > div.problem{
            display: flex;
            gap: 20px;
            background-color: rgba(255, 255, 255, 0.1);
            margin-left: 40px;
            margin-bottom: 10px;
            padding: 15px 10px;
            padding-left: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 0 var(--tier-color);
            cursor: pointer;
            opacity: 0.3;
          }
          div.history > div.list > div.item > div.problem > img.tier{
            width: 14px;
          }
          div.history > div.list > div.item > div.problem > div.id{
            font-size: 12pt;
          }
          div.etc{
            font-size: 11pt;
            margin-left: 10px;
          }
          div.option{
            position: fixed;
            display: flex;
            gap: 16px;
            bottom: 20px;
            right: 20px;
          }
          div.option > div.btn{
            display: flex;
            justify-content: center;
            align-items: center;
            width: 36px;
            height: 36px;
            border-radius: 9999px;
            background-color: transparent;
            cursor: pointer;
          }
          div.option > div.btn > svg{
            width: 28px;
            height: 28px;
          }
        </style>
        <script src="https://unpkg.com/lucide@latest"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/motion@latest/dist/motion.js"></script>
        <script>
          const {animate, hover, scroll, press} = Motion;
          const vscode = acquireVsCodeApi();
          lucide.createIcons();
          // User
          const userBackground = document.querySelector("div.container > div.user > img.background");
          const userProfileName = document.querySelector("div.container > div.user > div.profile > span.name");
          const userProfile = document.querySelector("div.container > div.user > div.profile > div.my > img.profile");
          const userProfileTier = document.querySelector("div.container > div.user > div.profile > div.my > img.tier");

          // History
          const historyList = document.querySelector("div.history > div.list");
          const dateElements = [];
          const lineElements = [];

          // Etc
          const $etc = document.querySelector("div.container > div.etc");
          const makeButton = document.querySelector("div.option > div.btn.plus");
          const recentButton = document.querySelector("div.option > div.btn.recent");
          const refreshButton = document.querySelector("div.option > div.btn.refresh");
          const springConfig = {type: "spring", stiffness: 400, damping: 20};

          document.documentElement.style.setProperty("opacity", 0);
          window.addEventListener("DOMContentLoaded", () => {
            setTimeout(() => document.documentElement.style.setProperty("opacity", 1), 10);
          });

          hover(userProfileName, el => {
            animate(el, {scale: 1.3}, springConfig);
            return () => animate(el, {scale: 1, rotate: "0deg"});
          });
          press(userProfileName, el => {
            animate(el, {rotate: "-10deg"}, {type: "spring", sitffness: 600, damping: 15});
            vscode.postMessage({type: "openProfile", username: userProfileName.textContent || "shiftpsh"});
            return () => animate(el, {rotate: "0deg"});
          });

          [makeButton, recentButton, refreshButton].forEach(btn => {
            hover(btn, () => {
              animate(btn, {backgroundColor: "rgba(255, 255, 255, 0.3)"}, {duration: 0.3});
              return () => animate(btn, {backgroundColor: "transparent"});
            });
            press(btn, () => {
              if(btn.classList[1] === "recent") dateElements.at(-1).scrollIntoView({behavior: "smooth", block: "start"});
              if(btn.classList[1] === "refresh" && userProfileName.textContent)
                vscode.postMessage({type: "forceUpdate", username: userProfileName.textContent});
              animate(btn, {scale: 0.8}, springConfig);
              return () => animate(btn, {scale: 1}, springConfig);
            });
          });

          window.addEventListener("message", event => {
            const {type} = event.data;
            if(type === "updateUser"){
              const {user, background} = event.data;
              userBackground.src = background.backgroundImageUrl;
              userProfileName.textContent = user.handle;
              userProfile.src = user.profileImageUrl;
              userProfileTier.src = \`https://static.solved.ac/tier_small/\${user.tier}.svg\`;
            }
            if(type === "update"){
              const {chunk, streak, savedScrollY} = event.data;
              console.log(streak);
              $etc.innerHTML = marked.parse(chunk.slice(3).join("\\n"));
              for(const item of streak){
                const itemElement = document.createElement("div");
                itemElement.classList.add("item");
                const lineElement = document.createElement("div");
                lineElement.classList.add("line");
                itemElement.appendChild(lineElement);
                lineElements.push(lineElement);
                const dateElement = document.createElement("div");
                dateElement.classList.add("date");
                dateElement.textContent = item[0];
                itemElement.appendChild(dateElement);
                dateElements.push(dateElement);
                if(typeof item[1] === "string"){
                  const textElement = document.createElement("div");
                  textElement.classList.add("content");
                  textElement.innerHTML = marked.parse(item[1]);
                  itemElement.appendChild(textElement);
                }
                else{
                  for(const problem of item.slice(1)){
                    const problemElement = document.createElement("div");
                    problemElement.classList.add("problem");
                    problemElement.style.setProperty("--tier-color", tierColor(problem.problemTier))
                    const problemTierElement = document.createElement("img");
                    const problemIdElement = document.createElement("div");
                    problemTierElement.classList.add("tier");
                    problemTierElement.src = \`https://static.solved.ac/tier_small/\${problem.problemTier}.svg\`;
                    problemIdElement.classList.add("id");
                    problemIdElement.textContent = problem.problemId;
                    problemElement.appendChild(problemTierElement);
                    problemElement.appendChild(problemIdElement);
                    itemElement.appendChild(problemElement);

                    hover(problemElement, el => {
                      animate(problemElement, {y: -10, opacity: 1}, {type: "spring", stiffness: 600, damping: 20});
                      return () => animate(problemElement, {y: 0, opacity: 0.3}, {type: "spring", stiffness: 600, damping: 20});
                    });
                  }
                }
                historyList.appendChild(itemElement);
              }
              lineElements.forEach(line => {
                scroll(animate(line, {scaleY: [0, 1, 1, 0]}), {
                  target: line,
                  offset: ["start 0.8", "end 0.8", "start 0.2", "end 0.2"]
                });
              });
              document.scrollingElement.scroll({top: savedScrollY});
            }
          });

          const saveScrollThrottle = throttle(() => {
            vscode.postMessage({type: "saveScroll", scrollY: window.scrollY});
          }, 1000);
          window.addEventListener("scroll", saveScrollThrottle);

          function throttle(fn, limit){
            let inThrottle = false;
            return (...args) => {
              if(!inThrottle){
                fn(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
              }
            };
          }

          // 해당 코드 출처 : https://github.com/solved-ac/help.solved.ac/blob/main/utils/color/tier.ts
          function tierColor(value){
            if (value.startsWith("s")) return "#96cc00";

            // bronze
            if (value === "1") return "#9d4900";
            if (value === "2") return "#a54f00";
            if (value === "3") return "#ad5600";
            if (value === "4") return "#b55d0a";
            if (value === "5") return "#c67739";
            // silver
            if (value === "6") return "#38546e";
            if (value === "7") return "#3d5a74";
            if (value === "8") return "#435f7a";
            if (value === "9") return "#496580";
            if (value === "10") return "#4e6a86";
            // gold
            if (value === "11") return "#d28500";
            if (value === "12") return "#df8f00";
            if (value === "13") return "#ec9a00";
            if (value === "14") return "#f9a518";
            if (value === "15") return "#ffb028";
            // platinum
            if (value === "16") return "#00c78b";
            if (value === "17") return "#00d497";
            if (value === "18") return "#27e2a4";
            if (value === "19") return "#3ef0b1";
            if (value === "20") return "#51fdbd";
            // diamond
            if (value === "21") return "#009ee5";
            if (value === "22") return "#00a9f0";
            if (value === "23") return "#00b4fc";
            if (value === "24") return "#2bbfff";
            if (value === "25") return "#41caff";
            // ruby
            if (value === "26") return "#e0004c";
            if (value === "27") return "#ea0053";
            if (value === "28") return "#f5005a";
            if (value === "29") return "#ff0062";
            if (value === "30") return "#ff3071";
            // master
            if (value === "31") return "#b300e0";
            // else
            return "#2d2d2d";
          };
        </script>
      </body>
      </html>
    `;
  }
}
