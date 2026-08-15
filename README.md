# CNA Airport Board

FIDS escolar em tempo real para TV, professores e administração.

## Rotas

- Board: /#/board (a raiz redireciona automaticamente)
- Staff: /#/staff
- Admin: /#/admin

## Arquitetura

React, TypeScript e Vite no GitHub Pages. Supabase fornece Postgres, RLS, Realtime, uma RPC limitada para o staff e Edge Function para o admin. O board usa America/Sao_Paulo e mantém o último snapshot no navegador.

## Desenvolvimento

    cp .env.example .env.local
    npm install
    npm run dev
    npm run lint
    npm run typecheck
    npm run test
    npm run build

Variáveis: VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Nunca use service role no frontend.

## Supabase e segurança

As migrations ficam em supabase/migrations. set_class_manual_status é a única escrita anônima e valida professor, turma, período e dia. Todas as tabelas públicas usam RLS. admin-api valida o hash do secret ADMIN_PASSWORD_SHA256.

## Status

| Status | Regra padrão |
|---|---|
| ON TIME | 120 a 30 min antes |
| CHECK-IN | 30 a 10 min antes |
| BOARDING | 10 a 3 min antes |
| LAST CALL | 3 min até o início |
| GATE CLOSED | início até 5 min depois |
| DEPARTED | durante a aula e por 60 min após |

Os limites são editáveis no Admin; overrides manuais valem somente na data local atual.

## Deploy

O workflow de Pages valida e publica dist a cada push em main. Configure as repository variables públicas do frontend. URL: https://caiosan0304.github.io/cna-airport-board/.
