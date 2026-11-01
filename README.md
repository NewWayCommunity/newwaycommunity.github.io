# 🌙 New Way Community

Um Hub de jogos Android e Apps Premium, organizados por categoria e gênero, com atualizações publicadas frequentes.
https://newwaycommunity.vercel.app/

Site com tema roxo escuro e fundo espacial animado, sincronizado no Vercel, com painel administrativo próprio e dados em tempo real via Firebase.

---

## ✨ Funcionalidades

### Para quem visita
- Categorias fixas na barra lateral: **Jogos Android**, **GoldSrc Engine**, **Source Engine**, **Apps Premium**
- Jogos organizados em carrosséis horizontais por gênero, criados automaticamente conforme são cadastrados
- Busca por nome, com skeleton loading enquanto os dados carregam
- Favoritos salvos localmente no navegador (sem precisar de conta)
- Até 4 links de download por jogo, com botão "Mostrar mais links" quando há mais de um
- Botão de **compartilhar** — gera um link direto da publicação para aquele jogo específico
- Selo "Novo" automático em postagens recentes (removido após 2 dias)
- Instalável como app (PWA)
- Visual com fundo espacial animado (estrelas e planetas) e transições suaves ao abrir/fechar postagens, telas e menus
- Preview de link com imagem ao compartilhar o site (Open Graph e Twitter Card)

### Para o admin
- Publicar, editar, fixar e excluir jogos
- Campos: seção, gênero (com sugestão automática), versão, tamanho (MB/GB), arquitetura (32/64 bits), descrição, ícone, banner e até 4 links nomeados
- Postagem automática em **Discord** e **Telegram** ao publicar um jogo novo, com webhook/token separado por categoria
- Botão de reenviar postagem manualmente pros canais, sem precisar recriar o jogo

---

## 🛠️ Tecnologias

- **React + Tailwind CSS** — interface pré-compilada (arquivos em `assets/`)
- **JavaScript puro** — toda a lógica do catálogo, admin, favoritos e integrações fica em `features/catalog/logic.js`
- **Firebase Authentication** — login do admin
- **Cloud Firestore** — banco de dados em tempo real (jogos, gêneros, relatos, configurações)
- **GitHub e Vercel** — hospedagem estática (o Vercel publica a cada atualização do repositório)
- **PWA** — manifest + service worker, instalável em Android

---

## 📁 Estrutura de arquivos

```
├── index.html                  # página principal (estrutura, meta tags de SEO e fundo espacial)
├── manifest.json               # configuração do PWA (nome, ícones, cores)
├── sw.js                       # service worker (cache do app instalado)
├── robots.txt                  # regras para robôs de busca
├── favicon.png                 # ícone da aba do navegador
├── .nojekyll                   # impede o GitHub Pages de processar os arquivos com Jekyll
├── .well-known/
│   └── discord                 # verificação de domínio do Discord
├── features/
│   └── catalog/
│       └── logic.js            # lógica do site: catálogo, painel admin, Firebase, Discord e Telegram
└── assets/
    ├── index-X-c5PTSk.js       # bundle principal (React) — arquivo compilado
    ├── routes-BrLij3Fe.js      # estrutura da página (HTML da interface) — arquivo compilado
    ├── styles-Bwrbb2UA.css     # estilos (tema, animações e transições) — arquivo compilado
    └── images/
        ├── logo-nwc.png        # logo usada na sidebar e no painel admin
        ├── icon-192.png        # ícone do app (192x192)
        ├── icon-512.png        # ícone do app (512x512)
        └── og-image.jpg        # imagem de preview ao compartilhar o link
```

---

## ⚠️ Aviso

Este é um projeto pessoal, sem fins comerciais e sem afiliação com os jogos ou empresas listados. Os links de download são hospedados por terceiros; o site apenas organiza e divulga.
