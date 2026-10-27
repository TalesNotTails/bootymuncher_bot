FROM node:25-trixie

# Install Neovim and essentials
RUN apt-get update && apt-get install -y \
    git curl ripgrep fd-find unzip build-essential \
    && apt-get clean

# Install recent Neovim (apt ships an old 0.10.x), picking the right arch
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
      amd64) NVIM_ARCH=x86_64 ;; \
      arm64) NVIM_ARCH=arm64 ;; \
      *) echo "Unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/nvim.tar.gz \
      "https://github.com/neovim/neovim/releases/download/v0.11.5/nvim-linux-${NVIM_ARCH}.tar.gz"; \
    tar -C /opt -xzf /tmp/nvim.tar.gz; \
    ln -s "/opt/nvim-linux-${NVIM_ARCH}/bin/nvim" /usr/local/bin/nvim; \
    rm /tmp/nvim.tar.gz

# Optional: Install a Node LSP globally
RUN npm install -g typescript typescript-language-server eslint_d prettier vscode-langservers-extracted opencode-ai

# Neovim config with ESLint/TypeScript LSP
COPY nvim /home/node/.config/nvim
ENV EDITOR="nvim ."
RUN nvim --headless "+Lazy! sync" +qa || true
