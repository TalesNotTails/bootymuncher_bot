FROM node:25-trixie

# Install Neovim and essentials
RUN apt-get update && apt-get install -y \
    git curl ripgrep fd-find unzip build-essential \
    && apt-get clean

RUN apt install -y neovim

# Optional: Install a Node LSP globally
RUN npm install -g typescript typescript-language-server eslint_d prettier

# Create a non-root user
ARG USERNAME=node
RUN mkdir -p /home/$USERNAME/.config/nvim
