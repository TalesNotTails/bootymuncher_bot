Bootymunchers Discord Bot
=========================
This repo contains a Discord bot that I use for my Discord server `Bootymunchers Inc`

slash commands
--------------

### /mc_status
Gets the status of the minecraft server. Returns that state of the server along with the number of online players and the server version
```
Server is online!
Players: 1/20
Version: 1.21.11
```

### /ping
Replies with a private (only visible to you) "Secret Pong!". Useful for checking that the bot is alive.

### /play `url`
Plays the audio of a YouTube link in your current voice channel.
- `url` (required): a `youtube.com`, `youtu.be`, or `music.youtube.com` link
- You must be in a voice channel. Only one track plays per server at a time; a new `/play` replaces the current one.
- Requires `yt-dlp` and `ffmpeg` to be installed on the host.

### /rank `[user]`
Shows your level and XP, plus the XP needed for the next level. The reply is private.
- `user` (optional): check another member instead of yourself
```
Alice is level 3 with 420 XP (600 XP to next level).
```

### /leaderboard
Shows the top 10 members of the server by XP. The reply is private.
```
1. Alice — level 3, 420 XP
2. Bob — level 2, 180 XP
```

configuration
-------------
When a member overtakes the top spot, the bot moves the leader role to them and announces it in the server's system channel.
- `LEADER_ROLE_ID`: ID of the role given to the current top user. If unset, only the announcement is sent.
- The bot needs the **Manage Roles** permission, with its highest role above the leader role.
- The **Server Members Intent** must be enabled in the Discord developer portal.

[![Auto Tagging](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/auto-tag-on-merge.yml/badge.svg)](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/auto-tag-on-merge.yml)
[![JS Lint](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/lint.yml/badge.svg)](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/lint.yml)
[![Docker Build CI](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/docker-build-push.yml/badge.svg)](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/docker-build-push.yml)
