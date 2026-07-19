-- dichava.app — perfil do profissional com disponibilidade para agendamento online
-- Rode no Supabase → SQL Editor.
alter table public.profissionais add column if not exists agenda_config jsonb;   -- {dur, dias:{1:['14:00','18:00'], ...}}
alter table public.profissionais add column if not exists agenda_codigo text;    -- código da clínica p/ receber a solicitação
