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

### /watch `url`
Watches a store page and pings you in the alerts channel when the item is available.
- `url` (required): link to the product page (`http` or `https`)
- The page is checked right away, and the reply says whether the item is currently in stock. You can watch up to 10 pages.
- You get pinged when the item changes from not-in-stock to in stock, not on every check.
- Stock status is read from the page's schema.org product data, availability meta tags, or add-to-cart / sold-out buttons. Pages that render stock info only with JavaScript, or stores that block bots, may not work.

### /unwatch `url`
Stops watching a page. Pick one of your watched pages from the autocomplete list, or paste its URL.

experience
----------
Members earn 15-25 XP for sending a message. When a member reacts to another member's guild message, both the message author and reactor earn 5-15 XP. Self-reactions and bot activity do not earn XP.

XP awards have a 60-second cooldown per member per server, regardless of whether the attempted award came from a message or reaction.

configuration
-------------
When a member overtakes the top spot, the bot moves the leader role to them and announces it in the server's system channel.
- `LEADER_ROLE_ID`: ID of the role given to the current top user. If unset, only the announcement is sent.
- The bot needs the **Manage Roles** permission, with its highest role above the leader role.
- The **Server Members Intent** must be enabled in the Discord developer portal.

For `/watch`:
- `WATCH_CHANNEL_ID`: ID of the text channel where availability pings are posted. If unset, `/watch` is disabled. The bot needs permission to view and send messages in it.
- `WATCH_INTERVAL_MINUTES`: how often watched pages are re-checked (default `10`, minimum `1`).

[![Auto Tagging](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/auto-tag-on-merge.yml/badge.svg)](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/auto-tag-on-merge.yml)
[![JS Lint](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/lint.yml/badge.svg)](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/lint.yml)
[![Docker Build CI](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/docker-build-push.yml/badge.svg)](https://github.com/TalesNotTails/bootymuncher_bot/actions/workflows/docker-build-push.yml)
