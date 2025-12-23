# Finance API Backend

Este é o servidor API que conecta seu aplicativo Finance V2 ao banco de dados PostgreSQL.

## Como fazer o Deploy no Easypanel

Como você quer rodar isso separadamente na VPS:

1.  **Crie um Repositório Novo no GitHub** (ex: `finance-backend`).
2.  **Suba os arquivos desta pasta** (`backend`) para lá.
    *   Garante que o `Dockerfile`, `package.json` e `index.js` estejam na raiz desse repositório.
3.  **No Easypanel**:
    *   Vá em **Project** > **New Service** > **App**.
    *   Escolha **Source: GitHub**.
    *   Selecione o repositório que você acabou de criar (`finance-backend`).
    *   Em **Build**, certifique-se que o "Docker file path" está apontando para o Dockerfile (geralmente `./Dockerfile` se estiver na raiz).
    *   Porta do container: `3000`.
4.  **Variáveis de Ambiente (Environment)**:
    *   No Easypanel, configure as variáveis para conectar no seu banco:
    ```
    DB_HOST=ip_do_seu_banco (ou nome do serviço se estiver no mesmo easypanel)
    DB_USER=seu_usuario
    DB_PASSWORD=sua_senha
    DB_NAME=seu_banco
    PORT=3000
    ```
5.  **Deploy**: Clique em "Create" ou "Deploy".

## Conectando o App (Frontend)

1.  Depois que o deploy terminar, o Easypanel vai te dar uma URL (ex: `https://finance-api.seudominio.com`).
2.  Vá no seu projeto do App (onde está o React/Vite).
3.  Abra o arquivo `.env`.
4.  Mude a variável `VITE_API_URL` para essa nova URL:
    `VITE_API_URL=https://finance-api.seudominio.com`
5.  Rode o build do App novamente (`npm run build`) para ele pegar a nova configuração (se for deploy estático) ou reinicie o servidor local.
