-- Limite de débit (SPECS § 9 et § 10) : une ligne par action autorisée, rangée sous l'empreinte de l'adresse IP.
-- L'adresse n'arrive jamais ici : le serveur Nuxt envoie un HMAC-SHA-256 de l'IP avec un secret qu'il est seul à connaître.
create table public.debit (
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  action text not null check (char_length(action) between 1 and 40),
  le timestamptz not null default now()
);
create index debit_empreinte_action on public.debit (empreinte, action, le);

-- Aucune politique et aucun privilège pour anon ni authenticated : seul le rôle de service y accède.
alter table public.debit enable row level security;

-- Compte les lignes de l'empreinte pour l'action dans la fenêtre : au-delà du maximum, renvoie le nombre de secondes à
-- attendre ; sinon enregistre l'appel et renvoie 0. Le verrou consultatif (par empreinte et action, levé en fin de
-- transaction) sérialise deux requêtes simultanées : le dernier créneau n'en laisse passer qu'une.
-- La purge ne touche que les lignes de plus de 24 heures de cette empreinte ; la purge générale est celle des tâches planifiées.
create function public.consommer_debit(p_empreinte text, p_action text, p_maximum integer, p_fenetre_s integer)
returns integer
language plpgsql set search_path = ''
as $$
declare
  v_nb integer;
  v_premier timestamptz;
begin
  if p_maximum < 1 or p_fenetre_s not between 1 and 86400 then
    raise exception 'Limite de débit mal réglée.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empreinte || ':' || p_action, 0));
  delete from public.debit where empreinte = p_empreinte and le < now() - interval '24 hours';
  select count(*), min(le) into v_nb, v_premier
  from public.debit
  where empreinte = p_empreinte and action = p_action and le > now() - make_interval(secs => p_fenetre_s);
  if v_nb >= p_maximum then
    return greatest(1, ceil(extract(epoch from v_premier + make_interval(secs => p_fenetre_s) - now()))::integer);
  end if;
  insert into public.debit (empreinte, action) values (p_empreinte, p_action);
  return 0;
end
$$;
revoke all on function public.consommer_debit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consommer_debit(text, text, integer, integer) to service_role;
