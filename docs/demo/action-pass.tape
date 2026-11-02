# Records docs/demo/action-pass.gif from a real run: `vhs docs/demo/action-pass.tape` from the repo root.
Output docs/demo/action-pass.gif
Set Shell "bash"
Set FontSize 15
Set Width 1300
Set Height 480
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 22ms

Hide
Type `export PS1='$ ' && mkdir -p /tmp/gh && : > /tmp/gh/summary && : > /tmp/gh/out` Enter
Sleep 2s
Type `export INPUT_BASELINE=__fixtures__/baseline.jsonl INPUT_METRICS=exact_match,f1 GITHUB_STEP_SUMMARY=/tmp/gh/summary GITHUB_OUTPUT=/tmp/gh/out` Enter
Sleep 2s
Sleep 3s
Type `clear` Enter
Sleep 1s
Show
Type `INPUT_RESULTS=__fixtures__/candidate-pass.jsonl node dist/index.js` Enter
Sleep 10s
Type `head -n 12 llm-eval-report.md` Enter
Sleep 4s
Hide
Type `rm -f llm-eval-report.md` Enter
Sleep 1s
