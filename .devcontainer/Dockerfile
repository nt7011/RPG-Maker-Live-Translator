FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
        bash-completion \
        build-essential \
        bubblewrap \
        ca-certificates \
        curl \
        fd-find \
        git \
        gnupg \
        jq \
        less \
        nano \
        openssh-client \
        python3 \
        python3-pip \
        python3-venv \
        ripgrep \
        shellcheck \
        sudo \
        unzip \
        vim \
        wget \
        zip \
    && if [ ! -e /usr/local/bin/fd ]; then ln -s "$(command -v fdfind)" /usr/local/bin/fd; fi \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex
RUN mkdir -p /root/.codex
