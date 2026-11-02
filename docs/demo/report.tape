# Records docs/demo/report.gif from a real run: `vhs docs/demo/report.tape` from the repo root.
Output docs/demo/report.gif
Set Shell "bash"
Set FontSize 15
Set Width 1300
Set Height 560
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 22ms

Hide
Type `export PS1='$ ' && npm ci --silent && clear` Enter
Sleep 45s
Show
Type `npm run -s report:sample` Enter
Sleep 8s
Type `head -n 18 docs/sample-report.md` Enter
Sleep 4s
