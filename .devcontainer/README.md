# Dev Container

This folder defines a [devcontainer](https://containers.dev) environment for developing the bot, so anyone on the project gets the same toolchain.

## What's inside

- **Base image:** `node:25-trixie` (Debian trixie, Node 25)
- **Feature:** `common-utils` — zsh, Oh My Zsh, and sensible shell defaults (user UID/GID 3000)
- **CLI tools:** `git`, `curl`, `ripgrep`, `fd-find`, `unzip`, `build-essential`
- **Neovim 0.11.5:** installed from the official GitHub release tarball into `/opt/nvim-linux-arm64` (the apt package ships an older 0.10.x)
- **Node globals:** `typescript`, `typescript-language-server`, `eslint_d`, `prettier`, `vscode-langservers-extracted`, `opencode-ai` (the `opencode` CLI)
- **Shell default:** zsh (configured as the default shell by `common-utils`)

On first creation (`postCreateCommand`), `npm install` runs automatically.

## Files

- `devcontainer.json` — container name, build, features (common-utils), and the post-create command
- `Dockerfile` — base image, apt packages, Neovim install, and the Neovim config image bake-in
- `nvim/init.lua` — the editor configuration (see below); it's copied to `/root/.config/nvim` and plugins are synced at image build time (`Lazy! sync`)

## Neovim configuration

Defined in `nvim/init.lua`, using [lazy.nvim](https://github.com/folke/lazy.nvim):

- **gitsigns.nvim** — git change markers in the sign column (`+` added, `~` changed, `_` deleted)
  - `<Space>hp` — preview the hunk at the cursor
- **nvim-lspconfig (eslint)** — TypeScript/JavaScript linting with flat config
  - `<Space>ca` — code action
  - `<Space>k` — show diagnostic float
  - `K` — hover info
  - `gd` — go to definition
  - `<Space>ef` — ESLint fix all (also runs automatically on save)
- **telescope.nvim** — fuzzy finding
  - `<Space>/` — live grep across project text
  - `<Space>ff` — find committed files
- **nvim-tree.lua** — file tree on the right side
  - `<Space>e` — toggle file tree
- Leader key is `<Space>`; relative line numbers enabled; 2-space tabs.

## Rebuilding / updating

The container is managed with [DevPod](https://devpod.sh):

```sh
devpod up --rebuild   # rebuild the image and recreate the container
```

Note the Neovim config is baked into the image at build time, so after editing `nvim/init.lua`, rebuild (or copy it into `/root/.config/nvim/init.lua` inside the container) to pick up changes.
