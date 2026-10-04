-- Basic settings
vim.g.mapleader = " "
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.signcolumn = "yes"
vim.opt.mouse = "a"
vim.opt.expandtab = true
vim.opt.shiftwidth = 2
vim.opt.tabstop = 2
vim.opt.termguicolors = true

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({ "git", "clone", "--filter=blob:none", "https://github.com/folke/lazy.nvim.git", "--branch=stable", lazypath })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  {
    "nvim-telescope/telescope.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
      local builtin = require("telescope.builtin")
      vim.keymap.set("n", "<leader>/", builtin.live_grep, { desc = "Fuzzy search text in project" })
      vim.keymap.set("n", "<leader>ff", builtin.git_files, { desc = "Find committed file" })
    end,
  },
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      require("nvim-tree").setup({
        view = { side = "right", width = 35 },
      })
      vim.keymap.set("n", "<leader>e", "<cmd>NvimTreeToggle<cr>", { desc = "Toggle file tree" })
    end,
  },
  {
    "lewis6991/gitsigns.nvim",
    config = function()
      require("gitsigns").setup({
        on_attach = function(bufnr)
          local gs = package.loaded.gitsigns
          vim.keymap.set("n", "<leader>hp", gs.preview_hunk, { buffer = bufnr, desc = "Gitsigns: preview hunk" })
        end,
        signs = {
          add = { text = "+" },
          change = { text = "~" },
          delete = { text = "_" },
          topdelete = { text = "‾" },
          changedelete = { text = "~" },
        },
      })
    end,
  },
  {
    "neovim/nvim-lspconfig",
    config = function()
      local on_attach = function(_, bufnr)
        vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, { buffer = bufnr, desc = "Code action" })
        vim.keymap.set("n", "<leader>k", vim.diagnostic.open_float, { buffer = bufnr, desc = "Show diagnostic" })
        vim.keymap.set("n", "K", vim.lsp.buf.hover, { buffer = bufnr, desc = "Hover" })
        vim.keymap.set("n", "gd", vim.lsp.buf.definition, { buffer = bufnr, desc = "Go to definition" })
      end

      local function fix_all_eslint()
        vim.lsp.buf.code_action({
          context = { only = { "source.fixAll.eslint" }, diagnostics = {} },
          apply = true,
        })
      end

      local eslint_on_attach = function(client, bufnr)
        on_attach(client, bufnr)
        vim.keymap.set("n", "<leader>ef", fix_all_eslint, { buffer = bufnr, desc = "ESLint: fix all" })
        vim.api.nvim_create_autocmd("BufWritePre", { buffer = bufnr, callback = fix_all_eslint })
      end

      vim.lsp.config("eslint", {
        on_attach = eslint_on_attach,
        settings = {
          experimental = { useFlatConfig = true },
          workingDirectory = { mode = "auto" },
        },
      })
      vim.lsp.enable("eslint")

    end,
  },
})
