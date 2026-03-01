FROM node:25-trixie

# Install Neovim and essentials
RUN apt-get update && apt-get install -y \
    git curl ripgrep fd-find unzip build-essential neovim \
    && apt-get clean

# Optional: Install a Node LSP globally
RUN npm install -g typescript typescript-language-server eslint_d prettier
