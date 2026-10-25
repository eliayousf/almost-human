# Submission video: target 1:45–1:50, hard maximum 2:00

The organizer's submission instructions, supplied by the team on 25 October
2026, require an **MP4 or MOV file, no more than 120 seconds and 300 MB**.
A phone recording is allowed. Upload the file to Max's private team page;
YouTube links and decks are not submissions. Use a conservative 300,000,000-byte
file limit and leave roughly ten seconds of duration headroom.

**Game:** https://almost-human-playtest.vercel.app/
**Judged source:** https://github.com/eliayousf/almost-human/tree/main

## Prepare before pressing Record

- Use the main game, not a design-preview route or an older deployment URL.
- Read and accept the game's eligibility/terms yourself before filming.
- Use invented, nonpersonal messages. Keep keys, account details and the private
  submission URL off-screen.
- Open the original/revised synthetic example and completed-v1 evidence in advance.
  The owner-held training receipt is recorded evidence, not a live training run.
- Start a real round. Begin recording with about **45 seconds of chat remaining**,
  and say that the round is already in progress. Do not shorten the server timer.
- Set recording to 1080p/30 fps if available. Prioritize readable text and clear voice.
- Rehearse once. This script is a plan, not evidence that rehearsal has happened.

## Shot list and narration cues

| Video time | Show | Say |
| --- | --- | --- |
| 0:00–0:12 | The live game, already in a round | Natural-sounding speech still needs natural conversation. Almost Human collects dialogue feedback through a one-minute game, aiming to improve the words voice agents say. |
| 0:12–0:35 | Send a message and show the actual reply | This is our text-based collection prototype, already in a round. Guesses measure perceived human-likeness, not guaranteed response quality. All game-model calls go through Mubit. |
| 0:35–0:52 | Vote and show the actual reveal/score | The server locks the vote, reveals the role and awards points. React to the actual outcome; don't promise a correct guess. |
| 0:52–1:20 | The real original/corrected synthetic example and completed-v1 receipt | We supplied editorial feedback and approved the corrected conversation. Mubit kept 36 synthetic examples and completed adapter v1. Training happened earlier. |
| 1:20–1:35 | Current adapter status, briefly | The version did not pass evaluation and is not serving. Live game replies are still provider inference through Mubit. We have added reviewed examples, but do not claim a fresh adapter answer. |
| 1:35–1:45 | Main README and proof/check links | The game and reproducible checks are available on GitHub main. The next acceptance gate is a version-verified adapter answer on an unseen question. |

A bot reply deliberately pauses 6–12 seconds after generation; that is a game
display effect, not a voice-latency benchmark. Narrate while
waiting; don't spend the video watching a silent timer. If the live round fails,
record another take. If editing out downtime, make the cut apparent and keep the
normal one-minute duration clear. Do not manufacture a result or splice a provider
reply into an adapter-labelled view.

The full original and revised model text is in the owner's ignored experiment
receipts. Do not put raw model records in the public repository. The demonstration
must use the correction associated with the completed v1 experiment; the newer
refresh corrections are accepted-data evidence, not a completed new version.

## Essential claims

- **Usefulness:** repeated conversational-response generation for voice-agent
  builders. The game collects text and believability feedback; actual voice
  integration, customer demand, spoken-response quality and speed gains are unverified.
- **Future data:** reviewed human-written responses could provide targets with
  separate permission and personal-data filtering. This is not implemented or
  authorized by the current playtest terms.
- **Mubit:** real gateway calls, a reviewed synthetic conversational correction,
  completed v1 training, and an explicit serving limitation.
- **Execution:** actual game behavior plus reproducible code checks. Mocked contract
  tests and simulated concurrency checks are labelled as such.
- **Demo:** real interaction, clear narration, no sign-in/setup delay, under two minutes.

Say the serving limitation once, clearly. Keep the longer evaluation analysis in
[JUDGING.md](../JUDGING.md) and [DIAGNOSTIC.md](DIAGNOSTIC.md). Do not call a vendor
bug proven or claim that passing local tests demonstrates learned-model quality.

## Validate the final file

```sh
nix shell nixpkgs#ffmpeg -c ffprobe -v error \
  -show_entries format=duration,size,format_name \
  -show_entries stream=codec_type,codec_name -of json /absolute/path/demo.mp4
```

Check duration ≤120 seconds, actual size ≤300,000,000 bytes, an MP4/MOV container,
and a playable video stream. Listen to the exported file all the way through.
Aim for ≤110 seconds so an export/timing mismatch cannot invalidate it. This
repository does not claim that an unprovided video has been checked or submitted.

## Recording checklist

- [ ] Real game footage and actual score/result.
- [ ] Correction and completed-v1 evidence are readable and labelled recorded.
- [ ] Provider versus trained-adapter distinction is explicit.
- [ ] No secrets, personal chats, private upload URL or submission form details visible.
- [ ] Export checked for duration, size, container and intelligible audio.
- [ ] Upload and latest-submission confirmation checked before the deadline.

See [SUBMISSION.md](SUBMISSION.md) for the exact form fields and deadline.
