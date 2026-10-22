# Fertsan | Gestão Comercial

CRM agronômico da equipe comercial da Fertsan: clientes, oportunidades, jornada de 11 etapas,
agenda, propostas com Risco Zero e bonificação Oráclo, apuração de resultados, estoque e metas.

**Stack:** React 18 + TypeScript + Vite + Tailwind · Supabase (Postgres, Auth, Storage, RLS).

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha URL e chave anon do Supabase
npm run dev
```

`npm test` roda os testes das regras de cálculo; `npm run build` gera a versão de produção.

## Banco de dados

As migrações ficam em `supabase/migrations/` e devem ser aplicadas em ordem:

1. `..._schema.sql` — tabelas, gatilhos (numeração de propostas, jornada, estoque, histórico) e funções.
2. `..._rls.sql` — regras de acesso: admin e gestor veem tudo; vendedor vê só os próprios registros.
3. `..._seed_catalogo.sql` — catálogo de produtos com preços por litro e doses padrão.

Com a Supabase CLI: `supabase link --project-ref <ref>` e `supabase db push`.
Ou cole cada arquivo no SQL Editor do painel do Supabase, na ordem.

**Primeiro acesso:** a primeira conta criada vira administradora. As seguintes entram como vendedor;
o administrador ajusta papéis em Configurações. Cadastrar a pessoa com o e-mail antes faz a conta
dela ser ligada automaticamente ao registro da equipe.

## Publicar (Vercel)

Importe o repositório na Vercel, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e publique.
O `vercel.json` já redireciona as rotas para o app. No Supabase, em Authentication → URL
Configuration, cadastre o domínio publicado como Site URL.

## Regras de negócio que corrigem a versão anterior

| Problema na versão anterior | Como ficou |
|---|---|
| Abrir a prévia/PDF salvava a proposta | Prévia usa o rascunho em memória; só "Salvar proposta" grava, com aviso de alterações não salvas |
| Produtos sem preço geravam itens de R$ 0,00 | Produto sem preço fica "preço pendente" e o banco recusa salvar |
| Preço por litro diferente entre módulos | Catálogo único; o banco grava o preço do catálogo em cada item (snapshot) |
| Clientes duplicados por grafia | Nome normalizado, aviso no cadastro, busca de parecidos e mesclagem manual |
| "Reagendado" sem nova data; agendadas vencidas sem alerta | Reagendar exige a nova data e cria atividade ligada; vencidas aparecem como "Vencida" |
| Etapa "A validar" fora da jornada | Etapa da oportunidade vem da última etapa concluída; etapa só conclui após a anterior |
| Metas sem cadastro e realizado "não informado"; vendedor duplicado no filtro | Metas por pessoa e trimestre; realizado = propostas aceitas; filtro pela equipe cadastrada |
| Risco Zero sem forma de apurar | Apuração com critérios, laudo e conclusão automática |
| Número de proposta aleatório | `FT-AAAA-NNNN` sequencial, com histórico de versões |
| "há" no lugar de "ha"; plural errado | Unidades e plurais padronizados |
| Responsáveis como texto livre | Relação com as pessoas da equipe (vários por registro) |
| Sem controle de acesso | Login, papéis e regras de acesso no banco (RLS) |

## Backup

"Exportar backup" baixa JSON e XLSX com tudo que o usuário pode ver. Em Configurações,
o administrador restaura um JSON exportado (reimportar atualiza, não duplica).
