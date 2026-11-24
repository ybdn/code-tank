-- Modèle Claude de chaque juré, choisi par campagne. Lu par la délibération (hors de ce dépôt) avec le reste de campagne.
alter table public.campagne add column modeles jsonb not null
  default '{"sudo":"claude-sonnet-5-5","refacto":"claude-sonnet-5-5","lint":"claude-sonnet-5-5","pitch":"claude-sonnet-5-5"}'
  constraint campagne_modeles_valides check (
    case when jsonb_typeof(modeles) = 'object' then
      modeles ?& array['sudo', 'refacto', 'lint', 'pitch']
      and modeles - 'sudo' - 'refacto' - 'lint' - 'pitch' = '{}'::jsonb
      and modeles ->> 'sudo' in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')
      and modeles ->> 'refacto' in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')
      and modeles ->> 'lint' in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')
      and modeles ->> 'pitch' in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')
    else false end
  );

-- Lecture : le select de campagne est accordé à la table entière. Écriture : l'organisateur, comme pour les autres champs.
grant insert (modeles), update (modeles) on public.campagne to authenticated;

-- Modifiable jusqu'au passage en délibération, figé ensuite. Le déclencheur s'applique à tout rôle, rôle de service compris.
create function public.campagne_modeles_figes() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.modeles is distinct from old.modeles and new.statut >= 'deliberation' then
    raise exception 'Les modèles des jurés sont figés depuis le passage en délibération.';
  end if;
  return new;
end
$$;
revoke all on function public.campagne_modeles_figes() from public, anon, authenticated;
create trigger campagne_modeles_figes before update on public.campagne
for each row execute function public.campagne_modeles_figes();
