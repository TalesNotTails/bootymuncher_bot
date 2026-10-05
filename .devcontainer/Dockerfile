FROM node:25-trixie

# Install Neovim and essentials
RUN apt-get update && apt-get install -y \
    git curl ripgrep fd-find unzip build-essential \
    && apt-get clean

# Install recent Neovim (apt ships an old 0.10.x)
RUN curl -fsSL -o /tmp/nvim.tar.gz https://github.com/neovim/neovim/releases/download/v0.11.5/nvim-linux-arm64.tar.gz \
    && tar -C /opt -xzf /tmp/nvim.tar.gz \
    && ln -s /opt/nvim-linux-arm64/bin/nvim /usr/local/bin/nvim \
    && rm /tmp/nvim.tar.gz

# Optional: Install a Node LSP globally
RUN npm install -g typescript typescript-language-server eslint_d prettier vscode-langservers-extracted opencode-ai

# Neovim config with ESLint/TypeScript LSP
COPY nvim /root/.config/nvim
RUN nvim --headless "+Lazy! sync" +qa || true
