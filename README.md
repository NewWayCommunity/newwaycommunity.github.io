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
- **Firebase Authentication** — login do admin (e-mail e senha)
- **Vercel Functions** (pasta `api/`) — backend do acesso ao painel: confere a palavra-chave e cria a sessão administrativa
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
├── vercel.json                 # configuração da Vercel (e bloqueio de arquivos internos)
├── package.json                # dependência do backend (firebase-admin)
├── .nojekyll                   # impede o GitHub Pages de processar os arquivos com Jekyll
├── .well-known/
│   └── discord                 # verificação de domínio do Discord
├── api/                        # backend do painel (Vercel Functions)
│   ├── _lib/core.js            # regras de acesso, limite de tentativas, sessões
│   ├── admin-gate.js           # palavra-chave -> bilhete de uso único
│   ├── admin-unlock.js         # bilhete + login -> sessão administrativa
│   ├── admin-session.js        # confirma a sessão no servidor
│   └── admin-logout.js         # encerra a sessão
├── firebase/
│   └── firestore.rules         # regras do Firestore (colar no console do Firebase)
├── tools/
│   └── gerar-hash.js           # gera o hash da palavra-chave (opcional, roda no Termux)
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

## 🔐 Segurança do painel

**Como entrar:** digite a palavra-chave na busca do site e aperte **Enter** (só vale quando nenhum jogo combina com o texto). Depois entre com e-mail e senha. Com a sessão ativa, o botão de voltar ao painel aparece no site, sem precisar digitar a palavra-chave de novo (a sessão dura 8 horas ou até tocar em **Sair**).

**Como funciona:**
- O navegador nunca vê o hash. A palavra-chave vai por HTTPS para `/api/admin-gate`, que calcula o SHA-256 e compara no servidor com `adminConfig/auth`. Se bater, devolve um bilhete de uso único (10 minutos).
- Depois do login por e-mail e senha, `/api/admin-unlock` confere o bilhete (e o queima), o login recente, o UID do admin e a conta ativa, e cria uma sessão (`adminSessions`) com um token personalizado.
- As regras do Firestore só aceitam gravação com essa sessão. Conhecer o hash ou ter só e-mail e senha não dá acesso. Os webhooks do Discord e o token do Telegram (`config/*`) só são legíveis com a sessão administrativa.
- Erros seguidos bloqueiam a conta e o IP (15 min, dobrando a cada reincidência). Os erros são genéricos.
- O painel funciona só no endereço da Vercel (o `/api` não existe no GitHub Pages).

**Configurar (uma vez):**
1. **Firebase > Authentication:** em *Settings > Authorized domains* adicione `newwaycommunity.vercel.app`; desligue o cadastro de novas contas (*User actions > Enable create*); copie o **UID** da conta admin (*Users*).
2. **Firestore:** crie `adminConfig/auth` com os campos (string) `hash` (SHA-256 de uma palavra-chave **nova**), `adminUid` (se houver mais de um admin, separe os UIDs por vírgula) e, se quiser, `salt` (`node tools/gerar-hash.js` gera tudo).
3. **Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada.** Na Vercel, em *Settings > Environment Variables*, crie `FIREBASE_SERVICE_ACCOUNT` com o conteúdo inteiro do `.json` e faça **Redeploy**. Nunca coloque esse arquivo no GitHub.
4. Depois que o deploy estiver no ar, publique `firebase/firestore.rules` em *Firestore > Regras*.
5. Apague o documento antigo `config/admin` (guardava o hash da palavra-chave antiga, que ficava legível por qualquer visitante).

## ⚠️ Aviso

Este é um projeto pessoal, sem fins comerciais e sem afiliação com os jogos ou empresas listados. Os links de download são hospedados por terceiros; o site apenas organiza e divulga.
