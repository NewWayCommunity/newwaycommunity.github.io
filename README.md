# 🌙 New Way Community

Hub de jogos Android e apps premium, organizados por categoria e gênero, com atualizações publicadas em tempo real.

Site estático, hospedado no GitHub Pages, com painel administrativo próprio e dados em tempo real via Firebase.

---

## ✨ Funcionalidades

### Para quem visita
- Categorias fixas na barra lateral: **Jogos Android**, **GoldSrc Engine**, **Source Engine**, **Apps Premium**
- Jogos organizados em carrosséis horizontais por gênero, criados automaticamente conforme são cadastrados
- Busca por nome, com skeleton loading enquanto os dados carregam
- Favoritos salvos localmente no navegador (sem precisar de conta)
- Até 4 links de download por jogo, com botão "Mostrar mais links" quando há mais de um
- Botão de **compartilhar** — gera um link direto pra aquele jogo específico
- **Reportar link quebrado**, com cooldown de 48h pra evitar spam do mesmo visitante
- Instalável como app (PWA), com ícone e splash screen próprios
- Selo "Novo" automático em postagens recentes

### Para o admin
- Painel protegido por login (e-mail/senha via Firebase Auth) — acesso pela busca do site, digitando uma palavra-chave secreta (sem botão visível)
- Publicar, editar, fixar e excluir jogos
- Campos: seção, gênero (com sugestão automática), versão, tamanho (MB/GB), arquitetura (32/64 bits), descrição, ícone, banner e até 4 links nomeados
- Postagem automática em **Discord** e **Telegram** ao publicar um jogo novo, com webhook/token separado por categoria
- Botão de reenviar postagem manualmente pros canais, sem precisar recriar o jogo
- Painel de "mais baixados" e lista de relatos de link quebrado

---

## 🛠️ Tecnologias

- **HTML, CSS e JavaScript puro** (sem framework, sem build step)
- **Firebase Authentication** — login do admin
- **Cloud Firestore** — banco de dados em tempo real (jogos, gêneros, relatos, configurações)
- **GitHub Pages** — hospedagem estática
- **PWA** — manifest + service worker, instalável em Android

---

## 📁 Estrutura de arquivos

```
├── index.html        # o site inteiro (estrutura, estilo e lógica)
├── manifest.json      # configuração do PWA (nome, ícones, cores)
├── sw.js              # service worker (cache do app instalado)
├── icon-192.png        # ícone do app (192x192)
└── icon-512.png        # ícone do app (512x512)
```

---

## ⚠️ Aviso

Este é um projeto pessoal, sem fins comerciais e sem afiliação com os jogos ou empresas listados. Os links de download são hospedados por terceiros; o site apenas organiza e divulga.
