import * as vscode from "vscode";

const REGEX_HEADER = /# (.+)/g;
const REGEX_SOLVING_DATE = /- (\d{4}\/\d{2}\/\d{2})/g;
const REGEX_SOLVING_ITEM = /^\s{2}- \[<img .*?tier_small\/(s?\d+)\.svg".*?> (\d+)\]\(.*?\)(.*)$/m;
const REGEX_API_URI = /https:\/\/mazassumnida\.wtf\/api\/v2\/generate_badge\?boj=(.+?)\)/;

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
      const user = await(await fetch(`https://solved.ac/api/v3/user/show?handle=${username}`)).json() as SolvedacUser;
      const background = await(await fetch(`https://solved.ac/api/v3/background/show?backgroundId=${user.backgroundId}`)).json() as SolvedacBackground;
      // Send contexts
      webviewPanel.webview.postMessage({
        type: "update",
        chunk: contexts,
        user, background,
        streak: list
      });
    };
    updateWebview();
    webviewPanel.onDidChangeViewState(event => {
      if(event.webviewPanel.visible) updateWebview();
    });
    webviewPanel.webview.onDidReceiveMessage(event => {
        if(event.type === "openProfile")  vscode.env.openExternal(vscode.Uri.parse(`https://solved.ac/profile/${event.username}`));
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
          div.history > div.list > div.item > div.content{
            margin-left: 40px;
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
        </style>
        <script src="https://cdn.jsdelivr.net/npm/motion@latest/dist/motion.js"></script>
        <script>
          const {animate, hover, scroll, press} = Motion;
          const vscode = acquireVsCodeApi();
          // User
          const userBackground = document.querySelector("div.container > div.user > img.background");
          const userProfileName = document.querySelector("div.container > div.user > div.profile > span.name");
          const userProfile = document.querySelector("div.container > div.user > div.profile > div.my > img.profile");
          const userProfileTier = document.querySelector("div.container > div.user > div.profile > div.my > img.tier");

          // History
          const historyList = document.querySelector("div.history > div.list");
          const dateElements = [];
          const lineElements = [];

          hover(userProfileName, el => {
            animate(el, {scale: 1.3}, {type: "spring", stiffness: 400, damping: 10});
            return () => animate(el, {scale: 1, rotate: "0deg"}, {type: "spring", stiffness: 400, damping: 20});
          });
          press(userProfileName, el => {
            animate(el, {rotate: "-10deg"}, {type: "spring", sitffness: 600, damping: 15});
            vscode.postMessage({type: "openProfile", username: userProfileName.textContent || "shiftpsh"});
            return () => animate(el, {rotate: "0deg"});
          });

          window.addEventListener("message", event => {
            const {type} = event.data;
            if(type === "update"){
              const {chunk, user, background, streak} = event.data;
              console.log(streak);
              userBackground.src = background.backgroundImageUrl;
              userProfileName.textContent = user.handle;
              userProfile.src = user.profileImageUrl;
              userProfileTier.src = \`https://static.solved.ac/tier_small/\${user.tier}.svg\`;

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
                  textElement.innerHTML = item[1];
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
            }
            lineElements.forEach(line => {
              scroll(animate(line, {scaleY: [0, 1, 1, 0]}), {
                target: line,
                offset: ["start 0.8", "end 0.8", "start 0.2", "end 0.2"]
              });
            });
          });


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
