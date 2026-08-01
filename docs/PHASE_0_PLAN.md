# WAI — Plano de Execução: Fase 0 (Fundação Técnica)

**Data:** 1 de agosto de 2026  
**Status:** Em Execução / Concluído  

## 1. Visão Geral e Objetivo

A **Fase 0** tem como objetivo estabelecer a fundação técnica segura, escalável e multiempresa da **WAI (Work Artificial Intelligence)**, garantindo a separação integral do motor de prospecção existente, com isolamento robusto entre organizações (Tenant Isolation via Row Level Security), logs estruturados com rastreabilidade (`correlationId`), autenticação e autorização centralizadas no servidor e trilha de auditoria completa (com estados anterior e posterior).

A regra central do produto rege todas as decisões arquiteturais:
> **A IA entende e conversa. O código valida e executa.**
*(Nesta Fase 0, a camada de IA não é introduzida para que a validação de segurança e isolamento seja determinística e verificável).*

---

## 2. Stack Tecnológica Congelada

- **Aplicação:** Next.js (App Router)
- **Linguagem:** TypeScript (modo estrito)
- **Banco de Dados & Autenticação:** PostgreSQL via Supabase / Supabase Auth
- **Acesso a Dados:** Supabase JS + Migrations SQL nativas (sem ORM/Prisma na Fase 0)
- **Interface:** React + CSS simples/módulos, focando em usabilidade, acessibilidade e responsividade
- **Testes & Validação:** Suíte unitária (Vitest/Node) para autorização e rotas do servidor, e script de validação de isolamento (RLS) via SQL
- **Deploy & Serviços Pagos:** Nenhum (desenvolvimento e verificação em ambiente local)

---

## 3. Arquitetura do Repositório e Módulos

A estrutura segue rigorosamente o limite proporcional à Fase 0:
- `src/app/`: Rotas Next.js App Router (`/login`, `/app/[organizationSlug]`, `/admin`).
- `src/modules/organizations/` e `src/modules/audit/`: Regras de negócio determinísticas e chamadas a dados protegidos.
- `src/db/`: Configuração de clientes Supabase (Browser, Server com sessão do usuário, e Admin exclusivo no servidor).
- `src/security/`: Lógica e middlewares de validação de papéis (`wai_admin`, `organization_owner`, `operator`, `viewer`), sem confiança de parâmetros do cliente sem verificação no servidor.
- `src/logging/`: Estrutura de logs formatada em JSON com injeção e propagação de `correlationId` sem vazamento de segredos, tokens ou senhas.
- `src/ui/`: Componentes visuais limpos e responsivos em italiano (idioma oficial de interface).
- `supabase/`: Migrações relacionais definitivas (`001_initial_schema.sql`, `002_security_functions_and_rls.sql`), seed de bootstrap e testes de RLS.

---

## 4. Estratégia de Isolamento e Segurança (RLS)

1. **Autenticação no Servidor:** Sessões JWT e validação via Supabase Auth no Next.js App Router. Nenhuma chave administrativa (`service_role`) é exposta ao browser ou cliente.
2. **Políticas de Row Level Security (RLS):**
   - Usuário padrão lê exclusivamente tabelas nas organizações vinculadas pela `organization_members`.
   - Isolamento horizontal inviolável (Empresa A não acessa nem altera Empresa B).
   - Inserção/remoção de organizações protegidas contra usuários padrão.
   - Alterações de configuração (como `settings_json`) permitidas exclusivamente aos perfis com papel `organization_owner`.
3. **Auditoria Determinística:** Alteração na configuração dispara o registro obrigatório em `audit_logs`, gravando ator, tipo de ação, entidade, `before_data`, `after_data` e o `correlation_id` da requisição. Falhas de gravação em auditoria são tratadas sem silenciamento.

---

## 5. Cronograma e Etapas de Teste

1. **Configuração Inicial do Repositório e Ambiente:** Criação dos arquivos de configuração (`.env.example`, `tsconfig.json`, linters, package scripts).
2. **Database Schema & RLS:** Criação das tabelas `platform_users`, `organizations`, `organization_members` e `audit_logs` com índices, chaves estrangeiras e políticas.
3. **Seed e Bootstrap:** Geração dos registros para `admin@wai.local` (`wai_admin`), `owner-a@wai.local` (`Studio Aurora`) e `owner-b@wai.local` (`Studio Brera`).
4. **Aplicação Web:** Construção das telas de Login, Painel do Estúdio (`/app/[organizationSlug]`) e Administração Global (`/admin`).
5. **Verificação de Qualidade e Testes:** Execução do lint, typecheck, build local do Next.js e bateria de testes para comprovação irrefutável do isolamento multiempresa e RLS.

---
*Plano gerado como marco obrigatório de execução da Fase 0. Não inclui nem antecipa recursos ou dependências de fases futuras.*
