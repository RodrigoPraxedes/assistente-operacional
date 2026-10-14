-- =============================================================================
-- Turno sem horário: só o período do dia (manhã, tarde ou noite)
-- =============================================================================
-- Quando o horário varia de um colaborador para outro, o turno marca apenas o
-- período. Turno com período não tem início nem fim; turno com horário não tem
-- período.
-- =============================================================================

alter table public.turnos
  add column periodo text check (periodo in ('manha', 'tarde', 'noite'));

alter table public.turnos
  alter column inicio drop not null,
  alter column fim drop not null;

alter table public.turnos
  add constraint turnos_horario_ou_periodo
  check ((periodo is null) = (inicio is not null and fim is not null));
